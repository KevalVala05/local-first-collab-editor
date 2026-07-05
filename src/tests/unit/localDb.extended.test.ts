/**
 * @file localDb.extended.test.ts
 * @description Extended integration tests for the local-first IndexedDB sync engine.
 *              Covers concurrent operations, outbox deduplication under edge cases,
 *              timestamp ordering, large content payloads, and stress scenarios.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  localDb,
  getCachedDocuments,
  saveDocumentLocally,
  renameDocumentLocally,
  createDocumentLocally,
  deleteDocumentLocally,
  type LocalDocument,
} from "@/lib/localDb";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDoc(overrides: Partial<LocalDocument> = {}): LocalDocument {
  return {
    _id: `doc_${Math.random().toString(36).slice(2)}`,
    title: "Test Document",
    content: "<p>Hello</p>",
    ownerId: { _id: "user_1", name: "Alice", email: "alice@test.com" },
    collaborators: [],
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    syncStatus: "synced",
    ...overrides,
  };
}

beforeEach(async () => {
  await localDb.documents.clear();
  await localDb.outbox.clear();
});

// ── createDocumentLocally — extended ─────────────────────────────────────────

describe("createDocumentLocally — extended", () => {
  it("generates unique IDs for each created document", async () => {
    const docs = await Promise.all([
      createDocumentLocally("Doc A", "u1", "Alice", "a@test.com"),
      createDocumentLocally("Doc B", "u1", "Alice", "a@test.com"),
      createDocumentLocally("Doc C", "u1", "Alice", "a@test.com"),
    ]);
    const ids = docs.map((d) => d._id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(3);
  });

  it("stores the document in IndexedDB immediately after creation", async () => {
    const doc = await createDocumentLocally("Persisted", "u1", "Alice", "a@b.com");
    const stored = await localDb.documents.get(doc._id);
    expect(stored).toBeDefined();
    expect(stored?._id).toBe(doc._id);
  });

  it("sets correct owner fields from parameters", async () => {
    const doc = await createDocumentLocally("Doc", "owner_999", "Bob Smith", "bob@test.com");
    expect(doc.ownerId._id).toBe("owner_999");
    expect(doc.ownerId.name).toBe("Bob Smith");
    expect(doc.ownerId.email).toBe("bob@test.com");
  });

  it("sets createdAt and updatedAt to valid ISO strings", async () => {
    const before = new Date().toISOString();
    const doc = await createDocumentLocally("Timestamp Test", "u1", "Alice", "a@b.com");
    const after = new Date().toISOString();

    expect(doc.createdAt >= before).toBe(true);
    expect(doc.createdAt <= after).toBe(true);
    expect(doc.updatedAt >= before).toBe(true);
  });

  it("starts with empty collaborators array", async () => {
    const doc = await createDocumentLocally("Empty Collab", "u1", "Alice", "a@b.com");
    expect(doc.collaborators).toEqual([]);
  });

  it("adds exactly one outbox entry per document creation", async () => {
    const doc = await createDocumentLocally("One Entry", "u1", "Alice", "a@b.com");
    const items = await localDb.outbox.where("documentId").equals(doc._id).toArray();
    expect(items).toHaveLength(1);
    expect(items[0].action).toBe("create_document");
  });
});

// ── saveDocumentLocally — extended ───────────────────────────────────────────

describe("saveDocumentLocally — extended", () => {
  it("updates updatedAt timestamp on each save", async () => {
    const doc = makeDoc({ _id: "ts_test" });
    const originalTime = doc.updatedAt;
    await localDb.documents.put(doc);

    // Small delay to ensure different timestamp
    await new Promise((r) => setTimeout(r, 5));
    await saveDocumentLocally("ts_test", "<p>Updated</p>");

    const updated = await localDb.documents.get("ts_test");
    expect(updated?.updatedAt).not.toBe(originalTime);
    expect(new Date(updated!.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(originalTime).getTime()
    );
  });

  it("handles very large content (close to 1MB)", async () => {
    const largeContent = "<p>" + "x".repeat(900_000) + "</p>";
    const doc = makeDoc({ _id: "large_doc" });
    await localDb.documents.put(doc);

    await expect(saveDocumentLocally("large_doc", largeContent)).resolves.not.toThrow();

    const stored = await localDb.documents.get("large_doc");
    expect(stored?.content).toBe(largeContent);
  });

  it("does not create a document record if it doesn't exist in IndexedDB", async () => {
    // Calling save for a non-existent document should only add outbox item (no doc created)
    await saveDocumentLocally("nonexistent_doc_999", "<p>ghost</p>");
    const doc = await localDb.documents.get("nonexistent_doc_999");
    expect(doc).toBeUndefined();
  });

  it("outbox timestamp is updated on repeated saves (dedup)", async () => {
    const doc = makeDoc({ _id: "dedup_ts" });
    await localDb.documents.put(doc);

    await saveDocumentLocally("dedup_ts", "<p>v1</p>");
    const items1 = await localDb.outbox
      .where("documentId")
      .equals("dedup_ts")
      .and((i) => i.action === "update_content")
      .toArray();
    const t1 = items1[0].timestamp;

    await new Promise((r) => setTimeout(r, 5));
    await saveDocumentLocally("dedup_ts", "<p>v2</p>");
    const items2 = await localDb.outbox
      .where("documentId")
      .equals("dedup_ts")
      .and((i) => i.action === "update_content")
      .toArray();

    expect(items2).toHaveLength(1);
    expect(items2[0].timestamp).toBeGreaterThanOrEqual(t1);
    expect(items2[0].payload.content).toBe("<p>v2</p>");
  });

  it("handles HTML with special characters and tags correctly", async () => {
    const htmlContent = `<h1>Title</h1><p>Hello &amp; World</p><ul><li>Item 1</li></ul>`;
    const doc = makeDoc({ _id: "html_test" });
    await localDb.documents.put(doc);

    await saveDocumentLocally("html_test", htmlContent);
    const stored = await localDb.documents.get("html_test");
    expect(stored?.content).toBe(htmlContent);
  });

  it("does not affect outbox entries of other documents", async () => {
    const docA = makeDoc({ _id: "docA" });
    const docB = makeDoc({ _id: "docB" });
    await localDb.documents.bulkPut([docA, docB]);

    await saveDocumentLocally("docA", "<p>A content</p>");

    const docBItems = await localDb.outbox.where("documentId").equals("docB").toArray();
    expect(docBItems).toHaveLength(0);
  });
});

// ── renameDocumentLocally — extended ─────────────────────────────────────────

describe("renameDocumentLocally — extended", () => {
  it("deduplicates rename outbox entries", async () => {
    const doc = makeDoc({ _id: "dedup_rename" });
    await localDb.documents.put(doc);

    await renameDocumentLocally("dedup_rename", "Name 1");
    await renameDocumentLocally("dedup_rename", "Name 2");
    await renameDocumentLocally("dedup_rename", "Name 3");

    const items = await localDb.outbox
      .where("documentId")
      .equals("dedup_rename")
      .and((i) => i.action === "rename_document")
      .toArray();

    expect(items).toHaveLength(1);
    expect(items[0].payload.title).toBe("Name 3");
  });

  it("does not modify document if it doesn't exist in IndexedDB", async () => {
    await renameDocumentLocally("ghost_rename", "New Name");
    const doc = await localDb.documents.get("ghost_rename");
    expect(doc).toBeUndefined();
  });

  it("separate rename and update outbox items coexist independently", async () => {
    const doc = makeDoc({ _id: "both_ops" });
    await localDb.documents.put(doc);

    await saveDocumentLocally("both_ops", "<p>content</p>");
    await renameDocumentLocally("both_ops", "New Title");

    const allItems = await localDb.outbox.where("documentId").equals("both_ops").toArray();
    const actions = allItems.map((i) => i.action);
    expect(actions).toContain("update_content");
    expect(actions).toContain("rename_document");
  });
});

// ── deleteDocumentLocally — extended ─────────────────────────────────────────

describe("deleteDocumentLocally — extended", () => {
  it("clears ALL types of pending outbox items for the document", async () => {
    const doc = makeDoc({ _id: "doc_full_clear" });
    await localDb.documents.put(doc);

    // Queue multiple different actions
    await localDb.outbox.bulkAdd([
      { documentId: "doc_full_clear", action: "update_content", payload: { content: "" }, timestamp: Date.now() },
      { documentId: "doc_full_clear", action: "rename_document", payload: { title: "X" }, timestamp: Date.now() },
    ]);

    await deleteDocumentLocally("doc_full_clear");

    const remaining = await localDb.outbox.where("documentId").equals("doc_full_clear")
      .and((i) => i.action !== "delete_document")
      .toArray();
    expect(remaining).toHaveLength(0);
  });

  it("does not remove outbox items for OTHER documents", async () => {
    const docA = makeDoc({ _id: "docA_del" });
    const docB = makeDoc({ _id: "docB_del" });
    await localDb.documents.bulkPut([docA, docB]);

    await localDb.outbox.add({
      documentId: "docB_del",
      action: "update_content",
      payload: { content: "<p>B</p>" },
      timestamp: Date.now(),
    });

    await deleteDocumentLocally("docA_del");

    const docBItems = await localDb.outbox.where("documentId").equals("docB_del").toArray();
    expect(docBItems).toHaveLength(1);
  });

  it("is idempotent — calling delete twice doesn't throw", async () => {
    const doc = makeDoc({ _id: "idempotent_del" });
    await localDb.documents.put(doc);

    await expect(deleteDocumentLocally("idempotent_del")).resolves.not.toThrow();
    await expect(deleteDocumentLocally("idempotent_del")).resolves.not.toThrow();
  });
});

// ── getCachedDocuments — extended ─────────────────────────────────────────────

describe("getCachedDocuments — extended", () => {
  beforeEach(async () => {
    // Seed 5 documents with varying content, dates, and sync states
    const docs: LocalDocument[] = [
      makeDoc({ _id: "e1", title: "React Hooks Guide",    content: "useState and useEffect", updatedAt: "2024-06-01T00:00:00Z", syncStatus: "synced" }),
      makeDoc({ _id: "e2", title: "Vitest Setup",         content: "unit testing with vitest", updatedAt: "2024-06-03T00:00:00Z", syncStatus: "pending" }),
      makeDoc({ _id: "e3", title: "Next.js 16 App Router",content: "file-based routing", updatedAt: "2024-06-02T00:00:00Z", syncStatus: "synced" }),
      makeDoc({ _id: "e4", title: "TypeScript Tips",      content: "generics and utility types", updatedAt: "2024-06-05T00:00:00Z", syncStatus: "error" }),
      makeDoc({ _id: "e5", title: "MongoDB Atlas Guide",  content: "database design patterns", updatedAt: "2024-06-04T00:00:00Z", syncStatus: "synced" }),
    ];
    await localDb.documents.bulkPut(docs);
  });

  it("search is case-insensitive for title", async () => {
    const result = await getCachedDocuments("REACT", "updatedAt", "desc", 1, 10);
    expect(result.documents.length).toBe(1);
    expect(result.documents[0]._id).toBe("e1");
  });

  it("search matches partial word in content", async () => {
    const result = await getCachedDocuments("generics", "updatedAt", "desc", 1, 10);
    expect(result.documents.length).toBe(1);
    expect(result.documents[0]._id).toBe("e4");
  });

  it("search returns multiple matches across title and content", async () => {
    // "guide" appears in e1 title ("Guide") and e5 title ("Guide") and e1 content doesn't, so:
    // "Guide" in React Hooks Guide + MongoDB Atlas Guide
    const result = await getCachedDocuments("guide", "updatedAt", "desc", 1, 10);
    expect(result.documents.length).toBe(2);
    const ids = result.documents.map((d) => d._id);
    expect(ids).toContain("e1");
    expect(ids).toContain("e5");
  });

  it("sorts by updatedAt desc correctly across 5 documents", async () => {
    const result = await getCachedDocuments("", "updatedAt", "desc", 1, 10);
    const dates = result.documents.map((d) => new Date(d.updatedAt).getTime());
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i - 1]).toBeGreaterThanOrEqual(dates[i]);
    }
  });

  it("sorts by updatedAt asc correctly", async () => {
    const result = await getCachedDocuments("", "updatedAt", "asc", 1, 10);
    const dates = result.documents.map((d) => new Date(d.updatedAt).getTime());
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i - 1]).toBeLessThanOrEqual(dates[i]);
    }
  });

  it("paginates with limit=2, returns correct pages count", async () => {
    const p1 = await getCachedDocuments("", "updatedAt", "desc", 1, 2);
    expect(p1.documents.length).toBe(2);
    expect(p1.pagination.pages).toBe(3); // ceil(5/2) = 3

    const p2 = await getCachedDocuments("", "updatedAt", "desc", 2, 2);
    expect(p2.documents.length).toBe(2);

    const p3 = await getCachedDocuments("", "updatedAt", "desc", 3, 2);
    expect(p3.documents.length).toBe(1); // last page
  });

  it("no documents overlap between pages", async () => {
    const p1 = await getCachedDocuments("", "updatedAt", "desc", 1, 2);
    const p2 = await getCachedDocuments("", "updatedAt", "desc", 2, 2);
    const p3 = await getCachedDocuments("", "updatedAt", "desc", 3, 2);

    const allIds = [
      ...p1.documents.map((d) => d._id),
      ...p2.documents.map((d) => d._id),
      ...p3.documents.map((d) => d._id),
    ];
    const uniqueIds = new Set(allIds);
    expect(uniqueIds.size).toBe(5); // all 5, no duplicates
  });

  it("combined search + pagination works correctly", async () => {
    // Add extra docs matching 'guide'
    await localDb.documents.put(makeDoc({ _id: "e6", title: "Guide Extra 1", content: "", updatedAt: "2024-06-06T00:00:00Z" }));
    await localDb.documents.put(makeDoc({ _id: "e7", title: "Guide Extra 2", content: "", updatedAt: "2024-06-07T00:00:00Z" }));

    const p1 = await getCachedDocuments("guide", "updatedAt", "desc", 1, 2);
    const p2 = await getCachedDocuments("guide", "updatedAt", "desc", 2, 2);

    expect(p1.pagination.total).toBe(4); // e1, e5, e6, e7
    expect(p1.documents.length).toBe(2);
    expect(p2.documents.length).toBe(2);
  });

  it("returns empty documents array but pagination.total=0 when query matches nothing", async () => {
    const result = await getCachedDocuments("zzz_no_match_xyz", "updatedAt", "desc", 1, 10);
    expect(result.documents).toHaveLength(0);
    expect(result.pagination.total).toBe(0);
    expect(result.pagination.pages).toBe(1); // Math.max(1, ...)
  });
});

// ── CollaborativeEditorDatabase — schema ─────────────────────────────────────

describe("CollaborativeEditorDatabase — schema integrity", () => {
  it("can store documents with all syncStatus values", async () => {
    const statuses: Array<LocalDocument["syncStatus"]> = ["synced", "pending", "error"];
    for (const status of statuses) {
      const doc = makeDoc({ _id: `status_${status}`, syncStatus: status });
      await expect(localDb.documents.put(doc)).resolves.toBeDefined();
      const stored = await localDb.documents.get(`status_${status}`);
      expect(stored?.syncStatus).toBe(status);
    }
  });

  it("stores and retrieves collaborators array intact", async () => {
    const doc = makeDoc({
      _id: "with_collabs",
      collaborators: [
        { userId: { _id: "u2", name: "Bob", email: "bob@test.com" }, role: "EDITOR" },
        { userId: { _id: "u3", name: "Carol", email: "carol@test.com" }, role: "VIEWER" },
      ],
    });
    await localDb.documents.put(doc);
    const stored = await localDb.documents.get("with_collabs");
    expect(stored?.collaborators).toHaveLength(2);
    expect(stored?.collaborators[0].role).toBe("EDITOR");
    expect(stored?.collaborators[1].role).toBe("VIEWER");
  });

  it("outbox auto-increments id for each entry", async () => {
    const id1 = await localDb.outbox.add({
      documentId: "d1",
      action: "update_content",
      payload: { content: "a" },
      timestamp: Date.now(),
    });
    const id2 = await localDb.outbox.add({
      documentId: "d2",
      action: "rename_document",
      payload: { title: "b" },
      timestamp: Date.now(),
    });
    expect(typeof id1).toBe("number");
    expect(typeof id2).toBe("number");
    expect(id2 as number).toBeGreaterThan(id1 as number);
  });

  it("can query outbox by documentId efficiently", async () => {
    await localDb.outbox.bulkAdd([
      { documentId: "target", action: "update_content", payload: {}, timestamp: 1 },
      { documentId: "other",  action: "update_content", payload: {}, timestamp: 2 },
      { documentId: "target", action: "rename_document", payload: {}, timestamp: 3 },
    ]);
    const targetItems = await localDb.outbox.where("documentId").equals("target").toArray();
    expect(targetItems).toHaveLength(2);
  });

  it("can delete outbox item by id", async () => {
    const id = await localDb.outbox.add({
      documentId: "del_test",
      action: "create_document",
      payload: { title: "X" },
      timestamp: Date.now(),
    }) as number;

    await localDb.outbox.delete(id);
    const item = await localDb.outbox.get(id);
    expect(item).toBeUndefined();
  });
});
