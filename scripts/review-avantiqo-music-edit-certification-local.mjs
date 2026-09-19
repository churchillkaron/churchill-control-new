#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";
loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_MUSIC_EDIT_HUMAN_REVIEW_PREP_V1";
const BENCHMARK_CONTRACT = "AVANTIQO_MUSIC_TRANSFORM_CERTIFICATION_BENCHMARK_V3";
const EXPECTED_CAPABILITY = "ai.audio.edit";
const EXPECTED_SOURCE_MODE = "MUSICAL_EDIT";
const EXPECTED_REVIEW_KIND = "MUSICAL_SURGICAL_EDIT";
const text = (value) => String(value ?? "").trim();
const required = (name) => { const value = text(process.env[name]); if (!value) throw new Error(`${name}_REQUIRED`); return value; };
const arg = (prefix) => text(process.argv.slice(2).find((entry) => entry.startsWith(prefix))?.slice(prefix.length));

function parseStorageReference(value) {
  const match = /^storage:\/\/([^/]+)\/(.+)$/i.exec(text(value));
  if (!match) throw new Error("AVANTIQO_MUSIC_EDIT_STORAGE_REFERENCE_INVALID");
  return { bucket: match[1], objectPath: match[2] };
}
function encodeObjectPath(bucket, objectPath) {
  return [bucket, ...objectPath.split("/").filter(Boolean)].map(encodeURIComponent).join("/");
}
async function downloadStorage(reference, destination) {
  const { bucket, objectPath } = parseStorageReference(reference);
  const base = required("NEXT_PUBLIC_SUPABASE_URL").replace(/\/+$/, "");
  const key = required("SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(`${base}/storage/v1/object/${encodeObjectPath(bucket, objectPath)}`, {
    headers: { Authorization: `Bearer ${key}`, apikey: key }, signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`AVANTIQO_MUSIC_EDIT_DOWNLOAD_HTTP_${response.status}:${text(await response.text()).slice(0,300)}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 10_000) throw new Error("AVANTIQO_MUSIC_EDIT_AUDIO_TOO_SMALL");
  await writeFile(destination, bytes);
  return bytes.length;
}
function run(command, args, code) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${code}:${text(result.stderr || result.stdout).slice(0,500)}`);
  return text(result.stdout);
}
function readF32(path) {
  const buffer = requireBuffer(path);
  const values = new Float64Array(Math.floor(buffer.length / 4));
  for (let i = 0; i < values.length; i += 1) values[i] = buffer.readFloatLE(i * 4);
  return values;
}
function requireBuffer(path) {
  const result = spawnSync(process.execPath, ["-e", `process.stdout.write(require('fs').readFileSync(${JSON.stringify(path)}))`], { encoding: null, maxBuffer: 256 * 1024 * 1024 });
  if (result.status !== 0) throw new Error("AVANTIQO_MUSIC_EDIT_PCM_READ_FAILED");
  return Buffer.from(result.stdout);
}
function metrics(source, output) {
  const n = Math.min(source.length, output.length);
  let sourceMean = 0, outputMean = 0;
  for (let i = 0; i < n; i += 1) { sourceMean += source[i]; outputMean += output[i]; }
  sourceMean /= n; outputMean /= n;
  let dot = 0, sourceVar = 0, outputVar = 0, sourceEnergy = 0, rawDot = 0;
  for (let i = 0; i < n; i += 1) {
    const a = source[i], b = output[i], x = a - sourceMean, y = b - outputMean;
    dot += x * y; sourceVar += x * x; outputVar += y * y; sourceEnergy += a * a; rawDot += a * b;
  }
  const correlation = dot / Math.sqrt(Math.max(1e-18, sourceVar * outputVar));
  const gain = rawDot / Math.max(1e-18, sourceEnergy);
  let residual = 0, outputEnergy = 0;
  for (let i = 0; i < n; i += 1) { const d = output[i] - gain * source[i]; residual += d * d; outputEnergy += output[i] * output[i]; }
  return { correlation: Number(correlation.toFixed(6)), gain_fit: Number(gain.toFixed(6)), nrmse_after_gain: Number(Math.sqrt(residual / Math.max(1e-18, outputEnergy)).toFixed(6)) };
}
function segment(array, start, end, sampleRate = 48_000) { return array.subarray(Math.round(start * sampleRate), Math.round(end * sampleRate)); }

