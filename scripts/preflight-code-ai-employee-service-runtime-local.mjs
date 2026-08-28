import process from "node:process";
import { register } from "node:module";
import { createClient } from "@supabase/supabase-js";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

register("./next-alias-loader.mjs", import.meta.url);
loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_CODE_EMPLOYEE_SERVICE_RUNTIME_PREFLIGHT_V2";
const ORGANIZATION_ID = String(
  process.argv[2] || process.env.AVANTIQO_CODE_PLANNER_CERT_ORGANIZATION_ID || "",
).trim();
const SERVICE_ID = "ai.code.debug";
const PROVIDER = "avantiqo-code";
const FOUNDATION_MODEL = "Qwen/Qwen3-Coder-30B-A3B-Instruct";
const CURRENCY = "THB";

function required(name) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function text(value) {
  return String(value ?? "").trim();
}

if (!ORGANIZATION_ID) throw new Error("AVANTIQO_CODE_EMPLOYEE_CERT_ORGANIZATION_ID_REQUIRED");
if (text(process.env.NODE_ENV).toLowerCase() !== "development") {
  throw new Error("AVANTIQO_CODE_EMPLOYEE_PREFLIGHT_DEVELOPMENT_ENV_REQUIRED");
}

const controlOrganizationId = required("AVANTIQO_CODE_WORKER_CONTROL_ORGANIZATION_ID");
const workerSessionSecret = required("AVANTIQO_CODE_WORKER_SESSION_SECRET");
if (workerSessionSecret.length < 32) {
  throw new Error("AVANTIQO_CODE_WORKER_SESSION_SECRET_MIN_32_CHARS_REQUIRED");
}
if (!text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY)) {
  throw new Error("CODE_EMPLOYEE_PREFLIGHT_RUNPOD_MANAGEMENT_CREDENTIAL_REQUIRED");
}
if (!text(process.env.RUNPOD_AVANTIQO_CODE_ENDPOINT_ID)) {
  throw new Error("CODE_EMPLOYEE_PREFLIGHT_RUNPOD_ENDPOINT_REQUIRED");
}
process.env.AVANTIQO_CODE_ENGINE_ENABLED = "true";

const supabase = createClient(
  required("NEXT_PUBLIC_SUPABASE_URL"),
  required("SUPABASE_SERVICE_ROLE_KEY"),
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  },
);

const [
  { data: services, error: serviceError },
  { data: wallets, error: walletError },
  { data: prices, error: priceError },
  { data: controlOrganizations, error: controlOrganizationError },
] = await Promise.all([
  supabase
    .from("organization_services")
    .select("id,service_id,status,usage_enabled,billing_enabled,default_provider_id,fallback_enabled,default_currency,metadata")
    .eq("organization_id", ORGANIZATION_ID)
    .eq("service_id", SERVICE_ID),
  supabase
    .from("organization_wallets")
    .select("id,currency,available_balance,reserved_balance,billing_policy,status,wallet_type,allow_negative,credit_limit")
    .eq("organization_id", ORGANIZATION_ID),
  supabase
    .from("provider_pricing")
    .select("*")
    .eq("provider", PROVIDER)
    .eq("capability", SERVICE_ID),
  supabase
    .from("organizations")
    .select("id")
    .eq("id", controlOrganizationId)
    .limit(1),
]);

if (serviceError) throw serviceError;
if (walletError) throw walletError;
if (priceError) throw priceError;
if (controlOrganizationError) throw controlOrganizationError;
if ((controlOrganizations || []).length !== 1) {
  throw new Error("CODE_EMPLOYEE_PREFLIGHT_WORKER_CONTROL_ORGANIZATION_INVALID");
}
if ((services || []).length !== 1) {
  throw new Error(`CODE_EMPLOYEE_PREFLIGHT_SERVICE_ROW_REQUIRED:${services?.length || 0}`);
}
if ((wallets || []).length !== 1) {
  throw new Error(`CODE_EMPLOYEE_PREFLIGHT_WALLET_ROW_REQUIRED:${wallets?.length || 0}`);
}
if ((prices || []).length !== 1) {
  throw new Error(`CODE_EMPLOYEE_PREFLIGHT_PRICING_ROW_REQUIRED:${prices?.length || 0}`);
}

const service = services[0];
const wallet = wallets[0];
const pricing = prices[0];

