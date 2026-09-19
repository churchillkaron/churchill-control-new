#!/usr/bin/env node
import crypto from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();
const CONTRACT = "AVANTIQO_MUSIC_VOCAL_CORRECTION_WORKSTATION_CERTIFICATION_V2";
const ENGINE_CONTRACT = "AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_V2";
const QUALITY_PROFILE = "TORCHCREPE_SIGNALSMITH_VOCAL_CORRECTION_V2";
const TUNING_CONTRACT = "AVANTIQO_MUSIC_VOCAL_TUNING_PLAN_V1";
const TIMING_CONTRACT = "AVANTIQO_MUSIC_VOCAL_TIMING_PLAN_V1";
const NODE_ID = "avantiqo-node-01";
const CAPABILITY = "ai.audio.vocal-correct";
const BUCKET = "creative-assets";
const OUTPUT = resolve(process.env.AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_OUTPUT || "/tmp/avantiqo-music-vocal-correction-certification.json");
const text = (v) => String(v ?? "").trim();
const finite = (v, fallback = null) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const required = (n) => { const v = text(process.env[n]); if (!v) throw new Error(`${n}_REQUIRED`); return v; };
function canonical(value) { if (Array.isArray(value)) return value.map(canonical); if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])); return value; }
const fingerprint = (value) => crypto.createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
if (text(process.env.AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_RIGHTS_APPROVED).toUpperCase() !== "YES") throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_RIGHTS_APPROVED=YES_REQUIRED");
if (text(process.env.AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_SPEND_APPROVED).toUpperCase() === "YES") throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_NODE01_EXTERNAL_SPEND_APPROVAL_MUST_NOT_BE_USED");

const request = JSON.parse(await readFile(resolve(required("AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_REQUEST_FILE")), "utf8"));
const organizationId = text(request.organization_id), sourceReference = text(request.source_storage_reference);
const sourceWindow = request.source_window && typeof request.source_window === "object" ? request.source_window : {};
const tuningPlan = request.approved_tuning_plan, timingPlan = request.approved_timing_plan || null;
if (!organizationId || !sourceReference.startsWith(`storage://${BUCKET}/${organizationId}/`)) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_SOURCE_SCOPE_INVALID");
if (tuningPlan?.contract !== TUNING_CONTRACT || tuningPlan?.all_segments_reviewed !== true || tuningPlan?.musician_approval_required !== true || tuningPlan?.auto_apply_forbidden !== true) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_TUNING_PLAN_REVIEW_REQUIRED");
if (timingPlan && (timingPlan.contract !== TIMING_CONTRACT || timingPlan.all_phrases_reviewed !== true || timingPlan.musician_approval_required !== true || timingPlan.auto_apply_forbidden !== true || timingPlan.time_stretch_used === true)) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_TIMING_PLAN_REVIEW_REQUIRED");

