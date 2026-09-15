#!/usr/bin/env node

import { readFile, stat, writeFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const CONTRACT = "AVANTIQO_MUSIC_SEPARATOR_CERTIFICATION_BENCHMARK_V2";
const READINESS_CONTRACT = "AVANTIQO_MUSIC_SEPARATOR_CERTIFICATION_READINESS_V2";
const ENGINE_CONTRACT = "AVANTIQO_MUSIC_SEPARATOR_ENGINE_V1";
const CAPABILITY = "ai.audio.stems";
const MODEL = "demucs-htdemucs-ft";
const QUALITY_PROFILE = "DEMUCS_HTDEMUCS_FT_4STEM_V1";
const APP_NAME = "avantiqo-music-separator-owned";
const FUNCTION_NAME = "separate";
const STORAGE_BUCKET = "creative-assets";
const RIGHTS_CONTRACT = "AVANTIQO_SOURCE_AUDIO_RIGHTS_ATTESTATION_V1";
const CONTENT_POLICY = "USER_RIGHTS_ATTESTATION_ONLY";
const STEMS = Object.freeze(["vocals", "drums", "bass", "other"]);
const BACKING_STEMS = Object.freeze(["drums", "bass", "other"]);
const OUTPUTS = Object.freeze({ backing_track_wav: "backing-track.wav", backing_track_mp3: "backing-track.mp3", vocals: "vocals.wav", drums: "drums.wav", bass: "bass.wav", other: "other.wav" });
const MIME = Object.freeze({ ".wav": "audio/wav", ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".aac": "audio/aac", ".flac": "audio/flac", ".ogg": "audio/ogg" });
const OUTPUT = resolve(process.env.AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_OUTPUT || "/tmp/avantiqo-music-separator-certification-benchmark.json");

const text = (value) => String(value ?? "").trim();
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const required = (name) => { const value = text(process.env[name]); if (!value) throw new Error(`${name}_REQUIRED`); return value; };
const approved = (name) => { if (text(process.env[name]).toUpperCase() !== "YES") throw new Error(`${name}=YES_REQUIRED`); };
const exactList = (value, expected) => Array.isArray(value) && value.length === expected.length && expected.every((item, index) => value[index] === item);
const safe = (value, fallback = "separator-benchmark") => text(value || fallback).replace(/[^A-Za-z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || fallback;

approved("AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_SPEND_APPROVED");
approved("AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_RIGHTS_APPROVED");
if (text(process.env.AVANTIQO_MUSIC_SEPARATOR_ENGINE_CERTIFIED).toLowerCase() === "true") throw new Error("AVANTIQO_MUSIC_SEPARATOR_ALREADY_CERTIFIED_USE_RELEASE_AUDIT");

const readinessRaw = await import("node:child_process").then(({ execFileSync }) => execFileSync(process.execPath, [resolve("scripts/audit-avantiqo-music-separator-certification-readiness.mjs")], { cwd: process.cwd(), env: process.env, encoding: "utf8" }));
const readiness = JSON.parse(readinessRaw);
if (readiness?.success !== true || readiness?.contract !== READINESS_CONTRACT || readiness?.implementation_ready !== true || readiness?.production_certified !== false) throw new Error("AVANTIQO_MUSIC_SEPARATOR_MODAL_READINESS_REQUIRED");

const sourceFile = resolve(required("AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_SOURCE_FILE"));
const sourceStat = await stat(sourceFile);
if (!sourceStat.isFile() || sourceStat.size <= 0 || sourceStat.size > 629145600) throw new Error("AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_SOURCE_FILE_INVALID");
const extension = extname(sourceFile).toLowerCase();
if (!MIME[extension]) throw new Error(`AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_SOURCE_EXTENSION_INVALID:${extension || "MISSING"}`);
const sourceBytes = await readFile(sourceFile);

const supabase = createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const benchmarkId = safe(`separator-${new Date().toISOString()}-${crypto.randomUUID().slice(0, 8)}`);
const organizationId = `benchmark-${crypto.randomUUID()}`;
const usageId = `${benchmarkId}-1`;
const sourcePath = `${organizationId}/benchmark/avantiqo-music-separator/${benchmarkId}/source-${safe(basename(sourceFile), "source")}${extension}`;
const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(sourcePath, sourceBytes, { contentType: MIME[extension], upsert: false });
if (uploadError) throw uploadError;
const { data: sourceRead, error: sourceReadError } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(sourcePath, 60 * 60);
if (sourceReadError || !sourceRead?.signedUrl) throw sourceReadError || new Error("AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_SOURCE_SIGNED_URL_REQUIRED");

const outputUploads = {};
const expectedReferences = {};
for (const [key, filename] of Object.entries(OUTPUTS)) {
  const path = `${organizationId}/benchmark/avantiqo-music-separator/${benchmarkId}/${filename}`;
  const { data, error } = await supabase.storage.from(STORAGE_BUCKET).createSignedUploadUrl(path, { upsert: false });
  if (error || !data?.signedUrl) throw error || new Error(`AVANTIQO_MUSIC_SEPARATOR_OUTPUT_UPLOAD_REQUIRED:${key}`);
  expectedReferences[key] = `storage://${STORAGE_BUCKET}/${path}`;
  outputUploads[key] = { signed_url: data.signedUrl, storage_reference: expectedReferences[key] };
}

const { ModalClient, FunctionCallGetTimeoutError } = await import("modal");
const tokenId = text(process.env.MODAL_TOKEN_ID || process.env.AVANTIQO_MODAL_TOKEN_ID);
const tokenSecret = text(process.env.MODAL_TOKEN_SECRET || process.env.AVANTIQO_MODAL_TOKEN_SECRET);
if (!tokenId || !tokenSecret) throw new Error("AVANTIQO_MUSIC_SEPARATOR_MODAL_CREDENTIALS_REQUIRED");
const client = new ModalClient({ tokenId, tokenSecret });
const environment = text(process.env.AVANTIQO_MUSIC_SEPARATOR_MODAL_ENVIRONMENT || process.env.MODAL_ENVIRONMENT);
const worker = await client.functions.fromName(APP_NAME, FUNCTION_NAME, environment ? { environment } : {});
const payload = {
  contract: ENGINE_CONTRACT, capability: CAPABILITY, model: MODEL, quality_profile: QUALITY_PROFILE,
  source_audio: sourceRead.signedUrl,
  rights_attestation: { contract: RIGHTS_CONTRACT, confirmed: true, content_restriction_policy: CONTENT_POLICY },
  output_uploads: outputUploads,
  processing: { remove_vocals: true, preserve_arrangement: true, key_shift_semitones: 0, tempo_ratio: 1, count_in_bars: 0, export_stems: true, vocal_cleanup_required: true },
  organization_id: organizationId, usage_id: usageId,
};
const started = performance.now();
const call = await worker.spawn([payload]);
const jobId = text(call.functionCallId);
if (!jobId) throw new Error("AVANTIQO_MUSIC_SEPARATOR_MODAL_CALL_ID_REQUIRED");
let result = null;
while (!result) {
  try { result = await call.get({ timeoutMs: 5_000 }); }
  catch (error) {
    if (!(error instanceof FunctionCallGetTimeoutError) && !text(error?.code || error?.name).toUpperCase().includes("TIMEOUT")) throw error;
  }
}
const wallMs = Math.round(performance.now() - started);
if (result?.success !== true || result?.contract !== ENGINE_CONTRACT || result?.capability !== CAPABILITY || result?.model !== MODEL || result?.quality_profile !== QUALITY_PROFILE) throw new Error("AVANTIQO_MUSIC_SEPARATOR_MODAL_RESULT_INVALID");
if (!exactList(result?.stem_names, STEMS) || !exactList(result?.backing_track_stems, BACKING_STEMS)) throw new Error("AVANTIQO_MUSIC_SEPARATOR_STEM_CONTRACT_INVALID");
for (const [key, expected] of Object.entries(expectedReferences)) if (text(result?.storage_references?.[key]) !== expected) throw new Error(`AVANTIQO_MUSIC_SEPARATOR_STORAGE_REFERENCE_MISMATCH:${key}`);

const sourceDuration = finite(result.source_duration_seconds, null);
const realtimeFactor = sourceDuration ? Number(((wallMs / 1000) / sourceDuration).toFixed(6)) : null;
const report = {
  success: true, contract: CONTRACT, generated_at: new Date().toISOString(), benchmark_id: benchmarkId,
  provider: "avantiqo-audio", infrastructure_provider: "MODAL_DIRECT_A10G_ASYNC_V1", modal_app: APP_NAME, modal_function: FUNCTION_NAME,
  capability: CAPABILITY, runtime_model: MODEL, quality_profile: QUALITY_PROFILE, immutable_image_reference: readiness.immutable_image_reference || null,
  rights_attestation: { contract: RIGHTS_CONTRACT, confirmed: true, source_scope: "OPERATOR_APPROVED_BENCHMARK_SOURCE_ONLY", content_restriction_policy: CONTENT_POLICY },
  observations: [{ run: 1, passed: true, modal_job_id: jobId, wall_ms: wallMs, source_duration_seconds: sourceDuration, output_duration_seconds: finite(result.output_duration_seconds, null), source_bytes: finite(result.source_bytes, sourceStat.size), realtime_factor: realtimeFactor, stem_names: result.stem_names, backing_track_stems: result.backing_track_stems, source_storage_reference: `storage://${STORAGE_BUCKET}/${sourcePath}`, storage_references: result.storage_references, quality_profile: QUALITY_PROFILE }],
  summary: { passed: true, runs: 1, source_duration_seconds: sourceDuration, wall_ms: wallMs, realtime_factor: realtimeFactor, required_outputs_present: Object.keys(OUTPUTS).every((key) => Boolean(result?.storage_references?.[key])), four_stem_contract_passed: exactList(result.stem_names, STEMS), backing_track_contract_passed: exactList(result.backing_track_stems, BACKING_STEMS) },
  certification: { runtime_benchmark_passed: true, economics_measured: false, human_quality_certified: false, production_certified: false, next_gate: "SEPARATOR_ECONOMICS_AND_HUMAN_QUALITY_REQUIRED" },
  safety: { explicit_spend_approval_required: true, explicit_rights_approval_required: true, provider_job_submitted: true, provider_job_count: 1, endpoint_mutation_performed: false, pricing_activation_performed: false, provider_certification_mutation_performed: false, production_deploy_performed: false, automatic_activation_forbidden: true },
};
await writeFile(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ success: true, output_path: OUTPUT, contract: CONTRACT, benchmark_id: benchmarkId, modal_job_id: jobId, source_duration_seconds: sourceDuration, realtime_factor: realtimeFactor, runtime_benchmark_passed: true, economics_measured: false, human_quality_certified: false, production_certified: false, pricing_activation_performed: false, production_deploy_performed: false }, null, 2));
