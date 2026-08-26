#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFile, stat, writeFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

const API_BASE = "https://api.runpod.ai/v2";
const STORAGE_BUCKET = "creative-assets";
const CONTRACT = "AVANTIQO_MUSIC_SEPARATOR_CERTIFICATION_BENCHMARK_V1";
const ENGINE_CONTRACT = "AVANTIQO_MUSIC_SEPARATOR_ENGINE_V1";
const READINESS_CONTRACT = "AVANTIQO_MUSIC_SEPARATOR_CERTIFICATION_READINESS_V1";
const PREFLIGHT_CONTRACT = "AVANTIQO_MUSIC_SEPARATOR_RUNPOD_PREFLIGHT_V1";
const CAPABILITY = "ai.audio.stems";
const CATALOG_MODEL = "facebookresearch/demucs:htdemucs_ft";
const RUNTIME_MODEL = "demucs-htdemucs-ft";
const DEMUCS_MODEL = "htdemucs_ft";
const QUALITY_PROFILE = "DEMUCS_HTDEMUCS_FT_4STEM_V1";
const RIGHTS_CONTRACT = "AVANTIQO_SOURCE_AUDIO_RIGHTS_ATTESTATION_V1";
const CONTENT_POLICY = "USER_RIGHTS_ATTESTATION_ONLY";
const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const SAFE_LEASE_LANE = "music-separator";
const STEMS = Object.freeze(["vocals", "drums", "bass", "other"]);
const BACKING_STEMS = Object.freeze(["drums", "bass", "other"]);
const OUTPUTS = Object.freeze({
  backing_track_wav: "backing-track.wav",
  backing_track_mp3: "backing-track.mp3",
  vocals: "vocals.wav",
  drums: "drums.wav",
  bass: "bass.wav",
  other: "other.wav",
});
const MIME_BY_EXTENSION = Object.freeze({
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".ogg": "audio/ogg",
});
const POLL_INTERVAL_MS = Math.max(
  2_000,
  Math.min(30_000, Number(process.env.AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_POLL_INTERVAL_MS || 5_000)),
);
const QUEUE_TIMEOUT_MS = Math.max(
  60_000,
  Math.min(30 * 60 * 1000, Number(process.env.AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_QUEUE_TIMEOUT_MS || 15 * 60 * 1000)),
);
const EXECUTION_TIMEOUT_MS = Math.max(
  60_000,
  Math.min(45 * 60 * 1000, Number(process.env.AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_EXECUTION_TIMEOUT_MS || 25 * 60 * 1000)),
);
const OUTPUT = resolve(
  process.env.AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_OUTPUT ||
    "/tmp/avantiqo-music-separator-certification-benchmark.json",
);

function text(value) {
  return String(value ?? "").trim();
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function approved(name) {
  if (text(process.env[name]).toUpperCase() !== "YES") {
    throw new Error(`${name}_YES_REQUIRED`);
  }
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function safe(value, fallback = "separator-benchmark") {
  return text(value || fallback)
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || fallback;
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function exactList(value, expected) {
  return Array.isArray(value) &&
    value.length === expected.length &&
    expected.every((item, index) => value[index] === item);
}

function assertSafeLease(endpointId) {
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE).toUpperCase() !== "YES") {
    throw new Error("AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_SAFE_LEASE_ACTIVE_REQUIRED");
  }
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT) !== SAFE_LEASE_CONTRACT) {
    throw new Error("AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_SAFE_LEASE_CONTRACT_INVALID");
  }
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_LANE) !== SAFE_LEASE_LANE) {
    throw new Error("AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_SAFE_LEASE_LANE_INVALID");
  }
  const leasedEndpointId = text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID);
  if (!leasedEndpointId || leasedEndpointId !== endpointId) {
    throw new Error("AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_SAFE_LEASE_ENDPOINT_MISMATCH");
  }
  const expiresAt = Date.parse(text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_EXPIRES_AT));
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    throw new Error("AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_SAFE_LEASE_EXPIRED");
  }
  return {
    contract: SAFE_LEASE_CONTRACT,
    lane: SAFE_LEASE_LANE,
    endpoint_id: leasedEndpointId,
    expires_at: new Date(expiresAt).toISOString(),
  };
}

