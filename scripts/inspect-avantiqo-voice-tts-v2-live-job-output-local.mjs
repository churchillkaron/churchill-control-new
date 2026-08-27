import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_VOICE_TTS_V2_LIVE_JOB_OUTPUT_INSPECTION_V1";
const ENGINE_CONTRACT = "AVANTIQO_VOICE_ENGINE_V1";
const QUALITY_CONTRACT = "AVANTIQO_VOICE_TTS_QUALITY_V2";
const PRODUCT_MODEL = "avantiqo-voice-tts-v2";
const FOUNDATION_MODEL = "resemble-ai/chatterbox:multilingual-v3";
const SECRETARY_PROFILE = "avantiqo-secretary-v1";
const SECRETARY_DELIVERY = "professional_conversational";
const WATERMARK = "CHATTERBOX_PERTH_BUILT_IN";
const API_BASE = "https://api.runpod.ai/v2";
const REPORT_PATH = resolve(
  process.env.AVANTIQO_VOICE_TTS_V3_ONE_PROOF_REPORT_OUTPUT ||
  "/tmp/avantiqo-voice-tts-v3-one-proof.json",
);

function text(value) {
  return String(value ?? "").trim();
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${CONTRACT}_${name}_REQUIRED`);
  return value;
}

function candidates() {
  const primary = required("RUNPOD_API_KEY");
  const management = text(process.env.RUNPOD_MANAGEMENT_API_KEY);
  return [
    { source: "RUNPOD_API_KEY", value: primary },
    ...(management && management !== primary
      ? [{ source: "RUNPOD_MANAGEMENT_API_KEY_READ_ONLY_FALLBACK", value: management }]
      : []),
  ];
}

async function readStatus(endpointId, jobId) {
  const attempts = [];
  for (const candidate of candidates()) {
    const response = await fetch(
      `${API_BASE}/${encodeURIComponent(endpointId)}/status/${encodeURIComponent(jobId)}`,
      {
        headers: {
          Authorization: `Bearer ${candidate.value}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(30000),
      },
    );
    const raw = await response.text();
    let body = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
    attempts.push({
      source: candidate.source,
      http_status: response.status,
      read_authorized: response.ok,
    });
    if (response.ok) return { body, attempts, source: candidate.source };
    if (![401, 403].includes(response.status)) {
      throw new Error(`${CONTRACT}_RUNPOD_STATUS_HTTP_${response.status}`);
    }
  }
  throw new Error(`${CONTRACT}_RUNPOD_STATUS_PERMISSION_REQUIRED`);
}

if (!existsSync(REPORT_PATH)) {
  throw new Error(`${CONTRACT}_PROOF_REPORT_REQUIRED:${REPORT_PATH}`);
}

const report = JSON.parse(await readFile(REPORT_PATH, "utf8"));
const jobId = text(report?.job_id);
if (!jobId) throw new Error(`${CONTRACT}_JOB_ID_REQUIRED`);
if (report?.success !== true) throw new Error(`${CONTRACT}_PROOF_REPORT_NOT_SUCCESSFUL`);
if (report?.generation_submitted !== true) throw new Error(`${CONTRACT}_GENERATION_NOT_SUBMITTED`);
if (text(report?.generation_submission_outcome) !== "ACCEPTED") {
  throw new Error(`${CONTRACT}_GENERATION_NOT_ACCEPTED`);
}

const endpointId = required("RUNPOD_AVANTIQO_VOICE_TTS_ENDPOINT_ID");
const statusRead = await readStatus(endpointId, jobId);
const status = text(statusRead.body?.status).toUpperCase();
if (status !== "COMPLETED") {
  throw new Error(`${CONTRACT}_JOB_NOT_COMPLETED:${status || "UNKNOWN"}`);
}

const output = statusRead.body?.output && typeof statusRead.body.output === "object"
  ? statusRead.body.output
  : {};
const health = output?.audio_health && typeof output.audio_health === "object"
  ? output.audio_health
  : {};
const blockers = [];

