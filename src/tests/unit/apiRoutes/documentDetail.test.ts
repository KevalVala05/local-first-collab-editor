/**
 * @file documentDetail.test.ts
 * @description Unit tests for the single document detail route handler (GET, PATCH & DELETE /api/documents/[id]).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, PATCH, DELETE } from "@/app/api/documents/[id]/route";
import { Document } from "@/models/Document";
import { getServerSession } from "next-auth";
import { StatusCodes } from "http-status-codes";
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from "@/constants/messages";
import { DocumentRole } from "@/types/document";

// Mock database connection
vi.mock("@/lib/db", () => ({
  default: vi.fn().mockResolvedValue(true),
}));

// Mock rate limiting
vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(),
}));

// Mock next-auth
vi.mock("next-auth", () => ({
  default: vi.fn(),
  getServerSession: vi.fn(),
}));

// Mock mongoose models
vi.mock("@/models/Document", () => {
  return {
    Document: {
      findById: vi.fn(),
      findByIdAndDelete: vi.fn(),
    },
  };
});

function makeMockQuery(resolveValue: unknown) {
  const query = {
    populate: vi.fn().mockReturnThis(),
    then: vi.fn().mockImplementation((onfulfilled) => {
      return Promise.resolve(resolveValue).then(onfulfilled);
    }),
  };
  return query as unknown as ReturnType<typeof Document.findById>;
}

describe("GET /api/documents/[id] — API Route Handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createRequest = () => new Request("http://localhost/api/documents/doc_123");
  const params = Promise.resolve({ id: "doc_123" });

  it("returns UNAUTHORIZED if user session is missing", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);

    const res = await GET(createRequest(), { params });
    const body = await res.json();

    expect(res.status).toBe(StatusCodes.UNAUTHORIZED);
    expect(body.message).toBe(ERROR_MESSAGES.UNAUTHORIZED);
  });

  it("returns NOT_FOUND if document does not exist", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "user_1" } });
    vi.mocked(Document.findById).mockResolvedValue(null);

    const res = await GET(createRequest(), { params });
    const body = await res.json();

    expect(res.status).toBe(StatusCodes.NOT_FOUND);
    expect(body.message).toBe(ERROR_MESSAGES.DOCUMENT_NOT_FOUND);
  });

  it("returns FORBIDDEN if user has no access permissions", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "user_1" } });
    // User is neither owner nor collaborator
    const mockDoc = {
      _id: "doc_123",
      ownerId: "user_other",
      collaborators: [],
    };
    vi.mocked(Document.findById).mockResolvedValue(mockDoc as unknown as ReturnType<typeof Document.findById>);

    const res = await GET(createRequest(), { params });
    const body = await res.json();

    expect(res.status).toBe(StatusCodes.FORBIDDEN);
    expect(body.message).toBe(ERROR_MESSAGES.DOCUMENT_ACCESS_DENIED);
  });

  it("successfully returns the document when user is OWNER", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "user_owner" } });
    
    const mockDoc = {
      _id: "doc_123",
      title: "Doc 1",
      ownerId: "user_owner",
      collaborators: [],
    };
    
    // The handler does `Document.findById` twice: once inside getDocumentWithPermission and once for populating.
    const mockFindById = vi.fn().mockImplementation(() => {
      if (vi.mocked(Document.findById).mock.calls.length === 1) {
        return Promise.resolve(mockDoc);
      }
      return makeMockQuery(mockDoc);
    });
    vi.mocked(Document.findById).mockImplementation(mockFindById);

    const res = await GET(createRequest(), { params });
    const body = await res.json();

    expect(res.status).toBe(StatusCodes.OK);
    expect(body.message).toBe(SUCCESS_MESSAGES.DOCUMENT_RETRIEVE_SUCCESS);
    expect(body.data).toEqual(mockDoc);
  });
});

describe("PATCH /api/documents/[id] — API Route Handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createRequest = (body: Record<string, unknown>) => {
    return new Request("http://localhost/api/documents/doc_123", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  };
  const params = Promise.resolve({ id: "doc_123" });

  it("returns FORBIDDEN when user has VIEWER role", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "user_viewer" } });
    
    const mockDoc = {
      _id: "doc_123",
      ownerId: "user_owner",
      collaborators: [{ userId: "user_viewer", role: DocumentRole.VIEWER }],
      save: vi.fn(),
    };
    vi.mocked(Document.findById).mockResolvedValue(mockDoc as unknown as ReturnType<typeof Document.findById>);

    const res = await PATCH(createRequest({ title: "New Title" }), { params });
    const body = await res.json();

    expect(res.status).toBe(StatusCodes.FORBIDDEN);
    expect(body.message).toBe(ERROR_MESSAGES.VIEWER_CANNOT_EDIT);
    expect(mockDoc.save).not.toHaveBeenCalled();
  });

  it("successfully updates document title and content as OWNER", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "user_owner" } });

    const mockDoc = {
      _id: "doc_123",
      title: "Old Title",
      content: "Old Content",
      ownerId: "user_owner",
      collaborators: [],
      save: vi.fn().mockResolvedValue(true),
    };
    vi.mocked(Document.findById).mockResolvedValue(mockDoc as unknown as ReturnType<typeof Document.findById>);

    const res = await PATCH(createRequest({ title: "New Title", content: "New Content" }), { params });
    const body = await res.json();

    expect(res.status).toBe(StatusCodes.OK);
    expect(mockDoc.title).toBe("New Title");
    expect(mockDoc.content).toBe("New Content");
    expect(mockDoc.save).toHaveBeenCalledTimes(1);
    expect(body.message).toBe(SUCCESS_MESSAGES.DOCUMENT_UPDATE_SUCCESS);
  });
});

describe("DELETE /api/documents/[id] — API Route Handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createRequest = () => new Request("http://localhost/api/documents/doc_123", { method: "DELETE" });
  const params = Promise.resolve({ id: "doc_123" });

  it("returns FORBIDDEN if collaborator attempts to delete document", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "user_editor" } });

    const mockDoc = {
      _id: "doc_123",
      ownerId: "user_owner",
      collaborators: [{ userId: "user_editor", role: DocumentRole.EDITOR }],
    };
    vi.mocked(Document.findById).mockResolvedValue(mockDoc as unknown as ReturnType<typeof Document.findById>);

    const res = await DELETE(createRequest(), { params });
    const body = await res.json();

    expect(res.status).toBe(StatusCodes.FORBIDDEN);
    expect(body.message).toBe(ERROR_MESSAGES.OWNER_ONLY_DELETE);
    expect(Document.findByIdAndDelete).not.toHaveBeenCalled();
  });

  it("successfully deletes the document if user is OWNER", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "user_owner" } });

    const mockDoc = {
      _id: "doc_123",
      ownerId: "user_owner",
      collaborators: [],
    };
    vi.mocked(Document.findById).mockResolvedValue(mockDoc as unknown as ReturnType<typeof Document.findById>);

    const res = await DELETE(createRequest(), { params });
    const body = await res.json();

    expect(res.status).toBe(StatusCodes.OK);
    expect(body.message).toBe(SUCCESS_MESSAGES.DOCUMENT_DELETE_SUCCESS);
    expect(Document.findByIdAndDelete).toHaveBeenCalledWith("doc_123");
  });
});
