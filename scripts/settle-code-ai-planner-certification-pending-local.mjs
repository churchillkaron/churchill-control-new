import process from "node:process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_CODE_PLANNER_PENDING_SETTLEMENT_V1";
const ORGANIZATION_NAME = "Avantiqo Code Planner Certification";
const PROVIDER = "avantiqo-code";
const CAPABILITY = "ai.code.debug";
const EPSILON = 0.000001;

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

if (text(process.env.NODE_ENV).toLowerCase() !== "development") {
  throw new Error("CODE_AI_PENDING_SETTLEMENT_DEVELOPMENT_ENV_REQUIRED");
}
if (text(process.env.AVANTIQO_CODE_PLANNER_PENDING_SETTLEMENT_APPROVED).toUpperCase() !== "YES") {
  throw new Error("CODE_AI_PENDING_SETTLEMENT_APPROVAL_REQUIRED");
}
const usageId = required("AVANTIQO_CODE_PLANNER_PENDING_USAGE_ID");
const providerJobId = required("AVANTIQO_CODE_PLANNER_PENDING_PROVIDER_JOB_ID");

const { supabaseAdmin } = await import("../lib/shared/supabase/admin.js");
const { ServiceExecutionRuntime } = await import(
  "../lib/platform/service-runtime/execution/ServiceExecutionRuntime.js"
);
const { UsageRuntime } = await import(
  "../lib/platform/service-runtime/usage/UsageRuntime.js"
);

const organizationResult = await supabaseAdmin
  .from("organizations")
  .select("id")
  .eq("name", ORGANIZATION_NAME);
if (organizationResult.error) throw organizationResult.error;
if ((organizationResult.data || []).length !== 1) {
  throw new Error("CODE_AI_PENDING_SETTLEMENT_CERTIFICATION_ORGANIZATION_REQUIRED");
}
const organizationId = organizationResult.data[0].id;

const serviceResult = await supabaseAdmin
  .from("organization_services")
  .select("managed_by,usage_enabled,billing_enabled,default_provider_id")
  .eq("organization_id", organizationId)
  .eq("service_id", CAPABILITY)
  .maybeSingle();
if (serviceResult.error) throw serviceResult.error;
const service = serviceResult.data;
if (
  !service ||
  service.managed_by !== "AVANTIQO_CERTIFICATION" ||
  service.usage_enabled !== false ||
  service.billing_enabled !== false ||
  text(service.default_provider_id) !== PROVIDER
) {
  throw new Error("CODE_AI_PENDING_SETTLEMENT_SERVICE_SCOPE_UNSAFE");
}

const usage = await UsageRuntime.get(usageId);
if (
  !usage ||
  usage.organization_id !== organizationId ||
  text(usage.provider) !== PROVIDER ||
  text(usage.capability) !== CAPABILITY ||
  text(usage.provider_request_id) !== providerJobId
) {
  throw new Error("CODE_AI_PENDING_SETTLEMENT_USAGE_SCOPE_UNSAFE");
}

let settlement = await ServiceExecutionRuntime.settlePending({
  organization_id: organizationId,
  provider: PROVIDER,
  provider_job_id: providerJobId,
  usage_id: usageId,
  pricing: usage.metadata?.reservation_pricing || {},
  quantity: usage.quantity || 1,
  unit: usage.unit || "request",
  metadata: {
    reconciliation_contract: CONTRACT,
    certification_only: true,
  },
  provider_status_input: { capability: CAPABILITY },
  started_at: usage.created_at || null,
});
if (settlement?.pending === true) {
  settlement = await ServiceExecutionRuntime.cancelPending({
    organization_id: organizationId,
    provider: PROVIDER,
    provider_job_id: providerJobId,
    usage_id: usageId,
    pricing: usage.metadata?.reservation_pricing || {},
    reason: "CODE_AI_CERTIFICATION_PENDING_JOB_CANCELLED_DURING_CLEANUP",
    metadata: {
      reconciliation_contract: CONTRACT,
      certification_only: true,
    },
  });
}

const usageAfter = await UsageRuntime.get(usageId);
if (!["SUCCESS", "FAILED"].includes(text(usageAfter?.status).toUpperCase())) {
  throw new Error("CODE_AI_PENDING_SETTLEMENT_USAGE_NOT_TERMINAL");
}

const walletResult = await supabaseAdmin
  .from("organization_wallets")
  .select("reserved_balance")
  .eq("organization_id", organizationId)
  .single();
if (walletResult.error) throw walletResult.error;
const reservedAfter = finite(walletResult.data?.reserved_balance);
if (reservedAfter > EPSILON) {
  throw new Error(`CODE_AI_PENDING_SETTLEMENT_RESERVED_BALANCE_REMAINS:${reservedAfter}`);
}

console.log(JSON.stringify({
  contract: CONTRACT,
  success: true,
  organization_id: organizationId,
  usage_id: usageId,
  provider_job_id: providerJobId,
  usage_status: text(usageAfter?.status).toUpperCase(),
  wallet_reserved_after: reservedAfter,
  provider_pending_after_cleanup: settlement?.pending === true,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
