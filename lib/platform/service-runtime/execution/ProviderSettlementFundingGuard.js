import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { getProvider } from "../providers/ProviderRegistry.js";
import { assertAvantiqoSupplierBilling } from "../billing/adapters/ProviderSupplierBillingAdapters.js";

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
    .select("id,organization_id,bill_to_organization_id,organization_service_id,status,provider,provider_request_id,currency,metadata")
    .eq("id", usage_id)
    .eq("organization_id", organization_id)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function organizationServiceRecord({ organizationId, serviceId }) {
  if (!serviceId) return null;

  const { data, error } = await supabaseAdmin
    .from("organization_services")
    .select("id,organization_id,status,usage_enabled,billing_enabled")
    .eq("id", serviceId)
    .eq("organization_id", organizationId)
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

function zeroCostPricing(usage = {}) {
  const metadata = object(usage.metadata);
  const pricing = object(metadata.reservation_pricing);
  return (
    pricing.zero_price === true &&
    Number(pricing.customer_price || 0) === 0 &&
    Number(pricing.supplier_cost || 0) === 0
  );
}

export async function assertProviderSettlementFunded({
  provider,
  job_id,
  context = {},
}) {
  const providerDefinition = getProvider(provider);
  if (!providerDefinition) {
    throw new Error(`Unknown provider: ${provider}`);
  }

  const billing = assertAvantiqoSupplierBilling(providerDefinition);
  const organizationId = text(context.organization_id);
  const usageId = text(context.usage_id);
  const providerJobId = text(job_id || context.provider_job_id);

  if (!organizationId || !usageId || !providerJobId) {
    throw new Error(`PROVIDER_GOVERNED_SETTLEMENT_USAGE_REQUIRED:${provider}`);
  }

  const usage = await usageRecord({
    organization_id: organizationId,
    usage_id: usageId,
  });

  if (!usage) {
    throw new Error(`PROVIDER_SETTLEMENT_USAGE_RECORD_REQUIRED:${provider}`);
  }
  if (text(usage.provider) && text(usage.provider) !== text(provider)) {
    throw new Error(`PROVIDER_SETTLEMENT_USAGE_PROVIDER_MISMATCH:${provider}:${usage.provider}`);
  }
  if (text(usage.provider_request_id) !== providerJobId) {
    throw new Error(`PROVIDER_SETTLEMENT_JOB_BINDING_MISMATCH:${provider}`);
  }
  if (!["PENDING", "SUCCESS", "FAILED"].includes(upper(usage.status))) {
    throw new Error(`PROVIDER_SETTLEMENT_USAGE_STATUS_INVALID:${provider}:${usage.status}`);
  }

  const billToOrganizationId = text(usage.bill_to_organization_id) || organizationId;
  if (billToOrganizationId !== organizationId) {
    throw new Error(
      `PROVIDER_SETTLEMENT_BILL_TO_ORGANIZATION_MISMATCH:${organizationId}:${billToOrganizationId}`,
    );
  }

  const organizationService = await organizationServiceRecord({
    organizationId,
    serviceId: usage.organization_service_id,
  });
  if (!organizationService) {
    throw new Error(`ORGANIZATION_SERVICE_REQUIRED:${provider}`);
  }
  if (upper(organizationService.status) !== "ACTIVE") {
    throw new Error(`ORGANIZATION_SERVICE_ACTIVE_REQUIRED:${provider}`);
  }

  if (zeroCostPricing(usage)) {
    return {
      authorized: true,
      mode: "AVANTIQO_EXISTING_ZERO_COST_PROVIDER_JOB_SETTLEMENT",
      billing,
      customer_organization_id: organizationId,
      bill_to_organization_id: billToOrganizationId,
      organization_service_id: organizationService.id,
      usage_id: usageId,
      provider_job_id: providerJobId,
      new_provider_execution_allowed: false,
      usage_enabled_required: false,
      billing_enabled_required: false,
    };
  }

  const [wallet, reservation] = await Promise.all([
    walletRecord(organizationId),
    prepaidReservation({ organizationId, usageId }),
  ]);

  if (!wallet?.id) {
    throw new Error("ORGANIZATION_WALLET_UNAVAILABLE");
  }
  if (upper(wallet.status) !== "ACTIVE") {
    throw new Error("ACTIVE_PREPAID_WALLET_REQUIRED");
  }
  if (upper(wallet.billing_policy) !== "PREPAID") {
    throw new Error("PREPAID_WALLET_REQUIRED");
  }
  if (!reservation || Number(reservation.amount || 0) <= 0) {
    throw new Error(`PROVIDER_PREPAID_RESERVATION_REQUIRED:${provider}`);
  }
  if (text(reservation.provider) && text(reservation.provider) !== text(provider)) {
    throw new Error(`PROVIDER_SETTLEMENT_RESERVATION_PROVIDER_MISMATCH:${provider}`);
  }

  return {
    authorized: true,
    mode: "AVANTIQO_EXISTING_PREPAID_PROVIDER_JOB_SETTLEMENT",
    billing,
    customer_organization_id: organizationId,
    bill_to_organization_id: billToOrganizationId,
    organization_service_id: organizationService.id,
    wallet_id: wallet.id,
    reservation_id: reservation.id,
    reserved_amount: Number(reservation.amount || 0),
    currency: reservation.currency || wallet.currency || usage.currency || null,
    usage_id: usageId,
    provider_job_id: providerJobId,
    new_provider_execution_allowed: false,
    usage_enabled_required: false,
    billing_enabled_required: false,
  };
}

export const ProviderSettlementFundingGuard = {
  assert: assertProviderSettlementFunded,
};
