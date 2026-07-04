import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useRouter } from "next/navigation";
import { toastSuccess, toastError } from "@/lib/toast";
import { SUCCESS_MESSAGES } from "@/constants/messages";

// 1. Create Document Hook
export function useCreateDocumentMutation()
{
  const router = useRouter();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () =>
    {
      const res = await axios.post("/api/documents", {});
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
      const message = axios.isAxiosError(err)
        ? err.response?.data?.message
        : err instanceof Error
        ? err.message
        : "Failed to create document";
      toastError(message || "Failed to create document");
    },
  });
}

// 2. Rename Document Hook
interface RenameArgs {
  id: string;
  title: string;
}

export function useRenameDocumentMutation(options?: { onSuccess?: () => void })
{
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, title }: RenameArgs) =>
    {
      const res = await axios.patch(`/api/documents/${id}`, { title });
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
      const message = axios.isAxiosError(err)
        ? err.response?.data?.message
        : err instanceof Error
        ? err.message
        : "Failed to rename document";
      toastError(message || "Failed to rename document");
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
      await axios.delete(`/api/documents/${id}`);
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
      const message = axios.isAxiosError(err)
        ? err.response?.data?.message
        : err instanceof Error
        ? err.message
        : "Failed to delete document";
      toastError(message || "Failed to delete document");
    },
  });
}

// 4. Share Document Hook
interface ShareArgs {
  id: string;
  email: string;
  role: string;
}

export function useShareDocumentMutation<T = unknown>(options?: { onSuccess?: (updatedDoc: T) => void })
{
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, email, role }: ShareArgs) =>
    {
      const res = await axios.post(`/api/documents/${id}/share`, { email, role });
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
      const message = axios.isAxiosError(err)
        ? err.response?.data?.message
        : err instanceof Error
        ? err.message
        : "Failed to share document";
      toastError(message || "Failed to share document");
    },
  });
}
