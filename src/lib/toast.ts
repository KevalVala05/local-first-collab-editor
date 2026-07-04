import { toast, ToastOptions } from "react-toastify";

/**
 * Displays a success toast notification.
 * Automatically generates a toastId from the message to prevent duplicate toasts.
 */
export const toastSuccess = (message: string, options?: ToastOptions) =>
{
  return toast.success(message, {
    toastId: options?.toastId || `success-${message.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}`,
    ...options,
  });
};

// Alias for spelling tolerance
export const toastSucess = toastSuccess;

/**
 * Displays an error toast notification.
 * Automatically generates a toastId from the message to prevent duplicate toasts.
 */
export const toastError = (message: string, options?: ToastOptions) =>
{
  return toast.error(message, {
    toastId: options?.toastId || `error-${message.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}`,
    ...options,
  });
};
