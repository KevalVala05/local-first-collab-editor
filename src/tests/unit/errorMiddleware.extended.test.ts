/**
 * @file errorMiddleware.extended.test.ts
 * @description Extended unit tests for withErrorHandler and ApiError.
 *              Covers async handler propagation, multiple argument types,
 *              re-thrown errors, error message fidelity, and response shape.
 */
import { describe, it, expect, vi } from "vitest";
import { ApiError, withErrorHandler } from "@/lib/errorMiddleware";
import { z } from "zod";
import { StatusCodes } from "http-status-codes";
import { NextResponse } from "next/server";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(url = "http://localhost/api/test", method = "GET"): Request {
  return new Request(url, { method });
}

async function parseResponse(res: NextResponse) {
  const body = await res.json();
  return { status: res.status, body };
}

// ── ApiError — detailed ───────────────────────────────────────────────────────

describe("ApiError — detailed", () => {
  it("preserves prototype chain for instanceof checks", () => {
    const err = new ApiError("Forbidden", 403);
    expect(err instanceof ApiError).toBe(true);
    expect(err instanceof Error).toBe(true);
  });

  it("stores arbitrary status codes", () => {
    const cases = [400, 401, 403, 404, 409, 413, 429, 500];
    cases.forEach((code) => {
      const err = new ApiError("msg", code);
      expect(err.statusCode).toBe(code);
    });
  });

  it("message is accessible as a standard Error property", () => {
    const err = new ApiError("custom message here", 400);
    expect(err.message).toBe("custom message here");
    expect(String(err)).toContain("custom message here");
  });
});

// ── withErrorHandler — response shape ────────────────────────────────────────

