import { NextResponse } from "next/server";

export function middleware(request) {
  const url = request.nextUrl.clone();
  const pathname = url.pathname;

  const publicRoutes = [
    "/login",
    "/signup",
    "/login/callback",
    "/subscribe",
  ];

  if (publicRoutes.includes(pathname)) {
    return NextResponse.next();
  }

  const hasSession =
    request.cookies.get("sb-access-token") ||
    request.cookies.get("sb-refresh-token");

  if (!hasSession) {
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // 🔥 NORMALIZE EVERYTHING
  const role = (request.cookies.get("role")?.value || "").toLowerCase().trim();
  const setupComplete = request.cookies.get("setup_complete")?.value === "true";
  const subscription = request.cookies.get("subscription")?.value;

  // 🔥 SUBSCRIPTION
  if (subscription !== "active" && !pathname.startsWith("/subscribe")) {
    url.pathname = "/subscribe";
    return NextResponse.redirect(url);
  }

  // 🔥 SETUP
  if (!setupComplete && !pathname.startsWith("/system-setup")) {
    url.pathname = "/system-setup/step-1";
    return NextResponse.redirect(url);
  }

  // 🔥 CONTROL ACCESS
  if (
    pathname.startsWith("/control") &&
    role !== "owner" &&
    role !== "general manager"
  ) {
    url.pathname = "/staff";
    return NextResponse.redirect(url);
  }

  // 🔥 DASHBOARD ACCESS
  if (pathname.startsWith("/dashboard") && role === "staff") {
    url.pathname = "/staff";
    return NextResponse.redirect(url);
  }

  // 🔥 PRODUCTION ACCESS
  if (
    pathname.startsWith("/production") &&
    role !== "production" &&
    role !== "owner" &&
    role !== "general manager"
  ) {
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/control/:path*",
    "/dashboard/:path*",
    "/staff/:path*",
    "/production/:path*",
    "/system-setup/:path*",
    "/accounting/:path*",
    "/management/:path*",
  ],
};