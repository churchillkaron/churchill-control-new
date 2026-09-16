#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_MUSIC_TRANSFORM_HUMAN_REVIEW_PREP_V1";
const BENCHMARK_CONTRACT = "AVANTIQO_MUSIC_TRANSFORM_CERTIFICATION_BENCHMARK_V3";
const CONTINUITY_FIXTURE_CONTRACT = "AVANTIQO_MUSIC_CONTINUITY_FIXTURE_V1";
const EXPECTED_CAPABILITY = "ai.audio.extend";

const text = (value) => String(value ?? "").trim();
function required(name) { const value = text(process.env[name]); if (!value) throw new Error(`${name}_REQUIRED`); return value; }
function arg(prefix) { return text(process.argv.slice(2).find((entry) => entry.startsWith(prefix))?.slice(prefix.length)); }
function encodeObjectPath(bucket, objectPath) {
  return [bucket, ...text(objectPath).split("/").filter(Boolean)].map((part) => encodeURIComponent(part)).join("/");
}
function parseStorageReference(value) {
  const match = /^storage:\/\/([^/]+)\/(.+)$/i.exec(text(value));
  if (!match) throw new Error("AVANTIQO_MUSIC_TRANSFORM_HUMAN_REVIEW_STORAGE_REFERENCE_INVALID");
  return { bucket: match[1], objectPath: match[2] };
}

const reportPath = resolve(arg("--report=") || required("AVANTIQO_MUSIC_TRANSFORM_REVIEW_REPORT"));
const report = JSON.parse(await readFile(reportPath, "utf8"));
if (
  report?.contract !== BENCHMARK_CONTRACT ||
  report?.passed !== true ||
  text(report?.capability) !== EXPECTED_CAPABILITY ||
  report?.provider_jobs_submitted !== 1 ||
  text(report?.infrastructure_provider) !== "MODAL_DIRECT_A10G_ASYNC_V1" ||
  report?.temporal_extension_technical_proven !== true ||
  report?.human_review_required !== true ||
  text(report?.human_review_status) !== "PENDING" ||
  text(report?.human_review_kind) !== "MUSICAL_CONTINUITY" ||
  text(report?.source_mode) !== "MUSICAL_CONTINUITY" ||
  report?.eligible_for_human_release_review !== true ||
  text(report?.source_fixture?.contract) !== CONTINUITY_FIXTURE_CONTRACT ||
  report?.source_fixture?.original_composition !== true ||
  report?.source_fixture?.royalty_free !== true ||
  report?.production_activation_allowed !== false ||
  report?.pricing_activation_allowed !== false ||
  report?.provider_selection_change_allowed !== false ||
  report?.output?.certification_candidate !== true ||
  report?.output?.production_certified !== false ||
  report?.output?.activation_allowed !== false ||
  report?.output?.temporal_extension_observed !== true
) {
  throw new Error("AVANTIQO_MUSIC_TRANSFORM_HUMAN_REVIEW_REPORT_NOT_ELIGIBLE");
}

const { bucket, objectPath } = parseStorageReference(report?.output?.storage_reference);
const sourceStorage = parseStorageReference(report?.source_storage_reference);
const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL").replace(/\/+$/, "");
const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
const objectUrl = `${supabaseUrl}/storage/v1/object/${encodeObjectPath(bucket, objectPath)}`;
const response = await fetch(objectUrl, {
  headers: {
    Authorization: `Bearer ${serviceRoleKey}`,
    apikey: serviceRoleKey,
    Accept: "audio/wav,application/octet-stream",
  },
  signal: AbortSignal.timeout(60_000),
});
if (!response.ok) {
  const raw = await response.text();
  throw new Error(`AVANTIQO_MUSIC_TRANSFORM_HUMAN_REVIEW_DOWNLOAD_HTTP_${response.status}:${text(raw).slice(0, 500)}`);
}
const audio = Buffer.from(await response.arrayBuffer());
if (audio.length < 10_000) throw new Error("AVANTIQO_MUSIC_TRANSFORM_HUMAN_REVIEW_AUDIO_TOO_SMALL");

