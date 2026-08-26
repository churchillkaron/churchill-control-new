#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_V1";
const ENGINE_CONTRACT = "AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_V2";
const QUALITY_PROFILE = "TORCHCREPE_SIGNALSMITH_VOCAL_CORRECTION_V2";
const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const SAFE_LEASE_LANE = "music-vocal-correction";
const RIGHTS_CONTRACT = "AVANTIQO_SOURCE_AUDIO_RIGHTS_ATTESTATION_V1";
const CONTENT_POLICY = "USER_RIGHTS_ATTESTATION_ONLY";
const OUTPUT_BUCKET = "creative-assets";
const API_BASE = "https://api.runpod.ai/v2";
const DEFAULT_OUTPUT = "/tmp/avantiqo-music-vocal-correction-certification.json";

const text = (value) => String(value ?? "").trim();
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const approved = (value) => text(value).toUpperCase() === "YES";

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function assertLease() {
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE).toUpperCase() !== "YES") {
    throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_CERT_SAFE_LEASE_REQUIRED");
  }
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT) !== SAFE_LEASE_CONTRACT) {
    throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_CERT_SAFE_LEASE_CONTRACT_INVALID");
  }
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_LANE) !== SAFE_LEASE_LANE) {
    throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_CERT_SAFE_LEASE_LANE_INVALID");
  }
  const endpointId = text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID);
  if (!endpointId) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_CERT_ENDPOINT_ID_REQUIRED");
  return endpointId;
}

async function json(url, apiKey, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  const raw = await response.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = { message: raw }; }
  if (!response.ok) {
    throw new Error(`AVANTIQO_MUSIC_VOCAL_CORRECTION_CERT_HTTP_${response.status}:${text(body?.error || body?.message || raw).slice(0, 800)}`);
  }
  return body;
}

async function sourceSignedUrl({ supabase, organizationId, sourceReference }) {
  const prefix = `storage://${OUTPUT_BUCKET}/`;
  if (!sourceReference.startsWith(prefix)) {
    throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_CERT_STORAGE_SOURCE_REQUIRED");
  }
  const path = sourceReference.slice(prefix.length);
  if (!path.startsWith(`${organizationId}/`)) {
    throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_CERT_ORGANIZATION_SCOPE_MISMATCH");
  }
  const { data, error } = await supabase.storage.from(OUTPUT_BUCKET).createSignedUrl(path, 900);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_CERT_SIGNED_SOURCE_REQUIRED");
  return data.signedUrl;
}

async function uploadTargets({ supabase, organizationId, runId }) {
  const base = `${organizationId}/certification/music-vocal-correction/${runId}`;
  const files = {
    corrected_vocal_wav: `${base}/corrected-vocal.wav`,
    correction_report_json: `${base}/correction-report.json`,
  };
  const output = {};
  for (const [key, path] of Object.entries(files)) {
    const { data, error } = await supabase.storage.from(OUTPUT_BUCKET).createSignedUploadUrl(path, { upsert: false });
    if (error) throw error;
    if (!data?.signedUrl) throw new Error(`AVANTIQO_MUSIC_VOCAL_CORRECTION_CERT_UPLOAD_TARGET_REQUIRED:${key}`);
    output[key] = {
      signed_url: data.signedUrl,
      storage_reference: `storage://${OUTPUT_BUCKET}/${path}`,
    };
  }
  return output;
}

