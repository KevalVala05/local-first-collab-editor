import { NextResponse } from "next/server";
import { StatusCodes } from "http-status-codes";

export function sendSuccessResponse<T>(
  data: T,
  // res is typed as any to support custom response objects or null in Next.js serverless functions
  res: any,
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
