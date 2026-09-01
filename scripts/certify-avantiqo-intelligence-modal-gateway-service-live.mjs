import { mkdir, writeFile, chmod } from "node:fs/promises";
import { register } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const CONTRACT = "AVANTIQO_INTELLIGENCE_MODAL_GATEWAY_SERVICE_CERTIFICATION_V1";
const PROVIDER = "avantiqo-intelligence";
const SERVICE_ID = "ai.text.generate";
const CAPABILITY = "ai.text.generate";
const FAST_MODEL = "Qwen/Qwen3-30B-A3B-Instruct-2507";
const CANONICAL_ORGANIZATION_NAME = "Avantiqo Platform";
const CANONICAL_ORGANIZATION_TYPE = "enterprise_group";
const POLL_INTERVAL_MS = 5_000;
const MAX_POLLS = 180;
const DEFAULT_MAX_CUSTOMER_CHARGE = 5;
const OUTPUT_DIR = resolve(
  process.env.AVANTIQO_INTELLIGENCE_MODAL_CERT_OUTPUT_DIR ||
    "local-audit-output/avantiqo-intelligence-modal-gateway-service-certification",
);
const REPORT_PATH = resolve(OUTPUT_DIR, "report.json");

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}
function upper(value) {
  return text(value, 120).toUpperCase();
}
function yes(value) {
  return ["YES", "TRUE", "1", "APPROVED", "ON"].includes(upper(value));
}
function list(value) {
  return Array.isArray(value) ? value : [];
}
function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}
function findValue(root, keys, seen = new Set()) {
  if (!root || typeof root !== "object" || seen.has(root)) return null;
  seen.add(root);
  for (const key of keys) {
    const candidate = root[key];
    if (candidate !== undefined && candidate !== null && candidate !== "") return candidate;
  }
  for (const value of Array.isArray(root) ? root : Object.values(root)) {
    const nested = findValue(value, keys, seen);
    if (nested !== null) return nested;
  }
  return null;
}
function requireSourcePin() {
  const expected = text(process.env.AVANTIQO_INTELLIGENCE_MODAL_CERT_EXPECTED_MAIN_COMMIT, 160).toLowerCase();
  const source = text(process.env.AVANTIQO_INTELLIGENCE_MODAL_CERT_SOURCE_MAIN_COMMIT, 160).toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(expected) || source !== expected) {
    throw new Error(`${CONTRACT}_PINNED_MAIN_REQUIRED`);
  }
  return expected;
}
function requirePaidApproval() {
  if (!yes(process.env.AVANTIQO_INTELLIGENCE_MODAL_REAL_INFERENCE_APPROVED)) {
    throw new Error("AVANTIQO_INTELLIGENCE_MODAL_REAL_INFERENCE_APPROVED=YES_REQUIRED");
  }
}
async function saveReport(value) {
  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await chmod(REPORT_PATH, 0o600);
}

const sourceMain = requireSourcePin();
requirePaidApproval();

const modalBaseUrl = text(process.env.AVANTIQO_INTELLIGENCE_MODAL_BASE_URL, 2000).replace(/\/+$/, "");
const modalGatewayToken = text(process.env.AVANTIQO_INTELLIGENCE_MODAL_GATEWAY_TOKEN, 2000);
if (!/^https:\/\//i.test(modalBaseUrl) || modalGatewayToken.length < 40) {
  throw new Error(`${CONTRACT}_MODAL_GATEWAY_CONFIGURATION_REQUIRED`);
}

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));
const { supabaseAdmin } = await import("@/lib/shared/supabase/admin");
const { resolveProvider } = await import("@/lib/platform/service-runtime/providers/ProviderResolver");
const { PricingRuntime } = await import("@/lib/platform/service-runtime/pricing/PricingRuntime");
const { WalletRepository } = await import("@/lib/platform/service-runtime/wallet/repositories/WalletRepository");
const {
  executeService,
  settlePendingService,
} = await import("@/lib/platform/service-runtime/execution/ServiceExecutionRuntime");
const {
  getAvantiqoIntelligenceEndpointHealth,
  getAvantiqoIntelligenceRuntimeConfiguration,
} = await import("@/lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProvider.js");

