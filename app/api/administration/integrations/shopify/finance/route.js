export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const MANAGER_ROLES = new Set([
  "OWNER",
  "ORGANIZATION_OWNER",
  "ORG_OWNER",
  "PLATFORM_OWNER",
  "SUPER_ADMIN",
  "ADMIN",
  "MANAGER",
]);
const MODES = new Set(["OBSERVE_ONLY", "POST_TO_FINANCE"]);
const LIFECYCLE_TYPES = [
  "SHOPIFY_ORDER_PAID_OBSERVED",
  "SHOPIFY_ORDER_TRANSACTION_OBSERVED",
  "SHOPIFY_ORDER_FULFILLED_OBSERVED",
  "SHOPIFY_ORDER_PARTIALLY_FULFILLED_OBSERVED",
  "SHOPIFY_FULFILLMENT_OBSERVED",
  "SHOPIFY_REFUND_OBSERVED",
];

function text(value) {
  return String(value ?? "").trim();
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function canManage(context) {
  return [context?.role, context?.access?.role, context?.membership?.role, context?.staff?.role]
    .map((value) => text(value).toUpperCase())
    .filter(Boolean)
    .some((role) => MANAGER_ROLES.has(role));
}
async function contextFor(request, body = {}) {
  const url = new URL(request.url);
  return requireOrganizationAccess({
    organizationId:
      body.organizationId || body.organization_id ||
      url.searchParams.get("organizationId") || url.searchParams.get("organization_id"),
    request,
  });
}
function forbidden() {
  return NextResponse.json(
    { success: false, error: "Owner, administrator, or manager access is required to manage Shopify finance synchronization" },
    { status: 403 },
  );
}

async function loadStore(organizationId) {
  const result = await supabaseAdmin
    .from("organization_channel_assets")
    .select("id,connection_id,external_id,name,entity_id,metadata,updated_at")
    .eq("organization_id", organizationId)
    .eq("channel_provider", "shopify")
    .eq("asset_type", "shopify_store")
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

async function loadBankAccounts(organizationId, entityId) {
  if (!entityId) return [];
  const result = await supabaseAdmin
    .from("bank_accounts")
    .select("id,entity_id,bank_name,account_name,account_number,currency,currency_code,is_default,active")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .order("is_default", { ascending: false })
    .order("account_name", { ascending: true });
  if (result.error) throw result.error;
  return result.data || [];
}

async function loadLifecycleEvents(organizationId, connectionId) {
  if (!connectionId) return [];
  const result = await supabaseAdmin
    .from("system_events")
    .select("id,type,processed,attempt_count,last_error,created_at,processed_at,payload")
    .eq("organization_id", organizationId)
    .in("type", LIFECYCLE_TYPES)
    .order("created_at", { ascending: false })
    .limit(500);
  if (result.error) throw result.error;
  return (result.data || []).filter((row) => text(row?.payload?.connection_id) === connectionId);
}

function lifecycleHealth(events) {
  const health = {
    observed: events.length,
    processed: 0,
    pending: 0,
    reconciled: 0,
    blocked: 0,
    failed: 0,
    posted_payments: 0,
    posted_refunds: 0,
    last_observed_at: events[0]?.created_at || null,
    last_processed_at: null,
  };
  for (const event of events) {
    const lifecycle = object(event?.payload?.shopify_finance_lifecycle);
    const finance = object(lifecycle.finance);
    const status = text(finance.status).toUpperCase();
    if (event.processed) health.processed += 1;
    else health.pending += 1;
    if (status === "RECONCILED") health.reconciled += 1;
    if (status.startsWith("BLOCKED_") || status.startsWith("PENDING_")) health.blocked += 1;
    if (event.last_error) health.failed += 1;
    health.posted_payments += Number(finance.posted_payments || 0);
    health.posted_refunds += Number(finance.posted_refunds || 0);
    if (!health.last_processed_at && event.processed_at) health.last_processed_at = event.processed_at;
  }
  return health;
}

async function replayEligibleObservations(organizationId, connectionId) {
  const events = await loadLifecycleEvents(organizationId, connectionId);
  const ids = events
    .filter((event) => {
      if (!event.processed) return false;
      const status = text(event?.payload?.shopify_finance_lifecycle?.finance?.status).toUpperCase();
      return status === "OBSERVED_ONLY" || status.startsWith("BLOCKED_") || status.startsWith("PENDING_");
    })
    .map((event) => event.id);
  if (!ids.length) return 0;
  const result = await supabaseAdmin
    .from("system_events")
    .update({
      processed: false,
      processed_at: null,
      processing: false,
      processing_started_at: null,
      attempt_count: 0,
      last_error: null,
      last_failed_at: null,
    })
    .eq("organization_id", organizationId)
    .in("id", ids);
  if (result.error) throw result.error;
  return ids.length;
}

async function snapshot(organizationId) {
  const store = await loadStore(organizationId);
  const metadata = object(store?.metadata);
  const accounts = await loadBankAccounts(organizationId, store?.entity_id || null);
  const events = await loadLifecycleEvents(organizationId, store?.connection_id || null);
  const configuredBankId = text(metadata.shopify_settlement_bank_account_id) || null;
  const configuredBank = accounts.find((row) => row.id === configuredBankId) || null;
  return {
    store,
    bank_accounts: accounts,
    finance: {
      mode: MODES.has(text(metadata.shopify_finance_sync_mode).toUpperCase())
        ? text(metadata.shopify_finance_sync_mode).toUpperCase()
        : "OBSERVE_ONLY",
      settlement_bank_account_id: configuredBankId,
      settlement_bank_account: configuredBank,
      configured: Boolean(store?.entity_id && configuredBank),
      updated_at: metadata.shopify_finance_sync_updated_at || null,
      updated_by_party_id: metadata.shopify_finance_sync_updated_by_party_id || null,
      health: lifecycleHealth(events),
    },
  };
}

export async function GET(request) {
  try {
    const access = await contextFor(request);
    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error || "Organization access denied" },
        { status: access.status || 403 },
      );
    }
    return NextResponse.json({ success: true, ...(await snapshot(access.organizationId)) });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "Shopify finance configuration failed" },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const access = await contextFor(request, body);
    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error || "Organization access denied" },
        { status: access.status || 403 },
      );
    }
    if (!canManage(access)) return forbidden();

    const mode = text(body.mode).toUpperCase();
    if (!MODES.has(mode)) {
      return NextResponse.json({ success: false, error: "Invalid Shopify finance synchronization mode" }, { status: 400 });
    }

    const store = await loadStore(access.organizationId);
    if (!store) {
      return NextResponse.json({ success: false, error: "Connect Shopify before configuring Finance" }, { status: 409 });
    }
    if (!store.entity_id) {
      return NextResponse.json({ success: false, error: "Map the Shopify store to a legal entity first" }, { status: 409 });
    }

    const bankAccountId = text(body.settlement_bank_account_id) || null;
    let bankAccount = null;
    if (bankAccountId) {
      const result = await supabaseAdmin
        .from("bank_accounts")
        .select("id,entity_id,bank_name,account_name,account_number,currency,currency_code,active")
        .eq("id", bankAccountId)
        .eq("organization_id", access.organizationId)
        .eq("entity_id", store.entity_id)
        .maybeSingle();
      if (result.error) throw result.error;
      bankAccount = result.data || null;
      if (!bankAccount) {
        return NextResponse.json({ success: false, error: "Settlement bank account is outside the Shopify legal entity" }, { status: 409 });
      }
      if (bankAccount.active === false) {
        return NextResponse.json({ success: false, error: "Settlement bank account is inactive" }, { status: 409 });
      }
    }
    if (mode === "POST_TO_FINANCE" && !bankAccount) {
      return NextResponse.json({ success: false, error: "Choose a settlement bank account before enabling Finance posting" }, { status: 409 });
    }

    const now = new Date().toISOString();
    const metadata = object(store.metadata);
    const update = await supabaseAdmin
      .from("organization_channel_assets")
      .update({
        metadata: {
          ...metadata,
          shopify_finance_sync_mode: mode,
          shopify_settlement_bank_account_id: bankAccount?.id || null,
          shopify_finance_sync_updated_at: now,
          shopify_finance_sync_updated_by_party_id: access.staff?.party_id || null,
        },
        updated_at: now,
      })
      .eq("id", store.id)
      .eq("organization_id", access.organizationId)
      .select("id")
      .single();
    if (update.error) throw update.error;

    const replayed = mode === "POST_TO_FINANCE"
      ? await replayEligibleObservations(access.organizationId, store.connection_id)
      : 0;

    return NextResponse.json({
      success: true,
      replayed_observations: replayed,
      ...(await snapshot(access.organizationId)),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "Shopify finance configuration failed" },
      { status: 500 },
    );
  }
}
