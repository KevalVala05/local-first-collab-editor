/**
 * @file localDb.test.ts
 * @description Unit tests for the local-first IndexedDB helpers (Dexie-backed).
 *              Uses `fake-indexeddb` to simulate a real IndexedDB environment in Node.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  CollaborativeEditorDatabase,
  getCachedDocuments,
  saveDocumentLocally,
  renameDocumentLocally,
  createDocumentLocally,
  deleteDocumentLocally,
  type LocalDocument,
} from "@/lib/localDb";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Creates an in-memory database instance for each test run */
function makeDb() {
  return new CollaborativeEditorDatabase();
}

function makeSampleDoc(overrides: Partial<LocalDocument> = {}): LocalDocument {
  return {
    _id: "doc_001",
    title: "Test Document",
    content: "<p>Hello World</p>",
    ownerId: { _id: "user_1", name: "Alice", email: "alice@test.com" },
    collaborators: [],
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    syncStatus: "synced",
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("CollaborativeEditorDatabase", () => {
  it("should be able to add and retrieve a document", async () => {
    const db = makeDb();
    const doc = makeSampleDoc();
    await db.documents.put(doc);

    const retrieved = await db.documents.get("doc_001");
    expect(retrieved).toBeDefined();
    expect(retrieved?.title).toBe("Test Document");
    expect(retrieved?.syncStatus).toBe("synced");
  });

  it("should support adding items to the outbox", async () => {
    const db = makeDb();
    const id = await db.outbox.add({
      documentId: "doc_001",
      action: "update_content",
      payload: { content: "<p>Updated</p>" },
      timestamp: Date.now(),
    });

    expect(id).toBeDefined();
    const item = await db.outbox.get(id as number);
    expect(item?.action).toBe("update_content");
  });
});

describe("getCachedDocuments", () => {
  beforeEach(async () => {
    // We can't easily reset the module-level `localDb` in each test,
    // so these tests rely on the global fake-indexeddb reset via `fake-indexeddb/auto`.
  });

  it("returns empty result when no documents cached", async () => {
    const result = await getCachedDocuments("", "updatedAt", "desc", 1, 10);
    expect(result.documents).toBeInstanceOf(Array);
    expect(result.pagination).toHaveProperty("total");
  });
});

describe("createDocumentLocally", () => {
  it("creates a document with a local_ prefixed id", async () => {
    const doc = await createDocumentLocally(
      "My Offline Doc",
      "user_123",
      "Bob",
      "bob@test.com"
    );

    expect(doc._id).toMatch(/^local_/);
    expect(doc.title).toBe("My Offline Doc");
    expect(doc.syncStatus).toBe("pending");
    expect(doc.isLocalOnly).toBe(true);
    expect(doc.content).toBe("");
  });

  it("queues a create_document action in the outbox", async () => {
    const doc = await createDocumentLocally("Queued Doc", "user_1", "Alice", "a@b.com");
    const { localDb } = await import("@/lib/localDb");
    const outboxItems = await localDb.outbox
      .where("documentId")
      .equals(doc._id)
      .toArray();

    expect(outboxItems.length).toBeGreaterThanOrEqual(1);
    const createItem = outboxItems.find((i) => i.action === "create_document");
    expect(createItem).toBeDefined();
    expect(createItem?.payload.title).toBe("Queued Doc");
  });
});

describe("saveDocumentLocally", () => {
  it("updates content and marks syncStatus as pending", async () => {
    const { localDb } = await import("@/lib/localDb");
    const doc = makeSampleDoc({ _id: "doc_save_test", syncStatus: "synced" });
    await localDb.documents.put(doc);

    await saveDocumentLocally("doc_save_test", "<p>Updated content</p>");

    const updated = await localDb.documents.get("doc_save_test");
    expect(updated?.content).toBe("<p>Updated content</p>");
    expect(updated?.syncStatus).toBe("pending");
  });

  it("queues an update_content outbox item", async () => {
    const { localDb } = await import("@/lib/localDb");
    const doc = makeSampleDoc({ _id: "doc_queue_test" });
    await localDb.documents.put(doc);

    await saveDocumentLocally("doc_queue_test", "<p>New</p>");

    const items = await localDb.outbox
      .where("documentId")
      .equals("doc_queue_test")
      .and((i) => i.action === "update_content")
      .toArray();

    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items[0].payload.content).toBe("<p>New</p>");
  });

  it("deduplicates outbox entries on repeated saves", async () => {
    const { localDb } = await import("@/lib/localDb");
    const doc = makeSampleDoc({ _id: "doc_dedup_test" });
    await localDb.documents.put(doc);

    await saveDocumentLocally("doc_dedup_test", "<p>Version 1</p>");
    await saveDocumentLocally("doc_dedup_test", "<p>Version 2</p>");

    const items = await localDb.outbox
      .where("documentId")
      .equals("doc_dedup_test")
      .and((i) => i.action === "update_content")
      .toArray();

    // Should collapse into one pending outbox entry
    expect(items.length).toBe(1);
    expect(items[0].payload.content).toBe("<p>Version 2</p>");
  });
});

describe("renameDocumentLocally", () => {
  it("updates title and marks syncStatus as pending", async () => {
    const { localDb } = await import("@/lib/localDb");
    const doc = makeSampleDoc({ _id: "doc_rename_test", title: "Old Title" });
    await localDb.documents.put(doc);

    await renameDocumentLocally("doc_rename_test", "New Title");

    const updated = await localDb.documents.get("doc_rename_test");
    expect(updated?.title).toBe("New Title");
    expect(updated?.syncStatus).toBe("pending");
  });

  it("queues a rename_document outbox item", async () => {
    const { localDb } = await import("@/lib/localDb");
    const doc = makeSampleDoc({ _id: "doc_rename_queue" });
    await localDb.documents.put(doc);

    await renameDocumentLocally("doc_rename_queue", "Renamed Doc");

    const items = await localDb.outbox
      .where("documentId")
      .equals("doc_rename_queue")
      .and((i) => i.action === "rename_document")
      .toArray();

    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items[0].payload.title).toBe("Renamed Doc");
  });
});

