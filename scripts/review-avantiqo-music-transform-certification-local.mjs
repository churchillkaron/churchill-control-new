#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_MUSIC_TRANSFORM_HUMAN_REVIEW_PREP_V1";
const BENCHMARK_CONTRACT = "AVANTIQO_MUSIC_TRANSFORM_CERTIFICATION_BENCHMARK_V2";
const SAFE_LEASE_LANE = "music-transform-candidate";
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
  report?.temporal_extension_technical_proven !== true ||
  report?.human_review_required !== true ||
  text(report?.human_review_status) !== "PENDING" ||
  report?.production_activation_allowed !== false ||
  report?.pricing_activation_allowed !== false ||
  report?.provider_selection_change_allowed !== false ||
  text(report?.safe_lease_lane) !== SAFE_LEASE_LANE ||
  report?.output?.certification_candidate !== true ||
  report?.output?.production_certified !== false ||
  report?.output?.activation_allowed !== false ||
  report?.output?.temporal_extension_observed !== true
) {
  throw new Error("AVANTIQO_MUSIC_TRANSFORM_HUMAN_REVIEW_REPORT_NOT_ELIGIBLE");
}

const { bucket, objectPath } = parseStorageReference(report?.output?.storage_reference);
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
const reviewAudioPath = resolve(arg("--output=") || `/tmp/${jobId}-human-review.wav`);
await writeFile(reviewAudioPath, audio);

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
  report_path: reportPath,
  review_audio_path: reviewAudioPath,
  review_audio_size_bytes: audio.length,
  opened_for_review: opened,
  human_review_status: "PENDING",
  temporal_extension_technical_proven: true,
  provider_jobs_submitted: 0,
  runpod_lease_opened: false,
  production_activation_performed: false,
  pricing_activation_performed: false,
  next_step: "LISTEN_THEN_RECORD_APPROVED_OR_REJECTED",
}, null, 2));
