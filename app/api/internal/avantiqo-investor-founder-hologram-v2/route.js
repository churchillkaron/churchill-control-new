export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import sharp from "sharp";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { resolveCreativeFfmpegPath } from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";

const TOKEN = "avq-investor-founder-hologram-v2-20260821";
const BUCKET = "creative-assets";
const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const SEGMENT_DIR = `${ORGANIZATION_ID}/avantiqo-investor-film-20260820/segments`;
const WIDTH = 1280;
const HEIGHT = 720;
const FPS = 24;

const SEGMENTS = Object.freeze({
  opening: {
    source: `${SEGMENT_DIR}/opening-final-v2.mp4`,
    backup: `${SEGMENT_DIR}/opening-final-v2-base-before-founder-hologram.mp4`,
    duration: 48.078,
    windows: [{ start: 8, end: 19.391, mode: "origin" }],
  },
  final_act: {
    source: `${SEGMENT_DIR}/final-act-final-v1.mp4`,
    backup: `${SEGMENT_DIR}/final-act-final-v1-base-before-founder-hologram.mp4`,
    duration: 93.234,
    windows: [
      { start: 0, end: 3.797, mode: "integration" },
      { start: 40.922, end: 47.25, mode: "ai" },
      { start: 83.109, end: 89.859, mode: "close" },
    ],
  },
});

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function clean(value) {
  return String(value ?? "").trim();
}

function run(command, args, timeoutMs = 290000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "ignore", "pipe"],
      env: { ...process.env, OMP_NUM_THREADS: "1" },
    });
    const stderr = [];
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("INVESTOR_SPATIAL_HOLOGRAM_V2_TIMEOUT"));
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
        reject(new Error(trace.slice(-12000) || `FFMPEG_EXIT_${code}`));
        return;
      }
      resolve(trace);
    });
  });
}

async function storageExists(storagePath) {
  const directory = path.posix.dirname(storagePath);
  const filename = path.posix.basename(storagePath);
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .list(directory, { search: filename, limit: 10 });
  if (error) return false;
  return (data || []).some((row) => row.name === filename);
}

async function download(storagePath, localPath) {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(storagePath);
  if (error) throw error;
  if (!data) throw new Error(`SPATIAL_HOLOGRAM_SOURCE_EMPTY:${storagePath}`);
  const bytes = Buffer.from(await data.arrayBuffer());
  await fs.writeFile(localPath, bytes);
  return bytes;
}

async function upload(storagePath, localPath, metadata = {}) {
  const bytes = await fs.readFile(localPath);
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType: "video/mp4",
    cacheControl: "3600",
    upsert: true,
    metadata: {
      organization_id: ORGANIZATION_ID,
      investor_film: "20260820",
      spatial_hologram: "founder_speech_windows_v2",
      ...metadata,
    },
  });
  if (error) throw error;
  return {
    path: storagePath,
    bytes: bytes.length,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
  };
}

async function signedUrl(storagePath, seconds = 86400) {
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, seconds);
  if (error) throw error;
  return data?.signedUrl || null;
}

function modeGeometry(mode) {
  if (mode === "integration") return { nodes: 5, rings: 3, lift: 0 };
  if (mode === "ai") return { nodes: 7, rings: 4, lift: -8 };
  if (mode === "close") return { nodes: 6, rings: 3, lift: 4 };
  return { nodes: 6, rings: 4, lift: 0 };
}

