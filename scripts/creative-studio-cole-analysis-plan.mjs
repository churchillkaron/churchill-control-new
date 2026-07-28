#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

const DOWNLOADS = path.join(process.env.HOME || "", "Downloads");
const REPORT =
  process.env.COLE_ANALYSIS_PLAN_REPORT ||
  path.join(
    DOWNLOADS,
    `COLE_LEY_ANALYSIS_PLAN_${new Date()
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\..+$/, "")}.json`,
  );
const FFMPEG = process.env.CREATIVE_MEDIA_FFMPEG_PATH || "ffmpeg";
const FFPROBE = process.env.CREATIVE_MEDIA_FFPROBE_PATH || "ffprobe";
const MINIMUM_SECTION_SECONDS = 8;
const MAXIMUM_SECTION_SECONDS = 20;
const MINIMUM_BOUNDARY_SILENCE_SECONDS = 1.2;
const SILENCE_NOISE_DB = -32;
const SILENCE_DURATION_SECONDS = 1.2;
const SAMPLE_FRACTIONS = [0.2, 0.5, 0.8];

const FILES = [
  "IMG_0013.MOV",
  "IMG_0021.MOV",
  "IMG_0023.MOV",
  "IMG_0973.MOV",
  "IMG_0974.MOV",
  "IMG_0975.MOV",
  "IMG_2622.MOV",
  "IMG_2628.MOV",
].map((name) => ({ name, file: path.join(DOWNLOADS, name) }));

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, finite(value, minimum)));
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      const out = Buffer.concat(stdout).toString("utf8");
      const err = Buffer.concat(stderr).toString("utf8");
      if (code !== 0) {
        reject(new Error(err || `${command} exited ${code}`));
        return;
      }
      resolve({ stdout: out, stderr: err });
    });
  });
}

function parseSilences(log = "") {
  const starts = [...log.matchAll(/silence_start:\s*([0-9.]+)/g)]
    .map((match) => finite(match[1]))
    .filter((value) => value !== null);
  const ends = [...log.matchAll(/silence_end:\s*([0-9.]+)/g)]
    .map((match) => finite(match[1]))
    .filter((value) => value !== null);
  const count = Math.min(starts.length, ends.length);
  const ranges = [];

  for (let index = 0; index < count; index += 1) {
    if (ends[index] <= starts[index]) continue;
    ranges.push({
      start_seconds: starts[index],
      end_seconds: ends[index],
      duration_seconds: ends[index] - starts[index],
    });
  }
  return ranges;
}

function sectionRanges(duration, silences) {
  const points = [0];
  for (const silence of silences) {
    if (silence.duration_seconds < MINIMUM_BOUNDARY_SILENCE_SECONDS) continue;
    points.push((silence.start_seconds + silence.end_seconds) / 2);
  }
  points.push(duration);

  const unique = [...new Set(points
    .map((value) => clamp(value, 0, duration))
    .map((value) => Number(value.toFixed(3))))]
    .sort((left, right) => left - right);
  const raw = [];
  for (let index = 0; index < unique.length - 1; index += 1) {
    const start = unique[index];
    const end = unique[index + 1];
    if (end > start) raw.push({ start_seconds: start, end_seconds: end });
  }

  const merged = [];
  for (const range of raw) {
    const durationSeconds = range.end_seconds - range.start_seconds;
    if (durationSeconds >= MINIMUM_SECTION_SECONDS || !merged.length) {
      merged.push({ ...range });
      continue;
    }
    merged[merged.length - 1].end_seconds = range.end_seconds;
  }

  const sections = [];
  for (const range of merged) {
    const total = range.end_seconds - range.start_seconds;
    const parts = Math.max(1, Math.ceil(total / MAXIMUM_SECTION_SECONDS));
    const partDuration = total / parts;
    for (let index = 0; index < parts; index += 1) {
      const start = range.start_seconds + partDuration * index;
      const end = index === parts - 1
        ? range.end_seconds
        : range.start_seconds + partDuration * (index + 1);
      if (end - start < MINIMUM_SECTION_SECONDS && sections.length) {
        sections[sections.length - 1].end_seconds = end;
        sections[sections.length - 1].duration_seconds =
          end - sections[sections.length - 1].start_seconds;
        continue;
      }
      sections.push({
        index: sections.length,
        start_seconds: start,
        end_seconds: end,
        duration_seconds: end - start,
      });
    }
  }

  if (!sections.length && duration > 0) {
    sections.push({
      index: 0,
      start_seconds: 0,
      end_seconds: duration,
      duration_seconds: duration,
    });
  }
  return sections;
}

