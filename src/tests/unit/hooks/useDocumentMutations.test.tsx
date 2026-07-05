/**
 * @file useDocumentMutations.test.tsx
 * @description Unit tests for the custom document mutation hooks:
 *              - useCreateDocumentMutation
 *              - useRenameDocumentMutation
 *              - useDeleteDocumentMutation
 *              - useShareDocumentMutation
 *              Covers online API interactions, local IndexedDB updates, offline fallbacks,
 *              toast signals, query invalidations, and error boundary responses.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import {
  useCreateDocumentMutation,
  useRenameDocumentMutation,
  useDeleteDocumentMutation,
  useShareDocumentMutation,
} from "@/hooks/useDocumentMutations";
import api from "@/lib/api";
import { toastSuccess, toastError } from "@/lib/toast";
import { useSession } from "next-auth/react";
import {
  createDocumentLocally,
  renameDocumentLocally,
  deleteDocumentLocally,
  localDb,
} from "@/lib/localDb";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// Mock next-auth
vi.mock("next-auth/react", () => ({
  useSession: vi.fn(),
}));

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock API client
vi.mock("@/lib/api", () => ({
  default: {
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock localDb functions and module
vi.mock("@/lib/localDb", () => {
  // Simple in-memory mock tables
  const mockDocsTable = {
    put: vi.fn().mockResolvedValue(""),
    get: vi.fn(),
    delete: vi.fn().mockResolvedValue(""),
  };
  return {
    localDb: {
      documents: mockDocsTable,
    },
    createDocumentLocally: vi.fn(),
    renameDocumentLocally: vi.fn(),
    deleteDocumentLocally: vi.fn(),
  };
});

// Mock Toast
vi.mock("@/lib/toast", () => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const WrapperComponent = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  WrapperComponent.displayName = "WrapperComponent";
  return WrapperComponent;
};

describe("Document Mutation Hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default online
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    // Suppress console.warn messages in tests
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  // ── useCreateDocumentMutation ──────────────────────────────────────────────

  describe("useCreateDocumentMutation", () => {
    it("online: creates doc on server, caches locally, toast success, navigates, invalidates cache", async () => {
      vi.mocked(useSession).mockReturnValue({
        data: { user: { id: "u1", name: "Alice", email: "a@test.com" } },
        status: "authenticated",
      } as unknown as ReturnType<typeof useSession>);

      const serverDoc = {
        _id: "doc_server_123",
        title: "Online Document",
        content: "<p>Hello</p>",
        ownerId: "u1",
        collaborators: [],
        createdAt: "2026-07-04T00:00:00.000Z",
        updatedAt: "2026-07-04T00:00:00.000Z",
      };

      vi.mocked(api.post).mockResolvedValue({ data: { data: serverDoc } });

      const onSuccessMock = vi.fn();
      const { result } = renderHook(() => useCreateDocumentMutation({ onSuccess: onSuccessMock }), {
        wrapper: createWrapper(),
      });

      result.current.mutate("Online Document");

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(api.post).toHaveBeenCalledWith("/documents", { title: "Online Document" });
      expect(localDb.documents.put).toHaveBeenCalledWith({
        _id: "doc_server_123",
        title: "Online Document",
        content: "<p>Hello</p>",
        ownerId: "u1",
        collaborators: [],
        createdAt: "2026-07-04T00:00:00.000Z",
        updatedAt: "2026-07-04T00:00:00.000Z",
        syncStatus: "synced",
      });
      expect(toastSuccess).toHaveBeenCalledWith("Document created successfully");
      expect(onSuccessMock).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/documents/doc_server_123");
    });

    it("offline: falls back to local creation using session credentials", async () => {
      vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);

      vi.mocked(useSession).mockReturnValue({
        data: { user: { id: "u1", name: "Alice", email: "a@test.com" } },
        status: "authenticated",
      } as unknown as ReturnType<typeof useSession>);

      const localDoc = {
        _id: "doc_local_abc",
        title: "Offline Document",
        content: "",
        ownerId: { _id: "u1", name: "Alice", email: "a@test.com" },
        collaborators: [],
        syncStatus: "pending",
      };

      vi.mocked(createDocumentLocally).mockResolvedValue(localDoc as unknown as import("@/lib/localDb").LocalDocument);

      const { result } = renderHook(() => useCreateDocumentMutation(), {
        wrapper: createWrapper(),
      });

      result.current.mutate("Offline Document");

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(api.post).not.toHaveBeenCalled();
      expect(createDocumentLocally).toHaveBeenCalledWith("Offline Document", "u1", "Alice", "a@test.com");
      expect(toastSuccess).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/documents/doc_local_abc");
    });

    it("throws unauthorized if offline and no user session exists", async () => {
      vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
      vi.mocked(useSession).mockReturnValue({ data: null, status: "unauthenticated" } as unknown as ReturnType<typeof useSession>);

      const { result } = renderHook(() => useCreateDocumentMutation(), {
        wrapper: createWrapper(),
      });

      result.current.mutate("No Session Doc");

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(toastError).toHaveBeenCalledWith("Unauthorized access. Please log in.");
    });

    it("online: server creation fails (throws), falls back to local creation", async () => {
      vi.mocked(useSession).mockReturnValue({
        data: { user: { id: "u1", name: "Alice", email: "a@test.com" } },
        status: "authenticated",
      } as unknown as ReturnType<typeof useSession>);

      vi.mocked(api.post).mockRejectedValue(new Error("Server is down"));

      const localDoc = {
        _id: "doc_local_abc",
        title: "Fallback Document",
        content: "",
        ownerId: { _id: "u1", name: "Alice", email: "a@test.com" },
        collaborators: [],
        syncStatus: "pending",
      };

      vi.mocked(createDocumentLocally).mockResolvedValue(localDoc as unknown as import("@/lib/localDb").LocalDocument);

      const { result } = renderHook(() => useCreateDocumentMutation(), {
        wrapper: createWrapper(),
      });

      result.current.mutate("Fallback Document");

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(api.post).toHaveBeenCalledWith("/documents", { title: "Fallback Document" });
      expect(createDocumentLocally).toHaveBeenCalledWith("Fallback Document", "u1", "Alice", "a@test.com");
      expect(toastSuccess).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/documents/doc_local_abc");
    });

    it("onError: displays toast error on Error object rejection", async () => {
      vi.mocked(useSession).mockReturnValue({
        data: { user: { id: "u1", name: "Alice", email: "a@test.com" } },
        status: "authenticated",
      } as unknown as ReturnType<typeof useSession>);

      vi.mocked(api.post).mockRejectedValue(new Error("Server failed"));
      vi.mocked(createDocumentLocally).mockRejectedValue(new Error("Creation failed"));

      const { result } = renderHook(() => useCreateDocumentMutation(), {
        wrapper: createWrapper(),
      });

      result.current.mutate("Fail Doc");

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(toastError).toHaveBeenCalledWith("Creation failed");
    });

    it("onError: displays default toast error on non-Error object rejection", async () => {
      vi.mocked(useSession).mockReturnValue({
        data: { user: { id: "u1", name: "Alice", email: "a@test.com" } },
        status: "authenticated",
      } as unknown as ReturnType<typeof useSession>);

      vi.mocked(api.post).mockRejectedValue("Raw error string");
      vi.mocked(createDocumentLocally).mockRejectedValue("Raw local error");

      const { result } = renderHook(() => useCreateDocumentMutation(), {
        wrapper: createWrapper(),
      });

      result.current.mutate("Fail Doc");

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(toastError).toHaveBeenCalledWith("Failed to create document");
    });

    it("online: handles server creation when content and collaborators are omitted", async () => {
      vi.mocked(useSession).mockReturnValue({
        data: { user: { id: "u1", name: "Alice", email: "a@test.com" } },
        status: "authenticated",
      } as unknown as ReturnType<typeof useSession>);

      const serverDoc = {
        _id: "doc_server_123",
        title: "Omitted Fields Doc",
        ownerId: { _id: "u1", name: "Alice", email: "a@test.com" },
        updatedAt: "2024-01-01T00:00:00.000Z",
        createdAt: "2024-01-01T00:00:00.000Z",
      };

      vi.mocked(api.post).mockResolvedValue({ data: { data: serverDoc } });

      const { result } = renderHook(() => useCreateDocumentMutation(), {
        wrapper: createWrapper(),
      });

      result.current.mutate("Omitted Fields Doc");

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(localDb.documents.put).toHaveBeenCalledWith(
        expect.objectContaining({
          content: "",
          collaborators: [],
        })
      );
    });

    it("offline: falls back to local creation with default name/email if session fields are missing", async () => {
      vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
      vi.mocked(useSession).mockReturnValue({
        data: { user: { id: "u1" } },
        status: "authenticated",
      } as unknown as ReturnType<typeof useSession>);

      const mockLocalDoc = { _id: "doc_local_123" };
      vi.mocked(createDocumentLocally).mockResolvedValue(mockLocalDoc as unknown as import("@/lib/localDb").LocalDocument);

      const { result } = renderHook(() => useCreateDocumentMutation(), {
        wrapper: createWrapper(),
      });

      result.current.mutate("Default User Doc");

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(createDocumentLocally).toHaveBeenCalledWith("Default User Doc", "u1", "You", "");
    });
  });

  // ── useRenameDocumentMutation ──────────────────────────────────────────────

  describe("useRenameDocumentMutation", () => {
    it("online: patches server, updates local Db title, toast success, calls onSuccess", async () => {
      const serverDoc = { _id: "d1", title: "New Name" };
      vi.mocked(api.patch).mockResolvedValue({ data: { data: serverDoc } });

      const localDoc = { _id: "d1", title: "Old Name", syncStatus: "pending" };
      vi.mocked(localDb.documents.get).mockResolvedValue(localDoc as unknown as import("@/lib/localDb").LocalDocument);

      const onSuccessMock = vi.fn();
      const { result } = renderHook(() => useRenameDocumentMutation({ onSuccess: onSuccessMock }), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ id: "d1", title: "New Name" });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(api.patch).toHaveBeenCalledWith("/documents/d1", { title: "New Name" });
      expect(localDb.documents.get).toHaveBeenCalledWith("d1");
      expect(localDb.documents.put).toHaveBeenCalledWith({
        _id: "d1",
        title: "New Name",
        syncStatus: "synced",
      });
      expect(toastSuccess).toHaveBeenCalledWith("Document updated successfully");
      expect(onSuccessMock).toHaveBeenCalled();
    });

    it("offline: falls back to renaming locally", async () => {
      vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);

      const { result } = renderHook(() => useRenameDocumentMutation(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ id: "d1", title: "Offline Rename" });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(api.patch).not.toHaveBeenCalled();
      expect(renameDocumentLocally).toHaveBeenCalledWith("d1", "Offline Rename");
      expect(toastSuccess).toHaveBeenCalled();
    });

    it("online: server rename fails (throws), falls back to local rename", async () => {
      vi.mocked(api.patch).mockRejectedValue(new Error("Server error"));

      const { result } = renderHook(() => useRenameDocumentMutation(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ id: "d1", title: "Fallback Rename" });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(api.patch).toHaveBeenCalledWith("/documents/d1", { title: "Fallback Rename" });
      expect(renameDocumentLocally).toHaveBeenCalledWith("d1", "Fallback Rename");
      expect(toastSuccess).toHaveBeenCalled();
    });

    it("onError: displays toast error on failure", async () => {
      vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
      vi.mocked(renameDocumentLocally).mockRejectedValue(new Error("Database error"));

      const { result } = renderHook(() => useRenameDocumentMutation(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ id: "d1", title: "Failed Rename" });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(toastError).toHaveBeenCalledWith("Database error");
    });

    it("online: does not update local db if document is not found locally", async () => {
      const serverDoc = { _id: "d1", title: "New Name" };
      vi.mocked(api.patch).mockResolvedValue({ data: { data: serverDoc } });

      vi.mocked(localDb.documents.get).mockResolvedValue(undefined);

      const { result } = renderHook(() => useRenameDocumentMutation(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ id: "d1", title: "New Name" });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(localDb.documents.put).not.toHaveBeenCalled();
    });

    it("onError: displays default toast error on non-Error object rejection", async () => {
      vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
      vi.mocked(renameDocumentLocally).mockRejectedValue("Raw rename error");

      const { result } = renderHook(() => useRenameDocumentMutation(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ id: "d1", title: "Failed Rename" });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(toastError).toHaveBeenCalledWith("Failed to rename document");
    });
  });

  // ── useDeleteDocumentMutation ──────────────────────────────────────────────

  describe("useDeleteDocumentMutation", () => {
    it("online: calls delete on server, removes from local db, toast success, calls onSuccess", async () => {
      vi.mocked(api.delete).mockResolvedValue({ data: { success: true } });

      const onSuccessMock = vi.fn();
      const { result } = renderHook(() => useDeleteDocumentMutation({ onSuccess: onSuccessMock }), {
        wrapper: createWrapper(),
      });

      result.current.mutate("d1");

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(api.delete).toHaveBeenCalledWith("/documents/d1");
      expect(localDb.documents.delete).toHaveBeenCalledWith("d1");
      expect(toastSuccess).toHaveBeenCalledWith("Document deleted successfully");
      expect(onSuccessMock).toHaveBeenCalled();
    });

    it("offline: falls back to deleteDocumentLocally", async () => {
      vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);

      const { result } = renderHook(() => useDeleteDocumentMutation(), {
        wrapper: createWrapper(),
      });

      result.current.mutate("d1");

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(api.delete).not.toHaveBeenCalled();
      expect(deleteDocumentLocally).toHaveBeenCalledWith("d1");
      expect(toastSuccess).toHaveBeenCalled();
    });

    it("online: server delete fails (throws), falls back to local delete", async () => {
      vi.mocked(api.delete).mockRejectedValue(new Error("Server error"));

      const { result } = renderHook(() => useDeleteDocumentMutation(), {
        wrapper: createWrapper(),
      });

      result.current.mutate("d1");

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(api.delete).toHaveBeenCalledWith("/documents/d1");
      expect(deleteDocumentLocally).toHaveBeenCalledWith("d1");
      expect(toastSuccess).toHaveBeenCalled();
    });

    it("onError: displays toast error on failure", async () => {
      vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
      vi.mocked(deleteDocumentLocally).mockRejectedValue(new Error("Delete failed"));

      const { result } = renderHook(() => useDeleteDocumentMutation(), {
        wrapper: createWrapper(),
      });

      result.current.mutate("d1");

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(toastError).toHaveBeenCalledWith("Delete failed");
    });

    it("onError: displays default toast error on non-Error object rejection", async () => {
      vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
      vi.mocked(deleteDocumentLocally).mockRejectedValue("Raw delete error");

      const { result } = renderHook(() => useDeleteDocumentMutation(), {
        wrapper: createWrapper(),
      });

      result.current.mutate("d1");

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(toastError).toHaveBeenCalledWith("Failed to delete document");
    });
  });

  // ── useShareDocumentMutation ────────────────────────────────────────────────

  describe("useShareDocumentMutation", () => {
    it("online: posts to share route, updates local collaborators list, calls onSuccess", async () => {
      const serverDoc = {
        _id: "d1",
        collaborators: [{ userId: { _id: "u2", name: "Bob" }, role: "EDITOR" }],
      };
      vi.mocked(api.post).mockResolvedValue({ data: { data: serverDoc } });

      const localDoc = { _id: "d1", collaborators: [] };
      vi.mocked(localDb.documents.get).mockResolvedValue(localDoc as unknown as import("@/lib/localDb").LocalDocument);

      const onSuccessMock = vi.fn();
      const { result } = renderHook(() => useShareDocumentMutation({ onSuccess: onSuccessMock }), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ id: "d1", email: "bob@b.com", role: "EDITOR" });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(api.post).toHaveBeenCalledWith("/documents/d1/share", {
        email: "bob@b.com",
        role: "EDITOR",
      });
      expect(localDb.documents.get).toHaveBeenCalledWith("d1");
      expect(localDb.documents.put).toHaveBeenCalledWith({
        _id: "d1",
        collaborators: [{ userId: { _id: "u2", name: "Bob" }, role: "EDITOR" }],
      });
      expect(toastSuccess).toHaveBeenCalledWith("Document shared successfully");
      expect(onSuccessMock).toHaveBeenCalledWith(serverDoc);
    });

    it("offline: immediately throws error since sharing requires active internet connection", async () => {
      vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);

      const { result } = renderHook(() => useShareDocumentMutation(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ id: "d1", email: "bob@b.com", role: "EDITOR" });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(api.post).not.toHaveBeenCalled();
      expect(toastError).toHaveBeenCalledWith("Sharing documents requires an active internet connection.");
    });

    it("onError: displays toast error on failure", async () => {
      vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
      vi.mocked(api.post).mockRejectedValue(new Error("Share failed"));

      const { result } = renderHook(() => useShareDocumentMutation(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ id: "d1", email: "bob@b.com", role: "EDITOR" });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(toastError).toHaveBeenCalledWith("Share failed");
    });

    it("online: does not update local db if document is not found locally", async () => {
      const serverDoc = {
        _id: "d1",
        collaborators: [{ userId: { _id: "u2", name: "Bob" }, role: "EDITOR" }],
      };
      vi.mocked(api.post).mockResolvedValue({ data: { data: serverDoc } });

      vi.mocked(localDb.documents.get).mockResolvedValue(undefined);

      const { result } = renderHook(() => useShareDocumentMutation(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ id: "d1", email: "bob@b.com", role: "EDITOR" });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(localDb.documents.put).not.toHaveBeenCalled();
    });

    it("online: falls back to empty collaborators list if server response has none", async () => {
      const serverDoc = {
        _id: "d1",
        collaborators: undefined,
      };
      vi.mocked(api.post).mockResolvedValue({ data: { data: serverDoc } });

      const localDoc = { _id: "d1", collaborators: [] };
      vi.mocked(localDb.documents.get).mockResolvedValue(localDoc as unknown as import("@/lib/localDb").LocalDocument);

      const { result } = renderHook(() => useShareDocumentMutation(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ id: "d1", email: "bob@b.com", role: "EDITOR" });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(localDb.documents.put).toHaveBeenCalledWith({
        _id: "d1",
        collaborators: [],
      });
    });

    it("onError: displays default toast error on non-Error object rejection", async () => {
      vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
      vi.mocked(api.post).mockRejectedValue("Raw share error");

      const { result } = renderHook(() => useShareDocumentMutation(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ id: "d1", email: "bob@b.com", role: "EDITOR" });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(toastError).toHaveBeenCalledWith("Failed to share document");
    });

    it("online: success call doesn't throw if onSuccess option is omitted", async () => {
      const serverDoc = {
        _id: "d1",
        collaborators: [],
      };
      vi.mocked(api.post).mockResolvedValue({ data: { data: serverDoc } });

      const localDoc = { _id: "d1", collaborators: [] };
      vi.mocked(localDb.documents.get).mockResolvedValue(localDoc as unknown as import("@/lib/localDb").LocalDocument);

      const { result } = renderHook(() => useShareDocumentMutation(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ id: "d1", email: "bob@b.com", role: "EDITOR" });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      // No onSuccess mock provided, should not throw
    });
  });
});
