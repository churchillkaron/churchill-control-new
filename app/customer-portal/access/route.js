import { NextResponse } from "next/server";
import { CUSTOMER_PORTAL_COOKIE, exchangeCustomerPortalAccessToken } from "@/lib/customer-portal/CustomerPortalRuntime";

export async function GET(request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token) return NextResponse.redirect(new URL("/customer-portal?error=invalid-link", request.url));
  try {
    const exchanged = await exchangeCustomerPortalAccessToken(token);
    const response = NextResponse.redirect(new URL("/customer-portal", request.url));
    response.cookies.set(CUSTOMER_PORTAL_COOKIE, exchanged.rawSessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch {
    return NextResponse.redirect(new URL("/customer-portal?error=expired-link", request.url));
  }
}
