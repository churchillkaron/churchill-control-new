export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { CUSTOMER_PORTAL_COOKIE, loadCustomerPortalData, resolveCustomerPortalSession } from "@/lib/customer-portal/CustomerPortalRuntime";

export async function GET(request) {
  const raw = request.cookies.get(CUSTOMER_PORTAL_COOKIE)?.value || null;
  const session = await resolveCustomerPortalSession(raw);
  if (!session) return NextResponse.json({ success: false, error: "Customer portal session required" }, { status: 401 });
  const data = await loadCustomerPortalData({ organizationId: session.organization_id, partyId: session.party_id });
  const response = NextResponse.json({ success: true, data });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
