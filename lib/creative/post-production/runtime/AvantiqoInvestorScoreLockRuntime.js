import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { resolveCreativeFfmpegPath } from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const SOURCE_BUCKET = "marketing-assets";
const SOURCE_PATH = `${ORGANIZATION_ID}/avantiqo-investor-video-20260818/avantiqo-investor-score.wav`;
const OUTPUT_BUCKET = "creative-assets";
const OUTPUT_PATH = `${ORGANIZATION_ID}/avantiqo-investor-film-20260820/audio/avantiqo-investor-score-v1-approved.mp3`;

function run(command, args, timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "ignore", "pipe"],
      env: { ...process.env, OMP_NUM_THREADS: "1" },
    });
    const stderr = [];
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("AVANTIQO_INVESTOR_SCORE_LOCK_TIMEOUT"));
    }, timeoutMs);
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(Buffer.concat(stderr).toString("utf8").slice(-10000) || `FFMPEG_EXIT_${code}`));
        return;
      }
      resolve(true);
    });
  });
}

async function objectMetadata(bucket, storagePath) {
  const directory = storagePath.split("/").slice(0, -1).join("/");
  const filename = storagePath.split("/").at(-1);
  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .list(directory, { search: filename, limit: 10 });
  if (error) throw error;
  const row = (data || []).find((item) => item.name === filename) || null;
  return {
    ready: Boolean(row),
    size_bytes: Number(row?.metadata?.size ?? row?.metadata?.contentLength ?? 0) || null,
    content_type: row?.metadata?.mimetype || row?.metadata?.contentType || null,
    updated_at: row?.updated_at || null,
  };
}

async function download(bucket, storagePath, localPath) {
  const { data, error } = await supabaseAdmin.storage.from(bucket).download(storagePath);
  if (error) throw error;
  if (!data) throw new Error("AVANTIQO_INVESTOR_SCORE_SOURCE_EMPTY");
  const bytes = Buffer.from(await data.arrayBuffer());
  await fs.writeFile(localPath, bytes);
  return bytes;
}

async function signedUrl(bucket, storagePath, seconds = 86400) {
  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(storagePath, seconds);
  if (error) throw error;
  return data?.signedUrl || null;
}

export async function getAvantiqoInvestorScoreLockStatus() {
  const [source, output] = await Promise.all([
    objectMetadata(SOURCE_BUCKET, SOURCE_PATH),
    objectMetadata(OUTPUT_BUCKET, OUTPUT_PATH),
  ]);
  return {
    success: true,
    source: { bucket: SOURCE_BUCKET, path: SOURCE_PATH, ...source },
    output: { bucket: OUTPUT_BUCKET, path: OUTPUT_PATH, ...output },
    ready: source.ready && output.ready,
  };
}

export async function lockAvantiqoInvestorScore({ force = false } = {}) {
  const ffmpeg = resolveCreativeFfmpegPath();
  if (!ffmpeg) throw new Error("CREATIVE_MEDIA_FFMPEG_NOT_READY");

  const sourceMeta = await objectMetadata(SOURCE_BUCKET, SOURCE_PATH);
  if (!sourceMeta.ready) throw new Error("AVANTIQO_INVESTOR_SCORE_SOURCE_MISSING");

  const outputMeta = await objectMetadata(OUTPUT_BUCKET, OUTPUT_PATH);
  if (!force && outputMeta.ready) {
    return {
      success: true,
      reused: true,
      output_path: OUTPUT_PATH,
      signed_url: await signedUrl(OUTPUT_BUCKET, OUTPUT_PATH),
      output: outputMeta,
    };
  }

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-investor-score-lock-"));
  try {
    const source = path.join(directory, "score.wav");
    const output = path.join(directory, "score.mp3");
    const sourceBytes = await download(SOURCE_BUCKET, SOURCE_PATH, source);
    const sourceSha256 = crypto.createHash("sha256").update(sourceBytes).digest("hex");

    await run(ffmpeg, [
      "-y",
      "-i", source,
      "-vn",
      "-af", "highpass=f=28,lowpass=f=15500,loudnorm=I=-21:TP=-2:LRA=9",
      "-ar", "48000",
      "-ac", "2",
      "-c:a", "libmp3lame",
      "-b:a", "192k",
      output,
    ]);

    const outputBytes = await fs.readFile(output);
    const outputSha256 = crypto.createHash("sha256").update(outputBytes).digest("hex");
    const { error } = await supabaseAdmin.storage.from(OUTPUT_BUCKET).upload(OUTPUT_PATH, outputBytes, {
      contentType: "audio/mpeg",
      cacheControl: "3600",
      upsert: true,
      metadata: {
        organization_id: ORGANIZATION_ID,
        investor_film: "20260820",
        source_bucket: SOURCE_BUCKET,
        source_path: SOURCE_PATH,
        source_sha256: sourceSha256,
        output_sha256: outputSha256,
        transformation: "WAV_TO_MP3_MASTER_SCORE_LOCK",
      },
    });
    if (error) throw error;

    return {
      success: true,
      reused: false,
      source: {
        bucket: SOURCE_BUCKET,
        path: SOURCE_PATH,
        bytes: sourceBytes.length,
        sha256: sourceSha256,
      },
      output: {
        bucket: OUTPUT_BUCKET,
        path: OUTPUT_PATH,
        bytes: outputBytes.length,
        sha256: outputSha256,
      },
      signed_url: await signedUrl(OUTPUT_BUCKET, OUTPUT_PATH),
    };
  } finally {
    await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}

export const AvantiqoInvestorScoreLockRuntime = Object.freeze({
  status: getAvantiqoInvestorScoreLockStatus,
  lock: lockAvantiqoInvestorScore,
  source_bucket: SOURCE_BUCKET,
  source_path: SOURCE_PATH,
  output_bucket: OUTPUT_BUCKET,
  output_path: OUTPUT_PATH,
});
