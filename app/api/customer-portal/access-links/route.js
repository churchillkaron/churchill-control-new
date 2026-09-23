import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  createCustomerPortalToken,
  hashCustomerPortalToken,
} from "@/lib/customer-portal/CustomerPortalRuntime";

export const dynamic = "force-dynamic";

function clean(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = clean(body?.organizationId || body?.organization_id, 80);
    const partyId = clean(body?.partyId || body?.party_id, 80);
    const purpose = clean(body?.purpose || "PORTAL_ACCESS", 80).toUpperCase();
    const sourceType = clean(body?.sourceType || body?.source_type, 80) || null;
    const sourceId = clean(body?.sourceId || body?.source_id, 180) || null;
    const expiresHours = Math.min(168, Math.max(1, Number(body?.expiresHours || body?.expires_hours || 72) || 72));

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status || 403 });
    }
    if (!partyId) {
      return NextResponse.json({ success: false, error: "partyId required" }, { status: 400 });
    }

    const { data: party, error: partyError } = await supabaseAdmin
      .from("parties")
      .select("id,organization_id,display_name,legal_name,email,phone,status")
      .eq("organization_id", access.organizationId)
      .eq("id", partyId)
      .maybeSingle();
    if (partyError) throw partyError;
    if (!party) {
      return NextResponse.json({ success: false, error: "Customer Party not found in this organization" }, { status: 404 });
    }

    const now = new Date();
    const rawToken = createCustomerPortalToken();
    const tokenHash = hashCustomerPortalToken(rawToken);
    const expiresAt = new Date(now.getTime() + expiresHours * 60 * 60 * 1000).toISOString();

    const { error: revokeError } = await supabaseAdmin
      .from("customer_portal_access_links")
      .update({ revoked_at: now.toISOString() })
      .eq("organization_id", access.organizationId)
      .eq("party_id", party.id)
      .eq("purpose", purpose)
      .is("consumed_at", null)
      .is("revoked_at", null);
    if (revokeError) throw revokeError;

    const { data: link, error: linkError } = await supabaseAdmin
      .from("customer_portal_access_links")
      .insert({
        organization_id: access.organizationId,
        party_id: party.id,
        token_hash: tokenHash,
        purpose,
        source_type: sourceType,
        source_id: sourceId,
        expires_at: expiresAt,
      })
      .select("id,organization_id,party_id,purpose,source_type,source_id,expires_at,created_at")
      .single();
    if (linkError) throw linkError;

    const origin = new URL(request.url).origin;
    return NextResponse.json({
      success: true,
      link,
      customer: party,
      access_url: `${origin}/customer-access/${encodeURIComponent(rawToken)}`,
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "Unable to create customer portal access link" },
      { status: 500 },
    );
  }
}
