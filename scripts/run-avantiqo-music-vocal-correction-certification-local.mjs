#!/usr/bin/env node
import crypto from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();
const CONTRACT = "AVANTIQO_MUSIC_VOCAL_CORRECTION_WORKSTATION_CERTIFICATION_V2";
const ENGINE_CONTRACT = "AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_V2";
const QUALITY_PROFILE = "TORCHCREPE_SIGNALSMITH_VOCAL_CORRECTION_V2";
const TUNING_CONTRACT = "AVANTIQO_MUSIC_VOCAL_TUNING_PLAN_V1";
const TIMING_CONTRACT = "AVANTIQO_MUSIC_VOCAL_TIMING_PLAN_V1";
const APP_NAME = "avantiqo-music-vocal-correction-owned";
const FUNCTION_NAME = "correct";
const BUCKET = "creative-assets";
const MODAL_A10G_USD_PER_SECOND = 0.000306;
const FX_THB_PER_USD = 32.9794;
const SPEND_CEILING_THB = Number(process.env.AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_SPEND_CEILING_THB || 0);
if (!Number.isFinite(SPEND_CEILING_THB) || SPEND_CEILING_THB <= 0) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_SPEND_CEILING_THB_REQUIRED");
const OUTPUT = resolve(process.env.AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_OUTPUT || "/tmp/avantiqo-music-vocal-correction-certification.json");
const text = (v) => String(v ?? "").trim();
const finite = (v, fallback = null) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const required = (n) => { const v = text(process.env[n]); if (!v) throw new Error(`${n}_REQUIRED`); return v; };
const approved = (n) => { if (text(process.env[n]).toUpperCase() !== "YES") throw new Error(`${n}=YES_REQUIRED`); };
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
const fingerprint = (value) => crypto.createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");

approved("AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_SPEND_APPROVED");
approved("AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_RIGHTS_APPROVED");
try {
  execFileSync(process.execPath, [resolve("scripts/audit-avantiqo-music-vocal-correction-image-readiness.mjs")], { cwd: process.cwd(), env: process.env, stdio: ["ignore", "pipe", "pipe"] });
} catch (error) {
  throw new Error(`AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_IMAGE_NOT_READY:${text(error?.stdout || error?.stderr || error?.message)}`);
}
const request = JSON.parse(await readFile(resolve(required("AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_REQUEST_FILE")), "utf8"));
const organizationId = text(request.organization_id);
const sourceReference = text(request.source_storage_reference);
const sourceWindow = request.source_window && typeof request.source_window === "object" ? request.source_window : {};
const tuningPlan = request.approved_tuning_plan;
const timingPlan = request.approved_timing_plan || null;
if (!organizationId || !sourceReference.startsWith(`storage://${BUCKET}/${organizationId}/`)) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_SOURCE_SCOPE_INVALID");
if (tuningPlan?.contract !== TUNING_CONTRACT || tuningPlan?.all_segments_reviewed !== true || tuningPlan?.musician_approval_required !== true || tuningPlan?.auto_apply_forbidden !== true) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_TUNING_PLAN_REVIEW_REQUIRED");
if (timingPlan && (timingPlan.contract !== TIMING_CONTRACT || timingPlan.all_phrases_reviewed !== true || timingPlan.musician_approval_required !== true || timingPlan.auto_apply_forbidden !== true || timingPlan.time_stretch_used === true)) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_TIMING_PLAN_REVIEW_REQUIRED");

const supabase = createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const sourcePath = sourceReference.slice(`storage://${BUCKET}/`.length);
const { data: signedSource, error: sourceError } = await supabase.storage.from(BUCKET).createSignedUrl(sourcePath, 3600);
if (sourceError || !signedSource?.signedUrl) throw sourceError || new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_SOURCE_SIGNED_URL_REQUIRED");
const runId = `vocal-correction-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
const outputs = {};
for (const [key, file] of Object.entries({ corrected_vocal_wav: "corrected-vocal.wav", correction_report_json: "correction-report.json" })) {
  const path = `${organizationId}/certification/music-vocal-correction/${runId}/${file}`;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: false });
  if (error || !data?.signedUrl) throw error || new Error(`AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_UPLOAD_REQUIRED:${key}`);
  outputs[key] = { signed_url: data.signedUrl, storage_reference: `storage://${BUCKET}/${path}` };
}

