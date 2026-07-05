/**
 * @file api.test.ts
 * @description Unit tests for the API axios client and interceptors.
 *              Verifies that response interceptors correctly format resolved data
 *              and transform API/network errors into structured JS Errors.
 */
import { describe, it, expect, vi } from "vitest";

interface MockedAxiosStore {
  store: {
    success: (res: unknown) => unknown;
    error: (err: unknown) => Promise<unknown>;
  };
}

// Mock axios globally and export a store to bypass TDZ (Temporal Dead Zone) issues
vi.mock("axios", () => {
  const store = {
    success: null as unknown as (res: unknown) => unknown,
    error: null as unknown as (err: unknown) => Promise<unknown>,
  };
  const mockAxiosInstance = {
    interceptors: {
      response: {
        use: vi.fn().mockImplementation((success, error) => {
          store.success = success;
          store.error = error;
        }),
      },
    },
  };
  return {
    default: {
      create: vi.fn().mockReturnValue(mockAxiosInstance),
      store,
    },
  };
});

// Import axios to get the mocked store and api to trigger interceptor registration
import axios from "axios";
import "@/lib/api";

describe("API Client — Interceptors", () => {
  const getSuccessInterceptor = () => (axios as unknown as MockedAxiosStore).store.success;
  const getErrorInterceptor = () => (axios as unknown as MockedAxiosStore).store.error;

  it("response interceptor passes through a valid response", () => {
    const mockRes = {
      status: 200,
      data: { message: "Success", data: { id: 1 } },
    };

    const result = getSuccessInterceptor()(mockRes);
    expect(result).toBe(mockRes);
    // Typecast to retrieve values on untyped structures
    expect((result as { data: { data: { id: number } } }).data.data.id).toBe(1);
  });

  it("error interceptor extracts custom message from backend response if present", async () => {
    const mockError = {
      message: "Network Error",
      response: {
        status: 400,
        data: {
          message: "Email is already registered",
        },
      },
    };

    await expect(getErrorInterceptor()(mockError)).rejects.toThrow("Email is already registered");
  });

  it("error interceptor falls back to error.message if no response data exists", async () => {
    const mockError = {
      message: "Timeout error",
      response: undefined,
    };

    await expect(getErrorInterceptor()(mockError)).rejects.toThrow("Timeout error");
  });

  it("error interceptor uses a fallback generic message if all else fails", async () => {
    const mockError = {
      message: "",
      response: undefined,
    };

    await expect(getErrorInterceptor()(mockError)).rejects.toThrow("An unexpected error occurred");
  });

  it("error interceptor attaches response status and data to the rejected Error", async () => {
    const mockError = {
      message: "Request failed",
      response: {
        status: 403,
        data: { message: "Forbidden resource", errorCode: "RULE_403" },
      },
    };

    try {
      await getErrorInterceptor()(mockError);
      // fail if it doesn't reject
      expect(true).toBe(false);
    } catch (error: unknown) {
      const err = error as Error & { status?: number; data?: unknown };
      expect(err.message).toBe("Forbidden resource");
      expect(err.status).toBe(403);
      expect(err.data).toEqual({ message: "Forbidden resource", errorCode: "RULE_403" });
    }
  });
});
