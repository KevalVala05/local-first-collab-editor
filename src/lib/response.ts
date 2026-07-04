import { NextResponse } from "next/server";
import { StatusCodes } from "http-status-codes";

export function sendSuccessResponse<T>(
  data: T,
  // res is always null in Next.js serverless routes (legacy Express-style placeholder)
  res: null,
  message: string = "Success",
  code: number = StatusCodes.OK
): NextResponse
{
  return NextResponse.json(
    {
      message,
      data,
    },
    { status: code }
  );
}
