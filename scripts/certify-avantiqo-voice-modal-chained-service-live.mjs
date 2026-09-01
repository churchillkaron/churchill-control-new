import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { register } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { ModalClient } from "modal";

const CONTRACT = "AVANTIQO_VOICE_MODAL_CHAINED_SERVICE_CERTIFICATION_V1";
const BENCHMARK_CONTRACT = "AVANTIQO_VOICE_MODAL_CHAINED_BENCHMARK_V1";
const BILLING_CONTRACT = "AVANTIQO_VOICE_PER_SECOND_BILLING_V1";
const PROVIDER = "avantiqo-voice";
const TTS_CAPABILITY = "ai.text.to.speech";
const STT_CAPABILITY = "ai.speech.to.text";
const MODAL_APP = "avantiqo-voice-owned";
const TTS_CLASS = "VoiceTts";
const STT_CLASS = "VoiceStt";
const TTS_FUNCTION = "speak";
const STT_FUNCTION = "transcribe";
const CANONICAL_ORGANIZATION_NAME = "Avantiqo Platform";
const CANONICAL_ORGANIZATION_TYPE = "enterprise_group";
const PHRASE = "Bright morning signals cross seven quiet bridges before sunrise.";
const MAX_AUDIO_SECONDS = 6;
const TTS_COST_CEILING_THB_PER_SECOND = 10 / 60;
const STT_COST_CEILING_THB_PER_SECOND = 5 / 60;
const MAX_PROJECTED_CUSTOMER_CHARGE_THB = 2;
const MODAL_A10G_USD_PER_SECOND = 0.000306;
const MODAL_PRICE_SOURCE = "https://modal.com/pricing";
const MODAL_PRICE_OBSERVED_AT = "2026-09-01";
const POLL_INTERVAL_MS = 5_000;
const MAX_POLLS = 240;
const DRAIN_POLLS = 18;
const OUTPUT_DIR = resolve(
  process.env.AVANTIQO_VOICE_MODAL_CHAIN_CERT_OUTPUT_DIR ||
    "local-audit-output/avantiqo-voice-modal-chained-service-certification",
);
const STATE_PATH = resolve(OUTPUT_DIR, "state.json");
const REPORT_PATH = resolve(OUTPUT_DIR, "report.json");
const AUDIO_PATH = resolve(OUTPUT_DIR, "tts-exact-stored.wav");

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
function closeEnough(a, b, epsilon = 1e-10) {
  return Math.abs(finite(a) - finite(b)) <= epsilon;
}
function round(value, digits = 8) {
  const scale = 10 ** digits;
  return Math.round(Number(value) * scale) / scale;
}
function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}
function now() {
  return new Date().toISOString();
}
function safeError(error) {
  return {
    name: text(error?.name || "Error", 120),
    message: text(error?.message || error, 1200),
  };
}
function findValue(root, keys, seen = new Set()) {
  if (!root || typeof root !== "object" || seen.has(root)) return null;
  seen.add(root);
  for (const key of keys) {
    const candidate = root[key];
    if (candidate !== undefined && candidate !== null && candidate !== "") return candidate;
  }
  for (const child of Array.isArray(root) ? root : Object.values(root)) {
    const found = findValue(child, keys, seen);
    if (found !== null) return found;
  }
  return null;
}
function normalizeTranscript(value) {
  return text(value, 4000)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\bseven\b/g, "7")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}
