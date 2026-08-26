import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const API_BASE = "https://api.runpod.ai/v2";
const ENGINE_CONTRACT = "AVANTIQO_MUSIC_EXTEND_ENGINE_V1";
const CERT_CONTRACT = "AVANTIQO_MUSIC_EXTEND_CERTIFICATION_JOB_V1";
const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const SAFE_LEASE_LANE = "music-extend";
const BUCKET = "creative-assets";

const text = (value) => String(value ?? "").trim();
const required = (name) => { const value = text(process.env[name]); if (!value) throw new Error(`${name}_REQUIRED`); return value; };
const approved = (name) => { if (text(process.env[name]).toUpperCase() !== "YES") throw new Error(`${name}=YES_REQUIRED`); };
const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

function assertLease(endpointId) {
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE).toUpperCase() !== "YES") throw new Error("AVANTIQO_MUSIC_EXTEND_BENCHMARK_SAFE_LEASE_ACTIVE_REQUIRED");
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT) !== SAFE_LEASE_CONTRACT) throw new Error("AVANTIQO_MUSIC_EXTEND_BENCHMARK_SAFE_LEASE_CONTRACT_INVALID");
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_LANE) !== SAFE_LEASE_LANE) throw new Error("AVANTIQO_MUSIC_EXTEND_BENCHMARK_SAFE_LEASE_LANE_INVALID");
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID) !== endpointId) throw new Error("AVANTIQO_MUSIC_EXTEND_BENCHMARK_SAFE_LEASE_ENDPOINT_MISMATCH");
  const expiresAt = Date.parse(text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_EXPIRES_AT));
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) throw new Error("AVANTIQO_MUSIC_EXTEND_BENCHMARK_SAFE_LEASE_EXPIRED");
}

async function runpod(url, apiKey, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}) },
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
  if (!response.ok) throw new Error(`RUNPOD_HTTP_${response.status}:${text(body?.error || body?.message || raw).slice(0, 600)}`);
  return body;
}

function makePartialMusic(seconds = 12, sampleRate = 48000) {
  const frames = seconds * sampleRate;
  const buffer = Buffer.alloc(44 + frames * 2);
  buffer.write("RIFF", 0); buffer.writeUInt32LE(36 + frames * 2, 4); buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24); buffer.writeUInt32LE(sampleRate * 2, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36); buffer.writeUInt32LE(frames * 2, 40);
  const chord = [220, 261.63, 329.63];
  for (let i = 0; i < frames; i += 1) {
    const t = i / sampleRate;
    const pulse = 0.55 + 0.45 * Math.sin(2 * Math.PI * 2 * t);
    const sample = chord.reduce((sum, hz, index) => sum + Math.sin(2 * Math.PI * hz * t) * (0.08 - index * 0.012), 0) * pulse;
    buffer.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(sample * 32767))), 44 + i * 2);
  }
  return buffer;
}

approved("AVANTIQO_MUSIC_EXTEND_BENCHMARK_SPEND_APPROVED");
approved("AVANTIQO_MUSIC_EXTEND_SOURCE_RIGHTS_APPROVED");
const endpointId = required("RUNPOD_AVANTIQO_MUSIC_EXTEND_ENDPOINT_ID");
const apiKey = required("RUNPOD_API_KEY");
assertLease(endpointId);
if (Number(process.env.AVANTIQO_MUSIC_EXTEND_BENCHMARK_RUNS || 1) !== 1) throw new Error("AVANTIQO_MUSIC_EXTEND_ONE_JOB_REQUIRED");

const supabase = createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
const organizationId = `benchmark-${crypto.randomUUID()}`;
const id = `music-extend-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
const sourcePath = `${organizationId}/benchmark/music-extend/${id}-partial.wav`;
const outputPath = `${organizationId}/benchmark/music-extend/${id}-output.wav`;
const source = makePartialMusic(12);
const { error: sourceError } = await supabase.storage.from(BUCKET).upload(sourcePath, source, { contentType: "audio/wav", upsert: false });
if (sourceError) throw sourceError;
const { data: sourceRead, error: readError } = await supabase.storage.from(BUCKET).createSignedUrl(sourcePath, 3600);
if (readError || !sourceRead?.signedUrl) throw readError || new Error("AVANTIQO_MUSIC_EXTEND_SOURCE_SIGNED_URL_REQUIRED");
const { data: outputUpload, error: outputError } = await supabase.storage.from(BUCKET).createSignedUploadUrl(outputPath, { upsert: false });
if (outputError || !outputUpload?.signedUrl) throw outputError || new Error("AVANTIQO_MUSIC_EXTEND_OUTPUT_SIGNED_URL_REQUIRED");
const outputReference = `storage://${BUCKET}/${outputPath}`;

