export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import {
  CUSTOMER_PORTAL_COOKIE,
  isCustomerPortalSameOriginRequest,
  resolveCustomerPortalSession,
} from "@/lib/customer-portal/CustomerPortalRuntime";
import { createCustomerPortalInboundMessage } from "@/lib/customer-portal/CustomerPortalCommunicationRuntime";

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

export async function POST(request) {
  try {
    if (!isCustomerPortalSameOriginRequest(request)) {
      return NextResponse.json({ success: false, error: "Cross-origin customer portal mutation denied" }, { status: 403 });
    }
    const session = await resolveCustomerPortalSession(request.cookies.get(CUSTOMER_PORTAL_COOKIE)?.value || null);
    if (!session) return NextResponse.json({ success: false, error: "Customer portal session required" }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    const messageBody = text(body.message || body.body, 12000);
    if (!messageBody) return NextResponse.json({ success: false, error: "Message required" }, { status: 400 });

    const message = await createCustomerPortalInboundMessage({
      organizationId: session.organization_id,
      partyId: session.party_id,
      sessionId: session.id,
      body: messageBody,
      sourceContext: { kind: "CUSTOMER_PORTAL_MESSAGE" },
    });
    return NextResponse.json({ success: true, message });
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || "Unable to send message" }, { status: 500 });
  }
}
