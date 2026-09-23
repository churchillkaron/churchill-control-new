export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { CUSTOMER_PORTAL_COOKIE, isCustomerPortalSameOriginRequest, loadCustomerPortalData, resolveCustomerPortalSession, revokeCustomerPortalSession } from "@/lib/customer-portal/CustomerPortalRuntime";

export async function GET(request) {
  const raw = request.cookies.get(CUSTOMER_PORTAL_COOKIE)?.value || null;
  const session = await resolveCustomerPortalSession(raw);
  if (!session) return NextResponse.json({ success: false, error: "Customer portal session required" }, { status: 401 });
  const data = await loadCustomerPortalData({ organizationId: session.organization_id, partyId: session.party_id });
  const response = NextResponse.json({ success: true, data });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function DELETE(request) {
  try {
    if (!isCustomerPortalSameOriginRequest(request)) {
      return NextResponse.json({ success: false, error: "Cross-origin customer portal mutation denied" }, { status: 403 });
    }
    const raw = request.cookies.get(CUSTOMER_PORTAL_COOKIE)?.value || null;
    if (raw) await revokeCustomerPortalSession(raw);
    const response = NextResponse.json({ success: true });
    response.cookies.set(CUSTOMER_PORTAL_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
      expires: new Date(0),
    });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || "Unable to sign out" }, { status: 500 });
  }
}