const payload = {
  contract: ENGINE_CONTRACT,
  capability: "ai.audio.extend",
  organization_id: organizationId,
  usage_id: id,
  source_audio_url: sourceRead.signedUrl,
  rights_attestation: { contract: "AVANTIQO_SOURCE_AUDIO_RIGHTS_ATTESTATION_V1", confirmed: true },
  structured_specification: {
    music: {
      caption: "Polished modern instrumental arrangement built around the supplied harmonic sketch",
      instrumental: true,
      duration_seconds: 12,
      instrumentation: "drums, bass, guitar, keyboard",
      complete_track_classes: ["drums", "bass", "guitar", "keyboard"],
    },
    provider_parameters: { seed: 61001, inference_steps: 32, guidance_scale: 7 },
  },
  storage_upload: { signed_url: outputUpload.signedUrl, storage_reference: outputReference },
  certification: {
    contract: CERT_CONTRACT,
    scope: "music-extend-only",
    capability: "ai.audio.extend",
    task_type: "complete",
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
if (!jobId) throw new Error("AVANTIQO_MUSIC_EXTEND_JOB_ID_REQUIRED");
let result = null;
const deadline = Date.now() + 30 * 60 * 1000;
while (Date.now() < deadline) {
  const state = await runpod(`${API_BASE}/${endpointId}/status/${encodeURIComponent(jobId)}`, apiKey);
  const status = text(state?.status).toUpperCase();
  if (status === "COMPLETED") { result = state; break; }
  if (["FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(status)) throw new Error(`AVANTIQO_MUSIC_EXTEND_JOB_${status}:${text(state?.error || state?.output?.error)}`);
  await sleep(5000);
}
if (!result) throw new Error("AVANTIQO_MUSIC_EXTEND_JOB_TIMEOUT");

const output = result.output || {};
const passed =
  text(output.engine_contract) === ENGINE_CONTRACT &&
  text(output.capability) === "ai.audio.extend" &&
  text(output.task_type) === "complete" &&
  text(output.model_variant) === "acestep-v15-base" &&
  text(output.quality_profile) === "ACE_STEP_1_5_BASE_COMPLETE_V1" &&
  output.source_audio_used === true &&
  output.arrangement_completion === true &&
  output.temporal_extension_proven === false &&
  output.ace_step_lm_used === false &&
  output.certification_candidate === true &&
  output.production_certified === false &&
  output.activation_allowed === false &&
  output.human_review_required === true &&
  text(output.certification_contract) === CERT_CONTRACT &&
  text(output.storage_reference) === outputReference &&
  Number(output.size_bytes) > 10000;

const report = {
  contract: "AVANTIQO_MUSIC_EXTEND_CERTIFICATION_BENCHMARK_V1",
  generated_at: new Date().toISOString(),
  capability: "ai.audio.extend",
  task_type: "complete",
  model_variant: "acestep-v15-base",
  quality_profile: "ACE_STEP_1_5_BASE_COMPLETE_V1",
  provider_jobs_submitted: 1,
  safe_lease_contract: SAFE_LEASE_CONTRACT,
  safe_lease_lane: SAFE_LEASE_LANE,
  source_rights_confirmed: true,
  synthetic_project_owned_source: true,
  arrangement_completion_tested: true,
  temporal_extension_tested: false,
  temporal_extension_proven: false,
  human_review_required: true,
  human_review_status: "PENDING",
  production_certified: false,
  production_activation_allowed: false,
  pricing_activation_allowed: false,
  provider_selection_change_allowed: false,
  passed,
  job_id: jobId,
  output: {
    duration_seconds: output.duration_seconds,
    source_duration_seconds: output.source_duration_seconds,
    sample_rate: output.sample_rate,
    size_bytes: output.size_bytes,
    complete_track_classes: output.complete_track_classes,
    storage_reference: output.storage_reference,
  },
};
const reportPath = resolve(process.env.AVANTIQO_MUSIC_EXTEND_BENCHMARK_OUTPUT || `/tmp/${id}.json`);
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ success: passed, contract: report.contract, provider_job_count: 1, safe_lease_lane: SAFE_LEASE_LANE, human_review_status: "PENDING", production_certified: false, activation_allowed: false, output_path: reportPath }, null, 2));
if (!passed) process.exitCode = 1;
