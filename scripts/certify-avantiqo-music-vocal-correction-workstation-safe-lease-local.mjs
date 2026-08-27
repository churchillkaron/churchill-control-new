#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const CONTRACT = "AVANTIQO_MUSIC_VOCAL_CORRECTION_WORKSTATION_CERTIFICATION_V2";
const ENGINE_CONTRACT = "AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_V2";
const REPORT_CONTRACT = "AVANTIQO_MUSIC_VOCAL_CORRECTION_REPORT_V2";
const TUNING_PLAN_CONTRACT = "AVANTIQO_MUSIC_VOCAL_TUNING_PLAN_V1";
const TIMING_PLAN_CONTRACT = "AVANTIQO_MUSIC_VOCAL_TIMING_PLAN_V1";
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
  process.env.AVANTIQO_MUSIC_VOCAL_CORRECTION_WORKSTATION_CERTIFICATION_OUTPUT ||
    "/tmp/avantiqo-music-vocal-correction-workstation-certification.json",
);

function text(value) { return String(value ?? "").trim(); }
function finite(value, fallback = null) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function required(name) { const value = text(process.env[name]); if (!value) throw new Error(`${name}_REQUIRED`); return value; }
function approved(name) { if (text(process.env[name]).toUpperCase() !== "YES") throw new Error(`${name}=YES_REQUIRED`); }
function sleep(ms) { return new Promise((resolvePromise) => setTimeout(resolvePromise, ms)); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function fingerprint(value) { return createHash("sha256").update(canonical(value)).digest("hex"); }
function checksum(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function safeId(value, fallback = "music-vocal-correction-workstation-certification") {
  return text(value || fallback).replace(/[^A-Za-z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || fallback;
}

function assertLease() {
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE).toUpperCase() !== "YES") throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_WORKSTATION_CERT_SAFE_LEASE_ACTIVE_REQUIRED");
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT) !== SAFE_LEASE_CONTRACT) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_WORKSTATION_CERT_SAFE_LEASE_CONTRACT_INVALID");
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_LANE) !== SAFE_LEASE_LANE) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_WORKSTATION_CERT_SAFE_LEASE_LANE_INVALID");
  const endpointId = required("AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID");
  const expiresAt = Date.parse(required("AVANTIQO_RUNPOD_SAFE_LEASE_EXPIRES_AT"));
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_WORKSTATION_CERT_SAFE_LEASE_EXPIRED");
  return { endpointId, expiresAt };
}

function validateTuningPlan(plan, sourceChecksum) {
  if (plan.contract !== TUNING_PLAN_CONTRACT) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_WORKSTATION_CERT_TUNING_PLAN_CONTRACT_INVALID");
  if (plan.auto_apply_forbidden !== true || plan.musician_approval_required !== true || plan.all_segments_reviewed !== true) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_WORKSTATION_CERT_TUNING_PLAN_REVIEW_REQUIRED");
  if (text(plan.source_checksum) !== sourceChecksum) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_WORKSTATION_CERT_TUNING_PLAN_CHECKSUM_MISMATCH");
  const unapproved = (Array.isArray(plan.segments) ? plan.segments : []).filter((segment) => Math.abs(finite(segment?.proposed_correction_cents, 0)) > 0.01 && segment?.approved !== true);
  if (unapproved.length) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_WORKSTATION_CERT_TUNING_PLAN_UNAPPROVED_SEGMENTS");
}

function validateTimingPlan(plan, tuningPlan, sourceChecksum) {
  if (plan.contract !== TIMING_PLAN_CONTRACT) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_WORKSTATION_CERT_TIMING_PLAN_CONTRACT_INVALID");
  if (plan.auto_apply_forbidden !== true || plan.musician_approval_required !== true || plan.all_phrases_reviewed !== true) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_WORKSTATION_CERT_TIMING_PLAN_REVIEW_REQUIRED");
  if (plan.whole_phrase_translation_only !== true || plan.time_stretch_used === true || plan.syllable_warp_forbidden !== true) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_WORKSTATION_CERT_TIMING_PLAN_NON_STRETCH_REQUIRED");
  if (text(plan.source_checksum) !== sourceChecksum) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_WORKSTATION_CERT_TIMING_PLAN_CHECKSUM_MISMATCH");
  if (text(plan.source_asset_id) !== text(tuningPlan.source_asset_id)) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_WORKSTATION_CERT_PLAN_SOURCE_ASSET_MISMATCH");
  if (Math.abs(finite(plan.source_offset_seconds, -1) - finite(tuningPlan.source_offset_seconds, -2)) > 0.001) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_WORKSTATION_CERT_PLAN_SOURCE_OFFSET_MISMATCH");
  if (Math.abs(finite(plan.source_duration_seconds, -1) - finite(tuningPlan.source_duration_seconds, -2)) > 0.01) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_WORKSTATION_CERT_PLAN_SOURCE_DURATION_MISMATCH");
  const unapproved = (Array.isArray(plan.phrases) ? plan.phrases : []).filter((phrase) => Math.abs(finite(phrase?.proposed_shift_ms, 0)) > 0.1 && phrase?.approved !== true);
  if (unapproved.length) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_WORKSTATION_CERT_TIMING_PLAN_UNAPPROVED_PHRASES");
}