if (service.status !== "ACTIVE" || service.usage_enabled !== true) {
  throw new Error("CODE_EMPLOYEE_PREFLIGHT_SERVICE_NOT_ACTIVE");
}
if (service.default_provider_id !== PROVIDER || service.fallback_enabled !== false) {
  throw new Error("CODE_EMPLOYEE_PREFLIGHT_OWNED_ONLY_SERVICE_REQUIRED");
}
if (service.billing_enabled !== true) {
  throw new Error("CODE_EMPLOYEE_PREFLIGHT_BILLING_REQUIRED_FOR_CONTROLLED_EXECUTION");
}
if (String(wallet.currency || "").toUpperCase() !== CURRENCY) {
  throw new Error("CODE_EMPLOYEE_PREFLIGHT_WALLET_CURRENCY_MISMATCH");
}
if (String(wallet.billing_policy || "").toUpperCase() !== "PREPAID") {
  throw new Error("CODE_EMPLOYEE_PREFLIGHT_PREPAID_WALLET_REQUIRED");
}
if (String(wallet.status || "").toUpperCase() !== "ACTIVE") {
  throw new Error("CODE_EMPLOYEE_PREFLIGHT_ACTIVE_WALLET_REQUIRED");
}
if (wallet.allow_negative !== false || Number(wallet.credit_limit || 0) !== 0) {
  throw new Error("CODE_EMPLOYEE_PREFLIGHT_NO_CREDIT_REQUIRED");
}
if (
  Number(wallet.available_balance || 0) <= 0 ||
  Number(wallet.available_balance || 0) > 10.000001
) {
  throw new Error("CODE_EMPLOYEE_PREFLIGHT_WALLET_CEILING_INVALID");
}
if (Number(wallet.reserved_balance || 0) !== 0) {
  throw new Error("CODE_EMPLOYEE_PREFLIGHT_RESERVED_BALANCE_MUST_START_ZERO");
}
if (pricing.active !== false) {
  throw new Error("CODE_EMPLOYEE_PREFLIGHT_PRODUCTION_PRICING_MUST_REMAIN_INACTIVE");
}
if (pricing.metadata?.production_routing_allowed !== false) {
  throw new Error("CODE_EMPLOYEE_PREFLIGHT_PRODUCTION_ROUTING_MUST_REMAIN_DISABLED");
}

const [
  { PricingRuntime },
  employeeRuntime,
  fastStartRuntime,
  workerSessionRuntime,
  workPackageRuntime,
  spendPolicy,
  { getProvider },
] = await Promise.all([
  import("../lib/platform/service-runtime/pricing/PricingRuntime.js"),
  import("../lib/code/runtime/CodeAIEmployeeRuntime.js"),
  import("../lib/code/runtime/CodeAIEmployeeFastStartRuntime.js"),
  import("../lib/code/runtime/CodeAIWorkerSessionRuntime.js"),
  import("../lib/code/runtime/CodeAIWorkPackageRuntime.js"),
  import("../lib/code/runtime/CodeAIPlannerSpendPolicy.js"),
  import("../lib/platform/service-runtime/providers/ProviderRegistry.js"),
]);

if (typeof employeeRuntime.executeCodeAIEmployeeMission !== "function") {
  throw new Error("CODE_EMPLOYEE_PREFLIGHT_RUNTIME_NOT_LOADABLE");
}
if (fastStartRuntime.CODE_AI_EMPLOYEE_FAST_START_CONTRACT !== "AVANTIQO_CODE_AI_EMPLOYEE_FAST_START_V2") {
  throw new Error("CODE_EMPLOYEE_PREFLIGHT_FAST_START_CONTRACT_MISMATCH");
}
if (workerSessionRuntime.CODE_AI_WORKER_SESSION_CONTRACT !== "AVANTIQO_CODE_AI_WORKER_SESSION_V2") {
  throw new Error("CODE_EMPLOYEE_PREFLIGHT_WORKER_SESSION_CONTRACT_MISMATCH");
}
if (workPackageRuntime.CODE_AI_WORK_PACKAGE_CONTRACT !== "AVANTIQO_CODE_AI_WORK_PACKAGE_V1") {
  throw new Error("CODE_EMPLOYEE_PREFLIGHT_WORK_PACKAGE_CONTRACT_MISMATCH");
}
if (workPackageRuntime.CODE_AI_WORK_PACKAGE_CONTROL_CONTRACT !== "AVANTIQO_CODE_AI_WORK_PACKAGE_CONTROL_V1") {
  throw new Error("CODE_EMPLOYEE_PREFLIGHT_WORK_PACKAGE_CONTROL_CONTRACT_MISMATCH");
}
if (Number(workPackageRuntime.CodeAIWorkPackageRuntime?.max_package_operations || 0) !== 12) {
  throw new Error("CODE_EMPLOYEE_PREFLIGHT_PACKAGE_OPERATION_LIMIT_MISMATCH");
}
if (Number(spendPolicy.DEFAULT_CODE_AI_REASONING_CALL_BUDGET || 0) !== 4) {
  throw new Error("CODE_EMPLOYEE_PREFLIGHT_DEFAULT_REASONING_BUDGET_MISMATCH");
}
if (Number(spendPolicy.MAX_CODE_AI_REASONING_CALL_BUDGET || 0) !== 8) {
  throw new Error("CODE_EMPLOYEE_PREFLIGHT_MAX_REASONING_BUDGET_MISMATCH");
}
if (Number(workerSessionRuntime.CodeAIWorkerSessionRuntime?.default_idle_ms || 0) !== 600000) {
  throw new Error("CODE_EMPLOYEE_PREFLIGHT_WORKER_DEFAULT_IDLE_MISMATCH");
}
if (Number(workerSessionRuntime.CodeAIWorkerSessionRuntime?.max_idle_ms || 0) !== 1800000) {
  throw new Error("CODE_EMPLOYEE_PREFLIGHT_WORKER_MAX_IDLE_MISMATCH");
}

