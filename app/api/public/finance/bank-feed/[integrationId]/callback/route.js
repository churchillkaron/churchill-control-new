export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { syncBankFeedIntegration } from "@/lib/finance/banking/runtime/FinanceBankFeedRuntime";

function text(value) { return String(value ?? "").trim(); }
function hash(value) { return crypto.createHash("sha256").update(text(value)).digest("hex"); }
function safeEqual(a, b) { const x = Buffer.from(text(a)); const y = Buffer.from(text(b)); return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y); }

export async function GET(request, { params }) {
  const url = new URL(request.url);
  const resolved = await params;
  const integrationId = text(resolved?.integrationId);
  const organizationId = text(url.searchParams.get("organizationId"));
  const state = text(url.searchParams.get("state"));
  let verifiedCallback = false;
  let workspaceUrl = "/";
  try {
    if (!organizationId || !integrationId || !state) throw new Error("BANK_FEED_CALLBACK_INVALID");
    const { data: integration, error } = await supabaseAdmin.from("finance_banking_integrations").select("id,organization_id,metadata").eq("id", integrationId).eq("organization_id", organizationId).maybeSingle();
    if (error) throw error;
    if (!integration) throw new Error("BANK_FEED_INTEGRATION_NOT_FOUND");
    const expected = text(integration.metadata?.consent_state_hash);
    if (!expected || !safeEqual(hash(state), expected)) throw new Error("BANK_FEED_CALLBACK_STATE_INVALID");
    verifiedCallback = true;
    workspaceUrl = `/workspace/${encodeURIComponent(integration.organization_id)}/finance/banking-integrations`;
    const result = await syncBankFeedIntegration({ organizationId: integration.organization_id, integrationId, syncMode: "INITIAL" });
    const redirect = new URL(workspaceUrl, url.origin);
    redirect.searchParams.set("bankFeed", result?.sync_run?.status || "COMPLETED");
    return NextResponse.redirect(redirect, 307);
  } catch (error) {
    if (verifiedCallback) {
      await supabaseAdmin.from("finance_banking_integrations").update({ sync_status: "FAILED", last_error_code: "BANK_FEED_CALLBACK_FAILED", last_error_message: text(error?.message).slice(0,1000), updated_at: new Date().toISOString() }).eq("id", integrationId).eq("organization_id", organizationId);
    }
    const redirect = new URL(workspaceUrl, url.origin);
    redirect.searchParams.set("bankFeed", "FAILED");
    return NextResponse.redirect(redirect, 307);
  }
}
