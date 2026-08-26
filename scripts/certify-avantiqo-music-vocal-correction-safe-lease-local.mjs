#!/usr/bin/env node

import { readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const CONTRACT = "AVANTIQO_MUSIC_VOCAL_CORRECTION_SAFE_LEASE_CERTIFICATION_V1";
const ENGINE_CONTRACT = "AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_V2";
const REPORT_CONTRACT = "AVANTIQO_MUSIC_VOCAL_CORRECTION_REPORT_V2";
const QUALITY_PROFILE = "TORCHCREPE_SIGNALSMITH_VOCAL_CORRECTION_V2";
const CAPABILITY = "ai.audio.vocal-correct";
const MODEL = "torchcrepe-full";
const RIGHTS_CONTRACT = "AVANTIQO_SOURCE_AUDIO_RIGHTS_ATTESTATION_V1";
const CONTENT_POLICY = "USER_RIGHTS_ATTESTATION_ONLY";
const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const SAFE_LEASE_LANE = "music-vocal-correction";
const STORAGE_BUCKET = "creative-assets";
const API_BASE = "https://api.runpod.ai/v2";
const POLL_MS = 5_000;
const QUEUE_TIMEOUT_MS = 8 * 60 * 1000;
const EXECUTION_TIMEOUT_MS = 20 * 60 * 1000;
const OUTPUT = resolve(
  process.env.AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_OUTPUT ||
    "/tmp/avantiqo-music-vocal-correction-certification.json",
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
    throw new Error(`${name}=YES_REQUIRED`);
  }
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function safeId(value, fallback = "music-vocal-correction-certification") {
  return text(value || fallback)
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || fallback;
}

function assertLease() {
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE).toUpperCase() !== "YES") {
    throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_SAFE_LEASE_ACTIVE_REQUIRED");
  }
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT) !== SAFE_LEASE_CONTRACT) {
    throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_SAFE_LEASE_CONTRACT_INVALID");
  }
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_LANE) !== SAFE_LEASE_LANE) {
    throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_SAFE_LEASE_LANE_INVALID");
  }
  const endpointId = required("AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID");
  const expiresAt = Date.parse(required("AVANTIQO_RUNPOD_SAFE_LEASE_EXPIRES_AT"));
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_SAFE_LEASE_EXPIRED");
  }
  return { endpointId, expiresAt };
}

