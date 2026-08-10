import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { getProvider } from "../providers/ProviderRegistry.js";
import { assertAvantiqoSupplierBilling } from "../billing/adapters/ProviderSupplierBillingAdapters.js";
import { ProviderSupplierAccountRuntime } from "../billing/runtime/ProviderSupplierAccountRuntime.js";

function text(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

async function usageRecord({ organization_id, usage_id }) {
  const { data, error } = await supabaseAdmin
    .from("platform_service_usage")
    .select("id,organization_id,organization_service_id,status,category,provider,currency,metadata")
    .eq("id", usage_id)
    .eq("organization_id", organization_id)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function walletRecord(organizationId) {
  const { data, error } = await supabaseAdmin
    .from("organization_wallets")
    .select("id,organization_id,currency,available_balance,reserved_balance,billing_policy,status")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function prepaidReservation({ organizationId, usageId }) {
  const { data, error } = await supabaseAdmin
    .from("wallet_transactions")
    .select("id,wallet_id,type,amount,currency,provider,reference,metadata,created_at")
    .eq("organization_id", organizationId)
    .eq("type", "RESERVE")
    .contains("metadata", { usage_id: usageId })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

function isInternalZeroCostControl(usage = {}) {
  const metadata = object(usage.metadata);
  const pricing = object(metadata.reservation_pricing);
  const category = upper(usage.category);
  const internalCategory =
    category.startsWith("ADMINISTRATION_") ||
    category.startsWith("PLATFORM_") ||
    category === "ADMINISTRATION_PROVIDER_BILLING";

  return (
    internalCategory &&
    pricing.zero_price === true &&
    Number(pricing.customer_price || 0) === 0 &&
    Number(pricing.supplier_cost || 0) === 0
  );
}

export async function assertProviderExecutionFunded({
  provider,
  context = {},
}) {
  const providerDefinition = getProvider(provider);
  if (!providerDefinition) {
    throw new Error(`Unknown provider: ${provider}`);
  }

  const billing = assertAvantiqoSupplierBilling(providerDefinition);
  const organizationId = text(context.organization_id);
  const usageId = text(context.usage_id);

  if (!organizationId || !usageId) {
    throw new Error(`PROVIDER_GOVERNED_SERVICE_USAGE_REQUIRED:${provider}`);
  }

  const usage = await usageRecord({
    organization_id: organizationId,
    usage_id: usageId,
  });

  if (!usage) {
    throw new Error(`PROVIDER_USAGE_RECORD_REQUIRED:${provider}`);
  }
  if (text(usage.provider) && text(usage.provider) !== text(provider)) {
    throw new Error(`PROVIDER_USAGE_PROVIDER_MISMATCH:${provider}:${usage.provider}`);
  }

  if (isInternalZeroCostControl(usage)) {
    return {
      authorized: true,
      mode: "AVANTIQO_INTERNAL_ZERO_COST_CONTROL",
      billing,
      usage_id: usageId,
    };
  }

  const supplierAccount = await ProviderSupplierAccountRuntime.providerStatus(provider);
  if (!supplierAccount.ready) {
    throw new Error(
      `${supplierAccount.blocker || "AVANTIQO_PROVIDER_SUPPLIER_ACCOUNT_REQUIRED"}:${provider}`,
    );
  }

  const wallet = await walletRecord(organizationId);
  if (!wallet?.id) {
    throw new Error("ORGANIZATION_WALLET_UNAVAILABLE");
  }
  if (upper(wallet.status) !== "ACTIVE") {
    throw new Error("ACTIVE_PREPAID_WALLET_REQUIRED");
  }
  if (upper(wallet.billing_policy) !== "PREPAID") {
    throw new Error("PREPAID_WALLET_REQUIRED");
  }

  const reservation = await prepaidReservation({
    organizationId,
    usageId,
  });

  if (!reservation || Number(reservation.amount || 0) <= 0) {
    throw new Error(`PROVIDER_PREPAID_RESERVATION_REQUIRED:${provider}`);
  }

  return {
    authorized: true,
    mode: "AVANTIQO_SUPPLIER_AND_PREPAID_RESERVED",
    billing,
    supplier_account_id: supplierAccount.account?.id || null,
    supplier_party_id: supplierAccount.account?.supplier_party_id || null,
    payer_organization_id: supplierAccount.account?.payer_organization_id || null,
    payer_entity_id: supplierAccount.account?.payer_entity_id || null,
    wallet_id: wallet.id,
    reservation_id: reservation.id,
    reserved_amount: Number(reservation.amount || 0),
    currency: reservation.currency || wallet.currency || usage.currency || null,
    usage_id: usageId,
  };
}

export const ProviderExecutionFundingGuard = {
  assert: assertProviderExecutionFunded,
};