const jobId = text(report?.job_id) || `music-transform-${Date.now()}`;
const reviewDir = resolve(arg("--dir=") || `${homedir()}/Downloads/Avantiqo-Extend-Certification/${jobId}`);
await mkdir(reviewDir, { recursive: true });
const reviewAudioPath = resolve(reviewDir, "extended-output.wav");
await writeFile(reviewAudioPath, audio);
const sourceUrl = `${supabaseUrl}/storage/v1/object/${encodeObjectPath(sourceStorage.bucket, sourceStorage.objectPath)}`;
const sourceResponse = await fetch(sourceUrl, { headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey }, signal: AbortSignal.timeout(60_000) });
if (!sourceResponse.ok) throw new Error(`AVANTIQO_MUSIC_EXTEND_SOURCE_DOWNLOAD_HTTP_${sourceResponse.status}`);
const sourceAudio = Buffer.from(await sourceResponse.arrayBuffer());
const sourcePath = resolve(reviewDir, "source.wav");
await writeFile(sourcePath, sourceAudio);
function pcm(path) { const r=spawnSync("ffmpeg",["-hide_banner","-loglevel","error","-i",path,"-ac","1","-ar","48000","-f","f32le","-"],{encoding:null,maxBuffer:256*1024*1024}); if(r.status!==0) throw new Error("AVANTIQO_MUSIC_EXTEND_PCM_DECODE_FAILED"); return Buffer.from(r.stdout); }
function metrics(a,b,start,end){ const sr=48000; const x0=Math.round(start*sr), x1=Math.round(end*sr); let n=Math.min(x1,Math.floor(a.length/4),Math.floor(b.length/4))-x0; let am=0,bm=0; for(let i=0;i<n;i++){am+=a.readFloatLE((x0+i)*4);bm+=b.readFloatLE((x0+i)*4);} am/=n;bm/=n; let dot=0,av=0,bv=0; for(let i=0;i<n;i++){const x=a.readFloatLE((x0+i)*4)-am,y=b.readFloatLE((x0+i)*4)-bm;dot+=x*y;av+=x*x;bv+=y*y;} return {correlation:Number((dot/Math.sqrt(Math.max(1e-18,av*bv))).toFixed(6))}; }
const sourcePcm=pcm(sourcePath), outputPcm=pcm(reviewAudioPath);
const sourceDuration=Number(report?.source_duration_seconds); const overlap=Number(report?.output?.continuity_overlap_seconds); const extensionEnd=Number(report?.output?.duration_seconds);
const untouchedEnd=Math.max(0,sourceDuration-overlap);
const prefix=metrics(sourcePcm,outputPcm,0,untouchedEnd);
let extensionEnergy=0, extensionSamples=0; for(let i=Math.round(sourceDuration*48000);i<Math.min(Math.floor(outputPcm.length/4),Math.round(extensionEnd*48000));i++){const v=outputPcm.readFloatLE(i*4);extensionEnergy+=v*v;extensionSamples++;}
const extensionRms=Math.sqrt(extensionEnergy/Math.max(1,extensionSamples));
const technicalContinuity={prefix_preservation_correlation:prefix.correlation,prefix_preservation_passed:prefix.correlation>=0.995,extension_rms:Number(extensionRms.toFixed(6)),extension_audio_present:extensionRms>=0.001,automatic_musical_continuity_inference_forbidden:true};
if (!technicalContinuity.prefix_preservation_passed || !technicalContinuity.extension_audio_present) throw new Error("AVANTIQO_MUSIC_EXTEND_TECHNICAL_CONTINUITY_FAILED");
const packetPath=resolve(reviewDir,"extend-human-review.json");
await writeFile(packetPath,JSON.stringify({success:true,contract:"AVANTIQO_MUSIC_EXTEND_HUMAN_REVIEW_PREP_V2",benchmark_report_path:reportPath,benchmark_job_id:jobId,source_path:sourcePath,extended_output_path:reviewAudioPath,technical_continuity:technicalContinuity,minimum_average_score:92,automatic_human_approval_forbidden:true,human_review_status:"PENDING",criteria:[{criterion:"seamlessness_at_overlap_boundary",minimum_score:92,score_0_100:null},{criterion:"harmonic_continuity",minimum_score:92,score_0_100:null},{criterion:"rhythmic_continuity",minimum_score:92,score_0_100:null},{criterion:"melodic_and_timbre_continuity",minimum_score:92,score_0_100:null},{criterion:"artifact_control",minimum_score:92,score_0_100:null},{criterion:"commercial_music_studio_readiness",minimum_score:92,score_0_100:null}],production_certified:false,production_activation_allowed:false,pricing_activation_allowed:false,provider_selection_change_allowed:false},null,2)+"\n");

let opened = false;
if (process.platform === "darwin" && text(process.env.AVANTIQO_MUSIC_TRANSFORM_REVIEW_OPEN).toUpperCase() !== "NO") {
  const openedResult = spawnSync("open", [reviewAudioPath], { stdio: "ignore" });
  opened = openedResult.status === 0;
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  benchmark_contract: BENCHMARK_CONTRACT,
  capability: EXPECTED_CAPABILITY,
  source_mode: "MUSICAL_CONTINUITY",
  source_fixture_contract: CONTINUITY_FIXTURE_CONTRACT,
  source_fixture_progression: report?.source_fixture?.progression || null,
  source_fixture_final_harmony: report?.source_fixture?.final_harmony || null,
  source_duration_seconds: report?.source_duration_seconds,
  report_path: reportPath,
  review_audio_path: reviewAudioPath,
  source_audio_path: sourcePath,
  review_packet_path: packetPath,
  technical_continuity: technicalContinuity,
  minimum_average_score: 92,
  automatic_human_approval_forbidden: true,
  review_audio_size_bytes: audio.length,
  opened_for_review: opened,
  human_review_status: "PENDING",
  human_review_kind: "MUSICAL_CONTINUITY",
  temporal_extension_technical_proven: true,
  provider_jobs_submitted: 0,
  modal_direct_execution: true,
  production_activation_performed: false,
  pricing_activation_performed: false,
  next_step: "LISTEN_FOR_SEAMLESS_HARMONY_RHYTHM_MELODY_AND_TIMBRE_CONTINUATION_THEN_RECORD_APPROVED_OR_REJECTED",
}, null, 2));
