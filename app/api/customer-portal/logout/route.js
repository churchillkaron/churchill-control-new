import { NextResponse } from "next/server";
import {
  CUSTOMER_PORTAL_COOKIE,
  revokeCustomerPortalSession,
} from "@/lib/customer-portal/CustomerPortalRuntime";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const rawToken = request.cookies.get(CUSTOMER_PORTAL_COOKIE)?.value || "";
    await revokeCustomerPortalSession(rawToken);
    const response = NextResponse.json({ success: true });
    response.cookies.set(CUSTOMER_PORTAL_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "Unable to close customer portal session" },
      { status: 500 },
    );
  }
}
