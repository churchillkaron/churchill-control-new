import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  AVANTIQO_MUSIC_CONTINUITY_FIXTURE_BPM,
  AVANTIQO_MUSIC_CONTINUITY_FIXTURE_SECONDS,
  avantiqoMusicContinuityFixtureMetadata,
  createAvantiqoMusicContinuityFixtureWav,
} from "./avantiqo-music-continuity-fixture.mjs";

const API_BASE = "https://api.runpod.ai/v2";
const ENGINE_CONTRACT = "AVANTIQO_AUDIO_ENGINE_V1";
const CERT_CONTRACT = "AVANTIQO_MUSIC_TRANSFORM_CERTIFICATION_JOB_V1";
const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const SAFE_LEASE_LANE = "music-transform-candidate";
const BUCKET = "creative-assets";
const TECHNICAL_SOURCE_DURATION_SECONDS = 12;
const EXTEND_SECONDS = 8;
const EXTEND_OVERLAP_SECONDS = 3;
const ENDPOINT_OPEN_PROPAGATION_TIMEOUT_MS = 45_000;
const ENDPOINT_OPEN_PROPAGATION_POLL_MS = 2_000;
const SOURCE_MODE_TECHNICAL = "TECHNICAL_SYNTHETIC";
const SOURCE_MODE_CONTINUITY = "MUSICAL_CONTINUITY";