const registeredProvider = getProvider(PROVIDER);
if (!registeredProvider) throw new Error("CODE_EMPLOYEE_PREFLIGHT_PROVIDER_NOT_REGISTERED");
if (registeredProvider.runtimeAvailable !== true) {
  throw new Error("CODE_EMPLOYEE_PREFLIGHT_PROVIDER_RUNTIME_UNAVAILABLE");
}
if (!registeredProvider.capabilities?.includes(SERVICE_ID)) {
  throw new Error("CODE_EMPLOYEE_PREFLIGHT_DEBUG_CAPABILITY_NOT_REGISTERED");
}
if (registeredProvider.metadata?.foundation_model !== FOUNDATION_MODEL) {
  throw new Error(
    `CODE_EMPLOYEE_PREFLIGHT_FOUNDATION_MODEL_MISMATCH:${registeredProvider.metadata?.foundation_model || "missing"}`,
  );
}
if (registeredProvider.metadata?.foundation_model_source_locked !== true) {
  throw new Error("CODE_EMPLOYEE_PREFLIGHT_FOUNDATION_MODEL_SOURCE_LOCK_REQUIRED");
}
if (registeredProvider.metadata?.runtime_configuration?.foundation_model_env_matches !== true) {
  throw new Error("CODE_EMPLOYEE_PREFLIGHT_FOUNDATION_MODEL_ENV_CONFLICT");
}

const settlementProbe = await PricingRuntime.resolveById({
  pricing_id: pricing.id,
  currency: CURRENCY,
  usage: {
    input_tokens: 1000,
    output_tokens: 100,
    quantity: 1,
    actual: true,
  },
});
if (settlementProbe.provider !== PROVIDER || settlementProbe.capability !== SERVICE_ID) {
  throw new Error("CODE_EMPLOYEE_PREFLIGHT_SETTLEMENT_PROVIDER_MISMATCH");
}
if (settlementProbe.estimated !== false) {
  throw new Error("CODE_EMPLOYEE_PREFLIGHT_ACTUAL_PRICING_REQUIRED");
}
if (!(Number(settlementProbe.customer_price || 0) > 0)) {
  throw new Error("CODE_EMPLOYEE_PREFLIGHT_POSITIVE_PRICE_REQUIRED");
}
if (Number(settlementProbe.customer_price || 0) > Number(wallet.available_balance || 0)) {
  throw new Error("CODE_EMPLOYEE_PREFLIGHT_SAMPLE_PRICE_EXCEEDS_WALLET");
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  organization_id: ORGANIZATION_ID,
  worker_control_organization_id_present: true,
  worker_session_secret_present: true,
  service_id: SERVICE_ID,
  provider: PROVIDER,
  foundation_model: FOUNDATION_MODEL,
  service_active: true,
  owned_only: true,
  billing_enabled: true,
  wallet_policy: "PREPAID",
  wallet_available_balance: Number(wallet.available_balance || 0),
  wallet_reserved_balance: Number(wallet.reserved_balance || 0),
  production_pricing_active: false,
  production_routing_allowed: false,
  actual_settlement_pricing_resolves: true,
  fast_start_contract: fastStartRuntime.CODE_AI_EMPLOYEE_FAST_START_CONTRACT,
  worker_session_contract: workerSessionRuntime.CODE_AI_WORKER_SESSION_CONTRACT,
  work_package_contract: workPackageRuntime.CODE_AI_WORK_PACKAGE_CONTRACT,
  max_package_operations: Number(workPackageRuntime.CodeAIWorkPackageRuntime.max_package_operations),
  default_reasoning_call_budget: Number(spendPolicy.DEFAULT_CODE_AI_REASONING_CALL_BUDGET),
  absolute_reasoning_call_budget: Number(spendPolicy.MAX_CODE_AI_REASONING_CALL_BUDGET),
  default_warm_idle_ms: Number(workerSessionRuntime.CodeAIWorkerSessionRuntime.default_idle_ms),
  max_warm_idle_ms: Number(workerSessionRuntime.CodeAIWorkerSessionRuntime.max_idle_ms),
  provider_job_submitted: false,
  worker_pod_created: false,
  wallet_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