const runtime = getAvantiqoIntelligenceRuntimeConfiguration();
if (runtime?.runtime_ready !== true) throw new Error(`${CONTRACT}_RUNTIME_NOT_READY`);
if (runtime?.infrastructure_provider !== "MODAL_H100_ASYNC_V1") {
  throw new Error(`${CONTRACT}_MODAL_PRIMARY_REQUIRED:${text(runtime?.infrastructure_provider, 160)}`);
}
if (runtime?.modal_primary_when_configured !== true) throw new Error(`${CONTRACT}_MODAL_PRIMARY_POLICY_REQUIRED`);
if (runtime?.simultaneous_modal_runpod_execution_forbidden !== true) {
  throw new Error(`${CONTRACT}_SIMULTANEOUS_MODAL_RUNPOD_FORBIDDEN_POLICY_REQUIRED`);
}
if (runtime?.scale_to_zero !== true || runtime?.persistent_model_volume !== false) {
  throw new Error(`${CONTRACT}_SCALE_TO_ZERO_STORAGE_POLICY_INVALID`);
}

const health = await getAvantiqoIntelligenceEndpointHealth();
if (health?.success !== true || health?.infrastructure_provider !== "MODAL_H100_ASYNC_V1") {
  throw new Error(`${CONTRACT}_MODAL_HEALTH_INVALID`);
}
if (health?.gateway_gpu_imported !== false || health?.gpu_inference_performed !== false || health?.scale_to_zero !== true) {
  throw new Error(`${CONTRACT}_MODAL_HEALTH_BOUNDARY_INVALID`);
}

const organizationResult = await supabaseAdmin
  .from("organizations")
  .select("id,name,organization_type,status,organization_status")
  .eq("name", CANONICAL_ORGANIZATION_NAME)
  .eq("organization_type", CANONICAL_ORGANIZATION_TYPE)
  .eq("status", "active")
  .eq("organization_status", "ACTIVE")
  .limit(3);
if (organizationResult.error) throw organizationResult.error;
const organizations = list(organizationResult.data);
if (organizations.length !== 1 || !organizations[0]?.id) {
  throw new Error(`${CONTRACT}_PLATFORM_ORGANIZATION_RESOLUTION_FAILED:${organizations.length}`);
}
const organizationId = String(organizations[0].id);

const serviceResult = await supabaseAdmin
  .from("organization_services")
  .select("*")
  .eq("organization_id", organizationId)
  .eq("service_id", SERVICE_ID)
  .limit(2);
if (serviceResult.error) throw serviceResult.error;
const serviceRows = list(serviceResult.data);
if (serviceRows.length !== 1 || !serviceRows[0]?.id) {
  throw new Error(`${CONTRACT}_ORGANIZATION_SERVICE_RESOLUTION_FAILED:${serviceRows.length}`);
}
const organizationService = serviceRows[0];
if (upper(organizationService.status) !== "ACTIVE") throw new Error(`${CONTRACT}_SERVICE_NOT_ACTIVE`);
if (organizationService.usage_enabled === false) throw new Error(`${CONTRACT}_SERVICE_USAGE_DISABLED`);