function text(value) { return String(value ?? "").trim(); }
function required(name) { const value = text(process.env[name]); if (!value) throw new Error(`${name}_REQUIRED`); return value; }
function approved(name) { if (text(process.env[name]).toUpperCase() !== "YES") throw new Error(`${name}=YES_REQUIRED`); }
function sleep(ms) { return new Promise((resolvePromise) => setTimeout(resolvePromise, ms)); }
function capability() {
  const value = text(process.env.AVANTIQO_MUSIC_TRANSFORM_CAPABILITY);
  if (!["ai.audio.remix", "ai.audio.edit", "ai.audio.extend"].includes(value)) throw new Error("AVANTIQO_MUSIC_TRANSFORM_CAPABILITY_INVALID");
  return value;
}
function sourceMode(selectedCapability) {
  const value = text(process.env.AVANTIQO_MUSIC_TRANSFORM_SOURCE_MODE).toUpperCase() || SOURCE_MODE_TECHNICAL;
  if (![SOURCE_MODE_TECHNICAL, SOURCE_MODE_CONTINUITY].includes(value)) throw new Error("AVANTIQO_MUSIC_TRANSFORM_SOURCE_MODE_INVALID");
  if (value === SOURCE_MODE_CONTINUITY && selectedCapability !== "ai.audio.extend") {
    throw new Error("AVANTIQO_MUSIC_TRANSFORM_MUSICAL_CONTINUITY_REQUIRES_EXTEND");
  }
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
function endpointPausedPropagationError(error) {
  const message = text(error?.message);
  return /^RUNPOD_HTTP_409:/i.test(message) && /(ENDPOINT_PAUSED|Endpoint is paused|max_workers=0)/i.test(message);
}
async function submitRunpodJob(endpointId, apiKey, payload) {
  const deadline = Date.now() + ENDPOINT_OPEN_PROPAGATION_TIMEOUT_MS;
  let rejectedAttempts = 0;
  while (true) {
    assertLease(endpointId);
    try {
      const submitted = await runpod(`${API_BASE}/${endpointId}/run`, apiKey, { method: "POST", body: JSON.stringify({ input: payload }) });
      if (rejectedAttempts > 0) {
        console.log(`AVANTIQO_MUSIC_TRANSFORM_CERTIFICATION_ENDPOINT_OPEN_PROPAGATED=${JSON.stringify({ rejected_attempts: rejectedAttempts, provider_jobs_submitted: 1 })}`);
      }
      return { submitted, rejectedAttempts };
    } catch (error) {
      if (!endpointPausedPropagationError(error)) throw error;
      rejectedAttempts += 1;
      if (Date.now() + ENDPOINT_OPEN_PROPAGATION_POLL_MS > deadline) {
        throw new Error(`AVANTIQO_MUSIC_TRANSFORM_ENDPOINT_OPEN_PROPAGATION_TIMEOUT:rejected_attempts=${rejectedAttempts}`);
      }
      console.log(`AVANTIQO_MUSIC_TRANSFORM_CERTIFICATION_ENDPOINT_OPEN_PROPAGATION_WAIT=${JSON.stringify({ rejected_attempts: rejectedAttempts, provider_jobs_submitted: 0 })}`);
      await sleep(ENDPOINT_OPEN_PROPAGATION_POLL_MS);
    }
  }
}
function storageObjectPath(bucket, path) {
  const parts = [bucket, ...text(path).split("/").filter(Boolean)];
  return parts.map((part) => encodeURIComponent(part)).join("/");
}
function absoluteStorageUrl(storageBase, value) {
  const url = text(value);
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  return `${storageBase}${url.startsWith("/") ? "" : "/"}${url}`;
}
async function storageJson(storageBase, serviceRoleKey, pathname, options = {}) {
  const response = await fetch(`${storageBase}${pathname}`, {
    method: options.method || "POST",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      Accept: "application/json",
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
  if (!response.ok) throw new Error(`SUPABASE_STORAGE_HTTP_${response.status}:${text(body?.error || body?.message || raw).slice(0, 600)}`);
  return body;
}
async function storageUpload(storageBase, serviceRoleKey, bucket, path, buffer) {
  const objectPath = storageObjectPath(bucket, path);
  const response = await fetch(`${storageBase}/object/${objectPath}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      Accept: "application/json",
      "Content-Type": "audio/wav",
      "x-upsert": "false",
    },
    body: buffer,
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
  if (!response.ok) throw new Error(`SUPABASE_STORAGE_UPLOAD_HTTP_${response.status}:${text(body?.error || body?.message || raw).slice(0, 600)}`);
  return body;
}
async function createStorageSignedReadUrl(storageBase, serviceRoleKey, bucket, path, expiresIn = 3600) {
  const objectPath = storageObjectPath(bucket, path);
  const body = await storageJson(storageBase, serviceRoleKey, `/object/sign/${objectPath}`, { body: { expiresIn } });
  const signedUrl = absoluteStorageUrl(storageBase, body?.signedURL || body?.signedUrl || body?.url);
  if (!signedUrl) throw new Error("AVANTIQO_MUSIC_TRANSFORM_SOURCE_SIGNED_URL_REQUIRED");
  return signedUrl;
}
async function createStorageSignedUploadUrl(storageBase, serviceRoleKey, bucket, path) {
  const objectPath = storageObjectPath(bucket, path);
  const body = await storageJson(storageBase, serviceRoleKey, `/object/upload/sign/${objectPath}`, { body: {} });
  const signedUrl = absoluteStorageUrl(storageBase, body?.url || body?.signedURL || body?.signedUrl);
  if (!signedUrl) throw new Error("AVANTIQO_MUSIC_TRANSFORM_OUTPUT_SIGNED_URL_REQUIRED");
  return signedUrl;
}
function makeTechnicalWav(seconds = TECHNICAL_SOURCE_DURATION_SECONDS, sampleRate = 44100) {
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
function sourceFixture(mode) {
  if (mode === SOURCE_MODE_CONTINUITY) {
    return {
      audio: createAvantiqoMusicContinuityFixtureWav(),
      durationSeconds: AVANTIQO_MUSIC_CONTINUITY_FIXTURE_SECONDS,
      bpm: AVANTIQO_MUSIC_CONTINUITY_FIXTURE_BPM,
      metadata: avantiqoMusicContinuityFixtureMetadata(),
      humanReviewKind: "MUSICAL_CONTINUITY",
      eligibleForHumanReleaseReview: true,
      caption: "Warm polished instrumental groove with chord progression, bass, melody and light drums",
    };
  }
  return {
    audio: makeTechnicalWav(TECHNICAL_SOURCE_DURATION_SECONDS),
    durationSeconds: TECHNICAL_SOURCE_DURATION_SECONDS,
    bpm: 96,
    metadata: { contract: "AVANTIQO_MUSIC_TRANSFORM_TECHNICAL_SOURCE_V1", deterministic: true, musical_quality_review_eligible: false },
    humanReviewKind: "TECHNICAL_ONLY",
    eligibleForHumanReleaseReview: false,
    caption: "Premium polished instrumental, balanced energy",
  };
}

approved("AVANTIQO_AUDIO_BENCHMARK_SPEND_APPROVED");
approved("AVANTIQO_MUSIC_TRANSFORM_SOURCE_RIGHTS_APPROVED");
const selectedCapability = capability();
const selectedSourceMode = sourceMode(selectedCapability);
const fixture = sourceFixture(selectedSourceMode);
const sourceDurationSeconds = fixture.durationSeconds;
const endpointId = required("RUNPOD_AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_ENDPOINT_ID");
const apiKey = required("RUNPOD_API_KEY");
assertLease(endpointId);
const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL").replace(/\/+$/, "");
const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
const storageBase = `${supabaseUrl}/storage/v1`;
const organizationId = `benchmark-${crypto.randomUUID()}`;
const id = `music-transform-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
const sourcePath = `${organizationId}/benchmark/music-transform/${id}-source.wav`;
const outputPath = `${organizationId}/benchmark/music-transform/${id}-output.wav`;
await storageUpload(storageBase, serviceRoleKey, BUCKET, sourcePath, fixture.audio);
const sourceSignedUrl = await createStorageSignedReadUrl(storageBase, serviceRoleKey, BUCKET, sourcePath, 3600);
const outputSignedUrl = await createStorageSignedUploadUrl(storageBase, serviceRoleKey, BUCKET, outputPath);
const outputReference = `storage://${BUCKET}/${outputPath}`;
const providerParameters = selectedCapability === "ai.audio.edit"
  ? { repainting_start: 3, repainting_end: 7, seed: 51001, inference_steps: 8, shift: 3 }
  : selectedCapability === "ai.audio.extend"
    ? { extension_seconds: EXTEND_SECONDS, continuity_overlap_seconds: EXTEND_OVERLAP_SECONDS, seed: 51001, inference_steps: 8, shift: 3 }
    : { audio_cover_strength: 0.6, seed: 51001, inference_steps: 8, shift: 3 };
const instruction = selectedCapability === "ai.audio.edit"
  ? "Refine only the selected region while preserving continuity."
  : selectedCapability === "ai.audio.extend"
    ? "Continue naturally beyond the existing ending while preserving musical identity, harmony, pulse, instrumentation and continuity."
    : "Create a polished alternate arrangement while preserving useful musical identity.";
const payload = {
  contract: ENGINE_CONTRACT,
  capability: selectedCapability,
  organization_id: organizationId,
  usage_id: id,
  instruction,
  source_asset_roles: { source_audio: sourceSignedUrl },
  structured_specification: {
    music: { caption: fixture.caption, instrumental: true, duration_seconds: sourceDurationSeconds, bpm: fixture.bpm },
    provider_parameters: providerParameters,
  },
  storage_upload: { signed_url: outputSignedUrl, storage_reference: outputReference },
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
console.log(`AVANTIQO_MUSIC_TRANSFORM_CERTIFICATION_SOURCE_MODE=${selectedSourceMode}`);
console.log(`AVANTIQO_MUSIC_TRANSFORM_CERTIFICATION_HUMAN_REVIEW_KIND=${fixture.humanReviewKind}`);
const { submitted, rejectedAttempts: endpointOpenPropagationRejections } = await submitRunpodJob(endpointId, apiKey, payload);
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
  Number(output.source_duration_seconds) >= sourceDurationSeconds - 0.5 &&
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
  endpoint_open_propagation_rejections: endpointOpenPropagationRejections,
  endpoint_scope: "MUSIC_TRANSFORM_CANDIDATE_ONLY",
  endpoint_id: endpointId,
  production_audio_endpoint_allowed: false,
  safe_lease_contract: SAFE_LEASE_CONTRACT,
  safe_lease_lane: SAFE_LEASE_LANE,
  source_rights_confirmed: true,
  synthetic_source: true,
  source_mode: selectedSourceMode,
  source_fixture: fixture.metadata,
  source_duration_seconds: sourceDurationSeconds,
  temporal_extension_strategy: selectedCapability === "ai.audio.extend" ? "XL_TURBO_REPAINT_RIGHT_OUTPAINT" : null,
  temporal_extension_technical_proven: temporalExtensionTechnicalProven,
  human_review_required: true,
  human_review_status: "PENDING",
  human_review_kind: fixture.humanReviewKind,
  eligible_for_human_release_review: fixture.eligibleForHumanReleaseReview && temporalExtensionTechnicalProven,
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
console.log(JSON.stringify({ success: passed, contract: report.contract, capability: selectedCapability, source_mode: selectedSourceMode, human_review_kind: fixture.humanReviewKind, eligible_for_human_release_review: report.eligible_for_human_release_review, provider_job_count: 1, endpoint_open_propagation_rejections: endpointOpenPropagationRejections, candidate_endpoint_only: true, temporal_extension_technical_proven: temporalExtensionTechnicalProven, human_review_status: "PENDING", activation_allowed: false, output_path: reportPath }, null, 2));
if (!passed) process.exitCode = 1;
