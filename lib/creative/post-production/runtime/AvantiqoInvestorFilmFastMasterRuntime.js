import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { getServiceSupabase } from "@/lib/shared/supabase/service";
import { resolveCreativeFfmpegPath } from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";
import { AVANTIQO_INVESTOR_FILM_MASTER_PLAN } from "./AvantiqoInvestorFilmMasterPlan";
import { AvantiqoInvestorFilmMasterRuntime } from "./AvantiqoInvestorFilmMasterRuntime";

const supabase = getServiceSupabase();
const BUCKET = "creative-assets";
const MASTER = AVANTIQO_INVESTOR_FILM_MASTER_PLAN;
const ORGANIZATION_ID = MASTER.organization_id;
const TARGET_DURATION = MASTER.duration_seconds;
const DURATION_TOLERANCE = 0.25;

const SEGMENTS = Object.freeze([
  `${MASTER.segment_output_contract.directory}/${MASTER.segment_output_contract.opening}`,
  `${MASTER.segment_output_contract.directory}/${MASTER.segment_output_contract.product_proof}`,
  `${MASTER.segment_output_contract.directory}/${MASTER.segment_output_contract.final_act}`,
]);

const SCORE_PATH = `${ORGANIZATION_ID}/avantiqo-investor-film-20260820/audio/avantiqo-investor-score-v1-approved.mp3`;
const OUTPUT_PATH = `${MASTER.final_output.directory}/${MASTER.final_output.filename}`;

function run(command, args, timeoutMs = 260000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "ignore", "pipe"],
      env: { ...process.env, OMP_NUM_THREADS: "1" },
    });
    const stderr = [];
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("AVANTIQO_INVESTOR_FAST_MASTER_TIMEOUT"));
    }, timeoutMs);

    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const trace = Buffer.concat(stderr).toString("utf8");
      if (code !== 0) {
        reject(new Error(trace.slice(-14000) || `FFMPEG_EXIT_${code}`));
        return;
      }
      resolve(trace);
    });
  });
}

function durationFromTrace(value) {
  const match = String(value || "").match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

async function mediaDuration(ffmpeg, source) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, ["-hide_banner", "-i", source], {
      shell: false,
      stdio: ["ignore", "ignore", "pipe"],
      env: { ...process.env, OMP_NUM_THREADS: "1" },
    });
    const stderr = [];
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", () => {
      const duration = durationFromTrace(Buffer.concat(stderr).toString("utf8"));
      if (!duration) reject(new Error(`MEDIA_DURATION_UNAVAILABLE:${source}`));
      else resolve(duration);
    });
  });
}

async function download(storagePath, localPath) {
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error) throw error;
  if (!data) throw new Error(`FAST_MASTER_SOURCE_EMPTY:${storagePath}`);
  const bytes = Buffer.from(await data.arrayBuffer());
  await fs.writeFile(localPath, bytes);
}

async function upload(storagePath, localPath) {
  const bytes = await fs.readFile(localPath);
  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType: "video/mp4",
    upsert: true,
    cacheControl: "3600",
  });
  if (error) throw error;
  return {
    bytes: bytes.length,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
  };
}

async function signedUrl(storagePath, seconds = 86400) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, seconds);
  if (error) throw error;
  return data?.signedUrl || null;
}

async function concatVisuals(ffmpeg, localSegments, directory, outputPath) {
  const listPath = path.join(directory, "fast-master.concat.txt");
  await fs.writeFile(
    listPath,
    localSegments.map((file) => `file '${file.replace(/'/g, "'\\''")}'`).join("\n"),
    "utf8",
  );

  await run(ffmpeg, [
    "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", listPath,
    "-an",
    "-c:v", "copy",
    "-movflags", "+faststart",
    outputPath,
  ]);
}

async function muxAudio(ffmpeg, visualPath, narrationPath, scorePath, outputPath) {
  const delayMs = Math.round(MASTER.narration_film_start * 1000);
  await run(ffmpeg, [
    "-y",
    "-i", visualPath,
    "-i", narrationPath,
    "-stream_loop", "-1",
    "-i", scorePath,
    "-filter_complex", [
      `[1:a]adelay=${delayMs}|${delayMs},volume=1.0[voice]`,
      `[2:a]atrim=0:${TARGET_DURATION},asetpts=N/SR/TB,volume=0.14,afade=t=in:st=0:d=2.5,afade=t=out:st=${TARGET_DURATION - 4}:d=4[score]`,
      "[voice][score]amix=inputs=2:duration=longest:dropout_transition=0,alimiter=limit=0.95[aout]",
    ].join(";"),
    "-map", "0:v:0",
    "-map", "[aout]",
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", "192k",
    "-ar", "48000",
    "-t", String(TARGET_DURATION),
    "-movflags", "+faststart",
    outputPath,
  ]);
}

export async function renderAvantiqoInvestorFilmFastMaster() {
  const ffmpeg = resolveCreativeFfmpegPath();
  if (!ffmpeg) throw new Error("CREATIVE_MEDIA_FFMPEG_NOT_READY");

  const preflight = await AvantiqoInvestorFilmMasterRuntime.preflight();
  if (!preflight?.ready) {
    return {
      success: false,
      rendered: false,
      error: "AVANTIQO_INVESTOR_FAST_MASTER_PREFLIGHT_FAILED",
      preflight,
    };
  }

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-investor-fast-master-"));
  try {
    const localSegments = SEGMENTS.map((_, index) => path.join(directory, `segment-${index}.mp4`));
    const narration = path.join(directory, "narration.mp3");
    const score = path.join(directory, "score.mp3");
    const visuals = path.join(directory, "visuals.mp4");
    const finished = path.join(directory, "avantiqo-investor-film-v6-master.mp4");

    await Promise.all([
      ...SEGMENTS.map((storagePath, index) => download(storagePath, localSegments[index])),
      download(MASTER.narration_path, narration),
      download(SCORE_PATH, score),
    ]);

    await concatVisuals(ffmpeg, localSegments, directory, visuals);
    await muxAudio(ffmpeg, visuals, narration, score, finished);

    const actualDuration = await mediaDuration(ffmpeg, finished);
    const durationDelta = Math.abs(actualDuration - TARGET_DURATION);
    if (durationDelta > DURATION_TOLERANCE) {
      throw new Error(`FAST_MASTER_RUNTIME_OUT_OF_TOLERANCE:${actualDuration}`);
    }

    const stored = await upload(OUTPUT_PATH, finished);
    return {
      success: true,
      rendered: true,
      fast_stream_copy: true,
      output_path: OUTPUT_PATH,
      signed_url: await signedUrl(OUTPUT_PATH),
      bytes: stored.bytes,
      sha256: stored.sha256,
      target_duration_seconds: TARGET_DURATION,
      actual_duration_seconds: actualDuration,
      duration_delta_seconds: durationDelta,
      preflight,
    };
  } finally {
    await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}

export const AvantiqoInvestorFilmFastMasterRuntime = Object.freeze({
  render: renderAvantiqoInvestorFilmFastMaster,
  output_path: OUTPUT_PATH,
});
