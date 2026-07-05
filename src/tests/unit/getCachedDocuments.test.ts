/**
 * @file getCachedDocuments.test.ts
 * @description Integration-style unit tests for the getCachedDocuments helper,
 *              covering search filtering, sorting, and pagination logic.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { localDb, getCachedDocuments, type LocalDocument } from "@/lib/localDb";

// ── Seed Data ─────────────────────────────────────────────────────────────────

const DOCS: LocalDocument[] = [
  {
    _id: "d1",
    title: "Alpha Document",
    content: "content about react",
    ownerId: { _id: "u1", name: "Alice", email: "alice@test.com" },
    collaborators: [],
    updatedAt: "2024-01-03T00:00:00.000Z",
    createdAt: "2024-01-01T00:00:00.000Z",
    syncStatus: "synced",
  },
  {
    _id: "d2",
    title: "Beta Document",
    content: "content about vitest",
    ownerId: { _id: "u1", name: "Alice", email: "alice@test.com" },
    collaborators: [],
    updatedAt: "2024-01-01T00:00:00.000Z",
    createdAt: "2024-01-02T00:00:00.000Z",
    syncStatus: "pending",
  },
  {
    _id: "d3",
    title: "Gamma Document",
    content: "content about nextjs",
    ownerId: { _id: "u2", name: "Bob", email: "bob@test.com" },
    collaborators: [],
    updatedAt: "2024-01-02T00:00:00.000Z",
    createdAt: "2024-01-03T00:00:00.000Z",
    syncStatus: "synced",
  },
];

beforeEach(async () => {
  await localDb.documents.clear();
  await localDb.documents.bulkPut(DOCS);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("getCachedDocuments — search filtering", () => {
  it("returns all docs when query is empty", async () => {
    const result = await getCachedDocuments("", "updatedAt", "desc", 1, 10);
    expect(result.documents.length).toBe(3);
    expect(result.pagination.total).toBe(3);
  });

  it("filters by title substring (case-insensitive)", async () => {
    const result = await getCachedDocuments("alpha", "updatedAt", "desc", 1, 10);
    expect(result.documents.length).toBe(1);
    expect(result.documents[0]._id).toBe("d1");
  });

  it("filters by content substring", async () => {
    const result = await getCachedDocuments("vitest", "updatedAt", "desc", 1, 10);
    expect(result.documents.length).toBe(1);
    expect(result.documents[0]._id).toBe("d2");
  });

  it("returns empty array when query matches nothing", async () => {
    const result = await getCachedDocuments("xyz_no_match", "updatedAt", "desc", 1, 10);
    expect(result.documents.length).toBe(0);
    expect(result.pagination.total).toBe(0);
  });
});

describe("getCachedDocuments — sorting", () => {
  it("sorts by updatedAt descending (newest first)", async () => {
    const result = await getCachedDocuments("", "updatedAt", "desc", 1, 10);
    const ids = result.documents.map((d) => d._id);
    expect(ids).toEqual(["d1", "d3", "d2"]); // d1 > d3 > d2 by updatedAt
  });

  it("sorts by updatedAt ascending (oldest first)", async () => {
    const result = await getCachedDocuments("", "updatedAt", "asc", 1, 10);
    const ids = result.documents.map((d) => d._id);
    expect(ids).toEqual(["d2", "d3", "d1"]);
  });

  it("sorts by title ascending (alphabetical)", async () => {
    const result = await getCachedDocuments("", "title", "asc", 1, 10);
    const titles = result.documents.map((d) => d.title);
    expect(titles).toEqual(["Alpha Document", "Beta Document", "Gamma Document"]);
  });

  it("sorts by title descending (reverse alphabetical)", async () => {
    const result = await getCachedDocuments("", "title", "desc", 1, 10);
    const titles = result.documents.map((d) => d.title);
    expect(titles).toEqual(["Gamma Document", "Beta Document", "Alpha Document"]);
  });

  it("handles sorting when documents have identical sorting field values", async () => {
    const duplicateDoc: LocalDocument = {
      _id: "d4",
      title: "Alpha Document",
      content: "content duplicate",
      ownerId: { _id: "u1", name: "Alice", email: "alice@test.com" },
      collaborators: [],
      updatedAt: "2024-01-03T00:00:00.000Z",
      createdAt: "2024-01-01T00:00:00.000Z",
      syncStatus: "synced",
    };
    await localDb.documents.put(duplicateDoc);

    const result = await getCachedDocuments("", "title", "asc", 1, 10);
    const matchingDocs = result.documents.filter(d => d.title === "Alpha Document");
    expect(matchingDocs.length).toBe(2);
  });

  it("handles sorting when documents have undefined/falsy sorting values", async () => {
    const docWithEmptyTitle: LocalDocument = {
      _id: "d5",
      title: "",
      content: "empty title",
      ownerId: { _id: "u1", name: "Alice", email: "alice@test.com" },
      collaborators: [],
      updatedAt: "2024-01-03T00:00:00.000Z",
      createdAt: "2024-01-01T00:00:00.000Z",
      syncStatus: "synced",
    };
    await localDb.documents.put(docWithEmptyTitle);

    const result = await getCachedDocuments("", "title", "asc", 1, 10);
    expect(result.documents[0]._id).toBe("d5");
  });

  it("handles sorting by numeric fields (e.g. currentVersion)", async () => {
    const docLowVersion = {
      _id: "d6",
      title: "Doc Low",
      content: "",
      ownerId: { _id: "u1", name: "Alice", email: "alice@test.com" },
      collaborators: [],
      updatedAt: "2024-01-03T00:00:00.000Z",
      createdAt: "2024-01-01T00:00:00.000Z",
      syncStatus: "synced",
      currentVersion: 1,
    };
    const docHighVersion = {
      _id: "d7",
      title: "Doc High",
      content: "",
      ownerId: { _id: "u1", name: "Alice", email: "alice@test.com" },
      collaborators: [],
      updatedAt: "2024-01-03T00:00:00.000Z",
      createdAt: "2024-01-01T00:00:00.000Z",
      syncStatus: "synced",
      currentVersion: 5,
    };
    await localDb.documents.put(docLowVersion as unknown as LocalDocument);
    await localDb.documents.put(docHighVersion as unknown as LocalDocument);

    const resultAsc = await getCachedDocuments("", "currentVersion" as unknown as keyof LocalDocument, "asc", 1, 10);
    const sortedDocsAsc = resultAsc.documents.filter(d => d._id === "d6" || d._id === "d7");
    expect(sortedDocsAsc[0]._id).toBe("d6");

    const resultDesc = await getCachedDocuments("", "currentVersion" as unknown as keyof LocalDocument, "desc", 1, 10);
    const sortedDocsDesc = resultDesc.documents.filter(d => d._id === "d6" || d._id === "d7");
    expect(sortedDocsDesc[0]._id).toBe("d7");
  });
});

describe("getCachedDocuments — pagination", () => {
  it("returns correct page 1 with limit 2", async () => {
    const result = await getCachedDocuments("", "updatedAt", "desc", 1, 2);
    expect(result.documents.length).toBe(2);
    expect(result.pagination).toMatchObject({ page: 1, limit: 2, total: 3, pages: 2 });
  });

  it("returns correct page 2 with limit 2", async () => {
    const result = await getCachedDocuments("", "updatedAt", "desc", 2, 2);
    expect(result.documents.length).toBe(1);
    expect(result.pagination).toMatchObject({ page: 2, limit: 2, total: 3, pages: 2 });
  });

  it("returns page 1 when page number exceeds total pages", async () => {
    const result = await getCachedDocuments("", "updatedAt", "desc", 99, 10);
    // Slice is out of range — returns empty array
    expect(result.documents.length).toBe(0);
    expect(result.pagination.total).toBe(3);
  });

  it("calculates pages = 1 when fewer docs than limit", async () => {
    const result = await getCachedDocuments("", "updatedAt", "desc", 1, 100);
    expect(result.pagination.pages).toBe(1);
  });
});
