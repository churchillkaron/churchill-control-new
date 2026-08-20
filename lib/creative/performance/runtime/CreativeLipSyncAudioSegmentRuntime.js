import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { getServiceSupabase } from "@/lib/shared/supabase/service";
import {
  resolveCreativeFfmpegPath,
} from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";
import {
  resolveCreativeProviderAssetUrl,
} from "@/lib/creative/assets/storage/resolveCreativeProviderAssetUrl";

const BUCKET = "creative-assets";

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function safeToken(value) {
  return String(value ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "segment";
}

function run(command, args, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "ignore", "pipe"],
      env: { ...process.env, OMP_NUM_THREADS: "1" },
    });
    const stderr = [];
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("CREATIVE_LIPSYNC_AUDIO_SEGMENT_TIMEOUT"));
    }, timeoutMs);

    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(
          Buffer.concat(stderr).toString("utf8").slice(-6000) ||
          `FFMPEG_EXIT_${code}`,
        ));
        return;
      }
      resolve(true);
    });
  });
}

async function download(url, target) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`CREATIVE_LIPSYNC_AUDIO_DOWNLOAD_FAILED:${response.status}`);
  }
  await fs.writeFile(target, Buffer.from(await response.arrayBuffer()));
}

export const CreativeLipSyncAudioSegmentRuntime = {
  async prepare({
    organization_id,
    task_id,
    audio,
    audio_start_seconds,
    audio_end_seconds,
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!task_id) throw new Error("task_id required");

    const start = finite(audio_start_seconds);
    const end = finite(audio_end_seconds);
    if (start === null || end === null || end <= start) {
      throw new Error("CREATIVE_LIPSYNC_AUDIO_SEGMENT_RANGE_INVALID");
    }

    const sourceUrl = await resolveCreativeProviderAssetUrl({
      organization_id,
      value: audio,
    });
    if (!sourceUrl) throw new Error("CREATIVE_LIPSYNC_AUDIO_SOURCE_REQUIRED");

    const ffmpeg = resolveCreativeFfmpegPath();
    if (!ffmpeg) throw new Error("CREATIVE_MEDIA_FFMPEG_NOT_READY");

    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "creative-lipsync-audio-"),
    );

    try {
      const source = path.join(directory, "source-audio");
      const target = path.join(directory, "segment.wav");
      await download(sourceUrl, source);

      await run(ffmpeg, [
        "-y",
        "-ss", String(start),
        "-i", source,
        "-t", String(end - start),
        "-vn",
        "-ac", "1",
        "-ar", "48000",
        "-c:a", "pcm_s16le",
        target,
      ]);

      const startMs = Math.round(start * 1000);
      const endMs = Math.round(end * 1000);
      const storagePath = [
        organization_id,
        "creative-lipsync-segments",
        `${safeToken(task_id)}-${startMs}-${endMs}.wav`,
      ].join("/");
      const bytes = await fs.readFile(target);
      const supabase = getServiceSupabase();
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, bytes, {
          contentType: "audio/wav",
          cacheControl: "3600",
          upsert: true,
        });
      if (error) throw error;

      return {
        contract: "CREATIVE_LIPSYNC_AUDIO_SEGMENT_V1",
        bucket: BUCKET,
        path: storagePath,
        storage_reference: `storage://${BUCKET}/${storagePath}`,
        source_audio_start_seconds: start,
        source_audio_end_seconds: end,
        duration_seconds: end - start,
        sample_rate: 48000,
        channels: 1,
        content_type: "audio/wav",
        bytes: bytes.length,
      };
    } finally {
      await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
    }
  },
};