describe("deleteDocumentLocally", () => {
  it("removes the document from IndexedDB", async () => {
    const { localDb } = await import("@/lib/localDb");
    const doc = makeSampleDoc({ _id: "doc_delete_test" });
    await localDb.documents.put(doc);

    await deleteDocumentLocally("doc_delete_test");

    const deleted = await localDb.documents.get("doc_delete_test");
    expect(deleted).toBeUndefined();
  });

  it("queues a delete_document outbox for server-synced docs", async () => {
    const { localDb } = await import("@/lib/localDb");
    const doc = makeSampleDoc({ _id: "server_doc_001" }); // no local_ prefix
    await localDb.documents.put(doc);

    await deleteDocumentLocally("server_doc_001");

    const items = await localDb.outbox
      .where("documentId")
      .equals("server_doc_001")
      .and((i) => i.action === "delete_document")
      .toArray();

    expect(items.length).toBeGreaterThanOrEqual(1);
  });

  it("does NOT queue delete for local-only docs", async () => {
    const { localDb } = await import("@/lib/localDb");
    const doc = makeSampleDoc({ _id: "local_123abc", isLocalOnly: true });
    await localDb.documents.put(doc);

    await deleteDocumentLocally("local_123abc");

    const items = await localDb.outbox
      .where("documentId")
      .equals("local_123abc")
      .and((i) => i.action === "delete_document")
      .toArray();

    // local-only docs should NOT be queued for server deletion
    expect(items.length).toBe(0);
  });

  it("clears existing pending outbox items for the deleted document", async () => {
    const { localDb } = await import("@/lib/localDb");
    const doc = makeSampleDoc({ _id: "doc_clear_outbox" });
    await localDb.documents.put(doc);

    // Pre-populate outbox with a pending update
    await localDb.outbox.add({
      documentId: "doc_clear_outbox",
      action: "update_content",
      payload: { content: "<p>Draft</p>" },
      timestamp: Date.now(),
    });

    await deleteDocumentLocally("doc_clear_outbox");

    const updateItems = await localDb.outbox
      .where("documentId")
      .equals("doc_clear_outbox")
      .and((i) => i.action === "update_content")
      .toArray();

    expect(updateItems.length).toBe(0);
  });

  it("handles outbox deletion even if outbox items do not have an id defined", async () => {
    const { localDb } = await import("@/lib/localDb");
    const doc = makeSampleDoc({ _id: "doc_no_id_test" });
    await localDb.documents.put(doc);

    // Spy on localDb.outbox.where to return a mock item that has no ID
    const spyWhere = vi.spyOn(localDb.outbox, "where").mockImplementation(() => {
      return {
        equals: () => {
          return {
            toArray: () => Promise.resolve([
              {
                documentId: "doc_no_id_test",
                action: "update_content",
                payload: { content: "some content" },
                timestamp: Date.now(),
                // id is deliberately missing/undefined
              },
            ]),
          } as unknown as never;
        },
      } as unknown as never;
    });

    await deleteDocumentLocally("doc_no_id_test");

    expect(spyWhere).toHaveBeenCalled();
    spyWhere.mockRestore();
  });
});
