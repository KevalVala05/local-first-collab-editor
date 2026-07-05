/**
 * @file errorMiddleware.test.ts
 * @description Unit tests for the withErrorHandler middleware and ApiError class.
 *              Verifies that errors are correctly transformed into HTTP responses.
 */
import { describe, it, expect } from "vitest";
import { ApiError, withErrorHandler } from "@/lib/errorMiddleware";
import { z } from "zod";
import { StatusCodes } from "http-status-codes";
import { NextResponse } from "next/server";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(url = "http://localhost/api/test"): Request {
  return new Request(url, { method: "GET" });
}

async function parseResponse(res: NextResponse) {
  const body = await res.json();
  return { status: res.status, body };
}

// ── ApiError ──────────────────────────────────────────────────────────────────

describe("ApiError", () => {
  it("stores message and statusCode", () => {
    const err = new ApiError("Not found", 404);
    expect(err.message).toBe("Not found");
    expect(err.statusCode).toBe(404);
  });

  it("is an instance of Error", () => {
    const err = new ApiError("Bad request", 400);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ApiError);
  });
});

// ── withErrorHandler ──────────────────────────────────────────────────────────

describe("withErrorHandler", () => {
  it("passes through a successful response unchanged", async () => {
    const handler = withErrorHandler(async () => {
      return NextResponse.json({ data: "ok" }, { status: 200 });
    });

    const res = await handler(makeRequest());
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body.data).toBe("ok");
  });

  it("handles ApiError and returns the correct status + message", async () => {
    const handler = withErrorHandler(async () => {
      throw new ApiError("Unauthorized access", StatusCodes.UNAUTHORIZED);
    });

    const res = await handler(makeRequest());
    const { status, body } = await parseResponse(res);

    expect(status).toBe(StatusCodes.UNAUTHORIZED);
    expect(body.message).toBe("Unauthorized access");
  });

  it("handles ZodError and returns 400 with the first issue message", async () => {
    const handler = withErrorHandler(async () => {
      const schema = z.object({ name: z.string().min(3, "Name too short") });
      schema.parse({ name: "A" }); // triggers ZodError
      return NextResponse.json({});
    });

    const res = await handler(makeRequest());
    const { status, body } = await parseResponse(res);

    expect(status).toBe(StatusCodes.BAD_REQUEST);
    expect(body.message).toBe("Name too short");
  });

  it("handles MongoDB duplicate key error (code 11000) with 409 Conflict", async () => {
    const handler = withErrorHandler(async () => {
      const mongoError = new Error("Duplicate key") as Error & { code: number };
      mongoError.code = 11000;
      throw mongoError;
    });

    const res = await handler(makeRequest());
    const { status, body } = await parseResponse(res);

    expect(status).toBe(StatusCodes.CONFLICT);
    expect(body.message).toBe("Duplicate field value entered");
  });

  it("handles unknown errors with 500 Internal Server Error", async () => {
    const handler = withErrorHandler(async () => {
      throw new Error("Something unexpected");
    });

    const res = await handler(makeRequest());
    const { status } = await parseResponse(res);

    expect(status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
  });

  it("passes additional route args through to the handler", async () => {
    type RouteContext = { params: { id: string } };
    const captured: RouteContext[] = [];

    const handler = withErrorHandler(async (req: Request, ctx: RouteContext) => {
      captured.push(ctx);
      return NextResponse.json({ id: ctx.params.id });
    });

    const ctx = { params: { id: "abc123" } };
    const res = await handler(makeRequest(), ctx);
    const { body } = await parseResponse(res);

    expect(body.id).toBe("abc123");
    expect(captured[0]).toStrictEqual(ctx);
  });
});
