/**
 * @file useAuthMutations.test.tsx
 * @description Unit tests for the useRegisterUserMutation hook.
 *              Verifies success and error behaviors including toast triggers and router push redirection.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useRegisterUserMutation } from "@/hooks/useAuthMutations";
import { registerUser } from "@/services/authService";
import { toastSuccess, toastError } from "@/lib/toast";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock toast utilities
vi.mock("@/lib/toast", () => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

// Mock authService registerUser
vi.mock("@/services/authService", () => ({
  registerUser: vi.fn(),
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

describe("useRegisterUserMutation Hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handles successful user registration", async () => {
    vi.mocked(registerUser).mockResolvedValue({ id: "1", name: "Alice" });

    const { result } = renderHook(() => useRegisterUserMutation(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ name: "Alice", email: "alice@b.com", password: "password123" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(toastSuccess).toHaveBeenCalledWith("User registered successfully");
    expect(mockPush).toHaveBeenCalledWith("/login");
  });

  it("handles user registration error with generic fallback message", async () => {
    vi.mocked(registerUser).mockRejectedValue(new Error("Email already registered"));

    const { result } = renderHook(() => useRegisterUserMutation(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ name: "Alice", email: "alice@b.com", password: "password123" });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(toastError).toHaveBeenCalledWith("Email already registered");
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("handles user registration error with string/fallback type check", async () => {
    vi.mocked(registerUser).mockRejectedValue("Unexpected crash object");

    const { result } = renderHook(() => useRegisterUserMutation(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ name: "Alice", email: "alice@b.com", password: "password123" });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(toastError).toHaveBeenCalledWith("An unexpected error occurred");
  });
});
