/**
 * @file documents.test.ts
 * @description Unit tests for the documents route handler (GET & POST /api/documents).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, POST } from "@/app/api/documents/route";
import { Document } from "@/models/Document";
import { getServerSession } from "next-auth";
import { StatusCodes } from "http-status-codes";
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from "@/constants/messages";

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
  const mockQuery = {
    sort: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    populate: vi.fn().mockResolvedValue([]),
  };
  return {
    Document: {
      countDocuments: vi.fn(),
      find: vi.fn().mockReturnValue(mockQuery),
      create: vi.fn(),
    },
  };
});

describe("GET /api/documents — API Route Handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createGetRequest = (url = "http://localhost/api/documents") => {
    return new Request(url, { method: "GET" });
  };

  it("returns UNAUTHORIZED if user session is missing", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);

    const req = createGetRequest();
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(StatusCodes.UNAUTHORIZED);
    expect(body.message).toBe(ERROR_MESSAGES.UNAUTHORIZED);
  });

  it("returns list of documents when session exists", async () => {
    const mockSession = { user: { id: "user_123" } };
    vi.mocked(getServerSession).mockResolvedValue(mockSession);

    // Mock document find and count methods
    vi.mocked(Document.countDocuments).mockResolvedValue(1);
    const mockDocs = [
      { _id: "doc_1", title: "Test Doc", ownerId: "user_123", collaborators: [] },
    ];
    // Find returns the query chain, so populate resolves mockDocs
    const mockFindQuery = Document.find() as unknown as ReturnType<typeof Document.find>;
    vi.mocked(mockFindQuery.populate).mockResolvedValue(mockDocs);

    const req = createGetRequest("http://localhost/api/documents?q=Test&page=1&limit=5");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(StatusCodes.OK);
    expect(body.message).toBe(SUCCESS_MESSAGES.DOCUMENT_RETRIEVE_SUCCESS);
    expect(body.data.documents).toEqual(mockDocs);
    expect(body.data.pagination).toEqual({
      page: 1,
      limit: 5,
      total: 1,
      pages: 1,
    });
  });
});

describe("POST /api/documents — API Route Handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createPostRequest = (body: Record<string, unknown>, headers: Record<string, string> = {}) => {
    return new Request("http://localhost/api/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  };

  it("returns UNAUTHORIZED if session is missing", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);

    const req = createPostRequest({ title: "New Doc" });
    const res = await POST(req);

    expect(res.status).toBe(StatusCodes.UNAUTHORIZED);
  });

  it("successfully creates a new document", async () => {
    const mockSession = { user: { id: "user_123" } };
    vi.mocked(getServerSession).mockResolvedValue(mockSession);

    const mockDoc = {
      _id: "doc_new",
      title: "New Document",
      content: "",
      ownerId: "user_123",
      currentVersion: 0,
      collaborators: [],
    };
    type MockedFunction = {
      mockResolvedValue: (val: unknown) => void;
    };
    (vi.mocked(Document.create) as unknown as MockedFunction).mockResolvedValue(mockDoc);

    const req = createPostRequest({ title: "New Document" });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(StatusCodes.CREATED);
    expect(body.message).toBe(SUCCESS_MESSAGES.DOCUMENT_CREATE_SUCCESS);
    expect(body.data).toEqual(mockDoc);
    expect(Document.create).toHaveBeenCalledWith({
      title: "New Document",
      content: "",
      ownerId: "user_123",
      currentVersion: 0,
      collaborators: [],
    });
  });

  it("enforces payload limit check", async () => {
    const mockSession = { user: { id: "user_123" } };
    vi.mocked(getServerSession).mockResolvedValue(mockSession);

    const req = createPostRequest({ title: "Huge Title" }, { "content-length": String(2 * 1024 * 1024) });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(StatusCodes.REQUEST_TOO_LONG);
    expect(body.message).toContain("Payload too large");
  });
});
