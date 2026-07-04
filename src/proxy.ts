import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";

export async function proxy(request: NextRequest)
{
  const token = await getToken(
    {
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    }
  );
  const { pathname } = request.nextUrl;

  // 1. If user is authenticated and tries to access login or register, redirect to dashboard
  if (token && (pathname === "/login" || pathname === "/register"))
  {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // 2. If user is NOT authenticated and tries to access protected routes, redirect to login
  if (!token && (pathname.startsWith("/dashboard") || pathname.startsWith("/documents")))
  {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/documents/:path*", "/login", "/register"],
};
