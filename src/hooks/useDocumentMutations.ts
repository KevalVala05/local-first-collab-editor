import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useRouter } from "next/navigation";
import { toastSuccess, toastError } from "@/lib/toast";
import { SUCCESS_MESSAGES } from "@/constants/messages";
import { useSession } from "next-auth/react";
import {
  createDocumentLocally,
  renameDocumentLocally,
  deleteDocumentLocally,
  localDb,
} from "@/lib/localDb";

// ── Types & Interfaces ──────────────────────────────────────────────────────

interface RenameArgs
{
  id: string;
  title: string;
}

interface ShareArgs
{
  id: string;
  email: string;
  role: string;
}

// ── Hooks ───────────────────────────────────────────────────────────────────

// 1. Create Document Hook
export function useCreateDocumentMutation()
{
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session } = useSession();

  return useMutation(
    {
      mutationFn: async (title: string) =>
      {
        const isOnline = typeof window !== "undefined" && navigator.onLine;
        if (isOnline)
        {
          try
          {
            const res = await api.post("/documents", { title });
            const serverDoc = res.data.data;

            // Cache in local db as well
            await localDb.documents.put(
              {
                _id: serverDoc._id,
                title: serverDoc.title,
                content: serverDoc.content || "",
                ownerId: serverDoc.ownerId,
                collaborators: serverDoc.collaborators || [],
                updatedAt: serverDoc.updatedAt,
                createdAt: serverDoc.createdAt,
                syncStatus: "synced",
              }
            );

            return serverDoc;
          }
          catch (error)
          {
            console.warn("Failed to create document on server, falling back to local creation.", error);
          }
        }

        // Offline or server creation failed
        if (!session?.user?.id)
        {
          throw new Error("User must be logged in to create a document.");
        }

        const localDoc = await createDocumentLocally(
          title,
          session.user.id,
          session.user.name || "You",
          session.user.email || ""
        );
        return localDoc;
      },
      onSuccess: (newDoc) =>
      {
        toastSuccess(SUCCESS_MESSAGES.DOCUMENT_CREATE_SUCCESS);
        queryClient.invalidateQueries(
          {
            queryKey: ["documents"],
          }
        );
        router.push(`/documents/${newDoc._id}`);
      },
      onError: (err: unknown) =>
      {
        const message = err instanceof Error ? err.message : "Failed to create document";
        toastError(message);
      },
    }
  );
}

// 2. Rename Document Hook
export function useRenameDocumentMutation(options?: { onSuccess?: () => void })
{
  const queryClient = useQueryClient();

  return useMutation(
    {
      mutationFn: async ({ id, title }: RenameArgs) =>
      {
        const isOnline = typeof window !== "undefined" && navigator.onLine;
        if (isOnline)
        {
          try
          {
            const res = await api.patch(`/documents/${id}`, { title });
            const serverDoc = res.data.data;

            // Sync rename into local DB
            const localDoc = await localDb.documents.get(id);
            if (localDoc)
            {
              localDoc.title = title;
              localDoc.syncStatus = "synced";
              await localDb.documents.put(localDoc);
            }

            return serverDoc;
          }
          catch (error)
          {
            console.warn("Failed to rename document on server, falling back to local rename.", error);
          }
        }

        // Offline or server patch failed
        await renameDocumentLocally(id, title);
        return { _id: id, title };
      },
      onSuccess: () =>
      {
        toastSuccess(SUCCESS_MESSAGES.DOCUMENT_UPDATE_SUCCESS);
        queryClient.invalidateQueries(
          {
            queryKey: ["documents"],
          }
        );
        if (options?.onSuccess)
        {
          options.onSuccess();
        }
      },
      onError: (err: unknown) =>
      {
        const message = err instanceof Error ? err.message : "Failed to rename document";
        toastError(message);
      },
    }
  );
}

// 3. Delete Document Hook
export function useDeleteDocumentMutation(options?: { onSuccess?: () => void })
{
  const queryClient = useQueryClient();

  return useMutation(
    {
      mutationFn: async (id: string) =>
      {
        const isOnline = typeof window !== "undefined" && navigator.onLine;
        if (isOnline)
        {
          try
          {
            await api.delete(`/documents/${id}`);

            // Delete from local DB as well
            await localDb.documents.delete(id);
            return;
          }
          catch (error)
          {
            console.warn("Failed to delete document on server, falling back to local delete.", error);
          }
        }

        // Offline or server delete failed
        await deleteDocumentLocally(id);
      },
      onSuccess: () =>
      {
        toastSuccess(SUCCESS_MESSAGES.DOCUMENT_DELETE_SUCCESS);
        queryClient.invalidateQueries(
          {
            queryKey: ["documents"],
          }
        );
        if (options?.onSuccess)
        {
          options.onSuccess();
        }
      },
      onError: (err: unknown) =>
      {
        const message = err instanceof Error ? err.message : "Failed to delete document";
        toastError(message);
      },
    }
  );
}

// 4. Share Document Hook
export function useShareDocumentMutation<T = unknown>(options?: { onSuccess?: (updatedDoc: T) => void })
{
  const queryClient = useQueryClient();

  return useMutation(
    {
      mutationFn: async ({ id, email, role }: ShareArgs) =>
      {
        const isOnline = typeof window !== "undefined" && navigator.onLine;
        if (!isOnline)
        {
          throw new Error("Sharing documents requires an active internet connection.");
        }

        const res = await api.post(`/documents/${id}/share`, { email, role });
        const serverDoc = res.data.data;

        // Keep local cached copy updated with new collaborators list
        const localDoc = await localDb.documents.get(id);
        if (localDoc)
        {
          localDoc.collaborators = serverDoc.collaborators || [];
          await localDb.documents.put(localDoc);
        }

        return serverDoc;
      },
      onSuccess: (updatedDoc) =>
      {
        toastSuccess(SUCCESS_MESSAGES.DOCUMENT_SHARE_SUCCESS);
        queryClient.invalidateQueries(
          {
            queryKey: ["documents"],
          }
        );
        if (options?.onSuccess)
        {
          options.onSuccess(updatedDoc);
        }
      },
      onError: (err: unknown) =>
      {
        const message = err instanceof Error ? err.message : "Failed to share document";
        toastError(message);
      },
    }
  );
}