function runJsonScript(relativePath) {
  let raw = "";
  try {
    raw = execFileSync(
      process.execPath,
      [resolve(relativePath)],
      {
        cwd: process.cwd(),
        env: process.env,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 90_000,
      },
    );
  } catch (error) {
    const stderr = text(error?.stderr).slice(0, 1600);
    const stdout = text(error?.stdout).slice(0, 1600);
    throw new Error(
      `AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_PREREQUISITE_FAILED:${relativePath}:${stderr || stdout || text(error?.message).slice(0, 1600)}`,
    );
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_PREREQUISITE_OUTPUT_INVALID:${relativePath}`);
  }
}

function assertReadiness(result) {
  const failures = [
    ["success", result?.success === true],
    ["contract", result?.contract === READINESS_CONTRACT],
    ["capability", result?.capability === CAPABILITY],
    ["catalog_model", result?.catalog_model === CATALOG_MODEL],
    ["runtime_model", result?.runtime_model === RUNTIME_MODEL],
    ["demucs_model", result?.demucs_model === DEMUCS_MODEL],
    ["quality_profile", result?.quality_profile === QUALITY_PROFILE],
    ["implementation_present", result?.gates?.implementation_present === true],
    ["owned_model_cataloged", result?.gates?.owned_model_cataloged === true],
    ["immutable_image_verified", result?.gates?.immutable_image_verified === true],
    ["benchmark_required", result?.gates?.benchmark_required === true],
    ["production_certified_false", result?.production_certified === false],
    ["production_routing_false", result?.production_routing_allowed === false],
  ].filter(([, passed]) => !passed).map(([name]) => name);
  if (failures.length) {
    throw new Error(`AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_READINESS_INVALID:${failures.join(",")}`);
  }
}

function assertPreflight(result) {
  const failures = [
    ["success", result?.success === true],
    ["contract", result?.contract === PREFLIGHT_CONTRACT],
    ["image_reference", /^ghcr\.io\/.+@sha256:[a-f0-9]{64}$/i.test(text(result?.image?.immutable_image_reference))],
    ["separator_endpoint", Boolean(result?.separator_endpoint?.id)],
    ["separator_not_busy", result?.separator_endpoint?.busy === false],
    ["separator_no_volume", result?.separator_endpoint?.network_volume_invariant_passed === true],
    ["read_only", result?.safety?.read_only === true],
    ["provider_job_not_submitted", result?.safety?.provider_job_submitted === false],
    ["separator_not_mutated", result?.safety?.separator_endpoint_mutation_performed === false],
    ["pricing_not_activated", result?.safety?.pricing_activation_performed === false],
  ].filter(([, passed]) => !passed).map(([name]) => name);
  if (failures.length) {
    throw new Error(`AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_PREFLIGHT_INVALID:${failures.join(",")}`);
  }
}

async function runpodRequest(url, apiKey, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
  if (!response.ok) {
    throw new Error(
      `AVANTIQO_MUSIC_SEPARATOR_RUNPOD_HTTP_${response.status}:${text(body?.error || body?.message || raw).slice(0, 1000)}`,
    );
  }
  return body;
}

async function cancelJob(endpointId, jobId, apiKey) {
  try {
    await runpodRequest(
      `${API_BASE}/${encodeURIComponent(endpointId)}/cancel/${encodeURIComponent(jobId)}`,
      apiKey,
      { method: "POST" },
    );
    console.log(`AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_JOB_CANCELLED=${jobId}`);
  } catch (error) {
    console.error(`AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_JOB_CANCEL_FAILED=${jobId}:${text(error?.message)}`);
  }
}

async function runJob(endpointId, payload, apiKey) {
  const started = performance.now();
  const submitted = await runpodRequest(
    `${API_BASE}/${encodeURIComponent(endpointId)}/run`,
    apiKey,
    { method: "POST", body: JSON.stringify({ input: payload }) },
  );
  const jobId = text(submitted?.id);
  if (!jobId) throw new Error("AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_JOB_ID_REQUIRED");
  console.log(`AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_JOB_ID=${jobId}`);

  const submittedAt = Date.now();
  let executionStartedAt = null;
  let lastStatus = "";
  while (true) {
    const body = await runpodRequest(
      `${API_BASE}/${encodeURIComponent(endpointId)}/status/${encodeURIComponent(jobId)}`,
      apiKey,
    );
    const status = text(body?.status).toUpperCase();
    const now = Date.now();
    if (status && status !== lastStatus) {
      console.log(`AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_STATUS=${status}`);
      lastStatus = status;
    }
    if (status === "IN_PROGRESS" && executionStartedAt === null) executionStartedAt = now;
    if (status === "COMPLETED") {
      return {
        body,
        job_id: jobId,
        wall_ms: Math.round(performance.now() - started),
        runpod_execution_ms: finite(body.executionTime ?? body.execution_time, null),
        runpod_delay_ms: finite(body.delayTime ?? body.delay_time, null),
      };
    }
    if (["FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(status)) {
      throw new Error(`AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_JOB_${status}:${text(body?.error || body?.output?.error || body?.message).slice(0, 1200)}`);
    }
    if (executionStartedAt === null && now - submittedAt > QUEUE_TIMEOUT_MS) {
      await cancelJob(endpointId, jobId, apiKey);
      throw new Error(`AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_QUEUE_TIMEOUT:${QUEUE_TIMEOUT_MS}`);
    }
    if (executionStartedAt !== null && now - executionStartedAt > EXECUTION_TIMEOUT_MS) {
      await cancelJob(endpointId, jobId, apiKey);
      throw new Error(`AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_EXECUTION_TIMEOUT:${EXECUTION_TIMEOUT_MS}`);
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

function validateWorkerOutput(output, expectedReferences) {
  const failures = [];
  if (output?.success !== true) failures.push("WORKER_SUCCESS_REQUIRED");
  if (text(output?.contract) !== ENGINE_CONTRACT) failures.push("ENGINE_CONTRACT_MISMATCH");
  if (text(output?.capability) !== CAPABILITY) failures.push("CAPABILITY_MISMATCH");
  if (text(output?.model) !== RUNTIME_MODEL) failures.push("RUNTIME_MODEL_MISMATCH");
  if (text(output?.demucs_model) !== DEMUCS_MODEL) failures.push("DEMUCS_MODEL_MISMATCH");
  if (text(output?.quality_profile) !== QUALITY_PROFILE) failures.push("QUALITY_PROFILE_MISMATCH");
  if (!finite(output?.source_duration_seconds, 0) || finite(output?.source_duration_seconds, 0) > 900) failures.push("SOURCE_DURATION_INVALID");
  if (!finite(output?.output_duration_seconds, 0)) failures.push("OUTPUT_DURATION_REQUIRED");
  if (!exactList(output?.stem_names, STEMS)) failures.push("FOUR_STEM_SET_MISMATCH");
  if (!exactList(output?.backing_track_stems, BACKING_STEMS)) failures.push("BACKING_STEM_SET_MISMATCH");
  const references = output?.storage_references || {};
  for (const [key, expected] of Object.entries(expectedReferences)) {
    if (text(references[key]) !== expected) failures.push(`STORAGE_REFERENCE_MISMATCH:${key}`);
  }
  if (failures.length) {
    throw new Error(`AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_WORKER_OUTPUT_INVALID:${failures.join(",")}`);
  }
}

approved("AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_SPEND_APPROVED");
approved("AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_RIGHTS_APPROVED");

const readiness = runJsonScript("scripts/audit-avantiqo-music-separator-certification-readiness.mjs");
assertReadiness(readiness);
const preflight = runJsonScript("scripts/preflight-avantiqo-music-separator-runpod-local.mjs");
assertPreflight(preflight);

const apiKey = required("RUNPOD_API_KEY");
const endpointId = text(process.env.RUNPOD_AVANTIQO_MUSIC_SEPARATOR_ENDPOINT_ID) || text(preflight?.separator_endpoint?.id);
if (!endpointId) throw new Error("RUNPOD_AVANTIQO_MUSIC_SEPARATOR_ENDPOINT_ID_REQUIRED");
const safeLease = assertSafeLease(endpointId);
const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
const sourceFile = resolve(required("AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_SOURCE_FILE"));
const sourceStat = await stat(sourceFile);
if (!sourceStat.isFile() || sourceStat.size <= 0 || sourceStat.size > 629145600) {
  throw new Error("AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_SOURCE_FILE_INVALID");
}
const extension = extname(sourceFile).toLowerCase();
const sourceMime = MIME_BY_EXTENSION[extension];
if (!sourceMime) throw new Error(`AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_SOURCE_EXTENSION_INVALID:${extension || "MISSING"}`);
const sourceBytes = await readFile(sourceFile);
const benchmarkId = safe(`separator-${new Date().toISOString()}-${crypto.randomUUID().slice(0, 8)}`);
const organizationId = `benchmark-${crypto.randomUUID()}`;
const usageId = `${benchmarkId}-1`;
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const sourcePath = `${organizationId}/benchmark/avantiqo-music-separator/${benchmarkId}/source-${safe(basename(sourceFile), "source")}${extension}`;
const { error: sourceUploadError } = await supabase.storage
  .from(STORAGE_BUCKET)
  .upload(sourcePath, sourceBytes, { contentType: sourceMime, upsert: false });
if (sourceUploadError) throw sourceUploadError;
const { data: sourceRead, error: sourceReadError } = await supabase.storage
  .from(STORAGE_BUCKET)
  .createSignedUrl(sourcePath, 60 * 60);
if (sourceReadError) throw sourceReadError;
if (!sourceRead?.signedUrl) throw new Error("AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_SOURCE_SIGNED_URL_REQUIRED");

const outputUploads = {};
const expectedReferences = {};
for (const [key, filename] of Object.entries(OUTPUTS)) {
  const path = `${organizationId}/benchmark/avantiqo-music-separator/${benchmarkId}/${filename}`;
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUploadUrl(path, { upsert: false });
  if (error) throw error;
  if (!data?.signedUrl) throw new Error(`AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_OUTPUT_SIGNED_URL_REQUIRED:${key}`);
  const storageReference = `storage://${STORAGE_BUCKET}/${path}`;
  outputUploads[key] = { signed_url: data.signedUrl, storage_reference: storageReference };
  expectedReferences[key] = storageReference;
}

const job = await runJob(endpointId, {
  contract: ENGINE_CONTRACT,
  capability: CAPABILITY,
  model: RUNTIME_MODEL,
  quality_profile: QUALITY_PROFILE,
  source_audio: sourceRead.signedUrl,
  rights_attestation: {
    contract: RIGHTS_CONTRACT,
    confirmed: true,
    content_restriction_policy: CONTENT_POLICY,
  },
  processing: {
    remove_vocals: true,
    preserve_arrangement: true,
    key_shift_semitones: 0,
    tempo_ratio: 1,
    count_in_bars: 0,
    export_stems: true,
    vocal_cleanup_required: true,
  },
  output_spec: {
    format: "wav",
    sample_rate: 44100,
    channels: 2,
    stems: STEMS,
    backing_track: true,
    backing_track_stems: BACKING_STEMS,
  },
  output_uploads: outputUploads,
  organization_id: organizationId,
  usage_id: usageId,
}, apiKey);

const workerOutput = job.body?.output || {};
validateWorkerOutput(workerOutput, expectedReferences);
const sourceDuration = finite(workerOutput.source_duration_seconds, null);
const executionMs = finite(job.runpod_execution_ms, job.wall_ms);
const realtimeFactor = sourceDuration && executionMs
  ? Number(((executionMs / 1000) / sourceDuration).toFixed(6))
  : null;

const observation = {
  run: 1,
  passed: true,
  runpod_job_id: job.job_id,
  runpod_execution_ms: job.runpod_execution_ms,
  runpod_delay_ms: job.runpod_delay_ms,
  wall_ms: job.wall_ms,
  source_duration_seconds: sourceDuration,
  output_duration_seconds: finite(workerOutput.output_duration_seconds, null),
  source_bytes: finite(workerOutput.source_bytes, sourceStat.size),
  realtime_factor: realtimeFactor,
  stem_names: workerOutput.stem_names,
  backing_track_stems: workerOutput.backing_track_stems,
  source_storage_reference: `storage://${STORAGE_BUCKET}/${sourcePath}`,
  storage_references: workerOutput.storage_references,
  quality_profile: QUALITY_PROFILE,
};

const report = {
  success: true,
  contract: CONTRACT,
  generated_at: new Date().toISOString(),
  benchmark_id: benchmarkId,
  provider: "avantiqo-audio",
  capability: CAPABILITY,
  catalog_model: CATALOG_MODEL,
  runtime_model: RUNTIME_MODEL,
  demucs_model: DEMUCS_MODEL,
  quality_profile: QUALITY_PROFILE,
  immutable_image_reference: readiness.immutable_image_reference || preflight?.image?.immutable_image_reference || null,
  prerequisite_evidence: {
    readiness_contract: READINESS_CONTRACT,
    readiness_passed: true,
    preflight_contract: PREFLIGHT_CONTRACT,
    preflight_passed: true,
    separator_endpoint_id: endpointId,
    endpoint_gpu_type_ids: preflight?.separator_endpoint?.gpu_type_ids || [],
    safe_lease: safeLease,
  },
  rights_attestation: {
    contract: RIGHTS_CONTRACT,
    confirmed: true,
    source_scope: "OPERATOR_APPROVED_BENCHMARK_SOURCE_ONLY",
    content_restriction_policy: CONTENT_POLICY,
  },
  observations: [observation],
  summary: {
    passed: true,
    runs: 1,
    source_duration_seconds: sourceDuration,
    runpod_execution_ms: job.runpod_execution_ms,
    runpod_delay_ms: job.runpod_delay_ms,
    wall_ms: job.wall_ms,
    realtime_factor: realtimeFactor,
    required_outputs_present: Object.keys(OUTPUTS).every((key) => Boolean(workerOutput?.storage_references?.[key])),
    four_stem_contract_passed: exactList(workerOutput.stem_names, STEMS),
    backing_track_contract_passed: exactList(workerOutput.backing_track_stems, BACKING_STEMS),
  },
  certification: {
    runtime_benchmark_passed: true,
    economics_measured: false,
    human_quality_certified: false,
    production_certified: false,
    next_gate: "SEPARATOR_ECONOMICS_AND_HUMAN_QUALITY_REQUIRED",
  },
  safety: {
    explicit_spend_approval_required: true,
    explicit_rights_approval_required: true,
    safe_lease_required: true,
    provider_job_submitted: true,
    database_rows_written: 0,
    endpoint_mutation_performed: false,
    pricing_activation_performed: false,
    provider_certification_mutation_performed: false,
    production_deploy_performed: false,
    automatic_activation_forbidden: true,
  },
};

await writeFile(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  success: true,
  output_path: OUTPUT,
  contract: CONTRACT,
  benchmark_id: benchmarkId,
  runpod_job_id: job.job_id,
  safe_lease_contract: safeLease.contract,
  safe_lease_lane: safeLease.lane,
  source_duration_seconds: sourceDuration,
  realtime_factor: realtimeFactor,
  runtime_benchmark_passed: true,
  economics_measured: false,
  human_quality_certified: false,
  production_certified: false,
  pricing_activation_performed: false,
  production_deploy_performed: false,
}, null, 2));
