import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { register } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { ModalClient } from "modal";

const CONTRACT = "AVANTIQO_INTELLIGENCE_MODAL_DIRECT_SERVICE_CERTIFICATION_V1";
const PROVIDER = "avantiqo-intelligence";
const SERVICE_ID = "ai.text.generate";
const CAPABILITY = "ai.text.generate";
const MODAL_APP = "avantiqo-intelligence-owned";
const MODAL_FUNCTION = "fast";
const DIRECT_JOB_PREFIX = "modal-intelligence-direct:";
const DIRECT_TRANSPORT = "modal-js-sdk-function-call-v1";
const FAST_MODEL = "Qwen/Qwen3-30B-A3B-Instruct-2507";
const CANONICAL_ORGANIZATION_NAME = "Avantiqo Platform";
const CANONICAL_ORGANIZATION_TYPE = "enterprise_group";
const POLL_INTERVAL_MS = 5_000;
const MAX_POLLS = 180;
const DEFAULT_MAX_CUSTOMER_CHARGE = 5;
const OUTPUT_DIR = resolve(
  process.env.AVANTIQO_INTELLIGENCE_MODAL_CERT_OUTPUT_DIR ||
    "local-audit-output/avantiqo-intelligence-modal-direct-service-certification",
);
const STATE_PATH = resolve(OUTPUT_DIR, "state.json");
const REPORT_PATH = resolve(OUTPUT_DIR, "report.json");

function text(value, limit = 4000) { return String(value ?? "").trim().slice(0, limit); }
function upper(value) { return text(value, 120).toUpperCase(); }
function yes(value) { return ["YES", "TRUE", "1", "APPROVED", "ON"].includes(upper(value)); }
function list(value) { return Array.isArray(value) ? value : []; }
function finite(value, fallback = 0) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function sleep(ms) { return new Promise((resolvePromise) => setTimeout(resolvePromise, ms)); }
function now() { return new Date().toISOString(); }
function safeError(error) {
  return { name: text(error?.name || "Error", 120), message: text(error?.message || error, 1000) };
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
async function loadState() {
  try {
    const value = JSON.parse(await readFile(STATE_PATH, "utf8"));
    return value && typeof value === "object" ? value : null;
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}
async function saveJson(path, value) {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const temp = `${path}.tmp-${process.pid}`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temp, path);
  await chmod(path, 0o600);
}
function requireSourcePin() {
  const expected = text(process.env.AVANTIQO_INTELLIGENCE_MODAL_CERT_EXPECTED_MAIN_COMMIT, 160).toLowerCase();
  const source = text(process.env.AVANTIQO_INTELLIGENCE_MODAL_CERT_SOURCE_MAIN_COMMIT, 160).toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(expected) || source !== expected) {
    throw new Error(`${CONTRACT}_PINNED_ORIGIN_MAIN_REQUIRED`);
  }
  return expected;
}
function mode() {
  const execute = process.argv.includes("--execute");
  const resume = process.argv.includes("--resume");
  if (execute && resume) throw new Error(`${CONTRACT}_MODE_CONFLICT`);
  return execute ? "EXECUTE" : resume ? "RESUME" : "PREFLIGHT";
}
function requirePaidApproval() {
  if (!yes(process.env.AVANTIQO_INTELLIGENCE_MODAL_REAL_INFERENCE_APPROVED)) {
    throw new Error("AVANTIQO_INTELLIGENCE_MODAL_REAL_INFERENCE_APPROVED=YES_REQUIRED");
  }
  if (text(process.env.NODE_ENV, 40).toLowerCase() !== "development") {
    throw new Error(`${CONTRACT}_DEVELOPMENT_ENV_REQUIRED`);
  }
}

