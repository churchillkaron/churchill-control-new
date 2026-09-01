import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { register } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { ModalClient } from "modal";

const CONTRACT = "AVANTIQO_VOICE_MODAL_CHAINED_SERVICE_CERTIFICATION_V1";
const BENCHMARK_CONTRACT = "AVANTIQO_VOICE_MODAL_CHAINED_BENCHMARK_V1";
const PROVIDER = "avantiqo-voice";
const TTS_CAPABILITY = "ai.text.to.speech";
const STT_CAPABILITY = "ai.speech.to.text";
const MODAL_APP = "avantiqo-voice-owned";
const TTS_FUNCTION = "speak";
const STT_FUNCTION = "transcribe";
const CANONICAL_ORGANIZATION_NAME = "Avantiqo Platform";
const CANONICAL_ORGANIZATION_TYPE = "enterprise_group";
const PHRASE = "Bright morning signals cross seven quiet bridges before sunrise.";
const MAX_AUDIO_SECONDS = 6;
const TTS_BENCHMARK_QUANTITY_MINUTES = MAX_AUDIO_SECONDS / 60;
const TTS_COST_CEILING_THB_PER_MINUTE = 10;
const STT_COST_CEILING_THB_PER_MINUTE = 5;
const CUSTOMER_MARKUP_PERCENT = 30;
const MAX_PROJECTED_CUSTOMER_CHARGE_THB = 2;
const MODAL_A10G_USD_PER_SECOND = 0.000306;
const MODAL_PRICE_SOURCE = "https://modal.com/pricing";
const MODAL_PRICE_OBSERVED_AT = "2026-09-01";
const POLL_INTERVAL_MS = 5_000;
const MAX_POLLS = 240;
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

async function resolveBenchmark(capability, expectedCost) {
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
  if (text(pricing.unit).toLowerCase() !== "minute") throw new Error(`${CONTRACT}_MINUTE_PRICING_REQUIRED:${capability}`);
  if (finite(pricing.cost_per_unit) !== expectedCost) throw new Error(`${CONTRACT}_BENCHMARK_CEILING_MISMATCH:${capability}`);
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

const ttsSelected = await resolveBenchmark(TTS_CAPABILITY, TTS_COST_CEILING_THB_PER_MINUTE);
const sttSelected = await resolveBenchmark(STT_CAPABILITY, STT_COST_CEILING_THB_PER_MINUTE);
const ttsPreview = PricingRuntime.resolveRecord({
  pricing: ttsSelected.pricing_record,
  provider: PROVIDER,
  capability: TTS_CAPABILITY,
  currency: ttsSelected.currency,
  usage: { quantity: TTS_BENCHMARK_QUANTITY_MINUTES },
});
const sttPreview = PricingRuntime.resolveRecord({
  pricing: sttSelected.pricing_record,
  provider: PROVIDER,
  capability: STT_CAPABILITY,
  currency: sttSelected.currency,
  usage: { quantity: MAX_AUDIO_SECONDS / 60 },
});
const projectedCustomerCharge = finite(ttsPreview.customer_price) + finite(sttPreview.customer_price);
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
const ttsWorker = await modal.functions.fromName(MODAL_APP, TTS_FUNCTION, lookupOptions);
const sttWorker = await modal.functions.fromName(MODAL_APP, STT_FUNCTION, lookupOptions);

async function stats(worker) {
  const value = await worker.getCurrentStats();
  return { backlog: finite(value?.backlog), runners: finite(value?.numTotalRunners) };
}
async function requireIdle() {
  const [tts, stt] = await Promise.all([stats(ttsWorker), stats(sttWorker)]);
  if (tts.backlog !== 0 || tts.runners !== 0 || stt.backlog !== 0 || stt.runners !== 0) {
    throw new Error(`${CONTRACT}_DUPLICATE_GPU_GUARD_ACTIVE:tts=${tts.backlog}/${tts.runners}:stt=${stt.backlog}/${stt.runners}`);
  }
  return { tts, stt };
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
    unit: execution?.usage?.unit || "minute",
    credential_id: execution?.credential_id || null,
    started_at: execution?.started_at || now(),
    submitted_at: now(),
  };
}

