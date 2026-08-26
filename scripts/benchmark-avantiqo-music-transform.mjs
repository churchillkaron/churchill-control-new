import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const API_BASE = "https://api.runpod.ai/v2";
const ENGINE_CONTRACT = "AVANTIQO_AUDIO_ENGINE_V1";
const CERT_CONTRACT = "AVANTIQO_MUSIC_TRANSFORM_CERTIFICATION_JOB_V1";
const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const SAFE_LEASE_LANE = "audio";
const BUCKET = "creative-assets";
const SOURCE_DURATION_SECONDS = 12;
const EXTEND_SECONDS = 8;
const EXTEND_OVERLAP_SECONDS = 3;

function text(value) { return String(value ?? "").trim(); }
function required(name) { const value = text(process.env[name]); if (!value) throw new Error(`${name}_REQUIRED`); return value; }
function approved(name) { if (text(process.env[name]).toUpperCase() !== "YES") throw new Error(`${name}=YES_REQUIRED`); }
function sleep(ms) { return new Promise((resolvePromise) => setTimeout(resolvePromise, ms)); }
function capability() {
  const value = text(process.env.AVANTIQO_MUSIC_TRANSFORM_CAPABILITY);
  if (!["ai.audio.remix", "ai.audio.edit", "ai.audio.extend"].includes(value)) throw new Error("AVANTIQO_MUSIC_TRANSFORM_CAPABILITY_INVALID");
  return value;
}
function assertLease(endpointId) {
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE).toUpperCase() !== "YES") throw new Error("AVANTIQO_MUSIC_TRANSFORM_SAFE_LEASE_ACTIVE_REQUIRED");
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT) !== SAFE_LEASE_CONTRACT) throw new Error("AVANTIQO_MUSIC_TRANSFORM_SAFE_LEASE_CONTRACT_INVALID");
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_LANE) !== SAFE_LEASE_LANE) throw new Error("AVANTIQO_MUSIC_TRANSFORM_SAFE_LEASE_LANE_INVALID");
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID) !== endpointId) throw new Error("AVANTIQO_MUSIC_TRANSFORM_SAFE_LEASE_ENDPOINT_MISMATCH");
  const expires = Date.parse(text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_EXPIRES_AT));
  if (!Number.isFinite(expires) || expires <= Date.now()) throw new Error("AVANTIQO_MUSIC_TRANSFORM_SAFE_LEASE_EXPIRED");
}
async function runpod(url, apiKey, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}) },
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  const body = raw ? JSON.parse(raw) : {};
  if (!response.ok) throw new Error(`RUNPOD_HTTP_${response.status}:${text(body?.error || body?.message || raw).slice(0, 600)}`);
  return body;
}
function makeWav(seconds = SOURCE_DURATION_SECONDS, sampleRate = 44100) {
  const frames = seconds * sampleRate;
  const buffer = Buffer.alloc(44 + frames * 2);
  buffer.write("RIFF", 0); buffer.writeUInt32LE(36 + frames * 2, 4); buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24); buffer.writeUInt32LE(sampleRate * 2, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36); buffer.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; i += 1) {
    const t = i / sampleRate;
    const sample = Math.round(Math.sin(2 * Math.PI * 220 * t) * 0.18 * 32767 + Math.sin(2 * Math.PI * 330 * t) * 0.08 * 32767);
    buffer.writeInt16LE(Math.max(-32768, Math.min(32767, sample)), 44 + i * 2);
  }
  return buffer;
}

