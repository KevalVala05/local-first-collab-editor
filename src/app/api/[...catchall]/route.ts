import { NextResponse } from "next/server";
import { StatusCodes } from "http-status-codes";
import { ERROR_MESSAGES } from "@/constants/messages";

export async function GET()
{
  return NextResponse.json(
    { message: ERROR_MESSAGES.ROUTE_NOT_FOUND },
    { status: StatusCodes.NOT_FOUND }
  );
}

export async function POST()
{
  return NextResponse.json(
    { message: ERROR_MESSAGES.ROUTE_NOT_FOUND },
    { status: StatusCodes.NOT_FOUND }
  );
}

export async function PUT()
{
  return NextResponse.json(
    { message: ERROR_MESSAGES.ROUTE_NOT_FOUND },
    { status: StatusCodes.NOT_FOUND }
  );
}

export async function DELETE()
{
  return NextResponse.json(
    { message: ERROR_MESSAGES.ROUTE_NOT_FOUND },
    { status: StatusCodes.NOT_FOUND }
  );
}

export async function PATCH()
{
  return NextResponse.json(
    { message: ERROR_MESSAGES.ROUTE_NOT_FOUND },
    { status: StatusCodes.NOT_FOUND }
  );
}