async function durationFor(file) {
  const { stdout } = await run(FFPROBE, [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    file,
  ]);
  const duration = finite(stdout.trim());
  if (!duration || duration <= 0) {
    throw new Error(`VIDEO_DURATION_INVALID:${path.basename(file)}`);
  }
  return duration;
}

async function planFile(source) {
  await fs.access(source.file);
  const duration = await durationFor(source.file);
  const { stderr } = await run(FFMPEG, [
    "-hide_banner",
    "-nostats",
    "-i", source.file,
    "-af", `silencedetect=noise=${SILENCE_NOISE_DB}dB:d=${SILENCE_DURATION_SECONDS}`,
    "-f", "null",
    "-",
  ]);
  const silences = parseSilences(stderr);
  const sections = sectionRanges(duration, silences);
  const providerCalls = sections.length * SAMPLE_FRACTIONS.length;
  return {
    source: source.name,
    duration_seconds: Number(duration.toFixed(3)),
    silence_range_count: silences.length,
    section_count: sections.length,
    samples_per_section: SAMPLE_FRACTIONS.length,
    estimated_ai_image_analyze_calls: providerCalls,
    sections,
  };
}

console.log("============================================================");
console.log("COLE LEY ZERO-COST ANALYSIS WORKLOAD PLAN");
console.log("============================================================");
console.log("DATABASE_WRITES=NO");
console.log("PROVIDER_CALLS=NO");
console.log("WALLET_CHARGES=NO");
console.log("PRODUCTION_STARTED=NO");

const files = [];
for (const source of FILES) {
  console.log(`SCANNING_FULL_AUDIO_TIMELINE=${source.name}`);
  const planned = await planFile(source);
  files.push(planned);
  console.log(
    `PLAN=${source.name} DURATION=${planned.duration_seconds} ` +
    `SECTIONS=${planned.section_count} ` +
    `AI_IMAGE_ANALYZE_CALLS=${planned.estimated_ai_image_analyze_calls}`,
  );
}

const totalDuration = files.reduce((sum, item) => sum + item.duration_seconds, 0);
const totalSections = files.reduce((sum, item) => sum + item.section_count, 0);
const totalCalls = files.reduce(
  (sum, item) => sum + item.estimated_ai_image_analyze_calls,
  0,
);
const report = {
  generated_at: new Date().toISOString(),
  mode: "ZERO_COST_ANALYSIS_WORKLOAD_PLAN",
  database_writes: false,
  provider_calls: false,
  wallet_charges: false,
  production_started: false,
  policy: {
    minimum_section_seconds: MINIMUM_SECTION_SECONDS,
    maximum_section_seconds: MAXIMUM_SECTION_SECONDS,
    minimum_boundary_silence_seconds: MINIMUM_BOUNDARY_SILENCE_SECONDS,
    silence_noise_db: SILENCE_NOISE_DB,
    silence_duration_seconds: SILENCE_DURATION_SECONDS,
    sample_fractions: SAMPLE_FRACTIONS,
  },
  totals: {
    source_video_count: files.length,
    duration_seconds: Number(totalDuration.toFixed(3)),
    section_count: totalSections,
    estimated_ai_image_analyze_calls: totalCalls,
  },
  files,
};

await fs.writeFile(REPORT, JSON.stringify(report, null, 2));

console.log("");
console.log("============================================================");
console.log(`SOURCE_VIDEO_COUNT=${files.length}`);
console.log(`TOTAL_DURATION_SECONDS=${report.totals.duration_seconds}`);
console.log(`TOTAL_SECTION_COUNT=${totalSections}`);
console.log(`ESTIMATED_AI_IMAGE_ANALYZE_CALLS=${totalCalls}`);
console.log("DATABASE_WRITES=NO");
console.log("PROVIDER_CALLS=NO");
console.log("WALLET_CHARGES=NO");
console.log("PRODUCTION_STARTED=NO");
console.log(`REPORT=${REPORT}`);
console.log("============================================================");