approved("AVANTIQO_AUDIO_BENCHMARK_SPEND_APPROVED");
approved("AVANTIQO_MUSIC_TRANSFORM_SOURCE_RIGHTS_APPROVED");
const selectedCapability = capability();
const endpointId = required("RUNPOD_AVANTIQO_AUDIO_ENDPOINT_ID");
const apiKey = required("RUNPOD_API_KEY");
assertLease(endpointId);
const supabase = createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
const organizationId = `benchmark-${crypto.randomUUID()}`;
const id = `music-transform-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
const sourcePath = `${organizationId}/benchmark/music-transform/${id}-source.wav`;
const outputPath = `${organizationId}/benchmark/music-transform/${id}-output.wav`;
const source = makeWav(SOURCE_DURATION_SECONDS);
const { error: sourceError } = await supabase.storage.from(BUCKET).upload(sourcePath, source, { contentType: "audio/wav", upsert: false });
if (sourceError) throw sourceError;
const { data: sourceRead, error: readError } = await supabase.storage.from(BUCKET).createSignedUrl(sourcePath, 3600);
if (readError || !sourceRead?.signedUrl) throw readError || new Error("AVANTIQO_MUSIC_TRANSFORM_SOURCE_SIGNED_URL_REQUIRED");
const { data: outputUpload, error: outputError } = await supabase.storage.from(BUCKET).createSignedUploadUrl(outputPath, { upsert: false });
if (outputError || !outputUpload?.signedUrl) throw outputError || new Error("AVANTIQO_MUSIC_TRANSFORM_OUTPUT_SIGNED_URL_REQUIRED");
const outputReference = `storage://${BUCKET}/${outputPath}`;
const providerParameters = selectedCapability === "ai.audio.edit"
  ? { repainting_start: 3, repainting_end: 7, seed: 51001, inference_steps: 8, shift: 3 }
  : selectedCapability === "ai.audio.extend"
    ? { extension_seconds: EXTEND_SECONDS, continuity_overlap_seconds: EXTEND_OVERLAP_SECONDS, seed: 51001, inference_steps: 8, shift: 3 }
    : { audio_cover_strength: 0.6, seed: 51001, inference_steps: 8, shift: 3 };
const instruction = selectedCapability === "ai.audio.edit"
  ? "Refine only the selected region while preserving continuity."
  : selectedCapability === "ai.audio.extend"
    ? "Continue naturally beyond the existing ending while preserving musical identity and continuity."
    : "Create a polished alternate arrangement while preserving useful musical identity.";
