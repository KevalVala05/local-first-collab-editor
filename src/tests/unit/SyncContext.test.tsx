import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach, MockInstance } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { SyncProvider, useSync } from "@/context/SyncContext";
import api from "@/lib/api";
import { localDb } from "@/lib/localDb";

// Mock Query Client
const mockInvalidateQueries = vi.fn();
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
  }),
}));

// Mock api
vi.mock("@/lib/api", () => ({
  default: {
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock localDb
vi.mock("@/lib/localDb", () => ({
  localDb: {
    outbox: {
      orderBy: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue([]),
      where: vi.fn().mockReturnThis(),
      equals: vi.fn().mockReturnThis(),
      delete: vi.fn().mockResolvedValue(undefined),
      put: vi.fn().mockResolvedValue(undefined),
    },
    documents: {
      get: vi.fn().mockResolvedValue(undefined),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    },
  },
}));

const mockOutbox = vi.mocked(localDb.outbox);
const mockDocuments = vi.mocked(localDb.documents);

// Test helper component to consume context
const TestConsumer = () => {
  const { syncStatus, isOnline, triggerSync } = useSync();
  return (
    <div>
      <span data-testid="status">{syncStatus}</span>
      <span data-testid="online">{isOnline ? "true" : "false"}</span>
      <button data-testid="trigger-btn" onClick={() => triggerSync()}>Sync</button>
    </div>
  );
};

describe("SyncContext & SyncProvider", () => {
  let fetchSpy: MockInstance<typeof fetch>;

  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Default online navigator status
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);

    // Suppress console.error output
    consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Mock fetch for pingServer
    fetchSpy = vi.spyOn(global, "fetch").mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
      } as Response)
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    fetchSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it("throws error when useSync is used outside SyncProvider", () => {
    const localConsoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => render(<TestConsumer />)).toThrow(
      "useSync must be used within a SyncProvider"
    );

    localConsoleSpy.mockRestore();
  });

  it("initializes to online status, pings server, and pings repeatedly on interval", async () => {
    render(
      <SyncProvider>
        <TestConsumer />
      </SyncProvider>
    );

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(screen.getByTestId("status").textContent).toBe("online");
    expect(screen.getByTestId("online").textContent).toBe("true");
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/auth/session",
      expect.any(Object)
    );

    // Fast-forward interval (15000ms)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("handles offline status when pingServer fails or navigator offline events are fired", async () => {
    fetchSpy.mockRejectedValue(new Error("Network connection lost"));

    render(
      <SyncProvider>
        <TestConsumer />
      </SyncProvider>
    );

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(screen.getByTestId("status").textContent).toBe("offline");
    expect(screen.getByTestId("online").textContent).toBe("false");

    fetchSpy.mockResolvedValue({ ok: true } as Response);
    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await vi.runOnlyPendingTimersAsync();
    });

    expect(screen.getByTestId("status").textContent).toBe("online");

    fetchSpy.mockRejectedValue(new Error("Offline"));
    await act(async () => {
      window.dispatchEvent(new Event("offline"));
      await vi.runOnlyPendingTimersAsync();
    });

    expect(screen.getByTestId("status").textContent).toBe("offline");
  });

  it("pingsServer timeout aborts fetch request", async () => {
    fetchSpy.mockImplementation((_url: string | URL | Request, init?: RequestInit) => {
      return new Promise((resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new Error("AbortError"));
        });
      });
    });

    render(
      <SyncProvider>
        <TestConsumer />
      </SyncProvider>
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(screen.getByTestId("status").textContent).toBe("offline");
  });

  it("handles create_document outbox item sync flow, updates dependent outbox actions, and dispatches custom event", async () => {
    const mockCreatedDoc = {
      _id: "mongo_doc_123",
      title: "New Document",
      ownerId: "user1",
      collaborators: undefined as unknown as string[],
      updatedAt: "2024-01-01",
      createdAt: "2024-01-01",
    };

    vi.mocked(api.post).mockResolvedValueOnce({ data: { data: mockCreatedDoc } });

    const createAction = {
      id: 1,
      action: "create_document",
      documentId: "local_temp_id",
      payload: { title: "New Document" },
      timestamp: Date.now(),
    };

    const dependentAction = {
      id: 2,
      action: "update_content",
      documentId: "local_temp_id",
      payload: { content: "Updated Content" },
      timestamp: Date.now() + 10,
    };

    const dependentActionWithSameId = {
      id: 1,
      action: "create_document",
      documentId: "local_temp_id",
    };

    const dependentActionWithNoId = {
      id: undefined,
      action: "update_content",
      documentId: "local_temp_id",
    };

    mockOutbox.toArray.mockResolvedValueOnce([createAction]);
    mockOutbox.toArray.mockResolvedValueOnce([
      dependentAction,
      dependentActionWithSameId,
      dependentActionWithNoId,
    ]);

    const localDoc = { _id: "local_temp_id", title: "New Document", content: undefined as unknown as string };
    mockDocuments.get.mockResolvedValueOnce(localDoc);

    const eventSpy = vi.fn();
    window.addEventListener("document_created_sync", eventSpy);

    render(
      <SyncProvider>
        <TestConsumer />
      </SyncProvider>
    );

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(api.post).toHaveBeenCalledWith("/documents", { title: "New Document" });

    expect(mockDocuments.put).toHaveBeenCalledWith({
      _id: "mongo_doc_123",
      title: "New Document",
      content: "",
      ownerId: "user1",
      collaborators: [],
      updatedAt: "2024-01-01",
      createdAt: "2024-01-01",
      syncStatus: "synced",
    });
    expect(mockDocuments.delete).toHaveBeenCalledWith("local_temp_id");

    expect(mockOutbox.put).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 2,
        documentId: "mongo_doc_123",
      })
    );

    expect(mockOutbox.delete).toHaveBeenCalledWith(1);

    expect(eventSpy).toHaveBeenCalled();
    const eventDetail = eventSpy.mock.calls[0][0].detail;
    expect(eventDetail).toEqual({
      oldId: "local_temp_id",
      newId: "mongo_doc_123",
    });

    window.removeEventListener("document_created_sync", eventSpy);
  });

  it("handles create_document outbox item sync flow when local document is missing", async () => {
    const mockCreatedDoc = {
      _id: "mongo_doc_123",
      title: "New Document",
      ownerId: "user1",
      collaborators: [],
      updatedAt: "2024-01-01",
      createdAt: "2024-01-01",
    };

    vi.mocked(api.post).mockResolvedValueOnce({ data: { data: mockCreatedDoc } });

    const createAction = {
      id: 17,
      action: "create_document",
      documentId: "local_temp_id_missing",
      payload: { title: "New Document" },
      timestamp: Date.now(),
    };

    mockOutbox.toArray.mockResolvedValueOnce([createAction]);
    mockOutbox.toArray.mockResolvedValueOnce([]);
    mockDocuments.get.mockResolvedValueOnce(undefined);

    render(
      <SyncProvider>
        <TestConsumer />
      </SyncProvider>
    );

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(mockDocuments.put).not.toHaveBeenCalled();
    expect(mockDocuments.delete).not.toHaveBeenCalled();
    expect(mockOutbox.delete).toHaveBeenCalledWith(17);
  });

  it("handles update_content outbox item sync flow", async () => {
    const updateAction = {
      id: 10,
      action: "update_content",
      documentId: "doc_abc",
      payload: { content: "New Content String" },
      timestamp: Date.now(),
    };

    mockOutbox.toArray.mockResolvedValueOnce([updateAction]);

    const localDoc = { _id: "doc_abc", title: "Title", content: "Old Content", syncStatus: "pending" };
    mockDocuments.get.mockResolvedValueOnce(localDoc);

    render(
      <SyncProvider>
        <TestConsumer />
      </SyncProvider>
    );

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(api.patch).toHaveBeenCalledWith("/documents/doc_abc", { content: "New Content String" });
    expect(mockDocuments.put).toHaveBeenCalledWith({
      ...localDoc,
      syncStatus: "synced",
    });
    expect(mockOutbox.delete).toHaveBeenCalledWith(10);
  });

  it("handles update_content outbox item sync flow when local document is missing", async () => {
    const updateAction = {
      id: 15,
      action: "update_content",
      documentId: "missing_doc",
      payload: { content: "New Content" },
      timestamp: Date.now(),
    };

    mockOutbox.toArray.mockResolvedValueOnce([updateAction]);
    mockDocuments.get.mockResolvedValueOnce(undefined);

    render(
      <SyncProvider>
        <TestConsumer />
      </SyncProvider>
    );

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(api.patch).toHaveBeenCalledWith("/documents/missing_doc", { content: "New Content" });
    expect(mockDocuments.put).not.toHaveBeenCalled();
    expect(mockOutbox.delete).toHaveBeenCalledWith(15);
  });

  it("handles rename_document outbox item sync flow", async () => {
    const renameAction = {
      id: 11,
      action: "rename_document",
      documentId: "doc_abc",
      payload: { title: "New Document Title" },
      timestamp: Date.now(),
    };

    mockOutbox.toArray.mockResolvedValueOnce([renameAction]);

    const localDoc = { _id: "doc_abc", title: "Old Title", content: "Content", syncStatus: "pending" };
    mockDocuments.get.mockResolvedValueOnce(localDoc);

    render(
      <SyncProvider>
        <TestConsumer />
      </SyncProvider>
    );

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(api.patch).toHaveBeenCalledWith("/documents/doc_abc", { title: "New Document Title" });
    expect(mockDocuments.put).toHaveBeenCalledWith({
      ...localDoc,
      syncStatus: "synced",
    });
    expect(mockOutbox.delete).toHaveBeenCalledWith(11);
  });

  it("handles rename_document outbox item sync flow when local document is missing", async () => {
    const renameAction = {
      id: 16,
      action: "rename_document",
      documentId: "missing_doc",
      payload: { title: "New Title" },
      timestamp: Date.now(),
    };

    mockOutbox.toArray.mockResolvedValueOnce([renameAction]);
    mockDocuments.get.mockResolvedValueOnce(undefined);

    render(
      <SyncProvider>
        <TestConsumer />
      </SyncProvider>
    );

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(api.patch).toHaveBeenCalledWith("/documents/missing_doc", { title: "New Title" });
    expect(mockDocuments.put).not.toHaveBeenCalled();
    expect(mockOutbox.delete).toHaveBeenCalledWith(16);
  });

  it("handles delete_document outbox item sync flow", async () => {
    const deleteAction = {
      id: 12,
      action: "delete_document",
      documentId: "doc_abc",
      payload: {},
      timestamp: Date.now(),
    };

    mockOutbox.toArray.mockResolvedValueOnce([deleteAction]);

    render(
      <SyncProvider>
        <TestConsumer />
      </SyncProvider>
    );

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(api.delete).toHaveBeenCalledWith("/documents/doc_abc");
    expect(mockOutbox.delete).toHaveBeenCalledWith(12);
  });

  it("does not delete outbox item if id is undefined", async () => {
    const action = {
      id: undefined,
      action: "delete_document",
      documentId: "doc_abc",
      timestamp: Date.now(),
    };

    mockOutbox.toArray.mockResolvedValueOnce([action]);

    render(
      <SyncProvider>
        <TestConsumer />
      </SyncProvider>
    );

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(mockOutbox.delete).not.toHaveBeenCalled();
  });

  it("pauses sync loop on network errors", async () => {
    // Prevent checkConnection from completing and overriding status
    fetchSpy.mockReturnValue(new Promise(() => {}));

    const action = { id: 20, action: "delete_document", documentId: "doc_abc", timestamp: Date.now() };
    mockOutbox.toArray.mockResolvedValueOnce([action]);

    vi.mocked(api.delete).mockRejectedValueOnce({ message: "Failed to fetch" });

    render(
      <SyncProvider>
        <TestConsumer />
      </SyncProvider>
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(screen.getByTestId("status").textContent).toBe("error");
    expect(mockOutbox.delete).not.toHaveBeenCalled();
  });

  it("discards item on validation/server errors to prevent sync lockups", async () => {
    const action = { id: 21, action: "delete_document", documentId: "doc_abc", timestamp: Date.now() };
    mockOutbox.toArray.mockResolvedValueOnce([action]);

    vi.mocked(api.delete).mockRejectedValueOnce({ status: 400, response: {} });

    render(
      <SyncProvider>
        <TestConsumer />
      </SyncProvider>
    );

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(screen.getByTestId("status").textContent).toBe("online");
    expect(mockOutbox.delete).toHaveBeenCalledWith(21);
  });

  it("handles pingServer resolution after component has unmounted", async () => {
    let resolvePing: (value: Response) => void = () => {};
    fetchSpy.mockImplementation(() => {
      return new Promise<Response>((resolve) => {
        resolvePing = resolve;
      });
    });

    const { unmount } = render(
      <SyncProvider>
        <TestConsumer />
      </SyncProvider>
    );

    // Unmount while fetch is pending
    unmount();

    // Resolve fetch
    await act(async () => {
      resolvePing({ ok: true, status: 200 } as Response);
    });
  });

  it("does not delete outbox items if id is undefined for create, update, and rename actions", async () => {
    const createAction = {
      id: undefined,
      action: "create_document",
      documentId: "local_temp_1",
      payload: { title: "New Doc" },
    };
    const updateAction = {
      id: undefined,
      action: "update_content",
      documentId: "doc_abc",
      payload: { content: "New Content" },
    };
    const renameAction = {
      id: undefined,
      action: "rename_document",
      documentId: "doc_abc",
      payload: { title: "New Title" },
    };

    mockOutbox.toArray.mockResolvedValueOnce([createAction, updateAction, renameAction]);

    const localDoc = { _id: "local_temp_1", title: "New Doc", content: "some content" };
    mockDocuments.get.mockResolvedValue(localDoc);

    const mockCreatedDoc = { _id: "mongo_1", title: "New Doc", ownerId: "u1" };
    vi.mocked(api.post).mockResolvedValueOnce({ data: { data: mockCreatedDoc } });
    vi.mocked(api.patch).mockResolvedValue(undefined);

    render(
      <SyncProvider>
        <TestConsumer />
      </SyncProvider>
    );

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(mockOutbox.delete).not.toHaveBeenCalled();
  });

  it("does not delete outbox item if id is undefined during processing error", async () => {
    const action = {
      id: undefined,
      action: "delete_document",
      documentId: "doc_abc",
      timestamp: Date.now(),
    };

    mockOutbox.toArray.mockResolvedValueOnce([action]);
    vi.mocked(api.delete).mockRejectedValueOnce({ status: 400, response: {} });

    render(
      <SyncProvider>
        <TestConsumer />
      </SyncProvider>
    );

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(mockOutbox.delete).not.toHaveBeenCalled();
  });

  it("does not trigger initial sync if navigator.onLine is false on mount", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);

    render(
      <SyncProvider>
        <TestConsumer />
      </SyncProvider>
    );

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(mockOutbox.toArray).not.toHaveBeenCalled();
  });

  it("handles unknown outbox actions by ignoring them", async () => {
    const action = {
      id: 99,
      action: "unknown_action",
      documentId: "doc_abc",
      timestamp: Date.now(),
    };

    mockOutbox.toArray.mockResolvedValueOnce([action]);

    render(
      <SyncProvider>
        <TestConsumer />
      </SyncProvider>
    );

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(mockOutbox.delete).not.toHaveBeenCalled();
  });
});