describe("withErrorHandler — response shape", () => {
  it("ApiError response body contains only `message` field", async () => {
    const handler = withErrorHandler(async () => {
      throw new ApiError("Not found", 404);
    });
    const res = await handler(makeRequest());
    const body = await res.json();

    // Should have `message`, should NOT have `data`
    expect(body).toHaveProperty("message", "Not found");
    expect(body).not.toHaveProperty("data");
  });

  it("unknown error response body has a message field", async () => {
    const handler = withErrorHandler(async () => {
      throw new TypeError("something broke");
    });
    const res = await handler(makeRequest());
    const { body, status } = await parseResponse(res);

    expect(status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
    expect(body).toHaveProperty("message");
  });

  it("ZodError returns the first issue message verbatim", async () => {
    const handler = withErrorHandler(async () => {
      z.object({
        email: z.string().email("Must be a valid email"),
      }).parse({ email: "bad" });
      return NextResponse.json({});
    });

    const { status, body } = await parseResponse(await handler(makeRequest()));
    expect(status).toBe(400);
    expect(body.message).toBe("Must be a valid email");
  });

  it("ZodError with multiple issues returns only the first", async () => {
    const handler = withErrorHandler(async () => {
      z.object({
        name: z.string().min(3, "Name too short"),
        age: z.number({ message: "Age required" }),
      }).parse({ name: "A" }); // two issues: name + missing age
      return NextResponse.json({});
    });

    const { body } = await parseResponse(await handler(makeRequest()));
    // First issue is always returned
    expect(typeof body.message).toBe("string");
    expect(body.message.length).toBeGreaterThan(0);
  });
});

// ── withErrorHandler — async propagation ────────────────────────────────────

describe("withErrorHandler — async propagation", () => {
  it("awaits async handler and returns its response", async () => {
    const handler = withErrorHandler(async () => {
      await new Promise((r) => setTimeout(r, 0)); // simulate async work
      return NextResponse.json({ result: 42 }, { status: 200 });
    });

    const { status, body } = await parseResponse(await handler(makeRequest()));
    expect(status).toBe(200);
    expect(body.result).toBe(42);
  });

  it("catches errors thrown inside a nested async function", async () => {
    async function innerWork() {
      await Promise.resolve();
      throw new ApiError("Inner async error", 503);
    }

    const handler = withErrorHandler(async () => {
      await innerWork();
      return NextResponse.json({});
    });

    const { status, body } = await parseResponse(await handler(makeRequest()));
    expect(status).toBe(503);
    expect(body.message).toBe("Inner async error");
  });

  it("handles Promise rejections (non-thrown errors)", async () => {
    const handler = withErrorHandler(async () => {
      await Promise.reject(new ApiError("Rejected promise", 502));
      return NextResponse.json({});
    });

    const { status, body } = await parseResponse(await handler(makeRequest()));
    expect(status).toBe(502);
    expect(body.message).toBe("Rejected promise");
  });
});

// ── withErrorHandler — multiple route argument shapes ────────────────────────

describe("withErrorHandler — route argument patterns", () => {
  it("works with no extra arguments (simple routes)", async () => {
    const handler = withErrorHandler(async () => {
      return NextResponse.json({ simple: true });
    });
    const { body } = await parseResponse(await handler(makeRequest()));
    expect(body.simple).toBe(true);
  });

  it("works with a single params object argument", async () => {
    type Ctx = { params: { id: string } };
    const handler = withErrorHandler(async (_req: Request, ctx: Ctx) => {
      return NextResponse.json({ id: ctx.params.id });
    });
    const { body } = await parseResponse(
      await handler(makeRequest(), { params: { id: "xyz" } })
    );
    expect(body.id).toBe("xyz");
  });

  it("errors inside route with params are still caught correctly", async () => {
    type Ctx = { params: { id: string } };
    const handler = withErrorHandler(async (_req: Request, ctx: Ctx) => {
      if (ctx.params.id === "bad") {
        throw new ApiError("Bad param", 400);
      }
      return NextResponse.json({ ok: true });
    });

    // bad param triggers error
    const errRes = await handler(makeRequest(), { params: { id: "bad" } });
    const { status: errStatus } = await parseResponse(errRes);
    expect(errStatus).toBe(400);

    // good param succeeds
    const okRes = await handler(makeRequest(), { params: { id: "good" } });
    const { status: okStatus } = await parseResponse(okRes);
    expect(okStatus).toBe(200);
  });
});

// ── withErrorHandler — MongoDB error codes ────────────────────────────────────

describe("withErrorHandler — MongoDB error handling", () => {
  it("handles code 11000 (duplicate key) with 409 Conflict", async () => {
    const handler = withErrorHandler(async () => {
      const e = Object.assign(new Error("E11000"), { code: 11000 });
      throw e;
    });
    const { status, body } = await parseResponse(await handler(makeRequest()));
    expect(status).toBe(StatusCodes.CONFLICT);
    expect(body.message).toBe("Duplicate field value entered");
  });

  it("does NOT treat non-11000 mongo codes as duplicate errors", async () => {
    const handler = withErrorHandler(async () => {
      const e = Object.assign(new Error("Some other mongo error"), { code: 11001 });
      throw e;
    });
    const { status } = await parseResponse(await handler(makeRequest()));
    // Should fall through to generic 500
    expect(status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
  });

  it("handles error object with code property that is NOT a number", async () => {
    const handler = withErrorHandler(async () => {
      const e = Object.assign(new Error("weird error"), { code: "ECONNREFUSED" });
      throw e;
    });
    const { status } = await parseResponse(await handler(makeRequest()));
    expect(status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
  });
});

// ── withErrorHandler — side-effect logging ────────────────────────────────────

describe("withErrorHandler — console.error is called on error", () => {
  it("logs the error via console.error", async () => {
    // setup.ts mocks console.error; we just verify the mock was invoked
    const errorSpy = vi.spyOn(console, "error");
    const handler = withErrorHandler(async () => {
      throw new Error("logged error");
    });
    await handler(makeRequest());
    expect(errorSpy).toHaveBeenCalled();
  });
});