const payload = {
  contract: ENGINE_CONTRACT,
  capability: selectedCapability,
  organization_id: organizationId,
  usage_id: id,
  instruction,
  source_asset_roles: { source_audio: sourceRead.signedUrl },
  structured_specification: {
    music: { caption: "Premium polished instrumental, balanced energy", instrumental: true, duration_seconds: SOURCE_DURATION_SECONDS, bpm: 96 },
    provider_parameters: providerParameters,
  },
  storage_upload: { signed_url: outputUpload.signedUrl, storage_reference: outputReference },
  certification: {
    contract: CERT_CONTRACT,
    scope: "music-transform-only",
    capability: selectedCapability,
    candidate: true,
    provider_spend_approved: true,
    source_rights_confirmed: true,
    safe_lease_contract: SAFE_LEASE_CONTRACT,
    safe_lease_lane: SAFE_LEASE_LANE,
    max_provider_jobs: 1,
    benchmark_runs: 1,
    human_review_required: true,
    automatic_human_review_approved: false,
    production_activation_allowed: false,
    pricing_activation_allowed: false,
    provider_selection_change_allowed: false,
  },
};
const submitted = await runpod(`${API_BASE}/${endpointId}/run`, apiKey, { method: "POST", body: JSON.stringify({ input: payload }) });
const jobId = text(submitted?.id);
if (!jobId) throw new Error("AVANTIQO_MUSIC_TRANSFORM_JOB_ID_REQUIRED");
let result = null;
const deadline = Date.now() + 25 * 60 * 1000;
while (Date.now() < deadline) {
  const state = await runpod(`${API_BASE}/${endpointId}/status/${jobId}`, apiKey);
  const status = text(state?.status).toUpperCase();
  if (status === "COMPLETED") { result = state; break; }
  if (["FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(status)) throw new Error(`AVANTIQO_MUSIC_TRANSFORM_JOB_${status}:${text(state?.error || state?.output?.error)}`);
  await sleep(5000);
}
if (!result) throw new Error("AVANTIQO_MUSIC_TRANSFORM_JOB_TIMEOUT");
const output = result.output || {};
const basePassed =
  text(output.capability) === selectedCapability &&
  output.certification_candidate === true &&
  output.production_certified === false &&
  output.activation_allowed === false &&
  output.human_review_required === true &&
  text(output.certification_contract) === CERT_CONTRACT &&
  output.source_audio_used === true &&
  text(output.storage_reference) === outputReference &&
  Number(output.size_bytes) > 10000;
const extendPassed = selectedCapability !== "ai.audio.extend" || (
  text(output.task_type) === "repaint" &&
  text(output.temporal_extend_strategy) === "XL_TURBO_REPAINT_RIGHT_OUTPAINT" &&
  Number(output.source_duration_seconds) >= SOURCE_DURATION_SECONDS - 0.5 &&
  Number(output.repainting_end) > Number(output.source_duration_seconds) &&
  Number(output.duration_seconds) > Number(output.source_duration_seconds) + 1 &&
  output.temporal_extension_observed === true &&
  output.temporal_extension_proven === false &&
  Number(output.extension_seconds_requested) === EXTEND_SECONDS &&
  Number(output.continuity_overlap_seconds) === EXTEND_OVERLAP_SECONDS
);
const passed = basePassed && extendPassed;
const temporalExtensionTechnicalProven = selectedCapability === "ai.audio.extend" && passed;
const report = {
  contract: "AVANTIQO_MUSIC_TRANSFORM_CERTIFICATION_BENCHMARK_V2",
  generated_at: new Date().toISOString(),
  capability: selectedCapability,
  provider_jobs_submitted: 1,
  safe_lease_contract: SAFE_LEASE_CONTRACT,
  safe_lease_lane: SAFE_LEASE_LANE,
  source_rights_confirmed: true,
  synthetic_source: true,
  source_duration_seconds: SOURCE_DURATION_SECONDS,
  temporal_extension_strategy: selectedCapability === "ai.audio.extend" ? "XL_TURBO_REPAINT_RIGHT_OUTPAINT" : null,
  temporal_extension_technical_proven: temporalExtensionTechnicalProven,
  human_review_required: true,
  human_review_status: "PENDING",
  production_activation_allowed: false,
  pricing_activation_allowed: false,
  provider_selection_change_allowed: false,
  passed,
  job_id: jobId,
  output: {
    capability: output.capability,
    task_type: output.task_type,
    model_variant: output.model_variant,
    quality_profile: output.quality_profile,
    source_audio_used: output.source_audio_used,
    certification_candidate: output.certification_candidate,
    production_certified: output.production_certified,
    activation_allowed: output.activation_allowed,
    storage_reference: output.storage_reference,
    duration_seconds: output.duration_seconds,
    source_duration_seconds: output.source_duration_seconds,
    extension_seconds_requested: output.extension_seconds_requested,
    extension_seconds_effective: output.extension_seconds_effective,
    continuity_overlap_seconds: output.continuity_overlap_seconds,
    repainting_start: output.repainting_start,
    repainting_end: output.repainting_end,
    temporal_extend_strategy: output.temporal_extend_strategy,
    temporal_extension_observed: output.temporal_extension_observed,
    size_bytes: output.size_bytes,
  },
};
const reportPath = resolve(process.env.AVANTIQO_MUSIC_TRANSFORM_BENCHMARK_OUTPUT || `/tmp/${id}.json`);
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ success: passed, contract: report.contract, capability: selectedCapability, provider_job_count: 1, temporal_extension_technical_proven: temporalExtensionTechnicalProven, human_review_status: "PENDING", activation_allowed: false, output_path: reportPath }, null, 2));
if (!passed) process.exitCode = 1;