const ownedPolicy = {
  allowed_providers: [PROVIDER],
  blocked_providers: [],
  owned_only_required: true,
  external_fallback_allowed: false,
  allow_owned_reasoning_fallback: false,
  allow_owned_lane_recovery: false,
};
const selected = await resolveProvider({
  organization_id: organizationId,
  capability: CAPABILITY,
  preferredProvider: PROVIDER,
  policy: ownedPolicy,
});
if (text(selected?.provider, 120) !== PROVIDER) {
  throw new Error(`${CONTRACT}_OWNED_PROVIDER_REQUIRED:${text(selected?.provider, 120)}`);
}
const pricingRecord = selected?.pricing_record;
if (!pricingRecord?.id && !pricingRecord?.pricing_id) throw new Error(`${CONTRACT}_PRICING_RECORD_REQUIRED`);
const pricing = PricingRuntime.resolveRecord({
  pricing: pricingRecord,
  provider: PROVIDER,
  model: selected?.model,
  capability: CAPABILITY,
  currency: selected?.currency,
  usage: { quantity: 1 },
});
const projectedCustomerCharge = Math.max(0, finite(pricing?.customer_price));
const maxCustomerCharge = Math.max(
  0,
  finite(process.env.AVANTIQO_INTELLIGENCE_MODAL_CERT_MAX_CUSTOMER_CHARGE, DEFAULT_MAX_CUSTOMER_CHARGE),
);
if (projectedCustomerCharge > maxCustomerCharge) {
  throw new Error(`${CONTRACT}_PROJECTED_CHARGE_LIMIT_EXCEEDED:${projectedCustomerCharge}:${maxCustomerCharge}`);
}
const wallet = await WalletRepository.getByOrganization(organizationId);
if (!wallet?.id) throw new Error(`${CONTRACT}_PREPAID_WALLET_REQUIRED`);
if (upper(wallet.status) !== "ACTIVE") throw new Error(`${CONTRACT}_ACTIVE_WALLET_REQUIRED`);
if (upper(wallet.billing_policy) !== "PREPAID") throw new Error(`${CONTRACT}_PREPAID_POLICY_REQUIRED`);
if (finite(wallet.available_balance) < projectedCustomerCharge) {
  throw new Error(`${CONTRACT}_PREPAID_WALLET_BALANCE_INSUFFICIENT`);
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  phase: "PREFLIGHT",
  source_main_commit: sourceMain,
  service_id: SERVICE_ID,
  capability: CAPABILITY,
  provider: PROVIDER,
  selected_model: text(selected?.model, 300),
  projected_customer_charge: projectedCustomerCharge,
  max_customer_charge: maxCustomerCharge,
  wallet_available_sufficient: true,
  infrastructure_provider: runtime.infrastructure_provider,
  modal_health_ok: true,
  modal_gpu: runtime.gpu,
  modal_scale_to_zero: runtime.scale_to_zero,
  persistent_model_volume: runtime.persistent_model_volume,
  max_provider_jobs: 1,
  external_fallback_allowed: false,
  runpod_used: false,
  production_vercel_deploy_performed: false,
  secrets_printed: false,
}, null, 2));

const startedAt = Date.now();
const execution = await executeService({
  organization_id: organizationId,
  bill_to_organization_id: organizationId,
  service_id: SERVICE_ID,
  provider_id: PROVIDER,
  capability: CAPABILITY,
  input: {
    capability: CAPABILITY,
    execution_lane: "fast",
    prompt: "Return exactly one short sentence confirming that this response is served by Avantiqo owned Intelligence and no external AI provider was used.",
    max_output_tokens: 80,
    temperature: 0.1,
  },
  metadata: {
    certification_contract: CONTRACT,
    certification_scope: "PLATFORM_OWNED_INTELLIGENCE_MODAL_GATEWAY_ONE_FAST_JOB",
    provider_spend_approved: true,
    max_provider_jobs: 1,
    benchmark_runs: 1,
    modal_gateway_required: true,
    modal_primary_required: true,
    runpod_forbidden: true,
    external_fallback_allowed: false,
    production_activation_allowed: false,
    pricing_activation_allowed: false,
    provider_selection_change_allowed: false,
    production_deploy_performed: false,
  },
  category: "CERTIFICATION",
  provider_policy: ownedPolicy,
});

if (execution?.provider !== PROVIDER) throw new Error(`${CONTRACT}_EXECUTION_PROVIDER_INVALID`);
if (execution?.pending !== true) throw new Error(`${CONTRACT}_ASYNC_PENDING_EXECUTION_REQUIRED`);
const providerJobId = text(execution?.provider_job_id, 500);
const usageId = text(execution?.usage?.id, 200);
if (!providerJobId.startsWith("modal-intelligence:") || !usageId) {
  throw new Error(`${CONTRACT}_MODAL_PENDING_BINDING_INVALID`);
}
console.log(`${CONTRACT}_ONE_PAID_JOB_SUBMITTED=true`);

