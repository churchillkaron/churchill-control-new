#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  AVANTIQO_MUSIC_CONTINUITY_FIXTURE_BPM,
  AVANTIQO_MUSIC_CONTINUITY_FIXTURE_SECONDS,
  avantiqoMusicContinuityFixtureMetadata,
  createAvantiqoMusicContinuityFixtureWav,
  createAvantiqoMusicDynamicMetalContinuityFixtureWav,
} from "./avantiqo-music-continuity-fixture.mjs";

const ENGINE_CONTRACT = "AVANTIQO_AUDIO_ENGINE_V1";
const CERT_CONTRACT = "AVANTIQO_MUSIC_TRANSFORM_CERTIFICATION_JOB_V1";
const BENCHMARK_CONTRACT = "AVANTIQO_MUSIC_TRANSFORM_CERTIFICATION_BENCHMARK_V3";
const APP_NAME = "avantiqo-audio-owned";
const FUNCTION_NAME = "generate";
const BUCKET = "creative-assets";
const EXTEND_SECONDS = 8;
const EXTEND_OVERLAP_SECONDS = 3;
const SOURCE_MODE_TECHNICAL = "TECHNICAL_SYNTHETIC";
const SOURCE_MODE_CONTINUITY = "MUSICAL_CONTINUITY";
const SOURCE_MODE_VARIATION = "MUSICAL_VARIATION";
const text = (value) => String(value ?? "").trim();
const approved = (name) => { if (text(process.env[name]).toUpperCase() !== "YES") throw new Error(`${name}=YES_REQUIRED`); };
const required = (name) => { const value = text(process.env[name]); if (!value) throw new Error(`${name}_REQUIRED`); return value; };
const capability = () => {
  const value = text(process.env.AVANTIQO_MUSIC_TRANSFORM_CAPABILITY);
  if (!["ai.audio.remix", "ai.audio.edit", "ai.audio.extend"].includes(value)) throw new Error("AVANTIQO_MUSIC_TRANSFORM_CAPABILITY_INVALID");
  return value;
};
function makeTechnicalWav(seconds = 12, sampleRate = 44100) {
  const frames = seconds * sampleRate; const buffer = Buffer.alloc(44 + frames * 2);
  buffer.write("RIFF", 0); buffer.writeUInt32LE(36 + frames * 2, 4); buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24); buffer.writeUInt32LE(sampleRate * 2, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36); buffer.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; i += 1) {
    const t = i / sampleRate; const sample = Math.round((Math.sin(2*Math.PI*220*t)*0.18 + Math.sin(2*Math.PI*330*t)*0.08) * 32767);
    buffer.writeInt16LE(Math.max(-32768, Math.min(32767, sample)), 44 + i * 2);
  }
  return buffer;
}
function sourceFixture(selectedCapability) {
  const requested = text(process.env.AVANTIQO_MUSIC_TRANSFORM_SOURCE_MODE).toUpperCase();
  const mode = requested || (selectedCapability === "ai.audio.extend" ? SOURCE_MODE_CONTINUITY : SOURCE_MODE_TECHNICAL);
  if (mode === SOURCE_MODE_VARIATION) {
    process.env.AVANTIQO_MUSIC_CONTINUITY_FIXTURE_PROFILE = "DYNAMIC_METAL";
    return { mode, audio:createAvantiqoMusicDynamicMetalContinuityFixtureWav(), duration:AVANTIQO_MUSIC_CONTINUITY_FIXTURE_SECONDS, bpm:AVANTIQO_MUSIC_CONTINUITY_FIXTURE_BPM, metadata:{...avantiqoMusicContinuityFixtureMetadata(), external_reference_recording_used:false}, humanReviewKind:"MUSICAL_VARIATION", eligible:true, caption:"Original dynamic heavy metal instrumental source reimagined as a clearly alternate arrangement with fresh rhythmic phrasing, changed section emphasis and new guitar voicings while preserving recognizable musical identity; create only new original material and imitate no artist or recording" };
  }
  if (mode === SOURCE_MODE_CONTINUITY) return {
    mode, audio: createAvantiqoMusicContinuityFixtureWav(), duration: AVANTIQO_MUSIC_CONTINUITY_FIXTURE_SECONDS,
    bpm: AVANTIQO_MUSIC_CONTINUITY_FIXTURE_BPM, metadata: avantiqoMusicContinuityFixtureMetadata(),
    humanReviewKind: "MUSICAL_CONTINUITY", eligible: true,
    caption: "Warm polished original instrumental groove with chord progression, bass, melody and light drums",
  };
  if (mode !== SOURCE_MODE_TECHNICAL) throw new Error("AVANTIQO_MUSIC_TRANSFORM_SOURCE_MODE_INVALID");
  return { mode, audio: makeTechnicalWav(), duration: 12, bpm: 96,
    metadata: { contract: "AVANTIQO_MUSIC_TRANSFORM_TECHNICAL_SOURCE_V1", deterministic: true, original_composition: true, royalty_free: true },
    humanReviewKind: "TECHNICAL_ONLY", eligible: false, caption: "Original synthetic instrumental benchmark source" };
}
function objectPath(bucket, path) { return [bucket, ...path.split("/")].map(encodeURIComponent).join("/"); }
async function storageRequest(base, key, pathname, { method="POST", body, contentType="application/json" } = {}) {
  const response = await fetch(`${base}${pathname}`, { method, headers: { Authorization:`Bearer ${key}`, apikey:key, Accept:"application/json", ...(body !== undefined ? {"Content-Type":contentType}: {}) }, body: body === undefined ? undefined : (Buffer.isBuffer(body) ? body : JSON.stringify(body)), signal: AbortSignal.timeout(60000) });
  const raw = await response.text(); let parsed={}; try { parsed=raw?JSON.parse(raw):{}; } catch {}
  if (!response.ok) throw new Error(`AVANTIQO_MUSIC_TRANSFORM_STORAGE_HTTP_${response.status}:${text(parsed?.message||parsed?.error||raw).slice(0,500)}`);
  return parsed;
}
function absoluteUrl(base, value) { const url=text(value); return /^https?:\/\//i.test(url) ? url : `${base}${url.startsWith("/")?"":"/"}${url}`; }

approved("AVANTIQO_AUDIO_BENCHMARK_SPEND_APPROVED");
approved("AVANTIQO_MUSIC_TRANSFORM_SOURCE_RIGHTS_APPROVED");
const selectedCapability = capability();
if (selectedCapability === "ai.audio.remix" && !text(process.env.AVANTIQO_MUSIC_TRANSFORM_SOURCE_MODE)) process.env.AVANTIQO_MUSIC_TRANSFORM_SOURCE_MODE = SOURCE_MODE_VARIATION;
const fixture = sourceFixture(selectedCapability);
const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL").replace(/\/+$/, "");
const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
const tokenId = required(process.env.MODAL_TOKEN_ID ? "MODAL_TOKEN_ID" : "AVANTIQO_MODAL_TOKEN_ID");
const tokenSecret = required(process.env.MODAL_TOKEN_SECRET ? "MODAL_TOKEN_SECRET" : "AVANTIQO_MODAL_TOKEN_SECRET");
const storageBase = `${supabaseUrl}/storage/v1`;
const id = `music-transform-${Date.now()}-${crypto.randomUUID().slice(0,8)}`;
const organizationId = `benchmark-${crypto.randomUUID()}`;
const sourcePath = `${organizationId}/benchmark/music-transform/${id}-source.wav`;
const outputPath = `${organizationId}/benchmark/music-transform/${id}-output.wav`;
await storageRequest(storageBase, serviceKey, `/object/${objectPath(BUCKET,sourcePath)}`, { body:fixture.audio, contentType:"audio/wav" });
const signedRead = await storageRequest(storageBase, serviceKey, `/object/sign/${objectPath(BUCKET,sourcePath)}`, { body:{expiresIn:3600} });
const sourceSignedUrl = absoluteUrl(storageBase, signedRead.signedURL || signedRead.signedUrl || signedRead.url);
const signedUpload = await storageRequest(storageBase, serviceKey, `/object/upload/sign/${objectPath(BUCKET,outputPath)}`, { body:{} });
const outputSignedUrl = absoluteUrl(storageBase, signedUpload.url || signedUpload.signedURL || signedUpload.signedUrl);
const outputReference = `storage://${BUCKET}/${outputPath}`;
const providerParameters = selectedCapability === "ai.audio.edit"
  ? { repainting_start:3, repainting_end:7, seed:51001, inference_steps:8, shift:3 }
  : selectedCapability === "ai.audio.extend"
    ? { extension_seconds:EXTEND_SECONDS, continuity_overlap_seconds:EXTEND_OVERLAP_SECONDS, seed:51001, inference_steps:8, shift:3 }
    : { audio_cover_strength:0.6, seed:51001, inference_steps:8, shift:3 };
const payload = {
  contract: ENGINE_CONTRACT, capability:selectedCapability, organization_id:organizationId, usage_id:id,
  instruction: selectedCapability === "ai.audio.extend" ? "Continue naturally beyond the ending while preserving musical identity and continuity." : selectedCapability === "ai.audio.edit" ? "Refine only the selected region while preserving everything outside it." : "Create a clearly alternate original arrangement while preserving useful musical identity.",
  source_asset_roles:{ source_audio:sourceSignedUrl },
  structured_specification:{ music:{ caption:fixture.caption, instrumental:true, duration_seconds:fixture.duration, bpm:fixture.bpm }, provider_parameters:providerParameters },
  storage_upload:{ signed_url:outputSignedUrl, storage_reference:outputReference },
  certification:{ contract:CERT_CONTRACT, scope:"music-transform-only", capability:selectedCapability, candidate:true, provider_spend_approved:true, source_rights_confirmed:true, max_provider_jobs:1, benchmark_runs:1, human_review_required:true, automatic_human_review_approved:false, production_activation_allowed:false, pricing_activation_allowed:false, provider_selection_change_allowed:false },
};
const sdk = await import("modal"); const client = new sdk.ModalClient({tokenId,tokenSecret});
const environment=text(process.env.AVANTIQO_AUDIO_MODAL_ENVIRONMENT||process.env.MODAL_ENVIRONMENT);
const worker = await client.functions.fromName(APP_NAME, FUNCTION_NAME, environment?{environment}:{});
const call = await worker.spawn([payload]); const jobId=text(call.functionCallId); if(!jobId) throw new Error("AVANTIQO_MUSIC_TRANSFORM_MODAL_CALL_ID_REQUIRED");
let output; try { output = await call.get({timeoutMs:25*60*1000}); } catch(error) { throw new Error(`AVANTIQO_MUSIC_TRANSFORM_MODAL_JOB_FAILED:${text(error?.message||error)}`); }
const basePassed = text(output?.capability)===selectedCapability && output?.certification_candidate===true && output?.production_certified===false && output?.activation_allowed===false && output?.human_review_required===true && text(output?.certification_contract)===CERT_CONTRACT && output?.source_audio_used===true && text(output?.storage_reference)===outputReference && Number(output?.size_bytes)>10000;
const extendPassed = selectedCapability !== "ai.audio.extend" || (text(output?.task_type)==="repaint" && text(output?.temporal_extend_strategy)==="XL_TURBO_REPAINT_RIGHT_OUTPAINT" && Number(output?.duration_seconds)>Number(output?.source_duration_seconds)+1 && output?.temporal_extension_observed===true && Number(output?.extension_seconds_requested)===EXTEND_SECONDS);
const passed=basePassed&&extendPassed;
const technicalProof = selectedCapability === "ai.audio.extend" ? extendPassed : passed;
const report={ contract:BENCHMARK_CONTRACT, generated_at:new Date().toISOString(), infrastructure_provider:"MODAL_DIRECT_A10G_ASYNC_V1", modal_app:APP_NAME, modal_function:FUNCTION_NAME, capability:selectedCapability, provider_jobs_submitted:1, provider_job_count:1, job_id:jobId, source_rights_confirmed:true, source_mode:fixture.mode, source_fixture:fixture.metadata, source_duration_seconds:fixture.duration, temporal_extension_technical_proven:selectedCapability==="ai.audio.extend"&&technicalProof, remix_variation_technical_proven:selectedCapability==="ai.audio.remix"&&technicalProof, edit_technical_proven:selectedCapability==="ai.audio.edit"&&technicalProof, human_review_required:true, human_review_status:"PENDING", human_review_kind:fixture.humanReviewKind, eligible_for_human_release_review:fixture.eligible&&technicalProof, production_activation_allowed:false, pricing_activation_allowed:false, provider_selection_change_allowed:false, passed, output:{ capability:output?.capability, task_type:output?.task_type, model_variant:output?.model_variant, quality_profile:output?.quality_profile, source_audio_used:output?.source_audio_used, audio_cover_strength:output?.audio_cover_strength??null, certification_candidate:output?.certification_candidate, production_certified:output?.production_certified, activation_allowed:output?.activation_allowed, storage_reference:output?.storage_reference, duration_seconds:output?.duration_seconds, source_duration_seconds:output?.source_duration_seconds, extension_seconds_requested:output?.extension_seconds_requested, continuity_overlap_seconds:output?.continuity_overlap_seconds, repainting_start:output?.repainting_start, repainting_end:output?.repainting_end, temporal_extend_strategy:output?.temporal_extend_strategy, temporal_extension_observed:output?.temporal_extension_observed, size_bytes:output?.size_bytes } };
const reportPath=resolve(process.env.AVANTIQO_MUSIC_TRANSFORM_BENCHMARK_OUTPUT||`/tmp/${id}.json`); await writeFile(reportPath,`${JSON.stringify(report,null,2)}\n`);
console.log(JSON.stringify({success:passed,contract:BENCHMARK_CONTRACT,capability:selectedCapability,infrastructure_provider:report.infrastructure_provider,provider_jobs_submitted:1,human_review_status:"PENDING",production_activation_performed:false,pricing_activation_performed:false,provider_selection_change_performed:false,output_path:reportPath},null,2));
if(!passed) process.exitCode=1;
