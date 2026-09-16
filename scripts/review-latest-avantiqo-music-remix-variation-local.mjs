#!/usr/bin/env node

import os from "node:os";
import path from "node:path";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const TMP = "/tmp";
const DOWNLOADS = path.join(os.homedir(), "Downloads");
const BENCHMARK_CONTRACT = "AVANTIQO_MUSIC_TRANSFORM_CERTIFICATION_BENCHMARK_V3";
const REVIEW_KIND = "MUSICAL_VARIATION";
const EXPECTED_CAPABILITY = "ai.audio.remix";
const EXPECTED_TASK_TYPE = "cover";
const EXPECTED_COVER_STRENGTH = 0.6;
const METAL_PROFILE_CONTRACT = "AVANTIQO_MUSIC_METAL_CONTINUITY_FIXTURE_V1";

const text = (value) => String(value ?? "").trim();
function required(name) { const value = text(process.env[name]); if (!value) throw new Error(`${name}_REQUIRED`); return value; }
function arg(prefix) { return text(process.argv.slice(2).find((entry) => entry.startsWith(prefix))?.slice(prefix.length)); }
function encodeObjectPath(bucket, objectPath) {
  return [bucket, ...text(objectPath).split("/").filter(Boolean)].map((part) => encodeURIComponent(part)).join("/");
}
function parseStorageReference(value) {
  const match = /^storage:\/\/([^/]+)\/(.+)$/i.exec(text(value));
  if (!match) return null;
  return { bucket: match[1], objectPath: match[2] };
}
function eligible(report) {
  return (
    report?.contract === BENCHMARK_CONTRACT &&
    report?.passed === true &&
    text(report?.capability) === EXPECTED_CAPABILITY &&
    report?.provider_jobs_submitted === 1 &&
    report?.remix_variation_technical_proven === true &&
    report?.human_review_required === true &&
    text(report?.human_review_status) === "PENDING" &&
    text(report?.human_review_kind) === REVIEW_KIND &&
    text(report?.source_mode) === "MUSICAL_VARIATION" &&
    report?.eligible_for_human_release_review === true &&
    text(report?.source_fixture?.profile) === "DYNAMIC_METAL" &&
    text(report?.source_fixture?.profile_contract) === METAL_PROFILE_CONTRACT &&
    report?.source_fixture?.original_composition === true &&
    report?.source_fixture?.royalty_free === true &&
    report?.source_fixture?.external_reference_recording_used === false &&
    report?.source_fixture?.artist_imitation_requested === false &&
    text(report?.infrastructure_provider) === "MODAL_DIRECT_A10G_ASYNC_V1" &&
    text(report?.output?.task_type) === EXPECTED_TASK_TYPE &&
    Math.abs(Number(report?.output?.audio_cover_strength) - EXPECTED_COVER_STRENGTH) <= 0.001 &&
    report?.output?.source_audio_used === true &&
    report?.output?.certification_candidate === true &&
    report?.output?.production_certified === false &&
    report?.output?.activation_allowed === false
  );
}

const candidates = [];
for (const name of await readdir(TMP)) {
  if (!/^(?:music-remix-variation|music-transform)-.*\.json$/i.test(name)) continue;
  const reportPath = path.resolve(TMP, name);
  try {
    const report = JSON.parse(await readFile(reportPath, "utf8"));
    if (!eligible(report)) continue;
    const fileStat = await stat(reportPath);
    candidates.push({ reportPath, report, mtimeMs: fileStat.mtimeMs });
  } catch {}
}

candidates.sort((a, b) => {
  const at = Date.parse(text(a.report?.generated_at));
  const bt = Date.parse(text(b.report?.generated_at));
  if (Number.isFinite(at) && Number.isFinite(bt) && at !== bt) return bt - at;
  return b.mtimeMs - a.mtimeMs;
});

const selected = candidates[0];
if (!selected) throw new Error("AVANTIQO_MUSIC_REMIX_VARIATION_ELIGIBLE_REPORT_NOT_FOUND");
const storage = parseStorageReference(selected.report?.output?.storage_reference);
if (!storage) throw new Error("AVANTIQO_MUSIC_REMIX_VARIATION_STORAGE_REFERENCE_INVALID");