const sourceMain = requireSourcePin();
const runMode = mode();
register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const { supabaseAdmin } = await import("@/lib/shared/supabase/admin");
const { resolveProvider } = await import("@/lib/platform/service-runtime/providers/ProviderResolver");
const { PricingRuntime } = await import("@/lib/platform/service-runtime/pricing/PricingRuntime");
const { WalletRepository } = await import("@/lib/platform/service-runtime/wallet/repositories/WalletRepository");
const { executeService, settlePendingService } = await import("@/lib/platform/service-runtime/execution/ServiceExecutionRuntime");
const {
  getAvantiqoIntelligenceEndpointHealth,
  getAvantiqoIntelligenceRuntimeConfiguration,
} = await import("@/lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProvider.js");

const tokenId = text(process.env.MODAL_TOKEN_ID || process.env.AVANTIQO_MODAL_TOKEN_ID, 500);
const tokenSecret = text(process.env.MODAL_TOKEN_SECRET || process.env.AVANTIQO_MODAL_TOKEN_SECRET, 1000);
if (!tokenId || !tokenSecret) throw new Error(`${CONTRACT}_MODAL_DIRECT_CREDENTIALS_REQUIRED`);
if (process.env.AVANTIQO_INTELLIGENCE_MODAL_BASE_URL || process.env.AVANTIQO_INTELLIGENCE_MODAL_GATEWAY_TOKEN) {
  throw new Error(`${CONTRACT}_LEGACY_GATEWAY_CONFIGURATION_FORBIDDEN`);
}
const modalEnvironment = text(process.env.AVANTIQO_MODAL_ENVIRONMENT || process.env.MODAL_ENVIRONMENT, 120);
const modal = new ModalClient({ tokenId, tokenSecret });
const lookupOptions = modalEnvironment ? { environment: modalEnvironment } : {};
const worker = await modal.functions.fromName(MODAL_APP, MODAL_FUNCTION, lookupOptions);

const runtime = getAvantiqoIntelligenceRuntimeConfiguration();
if (runtime?.runtime_ready !== true) throw new Error(`${CONTRACT}_RUNTIME_NOT_READY`);
if (runtime?.infrastructure_provider !== "MODAL_H100_ASYNC_V1") {
  throw new Error(`${CONTRACT}_MODAL_PRIMARY_REQUIRED:${text(runtime?.infrastructure_provider, 160)}`);
}
if (runtime?.modal_primary_when_configured !== true) throw new Error(`${CONTRACT}_MODAL_PRIMARY_POLICY_REQUIRED`);
if (runtime?.simultaneous_modal_runpod_execution_forbidden !== true) {
  throw new Error(`${CONTRACT}_SIMULTANEOUS_MODAL_RUNPOD_FORBIDDEN_POLICY_REQUIRED`);
}
if (runtime?.modal_gateway_required !== false || runtime?.async_gateway !== false) {
  throw new Error(`${CONTRACT}_GATEWAY_MUST_BE_DISABLED`);
}
if (runtime?.modal_transport !== DIRECT_TRANSPORT) throw new Error(`${CONTRACT}_DIRECT_TRANSPORT_REQUIRED`);
if (runtime?.gpu !== "H100" || runtime?.scale_to_zero !== true || runtime?.persistent_model_volume !== false) {
  throw new Error(`${CONTRACT}_H100_SCALE_TO_ZERO_POLICY_INVALID`);
}

const health = await getAvantiqoIntelligenceEndpointHealth();
if (health?.success !== true || health?.infrastructure_provider !== "MODAL_H100_ASYNC_V1") {
  throw new Error(`${CONTRACT}_MODAL_HEALTH_INVALID`);
}
if (health?.modal_gateway_used !== false || health?.gpu_inference_performed !== false || health?.scale_to_zero !== true) {
  throw new Error(`${CONTRACT}_MODAL_HEALTH_BOUNDARY_INVALID`);
}