const key = tuningPlan?.musical_key || {};
const payload = {
  contract: ENGINE_CONTRACT,
  capability: "ai.audio.vocal-correct",
  model: "torchcrepe-full",
  quality_profile: QUALITY_PROFILE,
  source_audio: signedSource.signedUrl,
  rights_attestation: { contract: "AVANTIQO_SOURCE_AUDIO_RIGHTS_ATTESTATION_V1", confirmed: true, content_restriction_policy: "USER_RIGHTS_ATTESTATION_ONLY" },
  output_uploads: outputs,
  source_window: sourceWindow,
  approved_tuning_plan: tuningPlan,
  approved_timing_plan: timingPlan,
  correction: {
    source_role: "isolated_vocal",
    key: `${text(key.key)} ${text(key.mode)}`.trim(),
    bpm: finite(timingPlan?.bpm ?? request.bpm, null),
    beat_offset_seconds: finite(timingPlan?.beat_offset_seconds, 0),
    pitch_strength: finite(tuningPlan?.settings?.correction_strength, 0.8),
    timing_strength: 0,
    max_pitch_shift_cents: finite(tuningPlan?.settings?.max_correction_cents, 200),
    max_timing_shift_ms: finite(timingPlan?.settings?.max_shift_ms, 80),
    snap_threshold_cents: finite(tuningPlan?.settings?.preserve_within_cents, 10),
    preserve_vibrato: true,
    preserve_formants: true,
  },
};
const tokenId = text(process.env.MODAL_TOKEN_ID || process.env.AVANTIQO_MODAL_TOKEN_ID);
const tokenSecret = text(process.env.MODAL_TOKEN_SECRET || process.env.AVANTIQO_MODAL_TOKEN_SECRET);
if (!tokenId || !tokenSecret) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_MODAL_CREDENTIALS_REQUIRED");
const { ModalClient, FunctionCallGetTimeoutError } = await import("modal");
const client = new ModalClient({ tokenId, tokenSecret });
const environment = text(process.env.AVANTIQO_MUSIC_VOCAL_CORRECTION_MODAL_ENVIRONMENT || process.env.MODAL_ENVIRONMENT);
const worker = await client.functions.fromName(APP_NAME, FUNCTION_NAME, environment ? { environment } : {});
const startedAt = performance.now();
const call = await worker.spawn([payload]);
const jobId = text(call.functionCallId);
if (!jobId) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_MODAL_CALL_ID_REQUIRED");
let result = null;
while (!result) {
  const elapsedSeconds = (performance.now() - startedAt) / 1000;
  const conservativeCostThb = elapsedSeconds * MODAL_A10G_USD_PER_SECOND * FX_THB_PER_USD;
  if (conservativeCostThb >= SPEND_CEILING_THB * 0.98) { try { await call.cancel({ terminateContainers: true }); } catch {} throw new Error(`AVANTIQO_MUSIC_VOCAL_CORRECTION_SPEND_CEILING_WATCHDOG:${conservativeCostThb.toFixed(6)}THB`); }
  try { result = await call.get({ timeoutMs: 5000 }); }
  catch (error) { if (!(error instanceof FunctionCallGetTimeoutError) && !text(error?.code || error?.name).toUpperCase().includes("TIMEOUT")) throw error; }
}
const wallMs = Math.round(performance.now() - startedAt);
const conservativeSupplierCostUsd = (wallMs / 1000) * MODAL_A10G_USD_PER_SECOND;
const conservativeSupplierCostThb = conservativeSupplierCostUsd * FX_THB_PER_USD;
if (conservativeSupplierCostThb > SPEND_CEILING_THB) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_SPEND_CEILING_EXCEEDED");
if (result?.success !== true || result?.contract !== ENGINE_CONTRACT || result?.execution_mode !== "MUSICIAN_APPROVED_PLAN") throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_RESULT_INVALID");
const report = result.report || {};
const readiness = report.readiness || {};
const tuningEvidence = report.approved_tuning_plan || {};
const timingEvidence = report.approved_timing_plan || null;
const timbreProxy = report.timbre_preservation_proxy || null;
if (tuningEvidence.fingerprint !== fingerprint(tuningPlan)) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_TUNING_FINGERPRINT_MISMATCH");
if (timingPlan && timingEvidence?.fingerprint !== fingerprint(timingPlan)) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_TIMING_FINGERPRINT_MISMATCH");
if (readiness.correction_pipeline_complete !== true || readiness.human_listening_review_required_for_certification !== true || readiness.production_certified !== false) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_TECHNICAL_GATE_FAILED");
if (timbreProxy?.contract !== "AVANTIQO_MUSIC_VOCAL_TIMBRE_PROXY_V1" || timbreProxy?.measured !== true || timbreProxy?.formant_preservation_claimed !== false) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_TIMBRE_PROXY_EVIDENCE_REQUIRED");

