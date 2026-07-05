import { describe, it, expect, vi, beforeEach } from "vitest";
import { proxy } from "@/proxy";
import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";

vi.mock("next-auth/jwt", () => ({
  getToken: vi.fn(),
}));

vi.mock("next/server", () => {
  const mockRedirect = vi.fn((url: string | URL) => ({
    status: 307,
    headers: { get: () => url.toString() },
    url: url.toString(),
  }));
  const mockNext = vi.fn(() => ({
    status: 200,
  }));
  return {
    NextResponse: {
      redirect: mockRedirect,
      next: mockNext,
    },
  };
});

describe("proxy middleware helper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXTAUTH_SECRET = "supersecret";
  });

  const createMockRequest = (pathname: string, baseUrl = "http://localhost:3000") => {
    const fullUrl = `${baseUrl}${pathname}`;
    return {
      url: fullUrl,
      nextUrl: {
        pathname,
      },
    } as unknown as NextRequest;
  };

  it("redirects authenticated user from /login to /dashboard", async () => {
    vi.mocked(getToken).mockResolvedValue({ name: "Alice", email: "a@test.com" });
    const req = createMockRequest("/login");

    const res = await proxy(req);

    expect(getToken).toHaveBeenCalledWith({
      req,
      secret: "supersecret",
    });
    expect(NextResponse.redirect).toHaveBeenCalledWith(
      new URL("/dashboard", "http://localhost:3000/login")
    );
    expect(res.status).toBe(307);
  });

  it("redirects authenticated user from /register to /dashboard", async () => {
    vi.mocked(getToken).mockResolvedValue({ name: "Alice", email: "a@test.com" });
    const req = createMockRequest("/register");

    const res = await proxy(req);

    expect(NextResponse.redirect).toHaveBeenCalledWith(
      new URL("/dashboard", "http://localhost:3000/register")
    );
    expect(res.status).toBe(307);
  });

  it("redirects unauthenticated user from /dashboard to /login", async () => {
    vi.mocked(getToken).mockResolvedValue(null);
    const req = createMockRequest("/dashboard");

    const res = await proxy(req);

    expect(NextResponse.redirect).toHaveBeenCalledWith(
      new URL("/login", "http://localhost:3000/dashboard")
    );
    expect(res.status).toBe(307);
  });

  it("redirects unauthenticated user from /documents/abc to /login", async () => {
    vi.mocked(getToken).mockResolvedValue(null);
    const req = createMockRequest("/documents/abc");

    const res = await proxy(req);

    expect(NextResponse.redirect).toHaveBeenCalledWith(
      new URL("/login", "http://localhost:3000/documents/abc")
    );
    expect(res.status).toBe(307);
  });

  it("allows authenticated user to access protected routes", async () => {
    vi.mocked(getToken).mockResolvedValue({ name: "Alice" });
    const req = createMockRequest("/documents/abc");

    const res = await proxy(req);

    expect(NextResponse.next).toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it("allows unauthenticated user to access /login", async () => {
    vi.mocked(getToken).mockResolvedValue(null);
    const req = createMockRequest("/login");

    const res = await proxy(req);

    expect(NextResponse.next).toHaveBeenCalled();
    expect(res.status).toBe(200);
  });
});
