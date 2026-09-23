export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { CUSTOMER_PORTAL_COOKIE, isCustomerPortalSameOriginRequest, resolveCustomerPortalSession } from "@/lib/customer-portal/CustomerPortalRuntime";

export async function POST(request) {
  try {
    if (!isCustomerPortalSameOriginRequest(request)) {
      return NextResponse.json({ success: false, error: "Cross-origin customer portal mutation denied" }, { status: 403 });
    }
    const session = await resolveCustomerPortalSession(request.cookies.get(CUSTOMER_PORTAL_COOKIE)?.value || null);
    if (!session) return NextResponse.json({ success: false, error: "Customer portal session required" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const quotationId = String(body?.quotationId || body?.quotation_id || "").trim();
    const action = String(body?.action || "").trim().toUpperCase();
    if (!quotationId) return NextResponse.json({ success: false, error: "quotationId required" }, { status: 400 });
    if (!["ACCEPT", "REJECT"].includes(action)) return NextResponse.json({ success: false, error: "action must be ACCEPT or REJECT" }, { status: 400 });

    const idempotencyKey = String(body?.idempotencyKey || "").trim() || `customer-portal:quotation:${quotationId}:${action}:${randomUUID()}`;
    const result = await supabaseAdmin.rpc("commercial_customer_respond_quotation_atomic", {
      p_organization_id: session.organization_id,
      p_party_id: session.party_id,
      p_quotation_id: quotationId,
      p_action: action,
      p_idempotency_key: idempotencyKey,
    });
    if (result.error) throw result.error;

    const response = NextResponse.json({ success: true, result: result.data });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || "Unable to respond to quotation" }, { status: 400 });
  }
}
