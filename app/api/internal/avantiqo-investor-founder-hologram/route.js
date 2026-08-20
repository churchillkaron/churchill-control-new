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

const TOKEN = "avq-investor-founder-hologram-20260821-v1";
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

function text(value) {
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
      reject(new Error("INVESTOR_FOUNDER_HOLOGRAM_RENDER_TIMEOUT"));
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
  if (!data) throw new Error(`FOUNDER_HOLOGRAM_SOURCE_EMPTY:${storagePath}`);
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
      founder_hologram: "speech_window_only",
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

function hologramSpec(mode) {
  if (mode === "integration") {
    return {
      title: "ONE BUSINESS FLOW",
      labels: ["SALE", "FINANCE", "SUPPLY", "PEOPLE"],
    };
  }
  if (mode === "ai") {
    return {
      title: "AVANTIQO INTELLIGENCE",
      labels: ["CONTEXT", "DECIDE", "APPROVE", "EXECUTE"],
    };
  }
  if (mode === "close") {
    return {
      title: "ONE OPERATING SYSTEM",
      labels: ["FINANCE", "OPERATIONS", "PEOPLE", "CUSTOMERS"],
    };
  }
  return {
    title: "AVANTIQO",
    labels: ["FINANCE", "OPERATIONS", "PEOPLE", "CUSTOMERS", "SUPPLY", "MARKETING"],
  };
}

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function makeHologram(directory, mode) {
  const spec = hologramSpec(mode);
  const target = path.join(directory, `hologram-${mode}.rgba`);
  const points = [
    [120, 175], [330, 145], [160, 275], [365, 255], [245, 95], [280, 330],
  ];

  const labels = spec.labels.map((label, index) => {
    const [x, y] = points[index % points.length];
    const anchorX = 260;
    const anchorY = 215;
    return `
      <g>
        <line x1="${anchorX}" y1="${anchorY}" x2="${x}" y2="${y}" stroke="#8eeeff" stroke-width="1" stroke-opacity="0.28"/>
        <circle cx="${x}" cy="${y}" r="11" fill="#70e8ff" fill-opacity="0.07" stroke="#a8f4ff" stroke-width="1.2" stroke-opacity="0.66"/>
        <circle cx="${x}" cy="${y}" r="3" fill="#d8fbff" fill-opacity="0.94"/>
        <text x="${x + 18}" y="${y + 4}" font-family="Arial, Helvetica, sans-serif" font-size="11" font-weight="700" letter-spacing="1.05" fill="#d7fbff" fill-opacity="0.86">${escapeXml(label)}</text>
      </g>`;
  }).join("");

  const svg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="520" height="430">
      <defs>
        <radialGradient id="baseGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stop-color="#9af4ff" stop-opacity="0.26"/>
          <stop offset="0.5" stop-color="#55dff7" stop-opacity="0.11"/>
          <stop offset="1" stop-color="#55dff7" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="beam" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stop-color="#8cecff" stop-opacity="0.16"/>
          <stop offset="1" stop-color="#8cecff" stop-opacity="0"/>
        </linearGradient>
        <filter id="glow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="5" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>

      <ellipse cx="260" cy="372" rx="180" ry="28" fill="url(#baseGlow)"/>
      <ellipse cx="260" cy="365" rx="112" ry="17" fill="none" stroke="#9af4ff" stroke-width="1.2" stroke-opacity="0.36"/>
      <ellipse cx="260" cy="365" rx="62" ry="9" fill="none" stroke="#c6f9ff" stroke-width="1" stroke-opacity="0.34"/>

      <path d="M178 365 L220 120 L300 120 L342 365 Z" fill="url(#beam)"/>
      <line x1="215" y1="360" x2="238" y2="118" stroke="#9af4ff" stroke-opacity="0.14"/>
      <line x1="305" y1="360" x2="282" y2="118" stroke="#9af4ff" stroke-opacity="0.14"/>

      <g filter="url(#glow)">
        <circle cx="260" cy="215" r="72" fill="none" stroke="#8cecff" stroke-width="1.3" stroke-opacity="0.24"/>
        <circle cx="260" cy="215" r="48" fill="none" stroke="#c6f9ff" stroke-width="1" stroke-opacity="0.20"/>
        <path d="M260 149 L278 207 L340 215 L278 223 L260 281 L242 223 L180 215 L242 207 Z" fill="#8eeeff" fill-opacity="0.035" stroke="#a9f5ff" stroke-opacity="0.18"/>
        <circle cx="260" cy="215" r="7" fill="#d8fbff" fill-opacity="0.82"/>
      </g>

      <text x="260" y="70" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="12" font-weight="700" letter-spacing="2.4" fill="#adf5ff" fill-opacity="0.76">${escapeXml(spec.title)}</text>
      ${labels}

      <g opacity="0.38">
        <line x1="95" y1="344" x2="425" y2="344" stroke="#91efff" stroke-width="1"/>
        <line x1="130" y1="354" x2="390" y2="354" stroke="#91efff" stroke-width="1"/>
        <circle cx="105" cy="120" r="1.8" fill="#d8fbff"/>
        <circle cx="395" cy="180" r="1.4" fill="#d8fbff"/>
        <circle cx="150" cy="90" r="1.2" fill="#d8fbff"/>
        <circle cx="355" cy="105" r="1.8" fill="#d8fbff"/>
      </g>
    </svg>
  `);

  const rendered = await sharp(svg)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  await fs.writeFile(target, rendered.data);
  return {
    path: target,
    width: rendered.info.width,
    height: rendered.info.height,
  };
}

async function preserveBase(segment, localBase, refreshBase) {
  const backupReady = await storageExists(segment.backup);
  if (!backupReady || refreshBase) {
    const localCurrent = `${localBase}.current.mp4`;
    await download(segment.source, localCurrent);
    await upload(segment.backup, localCurrent, {
      founder_hologram: "base_backup",
    });
    await fs.copyFile(localCurrent, localBase);
    return { backup_created: true, backup_refreshed: Boolean(refreshBase) };
  }
  await download(segment.backup, localBase);
  return { backup_created: false, backup_refreshed: false };
}

async function renderSegment(key, { refreshBase = false } = {}) {
  const segment = SEGMENTS[key];
  if (!segment) throw new Error(`FOUNDER_HOLOGRAM_SEGMENT_INVALID:${key}`);

  const ffmpeg = resolveCreativeFfmpegPath();
  if (!ffmpeg) throw new Error("CREATIVE_MEDIA_FFMPEG_NOT_READY");

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), `avantiqo-founder-hologram-${key}-`));
  try {
    const input = path.join(directory, "base.mp4");
    const output = path.join(directory, "composited.mp4");
    const baseState = await preserveBase(segment, input, refreshBase);

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
        `[${index + 1}:v]setpts=PTS-STARTPTS,format=rgba,colorchannelmixer=aa=0.78,scale='iw*(0.96+0.025*sin(t*0.65))':'ih*(0.96+0.025*sin(t*0.65))'[holo${index}]`,
      );
      filters.push(
        `[base${index}][holo${index}]overlay=x='W-w-18+7*sin(t*0.38)':y='H-h+8+5*cos(t*0.44)':enable='between(t,${window.start},${window.end})':format=auto[base${index + 1}]`,
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
      founder_hologram: "spatial_projection_rgba",
      founder_hologram_segment: key,
      founder_hologram_windows: String(segment.windows.length),
      founder_hologram_transport: "RAW_RGBA_DECODER_FREE",
      founder_hologram_card_background: "forbidden",
      founder_hologram_face_occlusion: "forbidden",
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
      policy: "SPATIAL_HOLOGRAM_ONLY_DURING_FOUNDER_SPEECH_WINDOWS",
      transport: "RAW_RGBA_DECODER_FREE",
      rectangular_ui_card: false,
    };
  } finally {
    await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (text(url.searchParams.get("token")) !== TOKEN) {
      return json({ success: false }, 404);
    }

    const action = text(url.searchParams.get("action") || "status").toLowerCase();
    const scope = text(url.searchParams.get("scope") || "all").toLowerCase();
    const refreshBase = url.searchParams.get("refresh_base") === "1";

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
        policy: "SPATIAL_HOLOGRAM_ONLY_DURING_FOUNDER_SPEECH_WINDOWS",
        transport: "RAW_RGBA_DECODER_FREE",
        rectangular_ui_card: false,
        face_occlusion_allowed: false,
        product_proof_untouched: true,
        items,
      });
    }

    if (action === "render") {
      const keys = scope === "all" ? Object.keys(SEGMENTS) : [scope];
      const results = [];
      for (const key of keys) {
        results.push(await renderSegment(key, { refreshBase }));
      }
      return json({
        success: true,
        policy: "SPATIAL_HOLOGRAM_ONLY_DURING_FOUNDER_SPEECH_WINDOWS",
        rectangular_ui_card: false,
        face_occlusion_allowed: false,
        product_proof_untouched: true,
        results,
      });
    }

    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    return json({ success: false, error: error?.message || String(error) }, 500);
  }
}
