import { NextResponse } from "next/server";

export function middleware(request) {

  const protectedRoutes = [

    "/dashboard",
    "/pos",
    "/billing",
    "/receipts",
    "/inventory",
    "/finance",
    "/reports",
    "/management",
    "/staff",
    "/shifts",
    "/payroll",
    "/payroll-payouts",
    "/audit",
    "/settings",
  ];

  const isProtected =
    protectedRoutes.some(
      (route) =>
        request.nextUrl.pathname.startsWith(
          route
        )
    );

  if (!isProtected) {

    return NextResponse.next();
  }

  const authCookie =
    request.cookies.get(
      "sb-access-token"
    );

  if (!authCookie) {

    return NextResponse.redirect(
      new URL(
        "/",
        request.url
      )
    );
  }

  return NextResponse.next();
}

export const config = {

  matcher: [
    "/dashboard/:path*",
    "/pos/:path*",
    "/billing/:path*",
    "/receipts/:path*",
    "/inventory/:path*",
    "/finance/:path*",
    "/reports/:path*",
    "/management/:path*",
    "/staff/:path*",
    "/shifts/:path*",
    "/payroll/:path*",
    "/payroll-payouts/:path*",
    "/audit/:path*",
    "/settings/:path*",
  ],
};