const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL").replace(/\/+$/, "");
const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
const objectUrl = `${supabaseUrl}/storage/v1/object/${encodeObjectPath(storage.bucket, storage.objectPath)}`;
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
  throw new Error(`AVANTIQO_MUSIC_REMIX_VARIATION_DOWNLOAD_HTTP_${response.status}:${text(raw).slice(0, 400)}`);
}
const audio = Buffer.from(await response.arrayBuffer());
if (audio.length < 10_000) throw new Error("AVANTIQO_MUSIC_REMIX_VARIATION_AUDIO_TOO_SMALL");
await mkdir(DOWNLOADS, { recursive: true });
const reviewDir = path.join(DOWNLOADS, "Avantiqo-Music-Remix-Variation", text(selected.report?.job_id) || "latest");
await mkdir(reviewDir, { recursive: true });
const outputPath = path.join(reviewDir, "remix-output.wav");
await writeFile(outputPath, audio);
const sourceStorage = parseStorageReference(selected.report?.source_storage_reference);
if (!sourceStorage) throw new Error("AVANTIQO_MUSIC_REMIX_VARIATION_SOURCE_STORAGE_REFERENCE_INVALID");
const sourceObjectUrl = `${supabaseUrl}/storage/v1/object/${encodeObjectPath(sourceStorage.bucket, sourceStorage.objectPath)}`;
const sourceResponse = await fetch(sourceObjectUrl, {
  headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey, Accept: "audio/wav,application/octet-stream" },
  signal: AbortSignal.timeout(60_000),
});
if (!sourceResponse.ok) throw new Error(`AVANTIQO_MUSIC_REMIX_VARIATION_SOURCE_DOWNLOAD_HTTP_${sourceResponse.status}:${text(await sourceResponse.text()).slice(0, 400)}`);
const sourceAudio = Buffer.from(await sourceResponse.arrayBuffer());
if (sourceAudio.length < 10_000) throw new Error("AVANTIQO_MUSIC_REMIX_VARIATION_SOURCE_AUDIO_TOO_SMALL");
const sourcePath = path.join(reviewDir, "source.wav");
await writeFile(sourcePath, sourceAudio);
function pcmFingerprint(audioPath) {
  const result = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", audioPath, "-ac", "1", "-ar", "48000", "-f", "f32le", "-"], { encoding: null, maxBuffer: 256 * 1024 * 1024 });
  if (result.status !== 0) throw new Error("AVANTIQO_MUSIC_REMIX_VARIATION_PCM_DECODE_FAILED");
  return Buffer.from(result.stdout);
}
function waveformMetrics(sourceBytes, remixBytes) {
  const n = Math.min(Math.floor(sourceBytes.length / 4), Math.floor(remixBytes.length / 4));
  if (n < 48000) throw new Error("AVANTIQO_MUSIC_REMIX_VARIATION_PCM_TOO_SHORT");
  let sm=0, rm=0; for(let i=0;i<n;i++){sm+=sourceBytes.readFloatLE(i*4); rm+=remixBytes.readFloatLE(i*4);} sm/=n; rm/=n;
  let dot=0, sv=0, rv=0; for(let i=0;i<n;i++){const a=sourceBytes.readFloatLE(i*4)-sm,b=remixBytes.readFloatLE(i*4)-rm; dot+=a*b; sv+=a*a; rv+=b*b;}
  const correlation=dot/Math.sqrt(Math.max(1e-18,sv*rv));
  return { correlation:Number(correlation.toFixed(6)), recognizable_identity_floor_passed:correlation>=0.05, alternate_arrangement_passed:correlation<=0.98 };
}
const variationEvidence = waveformMetrics(pcmFingerprint(sourcePath), pcmFingerprint(outputPath));
if (!variationEvidence.recognizable_identity_floor_passed || !variationEvidence.alternate_arrangement_passed) throw new Error("AVANTIQO_MUSIC_REMIX_VARIATION_TECHNICAL_VARIATION_EVIDENCE_FAILED");
const reviewPacketPath = path.join(reviewDir, "remix-human-review.json");
const reviewPacket = {
  success:true, contract:"AVANTIQO_MUSIC_REMIX_VARIATION_HUMAN_REVIEW_PREP_V2", generated_at:new Date().toISOString(),
  benchmark_report_path:selected.reportPath, benchmark_job_id:text(selected.report?.job_id), capability:EXPECTED_CAPABILITY,
  source_mode:"MUSICAL_VARIATION", human_review_kind:REVIEW_KIND, source_path:sourcePath, remix_path:outputPath, variation_evidence:variationEvidence,
  minimum_average_score:92, automatic_human_approval_forbidden:true, human_review_status:"PENDING", reviewer:"", reviewed_at:null,
  criteria:[
    {criterion:"recognizable_source_identity",minimum_score:88,score_0_100:null,status:"PENDING",evidence_note:""},
    {criterion:"alternate_arrangement_strength",minimum_score:92,score_0_100:null,status:"PENDING",evidence_note:""},
    {criterion:"new_original_material_quality",minimum_score:92,score_0_100:null,status:"PENDING",evidence_note:""},
    {criterion:"musical_coherence",minimum_score:92,score_0_100:null,status:"PENDING",evidence_note:""},
    {criterion:"artifact_control",minimum_score:92,score_0_100:null,status:"PENDING",evidence_note:""},
    {criterion:"commercial_music_studio_readiness",minimum_score:92,score_0_100:null,status:"PENDING",evidence_note:""}
  ], production_certified:false, production_activation_allowed:false, pricing_activation_allowed:false, provider_selection_change_allowed:false
};
await writeFile(reviewPacketPath, `${JSON.stringify(reviewPacket, null, 2)}\n`);

