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
const OUTPUT_DIR = `${ORGANIZATION_ID}/avantiqo-investor-film-20260820/founder-v7`;
const REACT_MODEL = "fal-ai/sync-lipsync/react-1";

const APPROVED_FOUNDER_MOTION_PATH = `${ORGANIZATION_ID}/unassigned/eaa7edd6-7a62-4ca2-9eac-dfb14059e649-gemini-founder-rgro0za2hzes.mp4`;
const APPROVED_FOUNDER_MOTION_SHA256 = "78b995566a564e7801f0a240a522ae5a02163680006b857bb091572182b121a1";
const APPROVED_FOUNDER_REFERENCE_ASSET_ID = "3e1b5197-5279-4713-93ed-0b0defc9581a";
const APPROVED_FOUNDER_REFERENCE_SHA256 = "40309c0610076b2107e4f2ca50c265187c097756a7bfdecb9e7909e6ca5c795a";
const REJECTED_LEGACY_FOUNDER_ASSET_ID = "052e10e2-432e-4cf9-82bd-65cb5bb7441a";

const NARRATION_PATH = `${ORGANIZATION_ID}/avantiqo-investor-video-20260818/avantiqo-investor-narration-cedar-v5-founder-locked-229.5s.mp3`;
const NARRATION_DURATION_SECONDS = 229.5;

const SEGMENTS = Object.freeze({
  "founder-opening-origin": {
    audio_start: 0,
    audio_end: 11.391,
    duration: 11.391,
    purpose:
      "I didn’t build Avantiqo because I wanted to create another software company. I built it because running real businesses showed me the same problem again and again.",
  },
  "founder-opening-obvious": {
    audio_start: 28.266,
    audio_end: 30.375,
    duration: 2.109,
    purpose: "That made one thing obvious.",
  },
  "founder-opening-built": {
    audio_start: 37.547,
    audio_end: 40.078,
    duration: 2.531,
    purpose: "That is why I built Avantiqo.",
  },
  "founder-mid-integration": {
    audio_start: 136.266,
    audio_end: 140.062,
    duration: 3.796,
    purpose: "And the important part is what happens between them.",
  },
  "founder-mid-ai": {
    audio_start: 177.188,
    audio_end: 183.516,
    duration: 6.328,
    purpose:
      "This becomes even more important as AI moves from answering questions to coordinating real work.",
  },
  "founder-close": {
    audio_start: 219.375,
    audio_end: 226.125,
    duration: 6.75,
    purpose:
      "We are not building another business application. We are building the system businesses will operate through.",
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
      reject(new Error("INVESTOR_FOUNDER_FFMPEG_TIMEOUT"));
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
          Buffer.concat(stderr).toString("utf8").slice(-8000) ||
          `FFMPEG_EXIT_${code}`,
        ));
        return;
      }
      resolve(true);
    });
  });
}

async function download(storagePath, localPath) {
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .download(storagePath);
  if (error) throw error;
  if (!data) throw new Error(`DOWNLOAD_EMPTY:${storagePath}`);
  await fs.writeFile(localPath, Buffer.from(await data.arrayBuffer()));
}

async function upload(storagePath, localPath, contentType) {
  const bytes = await fs.readFile(localPath);
  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(storagePath, bytes, {
      contentType,
      upsert: true,
      cacheControl: "3600",
    });
  if (error) throw error;
  return { path: storagePath, bytes: bytes.length };
}

async function signedUrl(storagePath, seconds = 21600) {
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, seconds);
  if (error) throw error;
  return data?.signedUrl || null;
}

async function exists(storagePath) {
  const directory = storagePath.split("/").slice(0, -1).join("/");
  const file = storagePath.split("/").at(-1);
  const { data } = await supabaseAdmin.storage
    .from(BUCKET)
    .list(directory, { search: file, limit: 10 });
  return (data || []).some((row) => row.name === file);
}

async function prepareSource(key, segment) {
  const ffmpeg = resolveCreativeFfmpegPath();
  if (!ffmpeg) throw new Error("CREATIVE_MEDIA_FFMPEG_NOT_READY");

  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), `avantiqo-founder-${key}-`),
  );

  try {
    const motion = path.join(directory, "approved-founder-motion.mp4");
    const narration = path.join(directory, "narration-v5.mp3");
    const source = path.join(directory, "founder-source.mp4");
    const audio = path.join(directory, "founder-audio.wav");

    await Promise.all([
      download(APPROVED_FOUNDER_MOTION_PATH, motion),
      download(NARRATION_PATH, narration),
    ]);

    await run(ffmpeg, [
      "-y",
      "-stream_loop", "-1",
      "-i", motion,
      "-t", String(segment.duration),
      "-an",
      "-vf", [
        "scale=1280:720:force_original_aspect_ratio=increase",
        "crop=1280:720",
        "fps=24",
        "format=yuv420p",
      ].join(","),
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "18",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      source,
    ]);

    await run(ffmpeg, [
      "-y",
      "-ss", String(segment.audio_start),
      "-i", narration,
      "-t", String(segment.duration),
      "-vn",
      "-ac", "1",
      "-ar", "48000",
      "-c:a", "pcm_s16le",
      audio,
    ]);

    const sourcePath = `${OUTPUT_DIR}/${key}-approved-gemini-motion-source.mp4`;
    const audioPath = `${OUTPUT_DIR}/${key}-cedar-v5.wav`;

    await upload(sourcePath, source, "video/mp4");
    await upload(audioPath, audio, "audio/wav");

    return {
      source_path: sourcePath,
      source_url: await signedUrl(sourcePath),
      audio_path: audioPath,
      audio_url: await signedUrl(audioPath),
    };
  } finally {
    await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}

