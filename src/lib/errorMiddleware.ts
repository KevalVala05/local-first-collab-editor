import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { StatusCodes } from "http-status-codes";
import { ERROR_MESSAGES } from "@/constants/messages";

type ApiHandler = (req: Request, ...args: any[]) => Promise<NextResponse> | NextResponse;

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

export function withErrorHandler(handler: ApiHandler)
{
  return async function (req: Request, ...args: any[])
  {
    try
    {
      return await handler(req, ...args);
    }
    catch (error: any)
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
      if (error.code === 11000)
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