let opened = false;
if (process.platform === "darwin" && text(process.env.AVANTIQO_MUSIC_TRANSFORM_REVIEW_OPEN).toUpperCase() !== "NO") {
  opened = spawnSync("open", [outputPath], { stdio: "ignore" }).status === 0;
}

console.log(JSON.stringify({
  success: true,
  contract: "AVANTIQO_MUSIC_REMIX_VARIATION_REVIEW_PREP_V1",
  benchmark_report_path: selected.reportPath,
  benchmark_job_id: text(selected.report?.job_id),
  capability: EXPECTED_CAPABILITY,
  human_review_kind: REVIEW_KIND,
  human_review_status: "PENDING",
  review_audio_path: outputPath,
  source_audio_path: sourcePath,
  review_packet_path: reviewPacketPath,
  variation_evidence: variationEvidence,
  minimum_average_score: 92,
  automatic_human_approval_forbidden: true,
  review_audio_size_bytes: audio.length,
  opened_for_review: opened,
  provider_jobs_submitted: 0,
  modal_direct_execution: true,
  production_activation_performed: false,
  next_step: "LISTEN_FOR_RECOGNIZABLE_SOURCE_IDENTITY_CLEAR_ALTERNATE_ARRANGEMENT_NEW_ORIGINAL_MATERIAL_AND_NO_MAJOR_ARTIFACTS",
}, null, 2));

const recordVerdict = arg("--verdict=").toUpperCase();
if (recordVerdict) {
  if (!["APPROVED", "REJECTED"].includes(recordVerdict)) throw new Error("AVANTIQO_MUSIC_REMIX_VARIATION_REVIEW_VERDICT_INVALID");
  const reviewer = arg("--reviewer=");
  if (!reviewer) throw new Error("AVANTIQO_MUSIC_REMIX_VARIATION_REVIEWER_REQUIRED");
  const notes = arg("--notes=");
  const scores = arg("--scores=");
  if (!scores) throw new Error("AVANTIQO_MUSIC_REMIX_VARIATION_REVIEW_SCORES_REQUIRED");
  const numericScores = scores.split(",").map((value) => Number(value.trim()));
  if (numericScores.length !== 6 || numericScores.some((value) => !Number.isFinite(value) || value < 0 || value > 100)) throw new Error("AVANTIQO_MUSIC_REMIX_VARIATION_REVIEW_SCORES_INVALID");
  const averageScore = numericScores.reduce((sum, value) => sum + value, 0) / numericScores.length;
  if (recordVerdict === "APPROVED" && averageScore < 92) throw new Error("AVANTIQO_MUSIC_REMIX_VARIATION_REVIEW_SCORE_BELOW_THRESHOLD");
  const result = {
    success: true,
    contract: "AVANTIQO_MUSIC_REMIX_VARIATION_HUMAN_REVIEW_RESULT_V1",
    generated_at: new Date().toISOString(),
    benchmark_contract: BENCHMARK_CONTRACT,
    benchmark_report_path: selected.reportPath,
    benchmark_job_id: text(selected.report?.job_id),
    endpoint_id: text(selected.report?.endpoint_id),
      capability: EXPECTED_CAPABILITY,
    source_mode: "MUSICAL_VARIATION",
    source_profile: "DYNAMIC_METAL",
    source_profile_contract: METAL_PROFILE_CONTRACT,
    remix_variation_technical_proven: true,
    human_review_required: true,
    human_review_kind: REVIEW_KIND,
    human_review_status: recordVerdict,
    reviewer,
    notes: notes || null,
    criterion_scores: numericScores,
    average_score: Number(averageScore.toFixed(2)),
    minimum_average_score: 92,
    automatic_human_approval_forbidden: true,
    variation_evidence: variationEvidence,
    provider_jobs_submitted: 0,
    modal_direct_execution: true,
    production_activation_allowed: false,
    pricing_activation_allowed: false,
    provider_selection_change_allowed: false,
    production_activation_performed: false,
    pricing_activation_performed: false,
    provider_selection_change_performed: false,
    eligible_for_later_release_decision: recordVerdict === "APPROVED",
  };
  const reviewPath = path.resolve(`/tmp/music-remix-variation-human-review-${text(selected.report?.job_id) || Date.now()}.json`);
  await writeFile(reviewPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    success: true,
    contract: result.contract,
    human_review_status: recordVerdict,
    eligible_for_later_release_decision: result.eligible_for_later_release_decision,
    provider_jobs_submitted: 0,
    modal_direct_execution: true,
    production_activation_performed: false,
    output_path: reviewPath,
  }, null, 2));
}