async function waitForJob(endpointId, jobId, apiKey, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let latest = null;
  while (Date.now() < deadline) {
    latest = await json(`${API_BASE}/${encodeURIComponent(endpointId)}/status/${encodeURIComponent(jobId)}`, apiKey, { timeoutMs: 30_000 });
    const status = text(latest?.status).toUpperCase();
    if (["COMPLETED", "FAILED", "CANCELLED", "CANCELED", "TIMED_OUT"].includes(status)) return latest;
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error(`AVANTIQO_MUSIC_VOCAL_CORRECTION_CERT_TIMEOUT:${text(latest?.status) || "UNKNOWN"}`);
}

if (!approved(process.env.AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_SPEND_APPROVED)) {
  throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_SPEND_APPROVED=YES_REQUIRED");
}
if (!approved(process.env.AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_RIGHTS_APPROVED)) {
  throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_RIGHTS_APPROVED=YES_REQUIRED");
}
const endpointId = assertLease();
const apiKey = required("RUNPOD_API_KEY");
const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
const organizationId = required("AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_ORGANIZATION_ID");
const sourceReference = required("AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_SOURCE_STORAGE_REFERENCE");
const bpm = finite(required("AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_BPM"), null);
if (!bpm || bpm < 30 || bpm > 300) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_BPM_INVALID");
const key = text(process.env.AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_KEY) || null;
const outputPath = text(process.env.AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_OUTPUT) || DEFAULT_OUTPUT;
const runId = `vocal-correction-${Date.now()}`;
const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const sourceAudio = await sourceSignedUrl({ supabase, organizationId, sourceReference });
const outputs = await uploadTargets({ supabase, organizationId, runId });

const input = {
  contract: ENGINE_CONTRACT,
  capability: "ai.audio.vocal-correct",
  model: "torchcrepe-full",
  quality_profile: QUALITY_PROFILE,
  source_audio: sourceAudio,
  rights_attestation: {
    contract: RIGHTS_CONTRACT,
    confirmed: true,
    content_restriction_policy: CONTENT_POLICY,
  },
  correction: {
    source_role: "isolated_vocal",
    bpm,
    ...(key ? { key } : {}),
    pitch_strength: 0.72,
    timing_strength: 0.45,
    max_pitch_shift_cents: 160,
    max_timing_shift_ms: 80,
    snap_threshold_cents: 24,
    preserve_vibrato: true,
    preserve_formants: true,
  },
  output_uploads: outputs,
  organization_id: organizationId,
  certification_run_id: runId,
};

const submitted = await json(`${API_BASE}/${encodeURIComponent(endpointId)}/run`, apiKey, {
  method: "POST",
  body: { input },
  timeoutMs: 30_000,
});
const jobId = text(submitted?.id || submitted?.job_id || submitted?.jobId);
if (!jobId) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_CERT_JOB_ID_REQUIRED");
console.log(`AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_JOB_ID=${jobId}`);

const terminal = await waitForJob(endpointId, jobId, apiKey, 25 * 60 * 1000);
const status = text(terminal?.status).toUpperCase();
if (status !== "COMPLETED") {
  throw new Error(`AVANTIQO_MUSIC_VOCAL_CORRECTION_CERT_JOB_FAILED:${status}:${text(terminal?.error || terminal?.output?.error).slice(0, 800)}`);
}
const result = terminal?.output || {};
if (result?.success !== true || text(result.contract) !== ENGINE_CONTRACT) {
  throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_CERT_OUTPUT_CONTRACT_INVALID");
}
const report = result?.report || {};
if (report?.readiness?.pitch_correction_complete !== true) {
  throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_CERT_PITCH_INCOMPLETE");
}
if (report?.readiness?.phrase_timing_correction_complete !== true) {
  throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_CERT_TIMING_INCOMPLETE");
}
if (report?.readiness?.human_listening_review_required_for_certification !== true) {
  throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_CERT_HUMAN_REVIEW_GATE_MISSING");
}
if (result?.production_certified === true) {
  throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_CERT_WORKER_SELF_CERTIFICATION_FORBIDDEN");
}

const evidence = {
  success: true,
  contract: CONTRACT,
  engine_contract: ENGINE_CONTRACT,
  quality_profile: QUALITY_PROFILE,
  run_id: runId,
  endpoint_id: endpointId,
  safe_lease_contract: SAFE_LEASE_CONTRACT,
  safe_lease_lane: SAFE_LEASE_LANE,
  provider_job_submitted: true,
  provider_job_count: 1,
  job_id: jobId,
  source_file_name: basename(sourceReference),
  source_storage_reference: sourceReference,
  rights_attestation_contract: RIGHTS_CONTRACT,
  content_restriction_policy: CONTENT_POLICY,
  corrected_vocal_storage_reference: text(result.corrected_vocal_wav) || outputs.corrected_vocal_wav.storage_reference,
  correction_report_storage_reference: text(result.correction_report_json) || outputs.correction_report_json.storage_reference,
  technical: {
    pitch_correction_complete: true,
    phrase_timing_correction_complete: true,
    phrase_timing_applied: report?.timing?.applied === true,
    applied_phrase_count: finite(report?.timing?.applied_phrase_count, 0),
    pitch_event_count: finite(report?.pitch?.event_count, 0),
    human_listening_review_required: true,
  },
  production_certified: false,
  human_listening_review_complete: false,
  pricing_activation_performed: false,
  production_deploy_performed: false,
  endpoint_mutation_performed_by_child: false,
  secrets_printed: false,
};
await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
console.log(JSON.stringify(evidence, null, 2));
console.log(`${CONTRACT}=TECHNICAL_PASS_HUMAN_REVIEW_REQUIRED`);