const supabase = createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const { data: node, error: nodeError } = await supabase.from("avantiqo_local_compute_nodes").select("id,enabled,capabilities,last_seen_at").eq("id", NODE_ID).maybeSingle();
if (nodeError) throw nodeError;
if (!node?.enabled || !Array.isArray(node.capabilities) || !node.capabilities.includes(CAPABILITY)) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_NODE01_CAPABILITY_UNAVAILABLE");
const seen = Date.parse(node.last_seen_at || ""); if (!Number.isFinite(seen) || Date.now() - seen > 120000) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_NODE01_STALE");
const sourcePath = sourceReference.slice(`storage://${BUCKET}/`.length);
const { data: signedSource, error: sourceError } = await supabase.storage.from(BUCKET).createSignedUrl(sourcePath, 3600);
if (sourceError || !signedSource?.signedUrl) throw sourceError || new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_SOURCE_SIGNED_URL_REQUIRED");
const runId = `vocal-correction-node01-${Date.now()}-${crypto.randomUUID().slice(0,8)}`;
const uploads = {}, refs = {};
for (const [key, file] of Object.entries({ corrected_vocal_wav:"corrected-vocal.wav", correction_report_json:"correction-report.json" })) {
  const path = `${organizationId}/certification/music-vocal-correction/${runId}/${file}`;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path, { upsert:false });
  if (error || !data?.signedUrl) throw error || new Error(`AVANTIQO_MUSIC_VOCAL_CORRECTION_UPLOAD_REQUIRED:${key}`);
  refs[key] = `storage://${BUCKET}/${path}`; uploads[key] = { signed_url:data.signedUrl, storage_reference:refs[key] };
}
const key = tuningPlan?.musical_key || {};
const params = { rights_attestation:{contract:"AVANTIQO_SOURCE_AUDIO_RIGHTS_ATTESTATION_V1",confirmed:true,content_restriction_policy:"USER_RIGHTS_ATTESTATION_ONLY"}, source_window:sourceWindow, approved_tuning_plan:tuningPlan, approved_timing_plan:timingPlan, correction:{source_role:"isolated_vocal",key:`${text(key.key)} ${text(key.mode)}`.trim(),bpm:finite(timingPlan?.bpm ?? request.bpm,null),beat_offset_seconds:finite(timingPlan?.beat_offset_seconds,0),pitch_strength:finite(tuningPlan?.settings?.correction_strength,0.8),timing_strength:0,max_pitch_shift_cents:finite(tuningPlan?.settings?.max_correction_cents,200),max_timing_shift_ms:finite(timingPlan?.settings?.max_shift_ms,80),snap_threshold_cents:finite(tuningPlan?.settings?.preserve_within_cents,10),preserve_vibrato:true,preserve_formants:true} };
const payload = { contract:ENGINE_CONTRACT, capability:CAPABILITY, model:"torchcrepe-full", quality_profile:QUALITY_PROFILE, structured_specification:{requirements:{isolated_vocal_only:true},output_spec:{format:"wav"},provider_parameters:params,metadata:{certification:true,local_only:true}}, source_asset_roles:{source_audio:signedSource.signedUrl}, source_assets:[signedSource.signedUrl], output_uploads:uploads };
const { data: job, error: jobError } = await supabase.from("avantiqo_local_compute_jobs").insert({organization_id:organizationId,usage_id:`${runId}-1`,capability:CAPABILITY,lane:"gpu",workload:"music_vocal_correction",model:"torchcrepe-full",payload,status:"QUEUED",priority:90,max_attempts:1}).select("id").single();
if (jobError) throw jobError;
const started = Date.now(), timeout = Number(process.env.AVANTIQO_MUSIC_VOCAL_CORRECTION_NODE01_TIMEOUT_MS || 1800000); let row = null;
while (Date.now() - started < timeout) { const q = await supabase.from("avantiqo_local_compute_jobs").select("id,status,result,metrics,error_code,node_id").eq("id",job.id).eq("organization_id",organizationId).maybeSingle(); if (q.error) throw q.error; if (!q.data) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_NODE01_JOB_NOT_FOUND"); const status=text(q.data.status).toUpperCase(); if(status==="COMPLETED"){row=q.data;break;} if(["FAILED","CANCELLED","ERROR"].includes(status)) throw new Error(`AVANTIQO_MUSIC_VOCAL_CORRECTION_NODE01_JOB_FAILED:${text(q.data.error_code)||status}`); await new Promise(r=>setTimeout(r,2000)); }
if (!row) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_NODE01_JOB_TIMEOUT");
const result = row.result || {}, report = result.report || {}, readiness = report.readiness || {}, tuningEvidence = report.approved_tuning_plan || {}, timingEvidence = report.approved_timing_plan || null, timbreProxy = report.timbre_preservation_proxy || null;
if (result.success !== true || result.contract !== ENGINE_CONTRACT || result.execution_mode !== "MUSICIAN_APPROVED_PLAN") throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_NODE01_RESULT_INVALID");
if (tuningEvidence.fingerprint !== fingerprint(tuningPlan)) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_TUNING_FINGERPRINT_MISMATCH");
if (timingPlan && timingEvidence?.fingerprint !== fingerprint(timingPlan)) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_TIMING_FINGERPRINT_MISMATCH");
if (readiness.correction_pipeline_complete !== true || readiness.human_listening_review_required_for_certification !== true || readiness.production_certified !== false) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_TECHNICAL_GATE_FAILED");
if (timbreProxy?.contract !== "AVANTIQO_MUSIC_VOCAL_TIMBRE_PROXY_V1" || timbreProxy?.measured !== true || timbreProxy?.formant_preservation_claimed !== false) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_TIMBRE_PROXY_EVIDENCE_REQUIRED");
for (const [key,ref] of Object.entries(refs)) if (text(result[key]) !== ref) throw new Error(`AVANTIQO_MUSIC_VOCAL_CORRECTION_STORAGE_REFERENCE_MISMATCH:${key}`);
const evidence = {success:true,contract:CONTRACT,generated_at:new Date().toISOString(),execution_mode:"MUSICIAN_APPROVED_PLAN",job_count_submitted:1,provider_job_count:0,local_compute_job_count:1,external_provider_spend_usd:0,external_provider_spend_thb:0,wall_ms:Date.now()-started,job_id:`local-node01-music:${job.id}`,provider:"avantiqo-audio",infrastructure_provider:"AVANTIQO_LOCAL_NODE_V1",node_id:row.node_id||NODE_ID,source_reference:sourceReference,outputs:{corrected_vocal_wav:result.corrected_vocal_wav,correction_report_json:result.correction_report_json},plans:{tuning_contract:TUNING_CONTRACT,tuning_fingerprint:tuningEvidence.fingerprint,timing_contract:timingPlan?TIMING_CONTRACT:null,timing_fingerprint:timingPlan?timingEvidence?.fingerprint:null,all_tuning_segments_reviewed:tuningEvidence.all_segments_reviewed===true,all_timing_phrases_reviewed:timingPlan?timingEvidence?.all_phrases_reviewed===true:true,automatic_timing_forbidden:true},technical:{pitch_status:readiness.pitch_status,pitch_correction_complete:readiness.pitch_correction_complete===true,phrase_timing_correction_complete:readiness.phrase_timing_correction_complete===true,correction_pipeline_complete:readiness.correction_pipeline_complete===true,timing_applied:report.timing?.applied===true,time_stretch_used:report.timing?.time_stretch_used===true,syllable_warp_applied:report.timing?.syllable_warp_applied===true,tonality_compensation_explicitly_configured:report.pitch?.tonality_compensation_explicitly_configured===true,timbre_proxy_contract:timbreProxy.contract,timbre_proxy_measured:timbreProxy.measured===true,median_absolute_band_delta_db:timbreProxy.median_absolute_band_delta_db??null,p95_absolute_band_delta_db:timbreProxy.p95_absolute_band_delta_db??null,median_spectral_centroid_delta_percent:timbreProxy.median_spectral_centroid_delta_percent??null,timbre_proxy_conservative_review_flag:timbreProxy.conservative_review_flag===true,timbre_proxy_is_not_formant_proof:timbreProxy.review_thresholds_are_qc_proxies_not_formant_proof===true,formant_preservation_claimed:false},human_review:{required:true,status:"PENDING",automatic_approval_forbidden:true},production_certified:false,production_activation_allowed:false,pricing_activation_allowed:false,provider_selection_change_allowed:false,production_deploy_performed:false};
await writeFile(OUTPUT,`${JSON.stringify(evidence,null,2)}\n`);console.log(JSON.stringify({success:true,contract:CONTRACT,output_path:OUTPUT,infrastructure_provider:"AVANTIQO_LOCAL_NODE_V1",external_provider_spend_thb:0,technical_complete:true,human_review_required:true,production_certified:false},null,2));