async function saveProviderOutput(key, url) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`LIPSYNC_OUTPUT_DOWNLOAD_FAILED:${response.status}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  const storagePath = `${OUTPUT_DIR}/${key}-synced-approved-v7.mp4`;
  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(storagePath, bytes, {
      contentType: "video/mp4",
      upsert: true,
      cacheControl: "3600",
    });
  if (error) throw error;

  return {
    path: storagePath,
    bytes: bytes.length,
    signed_url: await signedUrl(storagePath, 86400),
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) {
      return json({ success: false }, 404);
    }

    const action = url.searchParams.get("action") || "status";
    const key = url.searchParams.get("key") || "founder-opening-origin";
    const segment = SEGMENTS[key];

    if (action === "status") {
      const outputs = {};
      for (const name of Object.keys(SEGMENTS)) {
        const outputPath = `${OUTPUT_DIR}/${name}-synced-approved-v7.mp4`;
        outputs[name] = {
          ready: await exists(outputPath),
          output_path: outputPath,
          segment: SEGMENTS[name],
        };
      }

      return json({
        success: true,
        lip_sync_enabled: true,
        provider: REACT_MODEL,
        model_mode: "head",
        temperature: 0.65,
        identity_source: "APPROVED_GEMINI_MOTION_ONLY",
        approved_founder_motion_path: APPROVED_FOUNDER_MOTION_PATH,
        approved_founder_motion_sha256: APPROVED_FOUNDER_MOTION_SHA256,
        approved_founder_reference_asset_id: APPROVED_FOUNDER_REFERENCE_ASSET_ID,
        approved_founder_reference_sha256: APPROVED_FOUNDER_REFERENCE_SHA256,
        rejected_legacy_founder_asset_id: REJECTED_LEGACY_FOUNDER_ASSET_ID,
        legacy_founder_allowed: false,
        narration_path: NARRATION_PATH,
        narration_duration_seconds: NARRATION_DURATION_SECONDS,
        timestamp_precision: "LOCKED_CEDAR_V5_SEMANTIC_EDIT_BOUNDARIES",
        segments: SEGMENTS,
        outputs,
      });
    }

    if (!segment) {
      return json({ success: false, error: "UNKNOWN_FOUNDER_SEGMENT" }, 400);
    }

    if (action === "start") {
      const prepared = await prepareSource(key, segment);
      if (!prepared.source_url || !prepared.audio_url) {
        throw new Error("SIGNED_MEDIA_REQUIRED");
      }

      const result = await FalLipSyncProvider.submit({
        video_url: prepared.source_url,
        audio_url: prepared.audio_url,
        sync_mode: "cut_off",
        model: REACT_MODEL,
        model_mode: "head",
        prompt: "neutral",
        temperature: 0.65,
      });

      let saved = null;
      if (!result.pending && result.output_url) {
        saved = await saveProviderOutput(key, result.output_url);
      }

      return json({
        success: true,
        key,
        segment,
        identity_source: "APPROVED_GEMINI_MOTION_ONLY",
        narration_source: "LOCKED_CEDAR_V5_229_5_SECONDS",
        request_id: result.request_id,
        pending: result.pending,
        provider: result.model,
        model_mode: "head",
        temperature: 0.65,
        prepared: {
          source_path: prepared.source_path,
          audio_path: prepared.audio_path,
        },
        saved,
      });
    }

    if (action === "poll") {
      const requestId = url.searchParams.get("request_id");
      if (!requestId) {
        return json({ success: false, error: "request_id required" }, 400);
      }

      const result = await FalLipSyncProvider.poll({
        request_id: requestId,
        model: REACT_MODEL,
      });
      let saved = null;
      if (!result.pending && result.output_url) {
        saved = await saveProviderOutput(key, result.output_url);
      }

      return json({
        success: true,
        key,
        segment,
        pending: result.pending,
        status: result.status,
        request_id: result.request_id,
        provider: result.model,
        saved,
      });
    }

    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    return json(
      {
        success: false,
        error: error?.message || String(error),
      },
      500,
    );
  }
}
