export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import crypto from "node:crypto";
import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { startBankFeedConsent } from "@/lib/finance/banking/runtime/FinanceBankFeedRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function text(value) { return String(value ?? "").trim(); }
function hash(value) { return crypto.createHash("sha256").update(text(value)).digest("hex"); }
function statusFor(message) {
  if (/permission denied/i.test(message)) return 403;
  if (/credential|consent|required|unsupported|not found/i.test(message)) return 409;
  return 500;
}

export async function POST(request, { params }) {
  try {
    const resolved = await params;
    const body = await request.json().catch(() => ({}));
    const organizationId = text(body.organizationId || body.organization_id);
    const integrationId = text(resolved?.integrationId);
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    await checkFinancePermission({ organizationId: access.organizationId, userId: access.user?.id, permissionKey: "finance.banking.manage", fullAccess: access.permissions?.includes("*") === true });

    const { data: integration, error } = await supabaseAdmin.from("finance_banking_integrations").select("id,provider_bank_code,provider_country_code,provider_credential_id,status").eq("organization_id", access.organizationId).eq("id", integrationId).maybeSingle();
    if (error) throw error;
    if (!integration) throw new Error("Bank feed connection not found");
    if (!integration.provider_credential_id) throw new Error("Bank feed provider credential required before consent can start");

    const state = crypto.randomBytes(32).toString("base64url");
    const origin = new URL(request.url).origin;
    const callback = `${origin}/api/public/finance/bank-feed/${encodeURIComponent(integrationId)}/callback?organizationId=${encodeURIComponent(access.organizationId)}&state=${encodeURIComponent(state)}`;
    const organizationResult = await supabaseAdmin.from("organizations").select("name").eq("id", access.organizationId).maybeSingle();
    if (organizationResult.error) throw organizationResult.error;
    const bankCodes = integration.provider_bank_code ? [integration.provider_bank_code] : [];
    const result = await startBankFeedConsent({ organizationId: access.organizationId, integrationId, redirectUri: callback, bankCodes, countryCode: integration.provider_country_code || "TH", organizationDisplayName: organizationResult.data?.name || "Avantiqo", consentStateHash: hash(state) });
    return NextResponse.json({ success: true, redirect_url: result.redirect_url, provider_request_id: result.provider_request_id, connection_id: integrationId });
  } catch (error) {
    const message = error?.message || "Unable to start bank consent";
    return NextResponse.json({ success: false, error: message }, { status: statusFor(message) });
  }
}