const reportPath = resolve(arg("--report=") || required("AVANTIQO_MUSIC_EDIT_REVIEW_REPORT"));
const report = JSON.parse(await readFile(reportPath, "utf8"));
if (report?.contract !== BENCHMARK_CONTRACT || report?.passed !== true || text(report?.capability) !== EXPECTED_CAPABILITY ||
    report?.provider_jobs_submitted !== 1 || text(report?.infrastructure_provider) !== "MODAL_DIRECT_A10G_ASYNC_V1" ||
    report?.edit_technical_proven !== true || report?.human_review_required !== true || text(report?.human_review_status) !== "PENDING" ||
    text(report?.source_mode) !== EXPECTED_SOURCE_MODE || text(report?.human_review_kind) !== EXPECTED_REVIEW_KIND ||
    report?.eligible_for_human_release_review !== true || report?.source_fixture?.original_composition !== true ||
    report?.source_fixture?.royalty_free !== true || report?.production_activation_allowed !== false || report?.pricing_activation_allowed !== false ||
    report?.provider_selection_change_allowed !== false || report?.output?.certification_candidate !== true || report?.output?.production_certified !== false ||
    report?.output?.activation_allowed !== false || Number(report?.output?.repainting_start) !== 3 || Number(report?.output?.repainting_end) !== 7) {
  throw new Error("AVANTIQO_MUSIC_EDIT_REVIEW_REPORT_NOT_ELIGIBLE");
}
const sourceReference = text(report?.source_storage_reference) || text(report?.output?.storage_reference).replace(/-output\.wav$/, "-source.wav");
const outputReference = text(report?.output?.storage_reference);
const jobId = text(report?.job_id) || `music-edit-${Date.now()}`;
const reviewDir = resolve(arg("--dir=") || `${homedir()}/Downloads/Avantiqo-Edit-Certification/${jobId}`);
await mkdir(reviewDir, { recursive: true });
const sourcePath = resolve(reviewDir, "source.wav");
const outputPath = resolve(reviewDir, "edit-output.wav");
const sourceBytes = await downloadStorage(sourceReference, sourcePath);
const outputBytes = await downloadStorage(outputReference, outputPath);
const sourcePcm = resolve(reviewDir, "source-48k-mono.f32");
const outputPcm = resolve(reviewDir, "edit-output-48k-mono.f32");
run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", sourcePath, "-ac", "1", "-ar", "48000", "-f", "f32le", sourcePcm], "AVANTIQO_MUSIC_EDIT_SOURCE_CONVERT_FAILED");
run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", outputPath, "-ac", "1", "-ar", "48000", "-f", "f32le", outputPcm], "AVANTIQO_MUSIC_EDIT_OUTPUT_CONVERT_FAILED");
const source = readF32(sourcePcm), output = readF32(outputPcm);
const pre = metrics(segment(source, 0, 3), segment(output, 0, 3));
const edited = metrics(segment(source, 3, 7), segment(output, 3, 7));
const post = metrics(segment(source, 7, 10), segment(output, 7, 10));
const preservationPassed = pre.correlation >= 0.995 && post.correlation >= 0.995 && pre.nrmse_after_gain <= 0.08 && post.nrmse_after_gain <= 0.08;
const editChangedPassed = edited.correlation <= 0.95 && edited.nrmse_after_gain >= 0.25;
if (!preservationPassed || !editChangedPassed) throw new Error("AVANTIQO_MUSIC_EDIT_SURGICAL_INTEGRITY_FAILED");
const review = {
  success: true, contract: CONTRACT, generated_at: new Date().toISOString(), benchmark_contract: BENCHMARK_CONTRACT,
  benchmark_report_path: reportPath, benchmark_job_id: jobId, capability: EXPECTED_CAPABILITY, source_mode: EXPECTED_SOURCE_MODE,
  human_review_kind: EXPECTED_REVIEW_KIND, source_path: sourcePath, output_path: outputPath, source_bytes: sourceBytes, output_bytes: outputBytes,
  repaint_window_seconds: { start: 3, end: 7 }, waveform_integrity: { preservation_passed: preservationPassed, edit_changed_passed: editChangedPassed, pre, edited, post },
  review_status: "PENDING", reviewer: "", reviewed_at: null, minimum_average_score: 92, automatic_human_approval_forbidden: true,
  criteria: [
    { criterion: "boundary_cleanliness", minimum_score: 92, score_0_100: null, status: "PENDING", evidence_note: "" },
    { criterion: "musical_coherence", minimum_score: 92, score_0_100: null, status: "PENDING", evidence_note: "" },
    { criterion: "artifact_control", minimum_score: 92, score_0_100: null, status: "PENDING", evidence_note: "" },
    { criterion: "timing_and_arrangement_preservation", minimum_score: 95, score_0_100: null, status: "PENDING", evidence_note: "" },
    { criterion: "level_and_timbre_consistency", minimum_score: 90, score_0_100: null, status: "PENDING", evidence_note: "" },
    { criterion: "commercial_music_studio_readiness", minimum_score: 92, score_0_100: null, status: "PENDING", evidence_note: "" },
  ],
  production_certified: false, production_activation_allowed: false, pricing_activation_allowed: false, provider_selection_change_allowed: false,
};
const reviewPath = resolve(arg("--output=") || `${reviewDir}/edit-human-review.json`);
await writeFile(reviewPath, `${JSON.stringify(review, null, 2)}\n`);
console.log(JSON.stringify({ success: true, contract: CONTRACT, review_path: reviewPath, source_path: sourcePath, output_path: outputPath, waveform_integrity: review.waveform_integrity, human_review_status: "PENDING", production_activation_performed: false }, null, 2));