async function runpodRequest(endpointId, pathname, apiKey, options = {}) {
  const response = await fetch(`${API_BASE}/${encodeURIComponent(endpointId)}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
  if (!response.ok) {
    throw new Error(`AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_RUNPOD_HTTP_${response.status}:${text(body?.error || body?.message || raw).slice(0, 800)}`);
  }
  return body;
}

async function cancelJob(endpointId, jobId, apiKey) {
  try {
    await runpodRequest(endpointId, `/cancel/${encodeURIComponent(jobId)}`, apiKey, { method: "POST" });
  } catch {}
}

async function runOneJob(endpointId, payload, apiKey, leaseExpiresAt) {
  const submitted = await runpodRequest(endpointId, "/run", apiKey, {
    method: "POST",
    body: { input: payload },
  });
  const jobId = text(submitted?.id || submitted?.job_id || submitted?.jobId);
  if (!jobId) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_JOB_ID_REQUIRED");

  const submittedAt = Date.now();
  let executionStartedAt = null;
  let lastStatus = "";
  while (true) {
    if (Date.now() >= leaseExpiresAt - 10_000) {
      await cancelJob(endpointId, jobId, apiKey);
      throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_LEASE_EXPIRY_GUARD");
    }
    const body = await runpodRequest(endpointId, `/status/${encodeURIComponent(jobId)}`, apiKey);
    const status = text(body?.status).toUpperCase();
    if (status && status !== lastStatus) {
      console.log(`AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_STATUS=${status}`);
      lastStatus = status;
    }
    if (status === "IN_PROGRESS" && executionStartedAt === null) executionStartedAt = Date.now();
    if (status === "COMPLETED") return { jobId, body };
    if (["FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(status)) {
      throw new Error(`AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_JOB_${status}:${text(body?.error || body?.output?.error).slice(0, 1000)}`);
    }
    if (executionStartedAt === null && Date.now() - submittedAt > QUEUE_TIMEOUT_MS) {
      await cancelJob(endpointId, jobId, apiKey);
      throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_QUEUE_TIMEOUT");
    }
    if (executionStartedAt !== null && Date.now() - executionStartedAt > EXECUTION_TIMEOUT_MS) {
      await cancelJob(endpointId, jobId, apiKey);
      throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_EXECUTION_TIMEOUT");
    }
    await sleep(POLL_MS);
  }
}

async function main() {
  approved("AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_SPEND_APPROVED");
  approved("AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_RIGHTS_APPROVED");
  const lease = assertLease();
  const apiKey = required("RUNPOD_API_KEY");
  const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
  const sourceFile = resolve(required("AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_SOURCE_FILE"));
  const sourceInfo = await stat(sourceFile);
  if (!sourceInfo.isFile() || sourceInfo.size <= 0 || sourceInfo.size > 100 * 1024 * 1024) {
    throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_SOURCE_FILE_INVALID");
  }

  const bpm = finite(process.env.AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_BPM, 120);
  if (!Number.isFinite(bpm) || bpm < 30 || bpm > 300) {
    throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_BPM_INVALID");
  }
  const key = text(process.env.AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_KEY || "Am");
  const runKey = safeId(`${Date.now()}-${process.env.GITHUB_RUN_ID || process.pid}`);
  const root = `certification/music-vocal-correction/${runKey}`;
  const sourcePath = `${root}/source-rights-owned.wav`;
  const correctedPath = `${root}/corrected-vocal.wav`;
  const reportPath = `${root}/correction-report.json`;

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const sourceBytes = await readFile(sourceFile);
  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(sourcePath, sourceBytes, { contentType: "audio/wav", upsert: false });
  if (uploadError) throw uploadError;
  const { data: signedSource, error: signedSourceError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(sourcePath, 30 * 60);
  if (signedSourceError || !signedSource?.signedUrl) {
    throw signedSourceError || new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_SIGNED_SOURCE_REQUIRED");
  }

  const outputUploads = {};
  for (const [keyName, path] of Object.entries({
    corrected_vocal_wav: correctedPath,
    correction_report_json: reportPath,
  })) {
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUploadUrl(path, { upsert: false });
    if (error || !data?.signedUrl) {
      throw error || new Error(`AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_SIGNED_UPLOAD_REQUIRED:${keyName}`);
    }
    outputUploads[keyName] = {
      signed_url: data.signedUrl,
      storage_reference: `storage://${STORAGE_BUCKET}/${path}`,
    };
  }

  const payload = {
    contract: ENGINE_CONTRACT,
    capability: CAPABILITY,
    model: MODEL,
    quality_profile: QUALITY_PROFILE,
    source_audio: signedSource.signedUrl,
    rights_attestation: {
      contract: RIGHTS_CONTRACT,
      confirmed: true,
      content_restriction_policy: CONTENT_POLICY,
    },
    correction: {
      source_role: "isolated_vocal",
      key,
      bpm,
      beat_offset_seconds: 0,
      pitch_strength: 0.72,
      timing_strength: 0.45,
      max_pitch_shift_cents: 160,
      max_timing_shift_ms: 80,
      snap_threshold_cents: 24,
      preserve_vibrato: true,
      preserve_formants: true,
    },
    output_uploads: outputUploads,
    certification: {
      contract: CONTRACT,
      synthetic_rights_owned_fixture: true,
      safe_lease_contract: SAFE_LEASE_CONTRACT,
      safe_lease_lane: SAFE_LEASE_LANE,
      human_listening_review_required: true,
    },
  };

  const { jobId, body } = await runOneJob(lease.endpointId, payload, apiKey, lease.expiresAt);
  const worker = body?.output || {};
  if (worker?.success !== true) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_WORKER_SUCCESS_REQUIRED");
  if (text(worker?.contract) !== ENGINE_CONTRACT) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_ENGINE_CONTRACT_MISMATCH");
  if (text(worker?.capability) !== CAPABILITY) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_CAPABILITY_MISMATCH");
  if (text(worker?.quality_profile) !== QUALITY_PROFILE) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_PROFILE_MISMATCH");
  if (worker?.production_certified !== false) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_WORKER_MUST_REMAIN_UNCERTIFIED");
  const report = worker?.report || {};
  if (text(report?.contract) !== REPORT_CONTRACT) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_REPORT_CONTRACT_MISMATCH");
  if (report?.readiness?.pitch_correction_complete !== true) throw new Error(`AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_PITCH_NOT_COMPLETE:${text(report?.readiness?.pitch_status)}`);
  if (report?.readiness?.phrase_timing_correction_complete !== true) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_TIMING_NOT_COMPLETE");
  if (report?.readiness?.correction_pipeline_complete !== true) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_PIPELINE_NOT_COMPLETE");
  if (report?.readiness?.human_listening_review_required_for_certification !== true) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_HUMAN_REVIEW_REQUIRED");
  if (report?.readiness?.production_certified !== false) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_REPORT_MUST_REMAIN_UNCERTIFIED");
  if (report?.pitch?.formant_compensation_explicitly_configured !== false || report?.pitch?.formant_preservation_claimed !== false) {
    throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_FORMANT_CLAIM_INVALID");
  }

  const result = {
    success: true,
    contract: CONTRACT,
    engine_contract: ENGINE_CONTRACT,
    quality_profile: QUALITY_PROFILE,
    capability: CAPABILITY,
    model: MODEL,
    job_id: jobId,
    job_count_submitted: 1,
    safe_lease: {
      contract: SAFE_LEASE_CONTRACT,
      lane: SAFE_LEASE_LANE,
      endpoint_id: lease.endpointId,
      expires_at: new Date(lease.expiresAt).toISOString(),
    },
    fixture: {
      synthetic_rights_owned: true,
      source_bytes: sourceInfo.size,
      key,
      bpm,
      storage_reference: `storage://${STORAGE_BUCKET}/${sourcePath}`,
    },
    technical: {
      pitch_status: report.readiness.pitch_status,
      pitch_correction_complete: true,
      phrase_timing_correction_complete: true,
      correction_pipeline_complete: true,
      voiced_frame_ratio: report.voiced_frame_ratio ?? null,
      pitch_event_count: report.pitch?.event_count ?? null,
      pitch_applied_event_count: report.pitch?.render?.applied_event_count ?? null,
      timing_status: report.timing?.status ?? null,
      timing_applied_phrase_count: report.timing?.applied_phrase_count ?? null,
      formant_compensation_explicitly_configured: false,
      formant_preservation_claimed: false,
    },
    outputs: {
      corrected_vocal_wav: outputUploads.corrected_vocal_wav.storage_reference,
      correction_report_json: outputUploads.correction_report_json.storage_reference,
    },
    human_review: {
      required: true,
      status: "PENDING",
      automatic_approval_forbidden: true,
      criteria: [
        "pitch_naturalness",
        "vibrato_preservation",
        "timbre_and_formant_naturalness",
        "consonant_and_transient_integrity",
        "artifact_control",
        "timing_naturalness",
        "emotional_phrasing_preservation",
        "before_after_improvement",
        "commercial_readiness",
      ],
    },
    production_certified: false,
    production_activation_allowed: false,
    provider_job_submitted: true,
    provider_job_count: 1,
    endpoint_management_performed_by_child: false,
    direct_workers_max_write_performed_by_child: false,
    production_deploy_performed: false,
    pricing_activation_performed: false,
    secrets_in_output: false,
  };
  await writeFile(OUTPUT, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(result, null, 2));
}

main().catch(async (error) => {
  const failure = {
    success: false,
    contract: CONTRACT,
    error: text(error?.message || error).slice(0, 1800),
    production_certified: false,
    production_activation_allowed: false,
    endpoint_management_performed_by_child: false,
    direct_workers_max_write_performed_by_child: false,
    production_deploy_performed: false,
    pricing_activation_performed: false,
    secrets_in_output: false,
  };
  await writeFile(OUTPUT, `${JSON.stringify(failure, null, 2)}\n`, "utf8").catch(() => {});
  console.error(JSON.stringify(failure, null, 2));
  process.exitCode = 1;
});
