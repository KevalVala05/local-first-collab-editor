/**
 * @file share.test.ts
 * @description Unit tests for the document share route handler (POST /api/documents/[id]/share).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/documents/[id]/share/route";
import { Document } from "@/models/Document";
import { User } from "@/models/User";
import { getServerSession } from "next-auth";
import { StatusCodes } from "http-status-codes";
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from "@/constants/messages";
import { DocumentRole } from "@/types/document";

// Mock database connection
vi.mock("@/lib/db", () => ({
  default: vi.fn().mockResolvedValue(true),
}));

// Mock next-auth
vi.mock("next-auth", () => ({
  default: vi.fn(),
  getServerSession: vi.fn(),
}));

// Mock mongoose models
vi.mock("@/models/Document", () => ({
  Document: {
    findById: vi.fn(),
  },
}));

vi.mock("@/models/User", () => ({
  User: {
    findOne: vi.fn(),
  },
}));

function makeMockQuery(resolveValue: unknown) {
  const query = {
    populate: vi.fn().mockReturnThis(),
    then: vi.fn().mockImplementation((onfulfilled) => {
      return Promise.resolve(resolveValue).then(onfulfilled);
    }),
  };
  return query as unknown as ReturnType<typeof Document.findById>;
}

describe("POST /api/documents/[id]/share — API Route Handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createRequest = (body: Record<string, unknown>) => {
    return new Request("http://localhost/api/documents/doc_123/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  };
  const params = Promise.resolve({ id: "doc_123" });

  it("returns UNAUTHORIZED if user session is missing", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);

    const res = await POST(createRequest({ email: "test@test.com", role: DocumentRole.EDITOR }), { params });

    expect(res.status).toBe(StatusCodes.UNAUTHORIZED);
  });

  it("returns FORBIDDEN if sharing initiator has VIEWER role", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "user_viewer" } });

    const mockDoc = {
      _id: "doc_123",
      ownerId: "user_owner",
      collaborators: [{ userId: "user_viewer", role: DocumentRole.VIEWER }],
    };
    vi.mocked(Document.findById).mockResolvedValue(mockDoc as unknown as ReturnType<typeof Document.findById>);

    const res = await POST(createRequest({ email: "test@test.com", role: DocumentRole.EDITOR }), { params });
    const body = await res.json();

    expect(res.status).toBe(StatusCodes.FORBIDDEN);
    expect(body.message).toBe(ERROR_MESSAGES.DOCUMENT_ACCESS_DENIED);
  });

  it("returns NOT_FOUND if target user by email does not exist", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "user_owner" } });

    const mockDoc = {
      _id: "doc_123",
      ownerId: "user_owner",
      collaborators: [],
    };
    vi.mocked(Document.findById).mockResolvedValue(mockDoc as unknown as ReturnType<typeof Document.findById>);
    vi.mocked(User.findOne).mockResolvedValue(null); // target user not found

    const res = await POST(createRequest({ email: "unknown@test.com", role: DocumentRole.EDITOR }), { params });
    const body = await res.json();

    expect(res.status).toBe(StatusCodes.NOT_FOUND);
    expect(body.message).toBe(ERROR_MESSAGES.USER_EMAIL_NOT_FOUND);
  });

  it("returns BAD_REQUEST when trying to share with the owner", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "user_owner" } });

    const mockDoc = {
      _id: "doc_123",
      ownerId: "user_owner",
      collaborators: [],
    };
    vi.mocked(Document.findById).mockResolvedValue(mockDoc as unknown as ReturnType<typeof Document.findById>);

    // Target user is the owner
    vi.mocked(User.findOne).mockResolvedValue({
      _id: "user_owner",
      email: "owner@test.com",
    } as unknown as ReturnType<typeof User.findOne>);

    const res = await POST(createRequest({ email: "owner@test.com", role: DocumentRole.EDITOR }), { params });
    const body = await res.json();

    expect(res.status).toBe(StatusCodes.BAD_REQUEST);
    expect(body.message).toBe(ERROR_MESSAGES.OWNER_CANNOT_SHARE);
  });

  it("successfully adds a new collaborator", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "user_owner" } });

    const mockDoc = {
      _id: "doc_123",
      ownerId: "user_owner",
      collaborators: [],
      save: vi.fn().mockResolvedValue(true),
    };

    const mockFindById = vi.fn().mockImplementation(() => {
      if (vi.mocked(Document.findById).mock.calls.length === 1) {
        return Promise.resolve(mockDoc);
      }
      return makeMockQuery(mockDoc);
    });

    vi.mocked(Document.findById).mockImplementation(mockFindById);

    vi.mocked(User.findOne).mockResolvedValue({
      _id: "user_collab",
      email: "collab@test.com",
    } as unknown as ReturnType<typeof User.findOne>);

    const res = await POST(createRequest({ email: "collab@test.com", role: DocumentRole.EDITOR }), { params });
    const body = await res.json();

    expect(mockDoc.collaborators).toContainEqual({
      userId: "user_collab",
      role: DocumentRole.EDITOR,
    });
    expect(mockDoc.save).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(StatusCodes.OK);
    expect(body.message).toBe(SUCCESS_MESSAGES.DOCUMENT_SHARE_SUCCESS);
  });
});
