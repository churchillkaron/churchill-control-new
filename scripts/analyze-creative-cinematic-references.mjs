import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ffmpeg = process.env.FFMPEG_PATH || "/opt/homebrew/bin/ffmpeg";
const ffprobe = process.env.FFPROBE_PATH || "/opt/homebrew/bin/ffprobe";
const inputDir = process.env.AVANTIQO_REFERENCE_VIDEO_DIR || "/tmp/avantiqo-reference-bench";

const REFERENCES = [
  { id: "sitXeGjm4Mc", role: "MYSTERY_REVEAL_EFFECTS" },
  { id: "5wjBHDogyko", role: "LUXURY_CONTINUITY_REVEAL" },
  { id: "vr8NwCFjGa0", role: "ENGINEERED_MOTION_SCALE" },
  { id: "Slz3lJcqfd4", role: "TACTILE_MECHANICAL_DETAIL" },
  { id: "lnjSaGxfZ1g", role: "DOCUMENTARY_TRUTH_PLACE_HUMANITY" },
];

function run(binary, args) {
  const result = spawnSync(binary, args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || "command failed").trim());
  return `${result.stdout || ""}\n${result.stderr || ""}`;
}function findReferenceFile(id) {
  if (!fs.existsSync(inputDir)) return null;
  const match = fs.readdirSync(inputDir).find((name) => name.startsWith(`${id}.`));
  return match ? path.join(inputDir, match) : null;
}

function probe(file) {
  const raw = run(ffprobe, [
    "-v", "error", "-show_entries", "format=duration",
    "-show_entries", "stream=width,height,avg_frame_rate",
    "-of", "json", file,
  ]);
  return JSON.parse(raw.trim());
}

function parseTimes(output, pattern) {
  const values = [];
  for (const line of output.split("\n")) {
    const match = line.match(pattern);
    if (match) values.push(Number(match[1]));
  }
  return values.filter(Number.isFinite).sort((a, b) => a - b);
}

function sceneCuts(file) {
  const output = run(ffmpeg, [
    "-hide_banner", "-i", file,
    "-vf", "select='gt(scene,0.28)',showinfo",
    "-an", "-f", "null", "-",
  ]);
  return parseTimes(output, /pts_time:([0-9.]+)/);
}function blackSegments(file) {
  const output = run(ffmpeg, [
    "-hide_banner", "-i", file,
    "-vf", "blackdetect=d=0.08:pix_th=0.10",
    "-an", "-f", "null", "-",
  ]);
  const segments = [];
  for (const line of output.split("\n")) {
    const match = line.match(/black_start:([0-9.]+) black_end:([0-9.]+) black_duration:([0-9.]+)/);
    if (match) segments.push({ start: Number(match[1]), end: Number(match[2]), duration: Number(match[3]) });
  }
  return segments;
}

function silenceSegments(file) {
  const output = run(ffmpeg, [
    "-hide_banner", "-i", file,
    "-af", "silencedetect=n=-42dB:d=0.12",
    "-vn", "-f", "null", "-",
  ]);
  const starts = parseTimes(output, /silence_start: ([0-9.]+)/);
  const ends = parseTimes(output, /silence_end: ([0-9.]+)/);
  return starts.map((start, index) => ({ start, end: ends[index] ?? null, duration: ends[index] == null ? null : ends[index] - start }));
}

function intervals(duration, cuts) {
  const boundaries = [0, ...cuts.filter((value) => value > 0 && value < duration), duration];
  return boundaries.slice(1).map((end, index) => Number((end - boundaries[index]).toFixed(3))).filter((value) => value > 0);
}

function summary(values) {
  if (!values.length) return { count: 0, min: null, max: null, mean: null, median: null };
  const sorted = [...values].sort((a, b) => a - b);
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  return { count: sorted.length, min: sorted[0], max: sorted.at(-1), mean: Number(mean.toFixed(3)), median: Number(median.toFixed(3)) };
}function analyzeReference(reference) {
  const file = findReferenceFile(reference.id);
  if (!file) return { ...reference, available: false, blocker: "REFERENCE_FILE_NOT_AVAILABLE" };
  const metadata = probe(file);
  const duration = Number(metadata.format?.duration || 0);
  const cuts = sceneCuts(file);
  const shotDurations = intervals(duration, cuts);
  const blacks = blackSegments(file);
  const silences = silenceSegments(file);
  return {
    ...reference,
    available: true,
    source_file: path.basename(file),
    duration_seconds: Number(duration.toFixed(3)),
    detected_cut_count: cuts.length,
    cuts_seconds: cuts.map((value) => Number(value.toFixed(3))),
    shot_duration_distribution: summary(shotDurations),
    short_punctuation_ratio: shotDurations.length ? Number((shotDurations.filter((value) => value <= 1.5).length / shotDurations.length).toFixed(3)) : 0,
    long_hold_ratio: shotDurations.length ? Number((shotDurations.filter((value) => value >= 4).length / shotDurations.length).toFixed(3)) : 0,
    black_segments: blacks,
    black_total_seconds: Number(blacks.reduce((sum, item) => sum + item.duration, 0).toFixed(3)),
    silence_segments: silences,
    silence_total_seconds: Number(silences.reduce((sum, item) => sum + (item.duration || 0), 0).toFixed(3)),
  };
}

const references = REFERENCES.map(analyzeReference);
const measurementsVerified = references.every((item) => item.available === true);
const result = {
  contract: "CREATIVE_CINEMATIC_REFERENCE_MEASUREMENT_V1",
  generated_at: new Date().toISOString(),
  measurement_mode: "LOCAL_FFMPEG_OBJECTIVE_EDITORIAL_METRICS",
  measurements_verified: measurementsVerified,
  provider_calls_executed: 0,
  media_generation_executed: 0,
  references,
};const outputPath = path.join(root, "audits/results/creative-reference-grammar-benchmark.json");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
process.exitCode = measurementsVerified ? 0 : 2;
