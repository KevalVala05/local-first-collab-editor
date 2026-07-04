import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useRouter } from "next/navigation";
import { toastSuccess, toastError } from "@/lib/toast";
import { SUCCESS_MESSAGES } from "@/constants/messages";

// ── Types & Interfaces ──────────────────────────────────────────────────────

interface RenameArgs {
  id: string;
  title: string;
}

interface ShareArgs {
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

  return useMutation({
    mutationFn: async (title: string) =>
    {
      const res = await api.post("/documents", { title });
      return res.data.data;
    },
    onSuccess: (newDoc) =>
    {
      toastSuccess(SUCCESS_MESSAGES.DOCUMENT_CREATE_SUCCESS);
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      router.push(`/documents/${newDoc._id}`);
    },
    onError: (err: unknown) =>
    {
      const message = err instanceof Error ? err.message : "Failed to create document";
      toastError(message);
    },
  });
}

// 2. Rename Document Hook
export function useRenameDocumentMutation(options?: { onSuccess?: () => void })
{
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, title }: RenameArgs) =>
    {
      const res = await api.patch(`/documents/${id}`, { title });
      return res.data.data;
    },
    onSuccess: () =>
    {
      toastSuccess(SUCCESS_MESSAGES.DOCUMENT_UPDATE_SUCCESS);
      queryClient.invalidateQueries({ queryKey: ["documents"] });
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
  });
}

// 3. Delete Document Hook
export function useDeleteDocumentMutation(options?: { onSuccess?: () => void })
{
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) =>
    {
      await api.delete(`/documents/${id}`);
    },
    onSuccess: () =>
    {
      toastSuccess(SUCCESS_MESSAGES.DOCUMENT_DELETE_SUCCESS);
      queryClient.invalidateQueries({ queryKey: ["documents"] });
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
  });
}

// 4. Share Document Hook
export function useShareDocumentMutation<T = unknown>(options?: { onSuccess?: (updatedDoc: T) => void })
{
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, email, role }: ShareArgs) =>
    {
      const res = await api.post(`/documents/${id}/share`, { email, role });
      return res.data.data;
    },
    onSuccess: (updatedDoc) =>
    {
      toastSuccess(SUCCESS_MESSAGES.DOCUMENT_SHARE_SUCCESS);
      queryClient.invalidateQueries({ queryKey: ["documents"] });
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
  });
}
