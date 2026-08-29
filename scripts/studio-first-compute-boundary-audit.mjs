#!/usr/bin/env node

import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const CONTRACT = "AVANTIQO_STUDIO_FIRST_COMPUTE_BOUNDARY_V1";
const ROOT = process.cwd();

const PAID_WORKER_ROOTS = [
  "services/avantiqo-video-engine",
  "services/avantiqo-image-engine",
  "services/avantiqo-music-elastic-engine",
  "services/avantiqo-voice-stt",
  "services/avantiqo-voice-stt-realtime",
].map((entry) => path.join(ROOT, entry));

const ALWAYS_FORBIDDEN_PATTERNS = [
  ["FFMPEG_BINARY", /\bffmpeg\b/i],
  ["VIDEO_EXPORT", /\bexport_to_video\b/],
  ["VIDEO_CODEC", /\b(libx264|libx265|h264|hevc|av1|vp9)\b/i],
  ["MUX_OR_DEMUX", /\b(mux|demux|remux|transcode)\b/i],
  ["ARCHIVE_CPU_WORK", /\b(zipfile|tarfile|gzip|gunzip|unzip)\b/i],
];

const STORAGE_FINALIZATION_PATTERNS = [
  ["SUPABASE_FINAL_UPLOAD", /storage_upload|signed_url|storage_reference/i],
  ["DIRECT_FINAL_UPLOAD", /requests\.(put|post)\([^\n]*(signed|upload)|fetch\([^\n]*(signed|upload)/i],
];

const ALLOWED_FILE_NAMES = new Set([
  "README.md",
  "requirements.txt",
]);

async function exists(target) {
  try { await stat(target); return true; } catch { return false; }
}

async function walk(dir) {
  if (!(await exists(dir))) return [];
  const rows = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const row of rows) {
    const full = path.join(dir, row.name);
    if (row.isDirectory()) files.push(...await walk(full));
    else files.push(full);
  }
  return files;
}

function relative(file) {
  return path.relative(ROOT, file).replaceAll(path.sep, "/");
}

function isPaidWorkerSource(file) {
  const ext = path.extname(file).toLowerCase();
  const base = path.basename(file);
  return [".py", ".js", ".mjs", ".ts", ".tsx", ".sh"].includes(ext) || /^Dockerfile(?:\.|$)/.test(base);
}

function violation(code, file, detail) {
  return { code, file: relative(file), detail };
}

const violations = [];
const scanned = [];

for (const root of PAID_WORKER_ROOTS) {
  for (const file of await walk(root)) {
    if (!isPaidWorkerSource(file) || ALLOWED_FILE_NAMES.has(path.basename(file))) continue;
    const source = await readFile(file, "utf8");
    scanned.push(relative(file));

    for (const [code, pattern] of ALWAYS_FORBIDDEN_PATTERNS) {
      if (pattern.test(source)) violations.push(violation(code, file, "Studio-capable CPU/media operation found in paid worker source"));
    }

    for (const [code, pattern] of STORAGE_FINALIZATION_PATTERNS) {
      if (pattern.test(source)) violations.push(violation(code, file, "Final artifact persistence/storage orchestration belongs in Studio"));
    }
  }
}

const knownExistingVideoViolations = violations.filter((item) => item.file.startsWith("services/avantiqo-video-engine/"));
const otherViolations = violations.filter((item) => !item.file.startsWith("services/avantiqo-video-engine/"));

// Current Video worker is a known migration debt and must monotonically move toward zero.
// New violations anywhere else fail immediately. Video debt is reported loudly and the
// audit fails once the migration marker is enabled.
const strictVideo = process.env.AVANTIQO_STUDIO_FIRST_STRICT_VIDEO === "YES";
const failed = otherViolations.length > 0 || (strictVideo && knownExistingVideoViolations.length > 0);

console.log(JSON.stringify({
  success: !failed,
  contract: CONTRACT,
  default_placement: "STUDIO",
  paid_compute_allowed_reasons: [
    "GPU_ACCELERATOR_REQUIRED",
    "EXTERNAL_MODEL_INFERENCE_REQUIRED",
    "EXTERNAL_SYSTEM_SIDE_EFFECT_REQUIRED",
  ],
  scanned_files: scanned.length,
  known_video_migration_debt_count: knownExistingVideoViolations.length,
  new_non_video_violation_count: otherViolations.length,
  strict_video_enforcement: strictVideo,
  violations,
}, null, 2));

if (failed) {
  console.error(`${CONTRACT}=FAIL`);
  process.exit(1);
}

console.log(`${CONTRACT}=PASS_WITH_KNOWN_VIDEO_MIGRATION_DEBT`);