async function runpodRequest(endpointId, pathname, apiKey, options = {}) {
  const response = await fetch(`${API_BASE}/${encodeURIComponent(endpointId)}${pathname}`, {
    method: options.method || "GET",
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
  if (!response.ok) throw new Error(`AVANTIQO_MUSIC_VOCAL_CORRECTION_WORKSTATION_CERT_RUNPOD_HTTP_${response.status}:${text(body?.error || body?.message || raw).slice(0, 800)}`);
  return body;
}

async function cancelJob(endpointId, jobId, apiKey) {
  try { await runpodRequest(endpointId, `/cancel/${encodeURIComponent(jobId)}`, apiKey, { method: "POST" }); } catch {}
}

async function runOneJob(endpointId, payload, apiKey, leaseExpiresAt) {
  const submitted = await runpodRequest(endpointId, "/run", apiKey, { method: "POST", body: { input: payload } });
  const jobId = text(submitted?.id || submitted?.job_id || submitted?.jobId);
  if (!jobId) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_WORKSTATION_CERT_JOB_ID_REQUIRED");
  const submittedAt = Date.now();
  let executionStartedAt = null;
  while (true) {
    if (Date.now() >= leaseExpiresAt - 10_000) {
      await cancelJob(endpointId, jobId, apiKey);
      throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_WORKSTATION_CERT_LEASE_EXPIRY_GUARD");
    }
    const body = await runpodRequest(endpointId, `/status/${encodeURIComponent(jobId)}`, apiKey);
    const status = text(body?.status).toUpperCase();
    if (status === "IN_PROGRESS" && executionStartedAt === null) executionStartedAt = Date.now();
    if (status === "COMPLETED") return { jobId, body };
    if (["FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(status)) throw new Error(`AVANTIQO_MUSIC_VOCAL_CORRECTION_WORKSTATION_CERT_JOB_${status}:${text(body?.error || body?.output?.error).slice(0, 1000)}`);
    if (executionStartedAt === null && Date.now() - submittedAt > QUEUE_TIMEOUT_MS) {
      await cancelJob(endpointId, jobId, apiKey);
      throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_WORKSTATION_CERT_QUEUE_TIMEOUT");
    }
    if (executionStartedAt !== null && Date.now() - executionStartedAt > EXECUTION_TIMEOUT_MS) {
      await cancelJob(endpointId, jobId, apiKey);
      throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_WORKSTATION_CERT_EXECUTION_TIMEOUT");
    }
    await sleep(POLL_MS);
  }
}

async function main() {
  approved("AVANTIQO_MUSIC_VOCAL_CORRECTION_WORKSTATION_CERTIFICATION_SPEND_APPROVED");
  approved("AVANTIQO_MUSIC_VOCAL_CORRECTION_WORKSTATION_CERTIFICATION_RIGHTS_APPROVED");
  const lease = assertLease();
  const apiKey = required("RUNPOD_API_KEY");
  const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
  const sourceFile = resolve(required("AVANTIQO_MUSIC_VOCAL_CORRECTION_WORKSTATION_CERTIFICATION_SOURCE_FILE"));
  const tuningPlanFile = resolve(required("AVANTIQO_MUSIC_VOCAL_CORRECTION_WORKSTATION_CERTIFICATION_TUNING_PLAN_FILE"));
  const timingPlanFile = resolve(required("AVANTIQO_MUSIC_VOCAL_CORRECTION_WORKSTATION_CERTIFICATION_TIMING_PLAN_FILE"));
  const sourceInfo = await stat(sourceFile);
  if (!sourceInfo.isFile() || sourceInfo.size <= 0 || sourceInfo.size > 100 * 1024 * 1024) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_WORKSTATION_CERT_SOURCE_FILE_INVALID");
  const sourceBytes = await readFile(sourceFile);
  const sourceChecksum = checksum(sourceBytes);
  const tuningPlan = JSON.parse(await readFile(tuningPlanFile, "utf8"));
  const timingPlan = JSON.parse(await readFile(timingPlanFile, "utf8"));
  validateTuningPlan(tuningPlan, sourceChecksum);
  validateTimingPlan(timingPlan, tuningPlan, sourceChecksum);

  const sourceDuration = finite(tuningPlan.source_duration_seconds, null);
  const sourceOffset = finite(tuningPlan.source_offset_seconds, 0);
  if (!sourceDuration || sourceDuration <= 0 || sourceDuration > 900) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_WORKSTATION_CERT_SOURCE_DURATION_INVALID");
  const sourceAssetId = text(tuningPlan.source_asset_id);
  if (!sourceAssetId) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_WORKSTATION_CERT_SOURCE_ASSET_ID_REQUIRED");

  const runKey = safeId(`${Date.now()}-${process.env.GITHUB_RUN_ID || process.pid}`);
  const root = `certification/music-vocal-correction-workstation/${runKey}`;
  const sourcePath = `${root}/source-rights-owned.wav`;
  const correctedPath = `${root}/corrected-vocal.wav`;
  const reportPath = `${root}/correction-report.json`;
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(sourcePath, sourceBytes, { contentType: "audio/wav", upsert: false });
  if (uploadError) throw uploadError;
  const { data: signedSource, error: signedSourceError } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(sourcePath, 30 * 60);
  if (signedSourceError || !signedSource?.signedUrl) throw signedSourceError || new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_WORKSTATION_CERT_SIGNED_SOURCE_REQUIRED");

  const outputUploads = {};
  for (const [keyName, path] of Object.entries({ corrected_vocal_wav: correctedPath, correction_report_json: reportPath })) {
    const { data, error } = await supabase.storage.from(STORAGE_BUCKET).createSignedUploadUrl(path, { upsert: false });
    if (error || !data?.signedUrl) throw error || new Error(`AVANTIQO_MUSIC_VOCAL_CORRECTION_WORKSTATION_CERT_SIGNED_UPLOAD_REQUIRED:${keyName}`);
    outputUploads[keyName] = { signed_url: data.signedUrl, storage_reference: `storage://${STORAGE_BUCKET}/${path}` };
  }

  const payload = {
    contract: ENGINE_CONTRACT,
    capability: CAPABILITY,
    model: MODEL,
    quality_profile: QUALITY_PROFILE,
    source_audio: signedSource.signedUrl,
    rights_attestation: { contract: RIGHTS_CONTRACT, confirmed: true, content_restriction_policy: CONTENT_POLICY },
    correction: {
      source_role: "isolated_vocal",
      key: `${text(tuningPlan.musical_key?.key)} ${text(tuningPlan.musical_key?.mode)}`.trim(),
      bpm: finite(timingPlan.bpm, finite(tuningPlan.bpm, 120)),
      beat_offset_seconds: 0,
      pitch_strength: finite(tuningPlan.settings?.correction_strength, 0.8),
      timing_strength: 0,
      max_pitch_shift_cents: finite(tuningPlan.settings?.max_correction_cents, 200),
      max_timing_shift_ms: finite(timingPlan.settings?.max_shift_ms, 80),
      snap_threshold_cents: finite(tuningPlan.settings?.preserve_within_cents, 10),
      preserve_vibrato: true,
      preserve_formants: true,
    },
    source_window: { source_asset_id: sourceAssetId, offset_seconds: sourceOffset, duration_seconds: sourceDuration },
    approved_tuning_plan: tuningPlan,
    approved_timing_plan: timingPlan,
    output_uploads: outputUploads,
    certification: {
      contract: CONTRACT,
      exact_workstation_reviewed_plans: true,
      safe_lease_contract: SAFE_LEASE_CONTRACT,
      safe_lease_lane: SAFE_LEASE_LANE,
      human_listening_review_required: true,
    },
  };

  const { jobId, body } = await runOneJob(lease.endpointId, payload, apiKey, lease.expiresAt);
  const worker = body?.output || {};
  if (worker?.success !== true || text(worker?.contract) !== ENGINE_CONTRACT) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_WORKSTATION_CERT_WORKER_CONTRACT_INVALID");
  if (text(worker?.execution_mode) !== "MUSICIAN_APPROVED_PLAN") throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_WORKSTATION_CERT_EXECUTION_MODE_INVALID");
  if (worker?.production_certified !== false) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_WORKSTATION_CERT_WORKER_SELF_CERTIFICATION_FORBIDDEN");
  const report = object(worker.report);
  if (text(report.contract) !== REPORT_CONTRACT) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_WORKSTATION_CERT_REPORT_CONTRACT_INVALID");
  if (text(report.execution_mode) !== "MUSICIAN_APPROVED_PLAN") throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_WORKSTATION_CERT_REPORT_EXECUTION_MODE_INVALID");
  if (text(report.approved_tuning_plan?.fingerprint) !== fingerprint(tuningPlan)) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_WORKSTATION_CERT_TUNING_FINGERPRINT_MISMATCH");
  if (text(report.approved_timing_plan?.fingerprint) !== fingerprint(timingPlan)) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_WORKSTATION_CERT_TIMING_FINGERPRINT_MISMATCH");
  if (report.readiness?.pitch_correction_complete !== true || report.readiness?.phrase_timing_correction_complete !== true || report.readiness?.correction_pipeline_complete !== true) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_WORKSTATION_CERT_PIPELINE_INCOMPLETE");
  if (report.readiness?.human_listening_review_required_for_certification !== true || report.readiness?.production_certified !== false) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_WORKSTATION_CERT_HUMAN_REVIEW_GATE_INVALID");
  if (report.pitch?.formant_preservation_claimed !== false) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_WORKSTATION_CERT_FORMANT_CLAIM_INVALID");
  if (report.safety?.approved_plan_exact_events_required_when_supplied !== true || report.safety?.approved_timing_plan_exact_moves_required_when_supplied !== true || report.safety?.automatic_timing_forbidden_with_musician_plans !== true) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_WORKSTATION_CERT_PLAN_SAFETY_INVALID");
  if (report.timing?.time_stretch_used === true || report.timing?.syllable_warp_applied === true) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_WORKSTATION_CERT_TIMING_WARP_FORBIDDEN");

  const result = {
    success: true,
    contract: CONTRACT,
    engine_contract: ENGINE_CONTRACT,
    quality_profile: QUALITY_PROFILE,
    capability: CAPABILITY,
    model: MODEL,
    execution_mode: "MUSICIAN_APPROVED_PLAN",
    job_id: jobId,
    job_count_submitted: 1,
    provider_job_count: 1,
    safe_lease: { contract: SAFE_LEASE_CONTRACT, lane: SAFE_LEASE_LANE, endpoint_id: lease.endpointId, expires_at: new Date(lease.expiresAt).toISOString() },
    fixture: {
      synthetic_rights_owned: true,
      source_bytes: sourceInfo.size,
      source_checksum: sourceChecksum,
      source_asset_id: sourceAssetId,
      source_offset_seconds: sourceOffset,
      source_duration_seconds: sourceDuration,
      storage_reference: `storage://${STORAGE_BUCKET}/${sourcePath}`,
    },
    plans: {
      tuning_contract: TUNING_PLAN_CONTRACT,
      tuning_fingerprint: fingerprint(tuningPlan),
      timing_contract: TIMING_PLAN_CONTRACT,
      timing_fingerprint: fingerprint(timingPlan),
      all_tuning_segments_reviewed: true,
      all_timing_phrases_reviewed: true,
      automatic_timing_forbidden: true,
    },
    technical: {
      pitch_status: report.readiness.pitch_status,
      pitch_correction_complete: true,
      phrase_timing_correction_complete: true,
      correction_pipeline_complete: true,
      pitch_event_count: report.pitch?.event_count ?? null,
      pitch_applied_event_count: report.pitch?.render?.applied_event_count ?? null,
      approved_phrase_move_count: report.approved_timing_plan?.approved_move_count ?? null,
      timing_status: report.timing?.status ?? null,
      timing_applied: report.timing?.applied === true,
      time_stretch_used: report.timing?.time_stretch_used === true,
      syllable_warp_applied: report.timing?.syllable_warp_applied === true,
      tonality_compensation_explicitly_configured: report.pitch?.tonality_compensation_explicitly_configured === true,
      formant_preservation_claimed: false,
    },
    outputs: { corrected_vocal_wav: outputUploads.corrected_vocal_wav.storage_reference, correction_report_json: outputUploads.correction_report_json.storage_reference },
    human_review: {
      required: true,
      status: "PENDING",
      automatic_approval_forbidden: true,
      must_compare_source_and_corrected_audio: true,
      criteria: ["pitch_naturalness", "vibrato_preservation", "timbre_and_formant_naturalness", "consonant_and_transient_integrity", "artifact_control", "timing_naturalness", "emotional_phrasing_preservation", "before_after_improvement", "commercial_readiness"],
    },
    production_certified: false,
    production_activation_allowed: false,
    pricing_activation_allowed: false,
    provider_job_submitted: true,
    endpoint_management_performed_by_child: false,
    production_deploy_performed: false,
    pricing_activation_performed: false,
    secrets_in_output: false,
  };
  await writeFile(OUTPUT, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(result, null, 2));
  console.log(`${CONTRACT}=TECHNICAL_PASS_HUMAN_REVIEW_REQUIRED`);
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