if (text(output?.engine_contract) !== ENGINE_CONTRACT) blockers.push("ENGINE_CONTRACT_MISMATCH");
if (text(output?.quality_contract) !== QUALITY_CONTRACT) blockers.push("QUALITY_CONTRACT_MISMATCH");
if (text(output?.model) !== PRODUCT_MODEL) blockers.push("PRODUCT_MODEL_NOT_V2");
if (text(output?.foundation_model) !== FOUNDATION_MODEL) blockers.push("FOUNDATION_MODEL_MISMATCH");
if (text(output?.capability) !== "ai.text.to.speech") blockers.push("CAPABILITY_MISMATCH");
if (text(output?.format).toLowerCase() !== "wav") blockers.push("FORMAT_NOT_WAV");
if (text(output?.language).toLowerCase() !== "en") blockers.push("LANGUAGE_NOT_EN");
if (text(output?.voice_profile) !== SECRETARY_PROFILE) blockers.push("SECRETARY_PROFILE_NOT_RETURNED");
if (text(output?.delivery) !== SECRETARY_DELIVERY) blockers.push("SECRETARY_DELIVERY_MISMATCH");
if (!(Number(output?.segments_generated) >= 1)) blockers.push("SEGMENTS_NOT_GENERATED");
if (output?.long_form_chunking !== false) blockers.push("UNEXPECTED_LONG_FORM_CHUNKING");
if (output?.voice_cloning_used !== false) blockers.push("UNEXPECTED_VOICE_CLONING");
if (text(output?.voice_identity_source) !== "avantiqo_builtin") blockers.push("IDENTITY_SOURCE_MISMATCH");
if (output?.voice_reference_contract != null) blockers.push("UNEXPECTED_REFERENCE_CONTRACT");
if (output?.voice_reference_sha256 != null) blockers.push("UNEXPECTED_REFERENCE_SHA256");
if (text(output?.watermarking) !== WATERMARK) blockers.push("WATERMARK_EVIDENCE_MISMATCH");
if (output?.raw_reasoning_persisted !== false) blockers.push("RAW_REASONING_PERSISTED");
if (health?.finite !== true) blockers.push("AUDIO_NOT_FINITE");
if (health?.non_silent !== true) blockers.push("AUDIO_SILENT");
if (!(Number(health?.duration_seconds) >= 0.12 && Number(health?.duration_seconds) <= 300)) blockers.push("AUDIO_DURATION_INVALID");
if (!(Number(health?.peak) > 0 && Number(health?.peak) <= 1)) blockers.push("AUDIO_PEAK_INVALID");
if (!(Number(health?.rms) > 0)) blockers.push("AUDIO_RMS_INVALID");
if (!(Number(output?.sample_rate) > 0)) blockers.push("SAMPLE_RATE_INVALID");
if (!text(output?.audio_base64)) blockers.push("AUDIO_PAYLOAD_REQUIRED");

const result = {
  success: blockers.length === 0,
  contract: CONTRACT,
  read_only: true,
  endpoint_id: endpointId,
  job_id: jobId,
  status,
  read_credential_source: statusRead.source,
  read_attempts: statusRead.attempts,
  blockers,
  certified: {
    engine_contract: text(output?.engine_contract) || null,
    quality_contract: text(output?.quality_contract) || null,
    product_model: text(output?.model) || null,
    foundation_model: text(output?.foundation_model) || null,
    voice_profile: text(output?.voice_profile) || null,
    delivery: text(output?.delivery) || null,
    segments_generated: Number(output?.segments_generated) || null,
    long_form_chunking: output?.long_form_chunking === true,
    voice_cloning_used: output?.voice_cloning_used === true,
    voice_identity_source: text(output?.voice_identity_source) || null,
    watermarking: text(output?.watermarking) || null,
    sample_rate: Number(output?.sample_rate) || null,
    audio_health: {
      finite: health?.finite === true,
      non_silent: health?.non_silent === true,
      peak: Number(health?.peak) || null,
      rms: Number(health?.rms) || null,
      duration_seconds: Number(health?.duration_seconds) || null,
    },
    audio_payload_present: Boolean(text(output?.audio_base64)),
    raw_reasoning_persisted: output?.raw_reasoning_persisted === true,
  },
  generation_submitted_by_inspector: false,
  stt_submitted_by_inspector: false,
  mutation_performed: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_printed: false,
};

console.log(JSON.stringify(result, null, 2));
if (!result.success) {
  throw new Error(`${CONTRACT}_REJECTED:${blockers.join(",")}`);
}