let organizationId = text(process.env.AVANTIQO_INTELLIGENCE_MODAL_CERT_ORGANIZATION_ID, 200);
let organizationSource = organizationId ? "EXPLICIT_CERT_ENV" : null;
if (!organizationId) {
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
  organizationId = text(organizations[0].id, 200);
  organizationSource = "CANONICAL_AVANTIQO_PLATFORM_DATABASE_RECORD";
}

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
const maxCustomerCharge = Math.max(0, finite(
  process.env.AVANTIQO_INTELLIGENCE_MODAL_CERT_MAX_CUSTOMER_CHARGE,
  DEFAULT_MAX_CUSTOMER_CHARGE,
));
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

const existingState = await loadState();
if (existingState?.contract && existingState.contract !== CONTRACT) {
  throw new Error(`${CONTRACT}_STATE_CONTRACT_INVALID`);
}
if (existingState?.terminal === true && existingState?.success === true) {
  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    phase: "ALREADY_CERTIFIED",
    source_main_commit: sourceMain,
    max_provider_jobs: 1,
    duplicate_job_submitted: false,
    gpu_inference_performed_this_run: false,
    prior_certification_reused: true,
    secrets_printed: false,
  }));
  console.log(`${CONTRACT}=PASS`);
  modal.close();
  process.exit(0);
}
if (existingState?.terminal === true && existingState?.success === false) {
  throw new Error(`${CONTRACT}_TERMINAL_FAILURE_NO_AUTOMATIC_RETRY`);
}
if (existingState?.phase === "SUBMITTING" && !existingState?.provider_job_id) {
  throw new Error(`${CONTRACT}_AMBIGUOUS_PRIOR_SUBMISSION_NO_AUTOMATIC_RETRY`);
}
let resumeState = existingState?.provider_job_id && existingState?.usage_id ? existingState : null;
if (runMode === "RESUME" && !resumeState) throw new Error(`${CONTRACT}_NO_PENDING_STATE_TO_RESUME`);