function requireSourcePin() {
  const expected = text(process.env.AVANTIQO_VOICE_MODAL_CHAIN_CERT_EXPECTED_MAIN_COMMIT, 160).toLowerCase();
  const source = text(process.env.AVANTIQO_VOICE_MODAL_CHAIN_CERT_SOURCE_MAIN_COMMIT, 160).toLowerCase();
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
  if (!yes(process.env.AVANTIQO_VOICE_MODAL_CHAINED_REAL_INFERENCE_APPROVED)) {
    throw new Error("AVANTIQO_VOICE_MODAL_CHAINED_REAL_INFERENCE_APPROVED=YES_REQUIRED");
  }
  if (text(process.env.NODE_ENV, 40).toLowerCase() !== "development") {
    throw new Error(`${CONTRACT}_DEVELOPMENT_ENV_REQUIRED`);
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
async function loadState() {
  try {
    const parsed = JSON.parse(await readFile(STATE_PATH, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}
function wavDurationSeconds(bytes) {
  const buffer = Buffer.from(bytes);
  if (buffer.length < 44 || buffer.subarray(0, 4).toString("ascii") !== "RIFF" || buffer.subarray(8, 12).toString("ascii") !== "WAVE") {
    throw new Error(`${CONTRACT}_WAV_HEADER_INVALID`);
  }
  let offset = 12;
  let byteRate = 0;
  let dataBytes = 0;
  while (offset + 8 <= buffer.length) {
    const id = buffer.subarray(offset, offset + 4).toString("ascii");
    const size = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === "fmt " && size >= 16 && body + 12 <= buffer.length) byteRate = buffer.readUInt32LE(body + 8);
    if (id === "data") {
      dataBytes = Math.min(size, Math.max(0, buffer.length - body));
      break;
    }
    offset = body + size + (size % 2);
  }
  if (!(byteRate > 0) || !(dataBytes > 0)) throw new Error(`${CONTRACT}_WAV_DURATION_METADATA_REQUIRED`);
  return dataBytes / byteRate;
}

const sourceMain = requireSourcePin();
const runMode = mode();
const recoverTtsUsageId = text(process.env.AVANTIQO_VOICE_MODAL_CHAIN_RECOVER_TTS_USAGE_ID, 200);
if (recoverTtsUsageId && runMode !== "RESUME") {
  throw new Error(`${CONTRACT}_TTS_RECOVERY_REQUIRES_RESUME_MODE`);
}
register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const { supabaseAdmin } = await import("@/lib/shared/supabase/admin");
const { resolveProvider } = await import("@/lib/platform/service-runtime/providers/ProviderResolver");
const { PricingRuntime } = await import("@/lib/platform/service-runtime/pricing/PricingRuntime");
const { WalletRepository } = await import("@/lib/platform/service-runtime/wallet/repositories/WalletRepository");
const { executeService, settlePendingService } = await import("@/lib/platform/service-runtime/execution/ServiceExecutionRuntime");

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
const organizationId = text(organizations[0].id, 200);

const supplierResult = await supabaseAdmin
  .from("provider_supplier_billing_accounts")
  .select("provider_id,status,verification_status,configuration,metadata")
  .eq("provider_id", PROVIDER)
  .limit(2);
if (supplierResult.error) throw supplierResult.error;
const supplierRows = list(supplierResult.data);
if (supplierRows.length !== 1) throw new Error(`${CONTRACT}_SUPPLIER_ACCOUNT_RESOLUTION_FAILED:${supplierRows.length}`);
const supplier = supplierRows[0];
if (upper(supplier.status) !== "ACTIVE" || upper(supplier.verification_status) !== "VERIFIED") {
  throw new Error(`${CONTRACT}_VERIFIED_ACTIVE_SUPPLIER_REQUIRED`);
}
if (text(supplier.configuration?.compute_supplier).toLowerCase() !== "modal") throw new Error(`${CONTRACT}_MODAL_SUPPLIER_REQUIRED`);
if (text(supplier.configuration?.modal_app) !== MODAL_APP) throw new Error(`${CONTRACT}_MODAL_APP_BINDING_INVALID`);
if (text(supplier.configuration?.transport) !== "modal-js-sdk-function-call-v1") throw new Error(`${CONTRACT}_DIRECT_TRANSPORT_BINDING_INVALID`);
if (text(supplier.configuration?.infrastructure_provider) !== "MODAL_A10G_ASYNC_V1") throw new Error(`${CONTRACT}_MODAL_INFRASTRUCTURE_BINDING_REQUIRED`);

const benchmarkPolicy = Object.freeze({
  execution_scope: "BENCHMARK_REVIEW_PREVIEW",
  benchmark_only: true,
  allowed_providers: [PROVIDER],
  blocked_providers: [],
  owned_only_required: true,
  external_fallback_allowed: false,
  allow_owned_reasoning_fallback: false,
  allow_owned_lane_recovery: false,
});

async function resolveBenchmark(capability, expectedCostPerSecond) {
  const selected = await resolveProvider({
    organization_id: organizationId,
    capability,
    preferredProvider: PROVIDER,
    policy: benchmarkPolicy,
  });
  if (text(selected?.provider, 120) !== PROVIDER) throw new Error(`${CONTRACT}_OWNED_PROVIDER_REQUIRED:${capability}`);
  const pricing = selected?.pricing_record;
  if (!pricing?.id && !pricing?.pricing_id) throw new Error(`${CONTRACT}_PRICING_RECORD_REQUIRED:${capability}`);
  if (pricing.active !== false) throw new Error(`${CONTRACT}_PRODUCTION_PRICING_MUST_REMAIN_INACTIVE:${capability}`);
  if (text(pricing.unit).toLowerCase() !== "second") throw new Error(`${CONTRACT}_SECOND_PRICING_REQUIRED:${capability}`);
  if (!closeEnough(pricing.cost_per_unit, expectedCostPerSecond)) throw new Error(`${CONTRACT}_BENCHMARK_CEILING_MISMATCH:${capability}`);
  if (text(pricing.metadata?.billing_unit_contract) !== BILLING_CONTRACT) throw new Error(`${CONTRACT}_PER_SECOND_BILLING_CONTRACT_REQUIRED:${capability}`);
  if (upper(pricing.metadata?.pricing_status) !== "MARKET_PARITY_READY") throw new Error(`${CONTRACT}_MARKET_PARITY_READY_REQUIRED:${capability}`);
  if (pricing.metadata?.economics_certified !== false || pricing.metadata?.production_certified !== false) {
    throw new Error(`${CONTRACT}_PREPRODUCTION_ECONOMICS_REQUIRED:${capability}`);
  }
  if (pricing.metadata?.production_routing_allowed !== false || pricing.metadata?.recalibration_required !== true) {
    throw new Error(`${CONTRACT}_PRODUCTION_ROUTING_MUST_REMAIN_DISABLED:${capability}`);
  }
  if (selected?.metadata?.benchmark_review_preview !== true || pricing.benchmark_review_preview_authorized !== true) {
    throw new Error(`${CONTRACT}_BENCHMARK_REVIEW_PREVIEW_REQUIRED:${capability}`);
  }
  return selected;
}

const ttsSelected = await resolveBenchmark(TTS_CAPABILITY, TTS_COST_CEILING_THB_PER_SECOND);
const sttSelected = await resolveBenchmark(STT_CAPABILITY, STT_COST_CEILING_THB_PER_SECOND);
const ttsPreview = PricingRuntime.resolveRecord({
  pricing: ttsSelected.pricing_record,
  provider: PROVIDER,
  capability: TTS_CAPABILITY,
  currency: ttsSelected.currency,
  usage: { quantity: MAX_AUDIO_SECONDS },
});
const sttPreview = PricingRuntime.resolveRecord({
  pricing: sttSelected.pricing_record,
  provider: PROVIDER,
  capability: STT_CAPABILITY,
  currency: sttSelected.currency,
  usage: { quantity: MAX_AUDIO_SECONDS },
});
const projectedCustomerCharge = recoverTtsUsageId
  ? finite(sttPreview.customer_price)
  : finite(ttsPreview.customer_price) + finite(sttPreview.customer_price);
if (projectedCustomerCharge > MAX_PROJECTED_CUSTOMER_CHARGE_THB) {
  throw new Error(`${CONTRACT}_PROJECTED_CHARGE_LIMIT_EXCEEDED:${projectedCustomerCharge}`);
}
const wallet = await WalletRepository.getByOrganization(organizationId);
if (!wallet?.id || upper(wallet.status) !== "ACTIVE" || upper(wallet.billing_policy) !== "PREPAID") {
  throw new Error(`${CONTRACT}_ACTIVE_PREPAID_WALLET_REQUIRED`);
}
if (finite(wallet.available_balance) < projectedCustomerCharge) throw new Error(`${CONTRACT}_PREPAID_WALLET_BALANCE_INSUFFICIENT`);

const tokenId = text(process.env.MODAL_TOKEN_ID || process.env.AVANTIQO_MODAL_TOKEN_ID, 500);
const tokenSecret = text(process.env.MODAL_TOKEN_SECRET || process.env.AVANTIQO_MODAL_TOKEN_SECRET, 1000);
if (!tokenId || !tokenSecret) throw new Error(`${CONTRACT}_MODAL_DIRECT_CREDENTIALS_REQUIRED`);
const modalEnvironment = text(process.env.AVANTIQO_MODAL_ENVIRONMENT || process.env.MODAL_ENVIRONMENT, 120);
const modal = new ModalClient({ tokenId, tokenSecret, ...(modalEnvironment ? { environment: modalEnvironment } : {}) });
const lookupOptions = modalEnvironment ? { environment: modalEnvironment } : {};

async function modalMethod(className, methodName) {
  const cls = await modal.cls.fromName(MODAL_APP, className, lookupOptions);
  const instance = await cls.instance();
  return instance.method(methodName);
}
const ttsWorker = await modalMethod(TTS_CLASS, TTS_FUNCTION);
const sttWorker = await modalMethod(STT_CLASS, STT_FUNCTION);

async function stats(worker) {
  const value = await worker.getCurrentStats();
  return { backlog: finite(value?.backlog), runners: finite(value?.numTotalRunners) };
}
async function readStats() {
  const [tts, stt] = await Promise.all([stats(ttsWorker), stats(sttWorker)]);
  return { tts, stt };
}
function isIdle(value) {
  return value.tts.backlog === 0 && value.tts.runners === 0 && value.stt.backlog === 0 && value.stt.runners === 0;
}
async function requireIdle() {
  const value = await readStats();
  if (!isIdle(value)) {
    throw new Error(`${CONTRACT}_DUPLICATE_GPU_GUARD_ACTIVE:tts=${value.tts.backlog}/${value.tts.runners}:stt=${value.stt.backlog}/${value.stt.runners}`);
  }
  return value;
}
async function waitForDrain() {
  for (let attempt = 1; attempt <= DRAIN_POLLS; attempt += 1) {
    const value = await readStats();
    if (isIdle(value)) return value;
    if (attempt < DRAIN_POLLS) await sleep(2_000);
  }
  throw new Error(`${CONTRACT}_SCALE_TO_ZERO_DRAIN_TIMEOUT`);
}
async function settleJob({ capability, state }) {
  let settled = null;
  for (let poll = 1; poll <= MAX_POLLS; poll += 1) {
    settled = await settlePendingService({
      organization_id: organizationId,
      provider: PROVIDER,
      provider_job_id: state.provider_job_id,
      usage_id: state.usage_id,
      pricing: state.pricing || {},
      quantity: state.quantity,
      unit: state.unit,
      metadata: {
        certification_contract: CONTRACT,
        benchmark_contract: BENCHMARK_CONTRACT,
        billing_contract: BILLING_CONTRACT,
        direct_modal_required: true,
        runpod_forbidden: true,
      },
      provider_status_input: { capability },
      credential_id: state.credential_id || null,
      started_at: state.started_at || null,
    });
    if (settled?.pending !== true) return settled;
    await saveState({ ...state, phase: `${capability === TTS_CAPABILITY ? "TTS" : "STT"}_POLLING`, last_poll_at: now(), poll_count: poll });
    if (poll < MAX_POLLS) await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`${CONTRACT}_POLL_TIMEOUT_RESUME_SAME_JOB_REQUIRED:${capability}`);
}
function pendingState(execution, phase, previous = {}) {
  if (execution?.provider !== PROVIDER || execution?.pending !== true) throw new Error(`${CONTRACT}_ASYNC_PENDING_EXECUTION_REQUIRED:${phase}`);
  const providerJobId = text(execution.provider_job_id, 500);
  const usageId = text(execution?.usage?.id, 200);
  const expectedFunction = phase === "TTS" ? TTS_FUNCTION : STT_FUNCTION;
  if (!providerJobId.startsWith(`modal-voice-direct:${expectedFunction}:`) || !usageId) {
    throw new Error(`${CONTRACT}_DIRECT_MODAL_PENDING_BINDING_INVALID:${phase}`);
  }
  return {
    ...previous,
    contract: CONTRACT,
    terminal: false,
    success: false,
    phase: `${phase}_SUBMITTED`,
    source_main_commit: sourceMain,
    organization_id: organizationId,
    provider_job_id: providerJobId,
    usage_id: usageId,
    pricing: execution.pricing,
    quantity: execution?.usage?.quantity,
    unit: execution?.usage?.unit || "second",
    credential_id: execution?.credential_id || null,
    started_at: execution?.started_at || now(),
    submitted_at: now(),
  };
}
async function downloadStoredWav(storageReference) {
  const prefix = "storage://creative-assets/";
  if (!storageReference.startsWith(prefix)) throw new Error(`${CONTRACT}_TTS_PRIVATE_STORAGE_REFERENCE_INVALID`);
  const storagePath = storageReference.slice(prefix.length);
  if (!storagePath.startsWith(`${organizationId}/generated/avantiqo-voice/`)) {
    throw new Error(`${CONTRACT}_TTS_PRIVATE_STORAGE_ORGANIZATION_INVALID`);
  }
  const { data, error } = await supabaseAdmin.storage.from("creative-assets").download(storagePath);
  if (error) throw error;
  const bytes = new Uint8Array(await data.arrayBuffer());
  if (!bytes.length) throw new Error(`${CONTRACT}_TTS_STORED_WAV_EMPTY`);
  return bytes;
}
async function recoverSuccessfulTts(usageId) {
  const { data: usage, error } = await supabaseAdmin
    .from("platform_service_usage")
    .select("*")
    .eq("id", usageId)
    .eq("organization_id", organizationId)
    .eq("provider", PROVIDER)
    .eq("capability", TTS_CAPABILITY)
    .maybeSingle();
  if (error) throw error;
  if (!usage) throw new Error(`${CONTRACT}_RECOVERY_TTS_USAGE_NOT_FOUND`);
  if (upper(usage.status) !== "SUCCESS" || upper(usage.execution_status) !== "SUCCESS") {
    throw new Error(`${CONTRACT}_RECOVERY_TTS_USAGE_NOT_SUCCESSFUL`);
  }
  const providerJobId = text(usage.provider_request_id, 500);
  if (!providerJobId.startsWith(`modal-voice-direct:${TTS_FUNCTION}:`)) {
    throw new Error(`${CONTRACT}_RECOVERY_TTS_PROVIDER_JOB_INVALID`);
  }
  const expectedReference = `storage://creative-assets/${organizationId}/generated/avantiqo-voice/${usageId}.wav`;
  const observedReference = text(findValue(usage.metadata, ["storage_reference", "storageReference"]), 2000);
  const storageReference = observedReference || expectedReference;
  if (storageReference !== expectedReference) throw new Error(`${CONTRACT}_RECOVERY_TTS_STORAGE_REFERENCE_INVALID`);
  const audioBytes = await downloadStoredWav(storageReference);
  const durationSeconds = wavDurationSeconds(audioBytes);
  if (!(durationSeconds > 0.12) || durationSeconds > MAX_AUDIO_SECONDS) {
    throw new Error(`${CONTRACT}_RECOVERY_TTS_AUDIO_DURATION_OUT_OF_BOUNDS:${durationSeconds}`);
  }
  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(AUDIO_PATH, audioBytes, { mode: 0o600 });
  await chmod(AUDIO_PATH, 0o600);
  return {
    contract: CONTRACT,
    phase: "TTS_COMPLETED",
    terminal: false,
    success: false,
    source_main_commit: sourceMain,
    organization_id: organizationId,
    provider_job_id: null,
    usage_id: null,
    tts_provider_job_id: providerJobId,
    tts_usage_id: usageId,
    tts_settled: {
      recovered_historical_success: true,
      customer_price: finite(usage.customer_price),
      supplier_cost: finite(usage.supplier_cost),
      historical_quantity: finite(usage.quantity),
      historical_unit: text(usage.unit),
      modal_elapsed_seconds: finite(findValue(usage.metadata, ["modal_elapsed_seconds", "generation_seconds"])),
    },
    tts_storage_reference: storageReference,
    tts_asset_url_observed: false,
    audio_path: AUDIO_PATH,
    audio_bytes: audioBytes.length,
    audio_duration_seconds: round(durationSeconds, 6),
    submitted_jobs: 1,
    provider_jobs_submitted_this_run: 0,
    historical_tts_reused_without_repricing: true,
    recovered_at: now(),
  };
}

let existing = await loadState();
if (existing?.contract && existing.contract !== CONTRACT) throw new Error(`${CONTRACT}_STATE_CONTRACT_INVALID`);
if (recoverTtsUsageId && (!existing || existing.terminal === true || !["TTS_COMPLETED", "STT_SUBMITTED", "STT_POLLING"].includes(existing.phase))) {
  existing = await recoverSuccessfulTts(recoverTtsUsageId);
  await saveState(existing);
}
if (existing?.terminal === true && existing?.success === true) {
  console.log(JSON.stringify({ success: true, contract: CONTRACT, phase: "ALREADY_CERTIFIED", provider_jobs_submitted_this_run: 0, gpu_inference_performed_this_run: false }));
  console.log(`${CONTRACT}=PASS`);
  modal.close();
  process.exit(0);
}
if (existing?.terminal === true && existing?.success === false) throw new Error(`${CONTRACT}_TERMINAL_FAILURE_NO_AUTOMATIC_RETRY`);
if (["TTS_SUBMITTING", "STT_SUBMITTING"].includes(existing?.phase) && !existing?.provider_job_id) {
  throw new Error(`${CONTRACT}_AMBIGUOUS_PRIOR_SUBMISSION_NO_AUTOMATIC_RETRY`);
}

let preStats = null;
if (!existing?.provider_job_id) preStats = await requireIdle();
console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  phase: "PREFLIGHT",
  source_main_commit: sourceMain,
  organization_source: "CANONICAL_AVANTIQO_PLATFORM_DATABASE_RECORD",
  organization_id_printed: false,
  provider: PROVIDER,
  benchmark_contract: BENCHMARK_CONTRACT,
  billing_contract: BILLING_CONTRACT,
  pricing: {
    tts: { unit: ttsPreview.unit, cost_per_unit: finite(ttsSelected.pricing_record.cost_per_unit), active: false, production_routing_allowed: false },
    stt: { unit: sttPreview.unit, cost_per_unit: finite(sttSelected.pricing_record.cost_per_unit), active: false, production_routing_allowed: false },
  },
  projected_customer_charge_thb: projectedCustomerCharge,
  max_projected_customer_charge_thb: MAX_PROJECTED_CUSTOMER_CHARGE_THB,
  historical_tts_recovery_requested: Boolean(recoverTtsUsageId),
  historical_tts_repriced: false,
  max_new_provider_jobs: recoverTtsUsageId ? 1 : 2,
  modal_app: MODAL_APP,
  modal_workers: {
    tts: { class: TTS_CLASS, method: TTS_FUNCTION },
    stt: { class: STT_CLASS, method: STT_FUNCTION },
  },
  modal_backlog: preStats,
  chained_order: ["TTS", "EXACT_STORED_WAV", "STT", "TRANSCRIPT_MATCH"],
  external_fallback_allowed: false,
  runpod_used: false,
  gpu_requested: false,
  gpu_inference_performed: false,
  production_activation_performed: false,
  pricing_activation_performed: false,
  production_vercel_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
console.log(`${CONTRACT}_PREFLIGHT=PASS`);

if (runMode === "PREFLIGHT") {
  modal.close();
  process.exit(0);
}
requirePaidApproval();

let state = existing || null;
let ttsSettled = null;
if (!state || !["TTS_COMPLETED", "STT_SUBMITTED", "STT_POLLING"].includes(state.phase)) {
  if (runMode === "RESUME") throw new Error(`${CONTRACT}_RESUME_REQUIRES_RECOVERABLE_TTS_STATE`);
  if (!state?.provider_job_id) {
    await requireIdle();
    const submitting = {
      contract: CONTRACT,
      phase: "TTS_SUBMITTING",
      terminal: false,
      success: false,
      source_main_commit: sourceMain,
      paid_approval_observed: true,
      max_provider_jobs: 2,
      submitted_jobs: 0,
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
        service_id: TTS_CAPABILITY,
        provider_id: PROVIDER,
        capability: TTS_CAPABILITY,
        input: {
          capability: TTS_CAPABILITY,
          input: PHRASE,
          language: "en",
          locale: "en",
          voice_profile: "avantiqo-neutral-v1",
          response_format: "wav",
          quantity: MAX_AUDIO_SECONDS,
        },
        metadata: {
          certification_contract: CONTRACT,
          benchmark_contract: BENCHMARK_CONTRACT,
          billing_contract: BILLING_CONTRACT,
          certification_scope: "PLATFORM_OWNED_VOICE_DIRECT_MODAL_CHAINED_TTS_STT",
          provider_spend_approved: true,
          direct_modal_required: true,
          modal_gateway_forbidden: true,
          runpod_forbidden: true,
          production_activation_allowed: false,
          pricing_activation_allowed: false,
          production_deploy_performed: false,
        },
        category: "CERTIFICATION",
        provider_policy: benchmarkPolicy,
      });
    } catch (error) {
      await saveState({ ...submitting, phase: "TTS_SUBMISSION_FAILED", terminal: true, success: false, error: safeError(error), finished_at: now() });
      throw error;
    }
    state = pendingState(execution, "TTS", { ...submitting, submitted_jobs: 1, provider_jobs_submitted_this_run: 1 });
    await saveState(state);
  }
  ttsSettled = await settleJob({ capability: TTS_CAPABILITY, state });
  if (ttsSettled?.failed === true || ttsSettled?.success !== true) throw new Error(`${CONTRACT}_TTS_FAILED:${text(ttsSettled?.error, 800)}`);
  const storageReference = text(findValue(ttsSettled, ["storage_reference", "storageReference"]), 2000);
  const audioBytes = await downloadStoredWav(storageReference);
  const durationSeconds = wavDurationSeconds(audioBytes);
  if (!(durationSeconds > 0.12) || durationSeconds > MAX_AUDIO_SECONDS) throw new Error(`${CONTRACT}_TTS_AUDIO_DURATION_OUT_OF_BOUNDS:${durationSeconds}`);
  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(AUDIO_PATH, audioBytes, { mode: 0o600 });
  await chmod(AUDIO_PATH, 0o600);
  state = {
    ...state,
    phase: "TTS_COMPLETED",
    provider_job_id: null,
    usage_id: null,
    tts_provider_job_id: state.provider_job_id,
    tts_usage_id: state.usage_id,
    tts_settled: ttsSettled,
    tts_storage_reference: storageReference,
    audio_path: AUDIO_PATH,
    audio_bytes: audioBytes.length,
    audio_duration_seconds: round(durationSeconds, 6),
    submitted_jobs: 1,
    completed_at: now(),
  };
  await saveState(state);
}

const exactAudio = new Uint8Array(await readFile(AUDIO_PATH));
const exactDurationSeconds = wavDurationSeconds(exactAudio);
if (exactDurationSeconds > MAX_AUDIO_SECONDS) throw new Error(`${CONTRACT}_STT_INPUT_DURATION_LIMIT_EXCEEDED`);

let sttSettled = null;
if (!["STT_SUBMITTED", "STT_POLLING"].includes(state?.phase)) {
  await waitForDrain();
  const submitting = {
    ...state,
    phase: "STT_SUBMITTING",
    provider_job_id: null,
    usage_id: null,
    submitted_jobs: 1,
    stt_submitting_at: now(),
  };
  await saveState(submitting);
  let execution;
  try {
    const upload = new Blob([exactAudio], { type: "audio/wav" });
    execution = await executeService({
      organization_id: organizationId,
      bill_to_organization_id: organizationId,
      service_id: STT_CAPABILITY,
      provider_id: PROVIDER,
      capability: STT_CAPABILITY,
      input: {
        capability: STT_CAPABILITY,
        upload_file: upload,
        file_name: "tts-exact-stored.wav",
        mime_type: "audio/wav",
        language: "en",
        quantity: exactDurationSeconds,
      },
      metadata: {
        certification_contract: CONTRACT,
        benchmark_contract: BENCHMARK_CONTRACT,
        billing_contract: BILLING_CONTRACT,
        certification_scope: "PLATFORM_OWNED_VOICE_DIRECT_MODAL_CHAINED_TTS_STT",
        chained_from_tts_storage_reference: state.tts_storage_reference,
        exact_tts_wav_reused: true,
        provider_spend_approved: true,
        direct_modal_required: true,
        modal_gateway_forbidden: true,
        runpod_forbidden: true,
        production_activation_allowed: false,
        pricing_activation_allowed: false,
        production_deploy_performed: false,
      },
      category: "CERTIFICATION",
      provider_policy: benchmarkPolicy,
    });
  } catch (error) {
    await saveState({ ...submitting, phase: "STT_SUBMISSION_FAILED", terminal: true, success: false, error: safeError(error), finished_at: now() });
    throw error;
  }
  state = pendingState(execution, "STT", {
    ...submitting,
    tts_provider_job_id: state.tts_provider_job_id,
    tts_usage_id: state.tts_usage_id,
    tts_settled: state.tts_settled,
    tts_storage_reference: state.tts_storage_reference,
    audio_path: AUDIO_PATH,
    audio_bytes: exactAudio.length,
    audio_duration_seconds: round(exactDurationSeconds, 6),
    submitted_jobs: 2,
    provider_jobs_submitted_this_run: finite(state.provider_jobs_submitted_this_run) + 1,
  });
  await saveState(state);
}
sttSettled = await settleJob({ capability: STT_CAPABILITY, state });
if (sttSettled?.failed === true || sttSettled?.success !== true) throw new Error(`${CONTRACT}_STT_FAILED:${text(sttSettled?.error, 800)}`);

const transcript = text(findValue(sttSettled, ["transcript", "text"]), 4000);
const expectedNormalized = normalizeTranscript(PHRASE);
const transcriptNormalized = normalizeTranscript(transcript);
if (!transcript || transcriptNormalized !== expectedNormalized) {
  await saveState({ ...state, phase: "TRANSCRIPT_MISMATCH", terminal: true, success: false, expected_normalized: expectedNormalized, transcript_normalized: transcriptNormalized, finished_at: now() });
  throw new Error(`${CONTRACT}_TRANSCRIPT_MISMATCH`);
}

const finalStats = await waitForDrain();
const ttsModalSeconds = finite(findValue(state.tts_settled, ["modal_request_elapsed_seconds", "modal_elapsed_seconds"]));
const ttsPreloadSeconds = finite(findValue(state.tts_settled, ["modal_container_preload_seconds"]));
const sttModalSeconds = finite(findValue(sttSettled, ["modal_request_elapsed_seconds", "modal_elapsed_seconds"]));
const sttPreloadSeconds = finite(findValue(sttSettled, ["modal_container_preload_seconds"]));
const ttsSupplierUsd = ttsModalSeconds * MODAL_A10G_USD_PER_SECOND;
const sttSupplierUsd = sttModalSeconds * MODAL_A10G_USD_PER_SECOND;
const report = {
  success: true,
  contract: CONTRACT,
  benchmark_contract: BENCHMARK_CONTRACT,
  billing_contract: BILLING_CONTRACT,
  source_main_commit: sourceMain,
  organization_source: "CANONICAL_AVANTIQO_PLATFORM_DATABASE_RECORD",
  organization_id_printed: false,
  provider: PROVIDER,
  modal_app: MODAL_APP,
  modal_transport: "modal-js-sdk-function-call-v1",
  modal_worker_shape: "CLASS_METHOD_WITH_CONTAINER_PRELOAD",
  modal_gateway_used: false,
  runpod_used: false,
  provider_jobs_submitted_this_run: finite(state.provider_jobs_submitted_this_run),
  historical_tts_reused_without_repricing: state.historical_tts_reused_without_repricing === true,
  duplicate_job_submitted: false,
  tts_worker: { class: TTS_CLASS, method: TTS_FUNCTION },
  stt_worker: { class: STT_CLASS, method: STT_FUNCTION },
  exact_stored_wav_reused_for_stt: true,
  storage_reference_present: true,
  wav_bytes: exactAudio.length,
  audio_duration_seconds: round(exactDurationSeconds, 6),
  phrase: PHRASE,
  transcript,
  transcript_normalized_match: true,
  tts_modal_request_elapsed_seconds: ttsModalSeconds,
  tts_modal_container_preload_seconds: ttsPreloadSeconds,
  stt_modal_request_elapsed_seconds: sttModalSeconds,
  stt_modal_container_preload_seconds: sttPreloadSeconds,
  modal_a10g_usd_per_second: MODAL_A10G_USD_PER_SECOND,
  modal_price_source: MODAL_PRICE_SOURCE,
  modal_price_observed_at: MODAL_PRICE_OBSERVED_AT,
  measured_supplier_economics: {
    tts_request_gpu_cost_usd: round(ttsSupplierUsd, 10),
    stt_request_gpu_cost_usd: round(sttSupplierUsd, 10),
    request_gpu_cost_usd_excluding_container_preload: round(ttsSupplierUsd + sttSupplierUsd, 10),
    container_preload_reported_separately: true,
    requires_modal_billable_container_measurement_before_pricing_promotion: true,
    requires_fx_before_thb_pricing_promotion: true,
  },
  provisional_pricing_remained_inactive: true,
  economics_certified_in_database: false,
  production_routing_allowed: false,
  production_activation_performed: false,
  pricing_activation_performed: false,
  provider_selection_changed: false,
  scale_to_zero_observed: true,
  final_modal_stats: finalStats,
  raw_reasoning_persisted: false,
  production_vercel_deploy_performed: false,
  secrets_printed: false,
  finished_at: now(),
};
await saveJson(REPORT_PATH, report);
await saveState({
  ...state,
  phase: "COMPLETED",
  terminal: true,
  success: true,
  provider_job_id: null,
  usage_id: null,
  stt_provider_job_id: state.provider_job_id,
  stt_usage_id: state.usage_id,
  report_path: REPORT_PATH,
  finished_at: report.finished_at,
  automatic_retry_forbidden: true,
});
console.log(JSON.stringify(report, null, 2));
console.log(`${CONTRACT}=PASS`);
modal.close();
