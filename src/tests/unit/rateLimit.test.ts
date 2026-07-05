/**
 * @file rateLimit.test.ts
 * @description Unit tests for the in-memory rate limiter (checkRateLimit).
 *              Tests window-based counting, per-user isolation, threshold blocking,
 *              window resets, and custom limit/window parameters.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkRateLimit } from "@/lib/rateLimit";
import { ApiError } from "@/lib/errorMiddleware";
import { StatusCodes } from "http-status-codes";

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Calls checkRateLimit `n` times without expecting a throw.
 */
function callN(userId: string, n: number, limit?: number, windowMs?: number) {
  for (let i = 0; i < n; i++) {
    checkRateLimit(userId, limit, windowMs);
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("checkRateLimit — basic behaviour", () => {
  it("does not throw for the very first request", () => {
    expect(() => checkRateLimit("user_A")).not.toThrow();
  });

  it("does not throw when requests are below the limit", () => {
    // default limit is 100 — 99 calls should be fine
    expect(() => callN("user_below", 99)).not.toThrow();
  });

  it("does not throw exactly at the limit boundary (call #100)", () => {
    // 99 calls already made for user_below above; this is a fresh user
    expect(() => callN("user_boundary", 100)).not.toThrow();
  });

  it("throws ApiError with 429 when limit is exceeded", () => {
    // Exhaust 100 default slots
    callN("user_exceed", 100);

    expect(() => checkRateLimit("user_exceed")).toThrowError(ApiError);

    try {
      checkRateLimit("user_exceed");
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).statusCode).toBe(StatusCodes.TOO_MANY_REQUESTS);
      expect((e as ApiError).message).toMatch(/too many requests/i);
    }
  });

  it("throws on every subsequent call once limit is exceeded", () => {
    callN("user_multi_exceed", 100);
    expect(() => checkRateLimit("user_multi_exceed")).toThrow();
    expect(() => checkRateLimit("user_multi_exceed")).toThrow();
    expect(() => checkRateLimit("user_multi_exceed")).toThrow();
  });
});

describe("checkRateLimit — per-user isolation", () => {
  it("tracks each userId independently", () => {
    // exhaust user_iso_A
    callN("user_iso_A", 100);
    expect(() => checkRateLimit("user_iso_A")).toThrow();

    // user_iso_B should still be fine
    expect(() => checkRateLimit("user_iso_B")).not.toThrow();
  });

  it("different users can each reach the limit independently", () => {
    callN("user_x", 100);
    callN("user_y", 100);

    expect(() => checkRateLimit("user_x")).toThrow();
    expect(() => checkRateLimit("user_y")).toThrow();
  });
});

describe("checkRateLimit — custom limit parameter", () => {
  it("respects a custom limit of 5", () => {
    callN("user_custom5", 5, 5);
    expect(() => checkRateLimit("user_custom5", 5)).toThrow();
  });

  it("does not throw on exactly limit=1 first call", () => {
    expect(() => checkRateLimit("user_limit1", 1)).not.toThrow();
  });

  it("throws on the second call when limit=1", () => {
    checkRateLimit("user_limit1_2", 1);
    expect(() => checkRateLimit("user_limit1_2", 1)).toThrow();
  });
});

describe("checkRateLimit — window reset", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resets count after the time window expires", () => {
    const windowMs = 1000; // 1 second window

    // exhaust the limit
    callN("user_reset", 100, 100, windowMs);
    expect(() => checkRateLimit("user_reset", 100, windowMs)).toThrow();

    // advance time past the window
    vi.advanceTimersByTime(windowMs + 1);

    // should be allowed again after reset
    expect(() => checkRateLimit("user_reset", 100, windowMs)).not.toThrow();
  });

  it("counter increments correctly within the same window", () => {
    const windowMs = 5000;
    const limit = 3;

    checkRateLimit("user_inc", limit, windowMs);
    checkRateLimit("user_inc", limit, windowMs);
    checkRateLimit("user_inc", limit, windowMs);
    // 4th call should throw
    expect(() => checkRateLimit("user_inc", limit, windowMs)).toThrow();

    // advance only half the window — still blocked
    vi.advanceTimersByTime(windowMs / 2);
    expect(() => checkRateLimit("user_inc", limit, windowMs)).toThrow();

    // advance past the window — should reset
    vi.advanceTimersByTime(windowMs);
    expect(() => checkRateLimit("user_inc", limit, windowMs)).not.toThrow();
  });

  it("creates a fresh window after the previous one expires", () => {
    const windowMs = 2000;
    const limit = 2;

    // First window
    callN("user_fresh", limit, limit, windowMs);
    expect(() => checkRateLimit("user_fresh", limit, windowMs)).toThrow();

    // After expiry, new window starts
    vi.advanceTimersByTime(windowMs + 1);
    expect(() => checkRateLimit("user_fresh", limit, windowMs)).not.toThrow();

    // Second call in new window — still ok
    expect(() => checkRateLimit("user_fresh", limit, windowMs)).not.toThrow();

    // Third call in new window — throws again (limit = 2)
    expect(() => checkRateLimit("user_fresh", limit, windowMs)).toThrow();
  });
});