async function makeHologram(directory, mode) {
  const geometry = modeGeometry(mode);
  const target = path.join(directory, `spatial-${mode}.rgba`);
  const width = 480;
  const height = 360;
  const cx = 240;
  const cy = 186 + geometry.lift;

  const points = [
    [115, 170], [365, 155], [145, 240], [342, 242],
    [190, 112], [295, 105], [240, 275],
  ].slice(0, geometry.nodes);

  const links = points.map(([x, y]) =>
    `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#7eeeff" stroke-width="1" stroke-opacity="0.26"/>`,
  ).join("");

  const nodes = points.map(([x, y], index) => `
    <g opacity="${0.64 + (index % 3) * 0.08}">
      <polygon points="${x},${y - 10} ${x + 9},${y - 5} ${x + 9},${y + 5} ${x},${y + 10} ${x - 9},${y + 5} ${x - 9},${y - 5}" fill="#55e5ff" fill-opacity="0.06" stroke="#aaf5ff" stroke-width="1.1"/>
      <circle cx="${x}" cy="${y}" r="2.7" fill="#d9fbff"/>
    </g>`,
  ).join("");

  const rings = Array.from({ length: geometry.rings }, (_, index) => {
    const rx = 42 + index * 18;
    const ry = 16 + index * 7;
    const opacity = 0.34 - index * 0.055;
    return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="#8defff" stroke-width="1" stroke-opacity="${opacity}"/>`;
  }).join("");

  const svg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <defs>
        <radialGradient id="baseGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stop-color="#b9f8ff" stop-opacity="0.30"/>
          <stop offset="0.46" stop-color="#57e5ff" stop-opacity="0.13"/>
          <stop offset="1" stop-color="#57e5ff" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="beam" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stop-color="#8defff" stop-opacity="0.15"/>
          <stop offset="1" stop-color="#8defff" stop-opacity="0"/>
        </linearGradient>
        <filter id="glow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="5" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>

      <ellipse cx="240" cy="330" rx="165" ry="24" fill="url(#baseGlow)"/>
      <ellipse cx="240" cy="326" rx="104" ry="14" fill="none" stroke="#9af3ff" stroke-width="1.2" stroke-opacity="0.42"/>
      <ellipse cx="240" cy="326" rx="58" ry="8" fill="none" stroke="#d6fbff" stroke-width="1" stroke-opacity="0.38"/>

      <path d="M158 326 L205 82 L275 82 L322 326 Z" fill="url(#beam)"/>
      <line x1="195" y1="320" x2="220" y2="86" stroke="#9af4ff" stroke-opacity="0.12"/>
      <line x1="285" y1="320" x2="260" y2="86" stroke="#9af4ff" stroke-opacity="0.12"/>

      <g filter="url(#glow)">
        ${rings}
        <circle cx="${cx}" cy="${cy}" r="6" fill="#d8fbff" fill-opacity="0.88"/>
        <path d="M240 138 L252 178 L294 186 L252 194 L240 234 L228 194 L186 186 L228 178 Z" fill="#8defff" fill-opacity="0.025" stroke="#b7f8ff" stroke-opacity="0.20"/>
      </g>

      <g>${links}${nodes}</g>

      <g opacity="0.44">
        <circle cx="112" cy="92" r="1.5" fill="#d8fbff"/>
        <circle cx="388" cy="118" r="1.7" fill="#d8fbff"/>
        <circle cx="154" cy="74" r="1.1" fill="#d8fbff"/>
        <circle cx="330" cy="75" r="1.2" fill="#d8fbff"/>
        <line x1="92" y1="306" x2="388" y2="306" stroke="#8defff" stroke-opacity="0.28"/>
      </g>
    </svg>
  `);

  const rendered = await sharp(svg).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  await fs.writeFile(target, rendered.data);
  return {
    path: target,
    width: rendered.info.width,
    height: rendered.info.height,
  };
}

async function preserveBase(segment, localBase) {
  if (await storageExists(segment.backup)) {
    await download(segment.backup, localBase);
    return { source: "clean_backup", backup_created: false };
  }

  await download(segment.source, localBase);
  await upload(segment.backup, localBase, { spatial_hologram: "clean_base_backup" });
  return { source: "current_segment", backup_created: true };
}

async function renderSegment(key) {
  const segment = SEGMENTS[key];
  if (!segment) throw new Error(`SPATIAL_HOLOGRAM_SEGMENT_INVALID:${key}`);
  const ffmpeg = resolveCreativeFfmpegPath();
  if (!ffmpeg) throw new Error("CREATIVE_MEDIA_FFMPEG_NOT_READY");

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), `avantiqo-spatial-hologram-v2-${key}-`));
  try {
    const input = path.join(directory, "clean-base.mp4");
    const output = path.join(directory, "composited.mp4");
    const baseState = await preserveBase(segment, input);

    const holograms = [];
    for (const window of segment.windows) {
      holograms.push(await makeHologram(directory, window.mode));
    }

    const args = [
      "-y",
      "-threads", "1",
      "-filter_threads", "1",
      "-filter_complex_threads", "1",
      "-i", input,
    ];

    for (const hologram of holograms) {
      args.push(
        "-f", "rawvideo",
        "-pixel_format", "rgba",
        "-video_size", `${hologram.width}x${hologram.height}`,
        "-framerate", String(FPS),
        "-stream_loop", "-1",
        "-i", hologram.path,
      );
    }

    const filters = [
      `[0:v]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT},fps=${FPS},format=yuv420p[base0]`,
    ];

    segment.windows.forEach((window, index) => {
      filters.push(
        `[${index + 1}:v]setpts=PTS-STARTPTS,format=rgba,colorchannelmixer=aa=0.66[holo${index}]`,
      );
      filters.push(
        `[base${index}][holo${index}]overlay=x='(W-w)/2+8*sin(t*0.35)':y='H-h+64+4*cos(t*0.42)':enable='between(t,${window.start},${window.end})':format=auto[base${index + 1}]`,
      );
    });

    args.push(
      "-filter_complex", filters.join(";"),
      "-map", `[base${segment.windows.length}]`,
      "-an",
      "-t", String(segment.duration),
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-crf", "18",
      "-pix_fmt", "yuv420p",
      "-r", String(FPS),
      "-movflags", "+faststart",
      output,
    );

    await run(ffmpeg, args);
    const stored = await upload(segment.source, output, {
      spatial_hologram: "projection_network_no_card_v2",
      spatial_hologram_segment: key,
      spatial_hologram_windows: String(segment.windows.length),
      text_labels: "none",
      face_occlusion_policy: "lower_frame_projection",
    });

    return {
      success: true,
      segment: key,
      output_path: segment.source,
      backup_path: segment.backup,
      windows: segment.windows,
      base_state: baseState,
      bytes: stored.bytes,
      sha256: stored.sha256,
      signed_url: await signedUrl(segment.source),
    };
  } finally {
    await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (clean(url.searchParams.get("token")) !== TOKEN) return json({ success: false }, 404);

    const action = clean(url.searchParams.get("action") || "status").toLowerCase();
    const scope = clean(url.searchParams.get("scope") || "all").toLowerCase();

    if (action === "status") {
      const items = {};
      for (const [key, segment] of Object.entries(SEGMENTS)) {
        items[key] = {
          source_ready: await storageExists(segment.source),
          backup_ready: await storageExists(segment.backup),
          source: segment.source,
          backup: segment.backup,
          windows: segment.windows,
        };
      }
      return json({
        success: true,
        policy: "LOWER_FRAME_SPATIAL_PROJECTION_DURING_FOUNDER_SPEECH",
        transport: "RAW_RGBA_DECODER_FREE",
        rectangular_ui_card: false,
        text_labels: false,
        product_proof_untouched: true,
        items,
      });
    }

    if (action === "render") {
      const keys = scope === "all" ? Object.keys(SEGMENTS) : [scope];
      const results = [];
      for (const key of keys) results.push(await renderSegment(key));
      return json({
        success: true,
        policy: "LOWER_FRAME_SPATIAL_PROJECTION_DURING_FOUNDER_SPEECH",
        rectangular_ui_card: false,
        text_labels: false,
        product_proof_untouched: true,
        results,
      });
    }

    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    return json({ success: false, error: error?.message || String(error) }, 500);
  }
}
