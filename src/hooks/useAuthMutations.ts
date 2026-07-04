import { useMutation } from "@tanstack/react-query";
import { toastSuccess, toastError } from "@/lib/toast";
import { SUCCESS_MESSAGES } from "@/constants/messages";
import { registerUser } from "@/services/authService";
import { useRouter } from "next/navigation";

/**
 * Hook for user registration mutation.
 * Calls the register API, shows toast messages, and redirects on success.
 */
export function useRegisterUserMutation() {
  const router = useRouter();

  return useMutation({
    mutationFn: registerUser,
    onSuccess: () => {
      toastSuccess(SUCCESS_MESSAGES.REGISTER_SUCCESS);
      router.push("/login");
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "An unexpected error occurred";
      toastError(message);
    },
  });
}
