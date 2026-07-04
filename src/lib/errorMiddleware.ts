import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { StatusCodes } from "http-status-codes";
import { ERROR_MESSAGES } from "@/constants/messages";

// Using a generic so TypeScript infers the exact arg types of each route handler,
// avoiding `any` while still being compatible with destructured params objects.
type ApiHandler<TArgs extends unknown[]> = (req: Request, ...args: TArgs) => Promise<NextResponse> | NextResponse;

export class ApiError extends Error
{
  statusCode: number;

  constructor(message: string, statusCode: number)
  {
    super(message);
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

export function withErrorHandler<TArgs extends unknown[]>(handler: ApiHandler<TArgs>)
{
  return async function (req: Request, ...args: TArgs)
  {
    try
    {
      return await handler(req, ...args);
    }
    catch (error: unknown)
    {
      console.error("API error captured by middleware:", error);

      if (error instanceof ApiError)
      {
        return NextResponse.json(
          { message: error.message },
          { status: error.statusCode }
        );
      }

      if (error instanceof ZodError)
      {
        return NextResponse.json(
          { message: error.issues[0].message },
          { status: StatusCodes.BAD_REQUEST }
        );
      }

      // MongoDB duplicate key error (code 11000)
      const mongoError = error as { code?: number };
      if (mongoError.code === 11000)
      {
        return NextResponse.json(
          { message: "Duplicate field value entered" },
          { status: StatusCodes.CONFLICT }
        );
      }

      return NextResponse.json(
        { message: ERROR_MESSAGES.SERVER_ERROR },
        { status: StatusCodes.INTERNAL_SERVER_ERROR }
      );
    }
  };
}
