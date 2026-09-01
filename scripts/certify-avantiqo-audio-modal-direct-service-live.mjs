import { mkdir, readFile, rename, writeFile, chmod } from "node:fs/promises";
import { register } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { ModalClient } from "modal";

const CONTRACT = "AVANTIQO_AUDIO_MODAL_DIRECT_SERVICE_CERTIFICATION_V1";
const PROVIDER = "avantiqo-audio";
const SERVICE_ID = "ai.music.generate";
const CAPABILITY = "ai.music.generate";
const MODAL_APP = "avantiqo-audio-owned";
const MODAL_FUNCTION = "generate";
const CANONICAL_ORGANIZATION_NAME = "Avantiqo Platform";
const CANONICAL_ORGANIZATION_TYPE = "enterprise_group";
const DURATION_SECONDS = 10;
const INFERENCE_STEPS = 8;
const FIXED_SEED = 260901;
const POLL_INTERVAL_MS = 15_000;
const MAX_POLLS = 120;
const DEFAULT_MAX_CUSTOMER_CHARGE = 5;
const OUTPUT_DIR = resolve(
  process.env.AVANTIQO_AUDIO_MODAL_CERT_OUTPUT_DIR ||
    "local-audit-output/avantiqo-audio-modal-direct-service-certification",
);
const STATE_PATH = resolve(OUTPUT_DIR, "state.json");
const REPORT_PATH = resolve(OUTPUT_DIR, "report.json");
const AUDIO_PATH = resolve(OUTPUT_DIR, "certification.wav");

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
function now() {
  return new Date().toISOString();
}
function oneOf(value, expected) {
  return expected.includes(text(value).toLowerCase());
}
function safeError(error) {
  return {
    name: text(error?.name || "Error", 120),
    message: text(error?.message || error, 1000),
  };
}
function usageQuantity(unit) {
  const normalized = text(unit, 40).toLowerCase();
  if (normalized === "second") return DURATION_SECONDS;
  if (normalized === "minute") return DURATION_SECONDS / 60;
  return 1;
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
    const parsed = JSON.parse(await readFile(STATE_PATH, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : null;
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
async function saveState(value) {
  await saveJson(STATE_PATH, value);
}
function requireSourcePin() {
  const expected = text(process.env.AVANTIQO_AUDIO_MODAL_CERT_EXPECTED_MAIN_COMMIT, 160).toLowerCase();
  const source = text(process.env.AVANTIQO_AUDIO_MODAL_CERT_SOURCE_MAIN_COMMIT, 160).toLowerCase();
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
  if (!yes(process.env.AVANTIQO_AUDIO_MODAL_REAL_INFERENCE_APPROVED)) {
    throw new Error("AVANTIQO_AUDIO_MODAL_REAL_INFERENCE_APPROVED=YES_REQUIRED");
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
const {
  executeService,
  settlePendingService,
} = await import("@/lib/platform/service-runtime/execution/ServiceExecutionRuntime");

let organizationId = text(process.env.AVANTIQO_AUDIO_MODAL_CERT_ORGANIZATION_ID, 200);
let organizationSource = organizationId ? "EXPLICIT_CERT_ENV" : null;
if (!organizationId) {
  const result = await supabaseAdmin
    .from("organizations")
    .select("id,name,organization_type,status,organization_status")
    .eq("name", CANONICAL_ORGANIZATION_NAME)
    .eq("organization_type", CANONICAL_ORGANIZATION_TYPE)
    .eq("status", "active")
    .eq("organization_status", "ACTIVE")
    .limit(3);
  if (result.error) throw result.error;
  const matches = list(result.data);
  if (matches.length !== 1) {
    throw new Error(`${CONTRACT}_PLATFORM_ORGANIZATION_RESOLUTION_FAILED:${matches.length}`);
  }
  organizationId = text(matches[0]?.id, 200);
  if (!organizationId) throw new Error(`${CONTRACT}_PLATFORM_ORGANIZATION_ID_REQUIRED`);
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
if (!pricingRecord?.id && !pricingRecord?.pricing_id) {
  throw new Error(`${CONTRACT}_PRICING_RECORD_REQUIRED`);
}
const quantity = usageQuantity(pricingRecord?.unit);
const pricing = PricingRuntime.resolveRecord({
  pricing: pricingRecord,
  provider: PROVIDER,
  model: selected?.model,
  capability: CAPABILITY,
  currency: selected?.currency,
  usage: { quantity },
});
const projectedCustomerCharge = Math.max(0, finite(pricing?.customer_price));
const maxCustomerCharge = Math.max(
  0,
  finite(process.env.AVANTIQO_AUDIO_MODAL_CERT_MAX_CUSTOMER_CHARGE, DEFAULT_MAX_CUSTOMER_CHARGE),
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

const tokenId = text(process.env.MODAL_TOKEN_ID || process.env.AVANTIQO_MODAL_TOKEN_ID, 500);
const tokenSecret = text(process.env.MODAL_TOKEN_SECRET || process.env.AVANTIQO_MODAL_TOKEN_SECRET, 1000);
if (!tokenId || !tokenSecret) throw new Error(`${CONTRACT}_MODAL_DIRECT_CREDENTIALS_REQUIRED`);
const modalEnvironment = text(process.env.AVANTIQO_MODAL_ENVIRONMENT || process.env.MODAL_ENVIRONMENT, 120);
const modal = new ModalClient({
  tokenId,
  tokenSecret,
  ...(modalEnvironment ? { environment: modalEnvironment } : {}),
});
const worker = await modal.functions.fromName(
  MODAL_APP,
  MODAL_FUNCTION,
  modalEnvironment ? { environment: modalEnvironment } : {},
);

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
    provider: PROVIDER,
    capability: CAPABILITY,
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
if (runMode === "PREFLIGHT" && resumeState) {
  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    phase: "PREFLIGHT",
    diagnosis: "PENDING_CERTIFICATION_REQUIRES_RESUME",
    provider: PROVIDER,
    capability: CAPABILITY,
    projected_customer_charge: projectedCustomerCharge,
    max_customer_charge: maxCustomerCharge,
    existing_provider_job: true,
    duplicate_job_submitted: false,
    gpu_requested: false,
    gpu_inference_performed: false,
    runpod_used: false,
    production_vercel_deploy_performed: false,
    secrets_printed: false,
  }));
  console.log(`${CONTRACT}_PREFLIGHT=PASS`);
  modal.close();
  process.exit(0);
}

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
  provider: PROVIDER,
  selected_model: text(selected?.model, 300),
  pricing_unit: text(pricing?.unit || pricingRecord?.unit, 80),
  pricing_quantity: quantity,
  projected_customer_charge: projectedCustomerCharge,
  max_customer_charge: maxCustomerCharge,
  wallet_available_sufficient: finite(wallet.available_balance) >= projectedCustomerCharge,
  modal_app: MODAL_APP,
  modal_function: MODAL_FUNCTION,
  modal_backlog: preStats ? finite(preStats.backlog) : null,
  modal_total_runners: preStats ? finite(preStats.numTotalRunners) : null,
  resume_existing_job: Boolean(resumeState),
  max_provider_jobs: 1,
  external_fallback_allowed: false,
  runpod_used: false,
  gateway_required: false,
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
    runpod_forbidden: true,
    created_at: now(),
  };
  await saveState(submitting);

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
        prompt: "Premium cinematic instrumental underscore, elegant modern orchestration, warm analog depth, restrained percussion, confident executive atmosphere, polished commercial mix, no vocals.",
        duration_seconds: DURATION_SECONDS,
        generation: {
          duration_seconds: DURATION_SECONDS,
          instrumental: true,
          bpm: 104,
          keyscale: "D minor",
          timesignature: "4/4",
          inference_steps: INFERENCE_STEPS,
          seed: FIXED_SEED,
        },
        output_spec: {
          duration_seconds: DURATION_SECONDS,
          format: "wav",
        },
      },
      metadata: {
        certification_contract: CONTRACT,
        certification_scope: "PLATFORM_OWNED_AUDIO_DIRECT_MODAL_ONE_JOB",
        provider_spend_approved: true,
        max_provider_jobs: 1,
        benchmark_runs: 1,
        direct_modal_required: true,
        modal_gateway_forbidden: true,
        runpod_forbidden: true,
        production_activation_allowed: false,
        pricing_activation_allowed: false,
        provider_selection_change_allowed: false,
        production_deploy_performed: false,
      },
      category: "CERTIFICATION",
      provider_policy: ownedPolicy,
    });
  } catch (error) {
    await saveState({
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
  if (!providerJobId.startsWith("modal-audio:") || !usageId) {
    throw new Error(`${CONTRACT}_DIRECT_MODAL_PENDING_BINDING_INVALID`);
  }
  resumeState = {
    ...submitting,
    phase: "SUBMITTED",
    provider_job_id: providerJobId,
    usage_id: usageId,
    pricing: execution.pricing,
    quantity: execution?.usage?.quantity ?? quantity,
    unit: execution?.usage?.unit ?? pricing?.unit ?? pricingRecord?.unit ?? "request",
    credential_id: execution?.credential_id || null,
    started_at: execution?.started_at || now(),
    submitted_at: now(),
  };
  await saveState(resumeState);
  console.log(`${CONTRACT}_ONE_PAID_JOB_SUBMITTED=true`);
}

let settled = null;
for (let poll = 1; poll <= MAX_POLLS; poll += 1) {
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
        runpod_forbidden: true,
      },
      provider_status_input: { capability: CAPABILITY },
      credential_id: resumeState.credential_id || null,
      started_at: resumeState.started_at || null,
    });
  } catch (error) {
    await saveState({
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
    await saveState({
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
  await saveState({
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
  await saveState({
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

const assetUrl = text(findValue(settled, ["asset_url", "audio_url", "file_url"]), 4000);
const storageReference = text(findValue(settled, ["storage_reference", "storageReference"]), 2000);
if (!assetUrl.startsWith("https://")) throw new Error(`${CONTRACT}_SIGNED_ASSET_URL_REQUIRED`);
if (!storageReference.startsWith(`storage://creative-assets/${organizationId}/generated/avantiqo-audio/`)) {
  throw new Error(`${CONTRACT}_PRIVATE_STORAGE_REFERENCE_INVALID`);
}

const audioResponse = await fetch(assetUrl);
if (!audioResponse.ok) throw new Error(`${CONTRACT}_AUDIO_DOWNLOAD_FAILED:${audioResponse.status}`);
const audioBytes = new Uint8Array(await audioResponse.arrayBuffer());
if (audioBytes.length <= 44) throw new Error(`${CONTRACT}_AUDIO_OUTPUT_TOO_SMALL`);
const header = Buffer.from(audioBytes.subarray(0, 12));
if (header.subarray(0, 4).toString("ascii") !== "RIFF" || header.subarray(8, 12).toString("ascii") !== "WAVE") {
  throw new Error(`${CONTRACT}_WAV_HEADER_INVALID`);
}
await mkdir(OUTPUT_DIR, { recursive: true });
await writeFile(AUDIO_PATH, audioBytes, { mode: 0o600 });
await chmod(AUDIO_PATH, 0o600);

const usage = settled?.usage || {};
if (upper(usage?.status) !== "SUCCESS") throw new Error(`${CONTRACT}_USAGE_NOT_SUCCESS`);
if (text(usage?.provider, 120) && text(usage.provider, 120) !== PROVIDER) {
  throw new Error(`${CONTRACT}_USAGE_PROVIDER_INVALID`);
}

let finalStats = null;
for (let attempt = 1; attempt <= 8; attempt += 1) {
  await sleep(attempt === 1 ? 8_000 : 5_000);
  finalStats = await worker.getCurrentStats();
  if (finite(finalStats?.backlog) === 0 && finite(finalStats?.numTotalRunners) === 0) break;
}
if (finite(finalStats?.backlog) !== 0 || finite(finalStats?.numTotalRunners) !== 0) {
  throw new Error(
    `${CONTRACT}_SCALE_TO_ZERO_NOT_OBSERVED:backlog=${finite(finalStats?.backlog)}:runners=${finite(finalStats?.numTotalRunners)}`,
  );
}

const generationSeconds = finite(findValue(settled, ["generation_seconds"]), 0);
const durationSeconds = finite(findValue(settled, ["duration_seconds"]), 0);
const report = {
  success: true,
  contract: CONTRACT,
  source_main_commit: sourceMain,
  organization_source: organizationSource,
  organization_id_printed: false,
  service_id: SERVICE_ID,
  capability: CAPABILITY,
  provider: PROVIDER,
  model: text(settled?.usage?.metadata?.model || selected?.model, 300) || null,
  modal_app: MODAL_APP,
  modal_function: MODAL_FUNCTION,
  modal_transport: "modal-js-sdk-function-call-v1",
  modal_gateway_used: false,
  runpod_used: false,
  max_provider_jobs: 1,
  provider_jobs_submitted: 1,
  duplicate_job_submitted: false,
  duration_seconds: durationSeconds,
  requested_duration_seconds: DURATION_SECONDS,
  inference_steps: INFERENCE_STEPS,
  fixed_seed: FIXED_SEED,
  generation_seconds: generationSeconds,
  wav_bytes: audioBytes.length,
  asset_local_path: AUDIO_PATH,
  storage_reference_present: true,
  service_usage_status: upper(usage?.status),
  service_recorded_supplier_cost: finite(usage?.supplier_cost),
  service_recorded_customer_price: finite(usage?.customer_price),
  wallet_settlement: text(settled?.settlement, 120),
  scale_to_zero_observed: true,
  final_modal_backlog: finite(finalStats?.backlog),
  final_modal_total_runners: finite(finalStats?.numTotalRunners),
  raw_reasoning_persisted: false,
  production_activation_performed: false,
  pricing_activation_performed: false,
  provider_selection_changed: false,
  production_vercel_deploy_performed: false,
  secrets_printed: false,
  finished_at: now(),
};
await saveJson(REPORT_PATH, report);
await saveState({
  ...resumeState,
  phase: "COMPLETED",
  terminal: true,
  success: true,
  report_path: REPORT_PATH,
  audio_path: AUDIO_PATH,
  finished_at: report.finished_at,
  automatic_retry_forbidden: true,
});

console.log(JSON.stringify(report, null, 2));
console.log(`${CONTRACT}=PASS`);
modal.close();
