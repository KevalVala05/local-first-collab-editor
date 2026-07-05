/**
 * @file authService.test.ts
 * @description Unit tests for the authentication client-side service layer (registerUser).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerUser } from "@/services/authService";
import api from "@/lib/api";

// Mock the API client
vi.mock("@/lib/api", () => {
  return {
    default: {
      post: vi.fn(),
    },
  };
});

describe("authService — registerUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls api.post with the correct route and payload", async () => {
    const payload = {
      name: "Alice Cooper",
      email: "alice@cooper.com",
      password: "password123",
    };

    const mockResponse = {
      data: {
        message: "Success",
        data: {
          user: {
            id: "user_abc",
            name: "Alice Cooper",
            email: "alice@cooper.com",
          },
        },
      },
    };

    vi.mocked(api.post).mockResolvedValue(mockResponse);

    const result = await registerUser(payload);

    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith("/auth/register", payload);
    expect(result).toEqual(mockResponse.data.data);
  });

  it("propagates errors thrown by the API client", async () => {
    const payload = {
      name: "Alice Cooper",
      email: "alice@cooper.com",
      password: "password123",
    };

    const error = new Error("Email already registered");
    vi.mocked(api.post).mockRejectedValue(error);

    await expect(registerUser(payload)).rejects.toThrow("Email already registered");
    expect(api.post).toHaveBeenCalledTimes(1);
  });
});
