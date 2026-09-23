export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { CUSTOMER_PORTAL_COOKIE, isCustomerPortalSameOriginRequest, resolveCustomerPortalSession } from "@/lib/customer-portal/CustomerPortalRuntime";

function text(value, limit = 200) {
  return String(value ?? "").trim().slice(0, limit);
}

export async function PATCH(request) {
  try {
    if (!isCustomerPortalSameOriginRequest(request)) {
      return NextResponse.json({ success: false, error: "Cross-origin customer portal mutation denied" }, { status: 403 });
    }
    const session = await resolveCustomerPortalSession(request.cookies.get(CUSTOMER_PORTAL_COOKIE)?.value || null);
    if (!session) return NextResponse.json({ success: false, error: "Customer portal session required" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const patch = {
      preferred_language: text(body.preferred_language || body.preferredLanguage, 40) || null,
      preferred_channel: text(body.preferred_channel || body.preferredChannel, 80).toLowerCase() || null,
      allow_calls: body.allow_calls === true || body.allowCalls === true,
      allow_messages: body.allow_messages === true || body.allowMessages === true,
      updated_at: new Date().toISOString(),
      metadata: {
        source: "customer_portal_self_service",
        customer_portal_session_id: session.id,
      },
    };

    const result = await supabaseAdmin.from("secretary_contact_profiles").upsert({
      organization_id: session.organization_id,
      party_id: session.party_id,
      ...patch,
    }, { onConflict: "organization_id,party_id" })
      .select("party_id,preferred_language,preferred_channel,allow_calls,allow_messages,do_not_disturb,updated_at")
      .single();
    if (result.error) throw result.error;

    const response = NextResponse.json({ success: true, preferences: result.data });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || "Unable to update communication preferences" }, { status: 500 });
  }
}
