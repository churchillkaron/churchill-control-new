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

const FOUNDER_MOTIONS = Object.freeze({
  warm_office: {
    path: `${ORGANIZATION_ID}/unassigned/82f9712f-4335-49b9-9614-bc86c229dc31-gemini-founder-tw5jpynuenno.mp4`,
    sha256: "b7ebbdfe6061973e95a44e5e8fc1bb45ed7fc9255fe89d7186c81b9bae335310",
    source_asset_id: "3c69139a-34a7-4c73-b44f-0796c32349b3",
  },
  night_office: {
    path: `${ORGANIZATION_ID}/unassigned/7732d405-ac9c-4f1f-8ef2-f326686e1be9-gemini-founder-tgpc3j2y5p6q.mp4`,
    sha256: "cc207c1e3a5dba3282f49beec422b0fcde186e5ed20341bf3dcb345a3c3b957f",
    source_asset_id: "d7f9fb83-68cb-492b-84cc-74f696f4ee4f",
  },
  restaurant: {
    path: `${ORGANIZATION_ID}/unassigned/5ff5480e-6f2c-41cd-bee0-43a481733f00-gemini-founder-9wto9l93a6v4.mp4`,
    sha256: "187791baa27aabba32711e7b64617438546899d77dbedc769e7c397a184b01f8",
    source_asset_id: "c75081c0-17ae-49f0-ae3d-c92f4e01cd3d",
  },
  portrait: {
    path: `${ORGANIZATION_ID}/unassigned/368b08eb-a0bc-4622-8f5e-b5d3d2806487-gemini-founder-1n6xamcyspsf.mp4`,
    sha256: "4edccbaa4baee4762aac8679502d09f1d9949dafa318e7b3f325d138be2e92cd",
    source_asset_id: "05d760cb-1e57-41a0-a101-7c4ef568517a",
  },
  seated_hologram: {
    path: `${ORGANIZATION_ID}/unassigned/1984c981-0071-484f-8c64-055f926d787b-gemini-founder-shqkv89kt5rb.mp4`,
    sha256: "762e9c7fc314d168fb4206d5b1fbb72b6418e6178fe9288c1636336293af9a7b",
    source_asset_id: "95747a81-24cc-41ce-afac-ad0512f9a241",
  },
});

const NARRATION_PATH = `${ORGANIZATION_ID}/avantiqo-investor-video-20260818/avantiqo-investor-narration-cedar-v5-founder-locked-229.5s.mp3`;
const NARRATION_DURATION_SECONDS = 229.5;

const SEGMENTS = Object.freeze({
  "founder-opening-origin": {
    motion: "warm_office",
    audio_start: 0,
    audio_end: 11.391,
    duration: 11.391,
    purpose:
      "I didn’t build Avantiqo because I wanted to create another software company. I built it because running real businesses showed me the same problem again and again.",
  },
  "founder-opening-obvious": {
    motion: "night_office",
    audio_start: 28.266,
    audio_end: 30.375,
    duration: 2.109,
    purpose: "That made one thing obvious.",
  },
  "founder-opening-built": {
    motion: "restaurant",
    audio_start: 37.547,
    audio_end: 40.078,
    duration: 2.531,
    purpose: "That is why I built Avantiqo.",
  },
  "founder-mid-integration": {
    motion: "seated_hologram",
    audio_start: 136.266,
    audio_end: 140.062,
    duration: 3.796,
    purpose: "And the important part is what happens between them.",
  },
  "founder-mid-ai": {
    motion: "portrait",
    audio_start: 177.188,
    audio_end: 183.516,
    duration: 6.328,
    purpose:
      "This becomes even more important as AI moves from answering questions to coordinating real work.",
  },
  "founder-close": {
    motion: "night_office",
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

  const motionSpec = FOUNDER_MOTIONS[segment.motion];
  if (!motionSpec) throw new Error(`FOUNDER_MOTION_BINDING_REQUIRED:${key}`);

  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), `avantiqo-founder-${key}-`),
  );

  try {
    const motion = path.join(directory, "approved-founder-motion.mp4");
    const narration = path.join(directory, "narration-v5.mp3");
    const source = path.join(directory, "founder-source.mp4");
    const audio = path.join(directory, "founder-audio.wav");

    await Promise.all([
      download(motionSpec.path, motion),
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
      motion: segment.motion,
      motion_path: motionSpec.path,
      motion_sha256: motionSpec.sha256,
      source_asset_id: motionSpec.source_asset_id,
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
          motion: FOUNDER_MOTIONS[SEGMENTS[name].motion],
        };
      }

      return json({
        success: true,
        lip_sync_enabled: true,
        provider: REACT_MODEL,
        model_mode: "head",
        temperature: 0.65,
        identity_source: "FIVE_VERIFIED_GEMINI_FOUNDER_MOTIONS",
        founder_motions: FOUNDER_MOTIONS,
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
        identity_source: "FIVE_VERIFIED_GEMINI_FOUNDER_MOTIONS",
        narration_source: "LOCKED_CEDAR_V5_229_5_SECONDS",
        request_id: result.request_id,
        pending: result.pending,
        provider: result.model,
        model_mode: "head",
        temperature: 0.65,
        prepared: {
          motion: prepared.motion,
          motion_path: prepared.motion_path,
          motion_sha256: prepared.motion_sha256,
          source_asset_id: prepared.source_asset_id,
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
