export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { resolveCreativeFfmpegPath } from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";
import { FalLipSyncProvider } from "@/lib/platform/service-runtime/providers/fal/FalLipSyncProvider";

const TOKEN = "avq-investor-lipsync-20260819-v1";
const BUCKET = "creative-assets";
const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const OUTPUT_DIR = `${ORGANIZATION_ID}/avantiqo-investor-film-20260819`;
const NARRATION_PATH = `${ORGANIZATION_ID}/avantiqo-investor-video-20260818/avantiqo-investor-narration-cedar.mp3`;

const WINDOWS = Object.freeze({
  f01: {
    master_start: 24.0,
    master_end: 33.4,
    audio_start: 19.2,
    audio_end: 28.6,
    video_path: `${ORGANIZATION_ID}/unassigned/a6089db7-57fd-47f8-b138-b63e92e40698-gemini-knata2wctqhk.mp4`,
  },
  f02: {
    master_start: 52.6,
    master_end: 62.0,
    audio_start: 47.8,
    audio_end: 57.2,
    video_path: `${ORGANIZATION_ID}/unassigned/3a8d8e19-eee4-491d-8923-8d253c60548a-gemini-ekhiyo7vyyqe.mp4`,
  },
  f03: {
    master_start: 167.6,
    master_end: 177.0,
    audio_start: 162.8,
    audio_end: 167.45,
    video_path: `${ORGANIZATION_ID}/unassigned/b94181b3-310e-4f47-9c50-6c9d1890611d-gemini-0m182edqz2p9.mp4`,
  },
});

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
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
      reject(new Error("INVESTOR_LIPSYNC_FFMPEG_TIMEOUT"));
    }, timeoutMs);
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(Buffer.concat(stderr).toString("utf8").slice(-8000) || `FFMPEG_EXIT_${code}`));
        return;
      }
      resolve(true);
    });
  });
}

async function download(storagePath, localPath) {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(storagePath);
  if (error) throw error;
  if (!data) throw new Error(`DOWNLOAD_EMPTY:${storagePath}`);
  await fs.writeFile(localPath, Buffer.from(await data.arrayBuffer()));
}

async function upload(storagePath, bytes, contentType) {
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType,
    upsert: true,
    cacheControl: "3600",
  });
  if (error) throw error;
  return storagePath;
}

async function signedUrl(storagePath, seconds = 7200) {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(storagePath, seconds);
  if (error) throw error;
  return data?.signedUrl || null;
}

async function prepareAudio(key, window) {
  const ffmpeg = resolveCreativeFfmpegPath();
  if (!ffmpeg) throw new Error("CREATIVE_MEDIA_FFMPEG_NOT_READY");

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), `avantiqo-lipsync-${key}-`));
  try {
    const narration = path.join(directory, "narration.mp3");
    const clip = path.join(directory, `${key}-audio.wav`);
    await download(NARRATION_PATH, narration);

    const duration = Math.max(0.1, window.audio_end - window.audio_start);
    await run(ffmpeg, [
      "-y",
      "-ss", String(window.audio_start),
      "-i", narration,
      "-t", String(duration),
      "-vn",
      "-ac", "1",
      "-ar", "48000",
      "-c:a", "pcm_s16le",
      clip,
    ]);

    const bytes = await fs.readFile(clip);
    const storagePath = `${OUTPUT_DIR}/lipsync/${key}-cedar-exact.wav`;
    await upload(storagePath, bytes, "audio/wav");
    return {
      path: storagePath,
      duration_seconds: Number(duration.toFixed(3)),
      signed_url: await signedUrl(storagePath),
    };
  } finally {
    await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}

async function saveProviderOutput(key, url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`LIPSYNC_OUTPUT_DOWNLOAD_FAILED:${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const storagePath = `${OUTPUT_DIR}/lipsync/${key}-synced-v1.mp4`;
  await upload(storagePath, bytes, "video/mp4");
  return {
    path: storagePath,
    bytes: bytes.length,
    signed_url: await signedUrl(storagePath, 21600),
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) {
      return json({ success: false }, 404);
    }

    const action = url.searchParams.get("action") || "status";
    const key = url.searchParams.get("key") || "f01";
    const window = WINDOWS[key];

    if (!window && action !== "status") {
      return json({ success: false, error: "Unknown founder window" }, 400);
    }

    if (action === "status") {
      const items = {};
      for (const [name, item] of Object.entries(WINDOWS)) {
        const outputPath = `${OUTPUT_DIR}/lipsync/${name}-synced-v1.mp4`;
        const { data } = await supabaseAdmin.storage
          .from(BUCKET)
          .list(`${OUTPUT_DIR}/lipsync`, { search: `${name}-synced-v1.mp4`, limit: 10 });
        items[name] = {
          ...item,
          exact_audio_duration_seconds: Number((item.audio_end - item.audio_start).toFixed(3)),
          synced_ready: (data || []).some((row) => row.name === `${name}-synced-v1.mp4`),
          output_path: outputPath,
        };
      }
      return json({ success: true, windows: items });
    }

    if (action === "start") {
      const audio = await prepareAudio(key, window);
      const videoUrl = await signedUrl(window.video_path, 7200);
      if (!videoUrl || !audio.signed_url) throw new Error("LIPSYNC_SIGNED_MEDIA_REQUIRED");

      const result = await FalLipSyncProvider.submit({
        video_url: videoUrl,
        audio_url: audio.signed_url,
        sync_mode: "cut_off",
      });

      let saved = null;
      if (!result.pending && result.output_url) {
        saved = await saveProviderOutput(key, result.output_url);
      }

      return json({
        success: true,
        key,
        window,
        audio,
        provider: result.model,
        request_id: result.request_id,
        pending: result.pending,
        saved,
      });
    }

    if (action === "poll") {
      const requestId = url.searchParams.get("request_id");
      if (!requestId) return json({ success: false, error: "request_id required" }, 400);

      const result = await FalLipSyncProvider.poll({ request_id: requestId });
      let saved = null;
      if (!result.pending && result.output_url) {
        saved = await saveProviderOutput(key, result.output_url);
      }

      return json({
        success: true,
        key,
        pending: result.pending,
        status: result.status,
        request_id: result.request_id,
        saved,
      });
    }

    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    return json({ success: false, error: error?.message || String(error) }, 500);
  }
}
