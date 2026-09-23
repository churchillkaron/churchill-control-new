import { NextResponse } from "next/server";
import {
  consumeCustomerPortalAccessToken,
  CUSTOMER_PORTAL_COOKIE,
  CUSTOMER_PORTAL_SESSION_DAYS,
} from "@/lib/customer-portal/CustomerPortalRuntime";

export const dynamic = "force-dynamic";

export async function POST(_request, { params }) {
  try {
    const resolvedParams = await Promise.resolve(params);
    const result = await consumeCustomerPortalAccessToken(resolvedParams?.token);
    if (!result.success) {
      return NextResponse.json(result, { status: result.status || 400 });
    }

    const response = NextResponse.json({
      success: true,
      redirect: "/customer-portal",
      session: {
        organization_id: result.session.organization_id,
        party_id: result.session.party_id,
        expires_at: result.session.expires_at,
      },
    });
    response.cookies.set(CUSTOMER_PORTAL_COOKIE, result.rawSessionToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: CUSTOMER_PORTAL_SESSION_DAYS * 24 * 60 * 60,
    });
    return response;
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "Unable to open customer portal" },
      { status: 500 },
    );
  }
}