const evidence = {
  success: true,
  contract: CONTRACT,
  generated_at: new Date().toISOString(),
  execution_mode: "MUSICIAN_APPROVED_PLAN",
  job_count_submitted: 1,
  provider_job_count: 1,
  spend_ceiling_thb: SPEND_CEILING_THB,
  wall_ms: wallMs,
  conservative_supplier_cost_usd: Number(conservativeSupplierCostUsd.toFixed(8)),
  conservative_supplier_cost_thb: Number(conservativeSupplierCostThb.toFixed(6)),
  job_id: jobId,
  provider: "avantiqo-audio",
  infrastructure_provider: "MODAL_DIRECT_A10G_ASYNC_V1",
  source_reference: sourceReference,
  outputs: { corrected_vocal_wav: result.corrected_vocal_wav, correction_report_json: result.correction_report_json },
  plans: {
    tuning_contract: TUNING_CONTRACT,
    tuning_fingerprint: tuningEvidence.fingerprint,
    timing_contract: timingPlan ? TIMING_CONTRACT : null,
    timing_fingerprint: timingPlan ? timingEvidence?.fingerprint : null,
    all_tuning_segments_reviewed: tuningEvidence.all_segments_reviewed === true,
    all_timing_phrases_reviewed: timingPlan ? timingEvidence?.all_phrases_reviewed === true : true,
    automatic_timing_forbidden: true,
  },
  technical: {
    pitch_status: readiness.pitch_status,
    pitch_correction_complete: readiness.pitch_correction_complete === true,
    phrase_timing_correction_complete: readiness.phrase_timing_correction_complete === true,
    correction_pipeline_complete: readiness.correction_pipeline_complete === true,
    timing_applied: report.timing?.applied === true,
    time_stretch_used: report.timing?.time_stretch_used === true,
    syllable_warp_applied: report.timing?.syllable_warp_applied === true,
    tonality_compensation_explicitly_configured: report.pitch?.tonality_compensation_explicitly_configured === true,
    timbre_proxy_contract: timbreProxy.contract,
    timbre_proxy_measured: timbreProxy.measured === true,
    median_absolute_band_delta_db: timbreProxy.median_absolute_band_delta_db ?? null,
    p95_absolute_band_delta_db: timbreProxy.p95_absolute_band_delta_db ?? null,
    median_spectral_centroid_delta_percent: timbreProxy.median_spectral_centroid_delta_percent ?? null,
    timbre_proxy_conservative_review_flag: timbreProxy.conservative_review_flag === true,
    timbre_proxy_is_not_formant_proof: timbreProxy.review_thresholds_are_qc_proxies_not_formant_proof === true,
    formant_preservation_claimed: false,
  },
  human_review: { required: true, status: "PENDING", automatic_approval_forbidden: true },
  production_certified: false,
  production_activation_allowed: false,
  pricing_activation_allowed: false,
  provider_selection_change_allowed: false,
  production_deploy_performed: false,
};
await writeFile(OUTPUT, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ success: true, contract: CONTRACT, output_path: OUTPUT, job_id: jobId, technical_complete: true, human_review_required: true, production_certified: false }, null, 2));