const existing = await loadState();
if (existing?.contract && existing.contract !== CONTRACT) throw new Error(`${CONTRACT}_STATE_CONTRACT_INVALID`);
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
  pricing: {
    tts: { unit: ttsPreview.unit, cost_per_unit: finite(ttsSelected.pricing_record.cost_per_unit), active: false, production_routing_allowed: false },
    stt: { unit: sttPreview.unit, cost_per_unit: finite(sttSelected.pricing_record.cost_per_unit), active: false, production_routing_allowed: false },
  },
  projected_customer_charge_thb: projectedCustomerCharge,
  max_projected_customer_charge_thb: MAX_PROJECTED_CUSTOMER_CHARGE_THB,
  modal_app: MODAL_APP,
  modal_functions: { tts: TTS_FUNCTION, stt: STT_FUNCTION },
  modal_backlog: preStats,
  max_provider_jobs: 2,
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
          quantity: TTS_BENCHMARK_QUANTITY_MINUTES,
        },
        metadata: {
          certification_contract: CONTRACT,
          benchmark_contract: BENCHMARK_CONTRACT,
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
    state = pendingState(execution, "TTS", { ...submitting, submitted_jobs: 1 });
    await saveState(state);
  }
  ttsSettled = await settleJob({ capability: TTS_CAPABILITY, state });
  if (ttsSettled?.failed === true || ttsSettled?.success !== true) throw new Error(`${CONTRACT}_TTS_FAILED:${text(ttsSettled?.error, 800)}`);

  const assetUrl = text(findValue(ttsSettled, ["asset_url", "audio_url", "file_url"]), 4000);
  const storageReference = text(findValue(ttsSettled, ["storage_reference", "storageReference"]), 2000);
  if (!assetUrl.startsWith("https://")) throw new Error(`${CONTRACT}_TTS_SIGNED_ASSET_URL_REQUIRED`);
  if (!storageReference.startsWith(`storage://creative-assets/${organizationId}/generated/avantiqo-voice/`)) {
    throw new Error(`${CONTRACT}_TTS_PRIVATE_STORAGE_REFERENCE_INVALID`);
  }
  const response = await fetch(assetUrl);
  if (!response.ok) throw new Error(`${CONTRACT}_TTS_AUDIO_DOWNLOAD_FAILED:${response.status}`);
  const audioBytes = new Uint8Array(await response.arrayBuffer());
  const durationSeconds = wavDurationSeconds(audioBytes);
  if (!(durationSeconds > 0.12) || durationSeconds > MAX_AUDIO_SECONDS) {
    throw new Error(`${CONTRACT}_TTS_AUDIO_DURATION_OUT_OF_BOUNDS:${durationSeconds}`);
  }
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
    tts_asset_url_observed: true,
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
  await requireIdle();
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
        quantity: exactDurationSeconds / 60,
      },
      metadata: {
        certification_contract: CONTRACT,
        benchmark_contract: BENCHMARK_CONTRACT,
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

let finalStats = null;
for (let attempt = 1; attempt <= 12; attempt += 1) {
  await sleep(attempt === 1 ? 8_000 : 5_000);
  finalStats = await requireIdle().catch(() => null);
  if (finalStats) break;
}
if (!finalStats) throw new Error(`${CONTRACT}_SCALE_TO_ZERO_NOT_OBSERVED`);

const ttsModalSeconds = finite(findValue(state.tts_settled, ["modal_elapsed_seconds"]));
const sttModalSeconds = finite(findValue(sttSettled, ["modal_elapsed_seconds"]));
const audioMinutes = exactDurationSeconds / 60;
const ttsSupplierUsd = ttsModalSeconds * MODAL_A10G_USD_PER_SECOND;
const sttSupplierUsd = sttModalSeconds * MODAL_A10G_USD_PER_SECOND;
const report = {
  success: true,
  contract: CONTRACT,
  benchmark_contract: BENCHMARK_CONTRACT,
  source_main_commit: sourceMain,
  organization_source: "CANONICAL_AVANTIQO_PLATFORM_DATABASE_RECORD",
  organization_id_printed: false,
  provider: PROVIDER,
  modal_app: MODAL_APP,
  modal_transport: "modal-js-sdk-function-call-v1",
  modal_gateway_used: false,
  runpod_used: false,
  provider_jobs_submitted: 2,
  duplicate_job_submitted: false,
  tts_function: TTS_FUNCTION,
  stt_function: STT_FUNCTION,
  exact_stored_wav_reused_for_stt: true,
  storage_reference_present: true,
  wav_bytes: exactAudio.length,
  audio_duration_seconds: round(exactDurationSeconds, 6),
  phrase: PHRASE,
  transcript,
  transcript_normalized_match: true,
  tts_modal_elapsed_seconds: ttsModalSeconds,
  stt_modal_elapsed_seconds: sttModalSeconds,
  modal_a10g_usd_per_second: MODAL_A10G_USD_PER_SECOND,
  modal_price_source: MODAL_PRICE_SOURCE,
  modal_price_observed_at: MODAL_PRICE_OBSERVED_AT,
  measured_supplier_economics: {
    tts_supplier_cost_usd: round(ttsSupplierUsd, 10),
    stt_supplier_cost_usd: round(sttSupplierUsd, 10),
    chained_supplier_cost_usd: round(ttsSupplierUsd + sttSupplierUsd, 10),
    tts_supplier_cost_usd_per_output_minute: audioMinutes > 0 ? round(ttsSupplierUsd / audioMinutes, 10) : null,
    stt_supplier_cost_usd_per_audio_minute: audioMinutes > 0 ? round(sttSupplierUsd / audioMinutes, 10) : null,
    includes_modal_function_elapsed_time: true,
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