let settled = null;
let pollCount = 0;
for (let poll = 1; poll <= MAX_POLLS; poll += 1) {
  pollCount = poll;
  settled = await settlePendingService({
    organization_id: organizationId,
    provider: PROVIDER,
    provider_job_id: providerJobId,
    usage_id: usageId,
    pricing: execution.pricing || {},
    quantity: execution?.usage?.quantity ?? 1,
    unit: execution?.usage?.unit ?? pricing?.unit ?? pricingRecord?.unit ?? "request",
    metadata: {
      certification_contract: CONTRACT,
      max_provider_jobs: 1,
      modal_gateway_required: true,
      runpod_forbidden: true,
      external_fallback_allowed: false,
    },
    provider_status_input: {
      capability: CAPABILITY,
      execution_lane: "fast",
    },
    credential_id: execution?.credential_id || null,
    started_at: execution?.started_at || new Date(startedAt).toISOString(),
  });
  if (settled?.pending !== true) break;
  if (poll < MAX_POLLS) await sleep(POLL_INTERVAL_MS);
}

if (!settled || settled?.pending === true) throw new Error(`${CONTRACT}_POLL_TIMEOUT`);
if (settled?.failed === true || settled?.success !== true) {
  throw new Error(`${CONTRACT}_PROVIDER_JOB_FAILED:${text(settled?.error, 800)}`);
}
if (settled?.provider !== PROVIDER) throw new Error(`${CONTRACT}_SETTLED_PROVIDER_INVALID`);

const outputText = text(findValue(settled?.output, ["text"]), 12000);
const infrastructure = text(findValue(settled?.output, ["infrastructure_provider"]), 200);
const modalGpu = text(findValue(settled?.output, ["modal_gpu"]), 80);
const executionLane = text(findValue(settled?.output, ["execution_lane"]), 80);
const model = text(findValue(settled?.output, ["model"]), 300);
const runpodInference = findValue(settled?.output, ["runpod_inference_performed"]);
const rawReasoningPersisted = findValue(settled?.output, ["raw_reasoning_persisted"]);
if (outputText.length < 10) throw new Error(`${CONTRACT}_OUTPUT_REQUIRED`);
if (infrastructure !== "MODAL_H100_ASYNC_V1") throw new Error(`${CONTRACT}_MODAL_INFRASTRUCTURE_REQUIRED:${infrastructure}`);
if (modalGpu !== "H100") throw new Error(`${CONTRACT}_H100_REQUIRED:${modalGpu}`);
if (executionLane !== "fast") throw new Error(`${CONTRACT}_FAST_LANE_REQUIRED:${executionLane}`);
if (model !== FAST_MODEL) throw new Error(`${CONTRACT}_FAST_MODEL_REQUIRED:${model}`);
if (runpodInference !== false) throw new Error(`${CONTRACT}_RUNPOD_INFERENCE_FORBIDDEN`);
if (rawReasoningPersisted !== false) throw new Error(`${CONTRACT}_RAW_REASONING_PERSISTENCE_FORBIDDEN`);

const usage = settled?.usage || {};
if (upper(usage?.status) !== "SUCCESS") throw new Error(`${CONTRACT}_USAGE_NOT_SUCCESS`);
if (text(usage?.provider, 120) && text(usage.provider, 120) !== PROVIDER) {
  throw new Error(`${CONTRACT}_USAGE_PROVIDER_INVALID`);
}

const report = {
  success: true,
  contract: CONTRACT,
  source_main_commit: sourceMain,
  service_id: SERVICE_ID,
  capability: CAPABILITY,
  provider: PROVIDER,
  model,
  execution_lane: executionLane,
  infrastructure_provider: infrastructure,
  modal_gpu: modalGpu,
  modal_gateway_used: true,
  modal_scale_to_zero_configured: true,
  persistent_model_volume: false,
  runpod_used: false,
  runpod_inference_performed: false,
  external_ai_fallback_used: false,
  max_provider_jobs: 1,
  provider_jobs_submitted: 1,
  duplicate_job_submitted: false,
  provider_job_id_present: true,
  response_chars: outputText.length,
  poll_count: pollCount,
  latency_ms: Date.now() - startedAt,
  service_usage_status: upper(usage?.status),
  service_recorded_supplier_cost: finite(usage?.supplier_cost),
  service_recorded_customer_price: finite(usage?.customer_price),
  wallet_settlement: text(settled?.settlement, 120),
  raw_reasoning_persisted: false,
  production_activation_performed: false,
  pricing_activation_performed: false,
  provider_selection_changed: false,
  production_vercel_deploy_performed: false,
  secrets_printed: false,
};
await saveReport(report);
console.log(JSON.stringify(report, null, 2));
console.log(`${CONTRACT}=PASS`);
