/**
 * @file snapshots.test.ts
 * @description Unit tests for the snapshots route handler (GET & POST /api/documents/[id]/snapshots).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, POST } from "@/app/api/documents/[id]/snapshots/route";
import { Document } from "@/models/Document";
import { Snapshot } from "@/models/Snapshot";
import { getServerSession } from "next-auth";
import { StatusCodes } from "http-status-codes";
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from "@/constants/messages";
import { DocumentRole } from "@/types/document";
import zlib from "zlib";

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
vi.mock("@/models/Document", () => ({
  Document: {
    findById: vi.fn(),
  },
}));

vi.mock("@/models/Snapshot", () => {
  const mockQuery = {
    sort: vi.fn().mockReturnThis(),
    populate: vi.fn().mockResolvedValue([]),
  };
  return {
    Snapshot: {
      find: vi.fn().mockReturnValue(mockQuery),
      create: vi.fn(),
    },
  };
});

describe("GET /api/documents/[id]/snapshots — API Route Handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createRequest = () => new Request("http://localhost/api/documents/doc_123/snapshots");
  const params = Promise.resolve({ id: "doc_123" });

  it("returns snapshots list and correctly decompresses content", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "user_owner" } });

    const mockDoc = {
      _id: "doc_123",
      ownerId: "user_owner",
      collaborators: [],
    };
    vi.mocked(Document.findById).mockResolvedValue(mockDoc as unknown as ReturnType<typeof Document.findById>);

    // Gzipped "Hello from history!"
    const rawContent = "Hello from history!";
    const compressedBase64 = zlib.gzipSync(rawContent).toString("base64");

    const mockSnapshots = [
      {
        _id: "snap_1",
        documentId: "doc_123",
        version: 1,
        title: "Version 1",
        content: compressedBase64,
        createdBy: { _id: "user_owner", name: "Owner" },
        createdAt: new Date().toISOString(),
      },
    ];

    const mockFindQuery = Snapshot.find() as unknown as ReturnType<typeof Snapshot.find>;
    vi.mocked(mockFindQuery.populate).mockResolvedValue(mockSnapshots);

    const res = await GET(createRequest(), { params });
    const body = await res.json();

    expect(res.status).toBe(StatusCodes.OK);
    expect(body.message).toBe(SUCCESS_MESSAGES.SNAPSHOT_RETRIEVE_SUCCESS);
    expect(body.data[0].content).toBe(rawContent); // Decompressed
    expect(body.data[0].version).toBe(1);
  });
});

describe("POST /api/documents/[id]/snapshots — API Route Handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createRequest = (body: Record<string, unknown>) => {
    return new Request("http://localhost/api/documents/doc_123/snapshots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  };
  const params = Promise.resolve({ id: "doc_123" });

  it("returns FORBIDDEN if VIEWER attempts to create a snapshot", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "user_viewer" } });

    const mockDoc = {
      _id: "doc_123",
      ownerId: "user_owner",
      collaborators: [{ userId: "user_viewer", role: DocumentRole.VIEWER }],
    };
    vi.mocked(Document.findById).mockResolvedValue(mockDoc as unknown as ReturnType<typeof Document.findById>);

    const res = await POST(createRequest({ title: "Custom Snap" }), { params });
    const body = await res.json();

    expect(res.status).toBe(StatusCodes.FORBIDDEN);
    expect(body.message).toBe(ERROR_MESSAGES.VIEWER_CANNOT_SNAPSHOT);
  });

  it("successfully creates a new snapshot and increments doc version", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "user_owner" } });

    const mockDoc = {
      _id: "doc_123",
      content: "Latest editor text",
      currentVersion: 2,
      ownerId: "user_owner",
      collaborators: [],
      save: vi.fn().mockResolvedValue(true),
    };
    vi.mocked(Document.findById).mockResolvedValue(mockDoc as unknown as ReturnType<typeof Document.findById>);

    const mockCreatedSnapshot = {
      _id: "snap_new",
      documentId: "doc_123",
      version: 3,
      title: "Manual Snap",
      content: "dummyCompressed",
      createdBy: "user_owner",
      createdAt: new Date().toISOString(),
      populate: vi.fn().mockReturnThis(),
    };
    type MockedFunction = {
      mockResolvedValue: (val: unknown) => void;
    };
    (vi.mocked(Snapshot.create) as unknown as MockedFunction).mockResolvedValue(mockCreatedSnapshot);
    (vi.mocked(mockCreatedSnapshot.populate) as unknown as MockedFunction).mockResolvedValue({
      ...mockCreatedSnapshot,
      createdBy: { _id: "user_owner", name: "Owner" },
    });

    const res = await POST(createRequest({ title: "Manual Snap" }), { params });
    const body = await res.json();

    expect(mockDoc.currentVersion).toBe(3); // Incremented
    expect(mockDoc.save).toHaveBeenCalledTimes(1);
    expect(Snapshot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: "doc_123",
        version: 3,
        title: "Manual Snap",
        createdBy: "user_owner",
      })
    );

    // Verify compressed snapshot payload was sent to DB
    const firstCallArgs = vi.mocked(Snapshot.create).mock.calls[0][0] as unknown as Record<string, string>;
    const decompressed = zlib.gunzipSync(Buffer.from(firstCallArgs.content, "base64")).toString("utf-8");
    expect(decompressed).toBe("Latest editor text");

    expect(res.status).toBe(StatusCodes.CREATED);
    expect(body.message).toBe(SUCCESS_MESSAGES.SNAPSHOT_CREATE_SUCCESS);
    expect(body.data.content).toBe("Latest editor text"); // Decompressed response data
    expect(body.data.version).toBe(3);
  });
});
