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
const OUTPUT_DIR = `${ORGANIZATION_ID}/avantiqo-investor-film-20260819/founder-v5`;
const APPROVED_REFERENCE_PATH = `${ORGANIZATION_ID}/unassigned/ca19f771-e2ad-4e62-ac50-19ff8efed996-avantiqo-founder-speaking-keyframe.jpg`;
const NARRATION_PATH = `${ORGANIZATION_ID}/avantiqo-investor-video-20260818/avantiqo-investor-narration-cedar.mp3`;

const SEGMENTS = Object.freeze({
  opening01: { audio_start: 0, audio_end: 9.4, duration: 9.4, zoom: "in" },
  opening02: { audio_start: 9.4, audio_end: 18.8, duration: 9.4, zoom: "out" },
  opening03: { audio_start: 18.8, audio_end: 28.2, duration: 9.4, zoom: "in" },
});

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
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

async function upload(storagePath, localPath, contentType) {
  const bytes = await fs.readFile(localPath);
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType,
    upsert: true,
    cacheControl: "3600",
  });
  if (error) throw error;
  return { path: storagePath, bytes: bytes.length };
}

async function signedUrl(storagePath, seconds = 21600) {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(storagePath, seconds);
  if (error) throw error;
  return data?.signedUrl || null;
}

async function exists(storagePath) {
  const directory = storagePath.split("/").slice(0, -1).join("/");
  const file = storagePath.split("/").at(-1);
  const { data } = await supabaseAdmin.storage.from(BUCKET).list(directory, { search: file, limit: 10 });
  return (data || []).some((row) => row.name === file);
}

async function prepareSource(key, segment) {
  const ffmpeg = resolveCreativeFfmpegPath();
  if (!ffmpeg) throw new Error("CREATIVE_MEDIA_FFMPEG_NOT_READY");

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), `avantiqo-founder-${key}-`));
  try {
    const image = path.join(directory, "founder.jpg");
    const narration = path.join(directory, "narration.mp3");
    const source = path.join(directory, "founder-source.mp4");
    const audio = path.join(directory, "founder-audio.wav");

    await Promise.all([
      download(APPROVED_REFERENCE_PATH, image),
      download(NARRATION_PATH, narration),
    ]);

    const frames = Math.max(1, Math.round(segment.duration * 24));
    const zoom = segment.zoom === "out"
      ? `1.045-0.045*(on/${frames})`
      : `1.0+0.045*(on/${frames})`;

    await run(ffmpeg, [
      "-y",
      "-loop", "1",
      "-framerate", "24",
      "-i", image,
      "-t", String(segment.duration),
      "-an",
      "-vf", [
        "scale=1344:756:force_original_aspect_ratio=increase",
        "crop=1280:720",
        `zoompan=z='${zoom}':d=1:s=1280x720:fps=24`,
        "eq=contrast=1.035:saturation=0.94:brightness=-0.008",
        "vignette=PI/8",
        "format=yuv420p",
      ].join(","),
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "18",
      "-pix_fmt", "yuv420p",
      "-r", "24",
      "-movflags", "+faststart",
      source,
    ]);

    const audioDuration = Math.max(0.1, segment.audio_end - segment.audio_start);
    await run(ffmpeg, [
      "-y",
      "-ss", String(segment.audio_start),
      "-i", narration,
      "-t", String(audioDuration),
      "-vn",
      "-ac", "1",
      "-ar", "48000",
      "-c:a", "pcm_s16le",
      audio,
    ]);

    const sourcePath = `${OUTPUT_DIR}/${key}-approved-source.mp4`;
    const audioPath = `${OUTPUT_DIR}/${key}-cedar.wav`;
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
  if (!response.ok) throw new Error(`LIPSYNC_OUTPUT_DOWNLOAD_FAILED:${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const storagePath = `${OUTPUT_DIR}/${key}-synced-approved-v1.mp4`;
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType: "video/mp4",
    upsert: true,
    cacheControl: "3600",
  });
  if (error) throw error;
  return { path: storagePath, bytes: bytes.length, signed_url: await signedUrl(storagePath, 86400) };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) return json({ success: false }, 404);

    const action = url.searchParams.get("action") || "status";
    const key = url.searchParams.get("key") || "opening01";
    const segment = SEGMENTS[key];

    if (action === "status") {
      const outputs = {};
      for (const name of Object.keys(SEGMENTS)) {
        const outputPath = `${OUTPUT_DIR}/${name}-synced-approved-v1.mp4`;
        outputs[name] = { ready: await exists(outputPath), output_path: outputPath };
      }
      return json({
        success: true,
        lip_sync_enabled: true,
        identity_source: "APPROVED_REFERENCE_ONLY",
        approved_reference_path: APPROVED_REFERENCE_PATH,
        old_gemini_founder_sources_allowed: false,
        outputs,
      });
    }

    if (!segment) return json({ success: false, error: "UNKNOWN_FOUNDER_SEGMENT" }, 400);

    if (action === "start") {
      const prepared = await prepareSource(key, segment);
      if (!prepared.source_url || !prepared.audio_url) throw new Error("SIGNED_MEDIA_REQUIRED");
      const result = await FalLipSyncProvider.submit({
        video_url: prepared.source_url,
        audio_url: prepared.audio_url,
        sync_mode: "cut_off",
      });
      let saved = null;
      if (!result.pending && result.output_url) saved = await saveProviderOutput(key, result.output_url);
      return json({
        success: true,
        key,
        identity_source: "APPROVED_REFERENCE_ONLY",
        request_id: result.request_id,
        pending: result.pending,
        provider: result.model,
        prepared: { source_path: prepared.source_path, audio_path: prepared.audio_path },
        saved,
      });
    }

    if (action === "poll") {
      const requestId = url.searchParams.get("request_id");
      if (!requestId) return json({ success: false, error: "request_id required" }, 400);
      const result = await FalLipSyncProvider.poll({ request_id: requestId });
      let saved = null;
      if (!result.pending && result.output_url) saved = await saveProviderOutput(key, result.output_url);
      return json({ success: true, key, pending: result.pending, status: result.status, request_id: result.request_id, saved });
    }

    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    return json({ success: false, error: error?.message || String(error) }, 500);
  }
}
