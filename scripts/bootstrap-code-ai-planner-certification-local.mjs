import process from "node:process";
import { register } from "node:module";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

register("./next-alias-loader.mjs", import.meta.url);
loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_CODE_AI_PLANNER_CERTIFICATION_BOOTSTRAP_V1";
const ORGANIZATION_NAME = "Avantiqo Code Planner Certification";
const SERVICE_ID = "ai.code.debug";
const PROVIDER = "avantiqo-code";
const CURRENCY = "THB";
const TOPUP_AMOUNT = 10;
const TOPUP_KEY = "TOPUP:avantiqo-code-planner-certification-v1";
const TOPUP_REFERENCE = "avantiqo-code-planner-certification-v1";

function required(name) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function fail(error) {
  console.error(`AVANTIQO_CODE_AI_PLANNER_CERTIFICATION_BOOTSTRAP=FAIL reason=${String(error?.message || error)}`);
  process.exit(1);
}

async function main() {
  required("NEXT_PUBLIC_SUPABASE_URL");
  required("SUPABASE_SERVICE_ROLE_KEY");
  const { supabaseAdmin: supabase } = await import("../lib/shared/supabase/admin.js");

  const { data: pricingRows, error: pricingError } = await supabase
    .from("provider_pricing")
    .select("id,provider,model,capability,currency,active,metadata")
    .eq("provider", PROVIDER)
    .eq("capability", SERVICE_ID);
  if (pricingError) throw pricingError;
  if (!Array.isArray(pricingRows) || pricingRows.length !== 1) {
    throw new Error(`CODE_AI_PLANNER_CERTIFICATION_EXACT_PRICING_ROW_REQUIRED:${pricingRows?.length || 0}`);
  }
  const pricing = pricingRows[0];
  if (pricing.active !== false) throw new Error("CODE_AI_PLANNER_CERTIFICATION_REQUIRES_INACTIVE_PREVIEW_PRICING");
  if (String(pricing.currency || "").toUpperCase() !== CURRENCY) {
    throw new Error(`CODE_AI_PLANNER_CERTIFICATION_PRICING_CURRENCY_MISMATCH:${pricing.currency || "missing"}`);
  }
  if (pricing.metadata?.owned_inference !== true) throw new Error("CODE_AI_PLANNER_CERTIFICATION_OWNED_PRICING_REQUIRED");
  if (pricing.metadata?.runtime_compatible !== true) throw new Error("CODE_AI_PLANNER_CERTIFICATION_RUNTIME_COMPATIBLE_REQUIRED");
  if (pricing.metadata?.model_license_verified !== true) throw new Error("CODE_AI_PLANNER_CERTIFICATION_LICENSE_VERIFIED_REQUIRED");
  if (String(pricing.metadata?.pricing_status || "").toUpperCase() !== "MARKET_PARITY_READY") {
    throw new Error("CODE_AI_PLANNER_CERTIFICATION_MARKET_PARITY_PRICING_REQUIRED");
  }
  if (pricing.metadata?.production_routing_allowed !== false) {
    throw new Error("CODE_AI_PLANNER_CERTIFICATION_PRODUCTION_ROUTING_MUST_REMAIN_DISABLED");
  }

  const { data: organizations, error: organizationLookupError } = await supabase
    .from("organizations")
    .select("id,name,organization_type,status,organization_status")
    .eq("name", ORGANIZATION_NAME);
  if (organizationLookupError) throw organizationLookupError;
  if ((organizations || []).length > 1) {
    throw new Error("CODE_AI_PLANNER_CERTIFICATION_ORGANIZATION_AMBIGUOUS");
  }

  let organization = organizations?.[0] || null;
  let organizationCreated = false;
  if (!organization) {
    const { data, error } = await supabase
      .from("organizations")
      .insert({
        name: ORGANIZATION_NAME,
        legal_name: ORGANIZATION_NAME,
        organization_type: "direct_business",
        status: "active",
        organization_status: "ACTIVE",
        industry: "software_certification",
        country: "TH",
      })
      .select("id,name,organization_type,status,organization_status")
      .single();
    if (error) throw error;
    organization = data;
    organizationCreated = true;
  }
  if (organization.organization_type !== "direct_business") {
    throw new Error("CODE_AI_PLANNER_CERTIFICATION_ORGANIZATION_TYPE_MISMATCH");
  }

  const { data: stagedService, error: serviceError } = await supabase
    .from("organization_services")
    .upsert({
      organization_id: organization.id,
      service_category_id: "platform-ai",
      service_id: SERVICE_ID,
      status: "ACTIVE",
      managed_by: "AVANTIQO_CERTIFICATION",
      usage_enabled: false,
      billing_enabled: false,
      default_provider_id: PROVIDER,
      fallback_enabled: false,
      billing_mode: "wallet",
      pricing_mode: "provider",
      default_currency: CURRENCY,
      metadata: {
        certification_only: true,
        certification_contract: CONTRACT,
        production_routing_allowed: false,
      },
      configuration: {
        certification_only: true,
      },
    }, {
      onConflict: "organization_id,service_id",
    })
    .select("id,organization_id,service_id,status,usage_enabled,billing_enabled,default_provider_id,fallback_enabled,default_currency,metadata")
    .single();
  if (serviceError) throw serviceError;
  if (stagedService.usage_enabled !== false || stagedService.billing_enabled !== false) {
    throw new Error("CODE_AI_PLANNER_CERTIFICATION_SERVICE_MUST_STAGE_DISABLED");
  }

  const ensure = await supabase.rpc("apply_wallet_transaction", {
    p_organization_id: organization.id,
    p_operation: "ENSURE",
    p_amount: 0,
    p_currency: CURRENCY,
    p_provider: PROVIDER,
    p_usage_id: null,
    p_invoice_id: null,
    p_reference: null,
    p_idempotency_key: null,
    p_metadata: {
      certification_only: true,
      certification_contract: CONTRACT,
    },
  });
  if (ensure.error) throw ensure.error;

  const topup = await supabase.rpc("apply_wallet_transaction", {
    p_organization_id: organization.id,
    p_operation: "TOPUP",
    p_amount: TOPUP_AMOUNT,
    p_currency: CURRENCY,
    p_provider: PROVIDER,
    p_usage_id: null,
    p_invoice_id: null,
    p_reference: TOPUP_REFERENCE,
    p_idempotency_key: TOPUP_KEY,
    p_metadata: {
      certification_only: true,
      certification_contract: CONTRACT,
      purpose: "CODE_AI_PLANNER_SERVICE_RUNTIME_CERTIFICATION",
    },
  });
  if (topup.error) throw topup.error;

  const { data: wallet, error: walletError } = await supabase
    .from("organization_wallets")
    .select("id,organization_id,currency,available_balance,reserved_balance,billing_policy,status,wallet_type,allow_negative,credit_limit")
    .eq("organization_id", organization.id)
    .single();
  if (walletError) throw walletError;
  if (String(wallet.currency || "").toUpperCase() !== CURRENCY) throw new Error("CODE_AI_PLANNER_CERTIFICATION_WALLET_CURRENCY_MISMATCH");
  if (String(wallet.billing_policy || "").toUpperCase() !== "PREPAID") throw new Error("CODE_AI_PLANNER_CERTIFICATION_PREPAID_WALLET_REQUIRED");
  if (String(wallet.status || "").toUpperCase() !== "ACTIVE") throw new Error("CODE_AI_PLANNER_CERTIFICATION_ACTIVE_WALLET_REQUIRED");
  if (wallet.allow_negative !== false || Number(wallet.credit_limit || 0) !== 0) {
    throw new Error("CODE_AI_PLANNER_CERTIFICATION_NO_CREDIT_WALLET_REQUIRED");
  }
  if (Number(wallet.available_balance || 0) <= 0) throw new Error("CODE_AI_PLANNER_CERTIFICATION_WALLET_BALANCE_REQUIRED");
  if (Number(wallet.reserved_balance || 0) !== 0) {
    throw new Error(`CODE_AI_PLANNER_CERTIFICATION_PENDING_RESERVATION_REQUIRES_SETTLEMENT:${wallet.reserved_balance}`);
  }

  const { data: service, error: enableError } = await supabase
    .from("organization_services")
    .update({ usage_enabled: true, billing_enabled: true })
    .eq("organization_id", organization.id)
    .eq("service_id", SERVICE_ID)
    .select("id,organization_id,service_id,status,usage_enabled,billing_enabled,default_provider_id,fallback_enabled,default_currency,metadata")
    .single();
  if (enableError) throw enableError;
  if (service.usage_enabled !== true || service.billing_enabled !== true) {
    throw new Error("CODE_AI_PLANNER_CERTIFICATION_SERVICE_ENABLE_FAILED");
  }

  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    organization_id: organization.id,
    organization_name: ORGANIZATION_NAME,
    organization_created: organizationCreated,
    organization_type: organization.organization_type,
    service: {
      id: service.id,
      service_id: service.service_id,
      status: service.status,
      usage_enabled: service.usage_enabled,
      billing_enabled: service.billing_enabled,
      default_provider_id: service.default_provider_id,
      fallback_enabled: service.fallback_enabled,
      default_currency: service.default_currency,
      certification_only: service.metadata?.certification_only === true,
    },
    wallet: {
      id: wallet.id,
      currency: wallet.currency,
      available_balance: Number(wallet.available_balance || 0),
      reserved_balance: Number(wallet.reserved_balance || 0),
      billing_policy: wallet.billing_policy,
      status: wallet.status,
      wallet_type: wallet.wallet_type,
      allow_negative: wallet.allow_negative,
      credit_limit: Number(wallet.credit_limit || 0),
    },
    pricing: {
      id: pricing.id,
      active: pricing.active,
      currency: pricing.currency,
      production_routing_allowed: pricing.metadata?.production_routing_allowed,
      pricing_status: pricing.metadata?.pricing_status,
    },
    topup_amount: TOPUP_AMOUNT,
    topup_idempotency_key: TOPUP_KEY,
    production_pricing_activated: false,
    production_deploy_performed: false,
    customer_organization_mutated: false,
    secrets_printed: false,
  }, null, 2));
}

main().catch(fail);