let preStats = null;
if (!resumeState) {
  preStats = await worker.getCurrentStats();
  if (finite(preStats?.backlog) !== 0 || finite(preStats?.numTotalRunners) !== 0) {
    throw new Error(
      `${CONTRACT}_DUPLICATE_GPU_GUARD_ACTIVE:backlog=${finite(preStats?.backlog)}:runners=${finite(preStats?.numTotalRunners)}`,
    );
  }
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  phase: "PREFLIGHT",
  source_main_commit: sourceMain,
  organization_source: organizationSource,
  organization_id_printed: false,
  service_id: SERVICE_ID,
  capability: CAPABILITY,
  provider: PROVIDER,
  selected_model: text(selected?.model, 300),
  projected_customer_charge: projectedCustomerCharge,
  max_customer_charge: maxCustomerCharge,
  wallet_available_sufficient: true,
  infrastructure_provider: runtime.infrastructure_provider,
  modal_transport: runtime.modal_transport,
  modal_gateway_required: false,
  modal_gpu: runtime.gpu,
  modal_scale_to_zero: runtime.scale_to_zero,
  modal_backlog: preStats ? finite(preStats.backlog) : null,
  modal_total_runners: preStats ? finite(preStats.numTotalRunners) : null,
  resume_existing_job: Boolean(resumeState),
  max_provider_jobs: 1,
  external_fallback_allowed: false,
  runpod_used: false,
  gpu_requested: false,
  gpu_inference_performed: false,
  production_vercel_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
console.log(`${CONTRACT}_PREFLIGHT=PASS`);

if (runMode === "PREFLIGHT") {
  modal.close();
  process.exit(0);
}

if (!resumeState) {
  requirePaidApproval();
  const submitting = {
    contract: CONTRACT,
    phase: "SUBMITTING",
    terminal: false,
    success: false,
    source_main_commit: sourceMain,
    organization_id: organizationId,
    organization_service_id: organizationService.id,
    provider: PROVIDER,
    capability: CAPABILITY,
    max_provider_jobs: 1,
    paid_approval_observed: true,
    duplicate_job_forbidden: true,
    modal_gateway_forbidden: true,
    runpod_forbidden: true,
    created_at: now(),
  };
  await saveJson(STATE_PATH, submitting);

  let execution;
  try {
    execution = await executeService({
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
        certification_scope: "PLATFORM_OWNED_INTELLIGENCE_DIRECT_MODAL_ONE_FAST_JOB",
        provider_spend_approved: true,
        max_provider_jobs: 1,
        benchmark_runs: 1,
        direct_modal_required: true,
        modal_gateway_forbidden: true,
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
  } catch (error) {
    await saveJson(STATE_PATH, {
      ...submitting,
      phase: "SUBMISSION_FAILED",
      terminal: true,
      success: false,
      error: safeError(error),
      automatic_retry_forbidden: true,
      finished_at: now(),
    });
    throw error;
  }

  if (execution?.provider !== PROVIDER) throw new Error(`${CONTRACT}_EXECUTION_PROVIDER_INVALID`);
  if (execution?.pending !== true) throw new Error(`${CONTRACT}_ASYNC_PENDING_EXECUTION_REQUIRED`);
  const providerJobId = text(execution?.provider_job_id, 500);
  const usageId = text(execution?.usage?.id, 200);
  if (!providerJobId.startsWith(DIRECT_JOB_PREFIX) || !usageId) {
    throw new Error(`${CONTRACT}_DIRECT_MODAL_PENDING_BINDING_INVALID`);
  }
  resumeState = {
    ...submitting,
    phase: "SUBMITTED",
    provider_job_id: providerJobId,
    usage_id: usageId,
    pricing: execution.pricing,
    quantity: execution?.usage?.quantity ?? 1,
    unit: execution?.usage?.unit ?? pricing?.unit ?? pricingRecord?.unit ?? "request",
    credential_id: execution?.credential_id || null,
    started_at: execution?.started_at || now(),
    submitted_at: now(),
  };
  await saveJson(STATE_PATH, resumeState);
  console.log(`${CONTRACT}_ONE_PAID_JOB_SUBMITTED=true`);
}

let settled = null;
let pollCount = 0;
for (let poll = 1; poll <= MAX_POLLS; poll += 1) {
  pollCount = poll;
  try {
    settled = await settlePendingService({
      organization_id: organizationId,
      provider: PROVIDER,
      provider_job_id: resumeState.provider_job_id,
      usage_id: resumeState.usage_id,
      pricing: resumeState.pricing || {},
      quantity: resumeState.quantity,
      unit: resumeState.unit,
      metadata: {
        certification_contract: CONTRACT,
        max_provider_jobs: 1,
        direct_modal_required: true,
        modal_gateway_forbidden: true,
        runpod_forbidden: true,
      },
      provider_status_input: { capability: CAPABILITY, execution_lane: "fast" },
      credential_id: resumeState.credential_id || null,
      started_at: resumeState.started_at || null,
    });
  } catch (error) {
    await saveJson(STATE_PATH, {
      ...resumeState,
      phase: "POLLING",
      terminal: false,
      success: false,
      last_poll_error: safeError(error),
      last_poll_at: now(),
      resume_required: true,
    });
    throw error;
  }
  if (settled?.pending === true) {
    await saveJson(STATE_PATH, {
      ...resumeState,
      phase: "POLLING",
      terminal: false,
      success: false,
      poll_count: poll,
      last_poll_at: now(),
      resume_required: true,
    });
    if (poll < MAX_POLLS) await sleep(POLL_INTERVAL_MS);
    continue;
  }
  break;
}

if (!settled || settled?.pending === true) {
  await saveJson(STATE_PATH, {
    ...resumeState,
    phase: "POLL_TIMEOUT",
    terminal: false,
    success: false,
    resume_required: true,
    automatic_retry_forbidden: true,
    last_poll_at: now(),
  });
  throw new Error(`${CONTRACT}_POLL_TIMEOUT_RESUME_SAME_JOB_REQUIRED`);
}
if (settled?.failed === true || settled?.success !== true) {
  await saveJson(STATE_PATH, {
    ...resumeState,
    phase: "FAILED",
    terminal: true,
    success: false,
    provider_result: settled,
    automatic_retry_forbidden: true,
    finished_at: now(),
  });
  throw new Error(`${CONTRACT}_PROVIDER_JOB_FAILED:${text(settled?.error, 800)}`);
}
if (settled?.provider !== PROVIDER) throw new Error(`${CONTRACT}_SETTLED_PROVIDER_INVALID`);

const outputText = text(findValue(settled?.output, ["text"]), 12000);
const infrastructure = text(findValue(settled?.output, ["infrastructure_provider"]), 200);
const modalGpu = text(findValue(settled?.output, ["modal_gpu"]), 80);
const modalTransport = text(findValue(settled?.output, ["modal_transport"]), 200);
const modalGatewayUsed = findValue(settled?.output, ["modal_gateway_used"]);
const executionLane = text(findValue(settled?.output, ["execution_lane"]), 80);
const model = text(findValue(settled?.output, ["model"]), 300);
const modalVolumeCreated = findValue(settled?.output, ["modal_volume_created"]);
const runpodInference = findValue(settled?.output, ["runpod_inference_performed"]);
const rawReasoningPersisted = findValue(settled?.output, ["raw_reasoning_persisted"]);
if (outputText.length < 10) throw new Error(`${CONTRACT}_OUTPUT_REQUIRED`);
if (infrastructure !== "MODAL_H100_ASYNC_V1") throw new Error(`${CONTRACT}_MODAL_INFRASTRUCTURE_REQUIRED:${infrastructure}`);
if (modalGpu !== "H100") throw new Error(`${CONTRACT}_H100_REQUIRED:${modalGpu}`);
if (modalTransport !== DIRECT_TRANSPORT) throw new Error(`${CONTRACT}_DIRECT_TRANSPORT_REQUIRED:${modalTransport}`);
if (modalGatewayUsed !== false) throw new Error(`${CONTRACT}_GATEWAY_USAGE_FORBIDDEN`);
if (executionLane !== "fast") throw new Error(`${CONTRACT}_FAST_LANE_REQUIRED:${executionLane}`);
if (model !== FAST_MODEL) throw new Error(`${CONTRACT}_FAST_MODEL_REQUIRED:${model}`);
if (modalVolumeCreated !== false) throw new Error(`${CONTRACT}_MODAL_VOLUME_FORBIDDEN`);
if (runpodInference !== false) throw new Error(`${CONTRACT}_RUNPOD_INFERENCE_FORBIDDEN`);
if (rawReasoningPersisted !== false) throw new Error(`${CONTRACT}_RAW_REASONING_PERSISTENCE_FORBIDDEN`);

const usage = settled?.usage || {};
if (upper(usage?.status) !== "SUCCESS") throw new Error(`${CONTRACT}_USAGE_NOT_SUCCESS`);

const finalStats = await worker.getCurrentStats();
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
  modal_transport: modalTransport,
  modal_gateway_used: false,
  modal_scale_to_zero_configured: true,
  modal_backlog_after_settlement: finite(finalStats?.backlog),
  modal_total_runners_after_settlement: finite(finalStats?.numTotalRunners),
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
  service_usage_status: upper(usage?.status),
  service_recorded_supplier_cost: finite(usage?.supplier_cost),
  service_recorded_customer_price: finite(usage?.customer_price),
  wallet_settlement: text(settled?.settlement, 120),
  raw_reasoning_persisted: false,
  production_vercel_deploy_performed: false,
  secrets_printed: false,
};
await saveJson(REPORT_PATH, report);
await saveJson(STATE_PATH, {
  ...resumeState,
  phase: "COMPLETED",
  terminal: true,
  success: true,
  report_path: REPORT_PATH,
  finished_at: now(),
});
console.log(JSON.stringify(report, null, 2));
console.log(`${CONTRACT}=PASS`);
modal.close();
