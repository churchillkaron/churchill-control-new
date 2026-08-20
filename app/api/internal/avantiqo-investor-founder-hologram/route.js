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
    windows: [
      { start: 8, end: 19.391, mode: "origin" },
    ],
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

function panelSpec(mode) {
  if (mode === "integration") {
    return {
      eyebrow: "ONE SHARED OPERATING CONTEXT",
      title: "BUSINESS FLOW",
      rows: ["SALE", "FINANCE", "SUPPLY", "PEOPLE"],
      footer: "ONE EVENT · ONE TRUTH · CONTROLLED EXECUTION",
    };
  }
  if (mode === "ai") {
    return {
      eyebrow: "AVANTIQO INTELLIGENCE",
      title: "GOVERNED AI",
      rows: ["CONTEXT", "PERMISSIONS", "WORKFLOWS", "ACCOUNTABILITY"],
      footer: "UNDERSTAND · RECOMMEND · APPROVE · EXECUTE",
    };
  }
  if (mode === "close") {
    return {
      eyebrow: "ONE OPERATING SYSTEM",
      title: "AVANTIQO",
      rows: ["FINANCE", "OPERATIONS", "PEOPLE", "CUSTOMERS"],
      footer: "THE SYSTEM BUSINESSES OPERATE THROUGH",
    };
  }
  return {
    eyebrow: "THE BUSINESS AS ONE SYSTEM",
    title: "AVANTIQO",
    rows: ["FINANCE", "OPERATIONS", "PEOPLE", "CUSTOMERS", "SUPPLIERS", "MARKETING"],
    footer: "REAL BUSINESS CONTEXT · CONNECTED EXECUTION",
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

async function makePanel(directory, mode) {
  const spec = panelSpec(mode);
  const target = path.join(directory, `hologram-${mode}.png`);
  const rowCount = spec.rows.length;
  const cols = rowCount > 4 ? 2 : 1;
  const rowsPerCol = Math.ceil(rowCount / cols);
  const rowMarkup = spec.rows.map((label, index) => {
    const col = cols === 1 ? 0 : Math.floor(index / rowsPerCol);
    const row = cols === 1 ? index : index % rowsPerCol;
    const x = 30 + col * 184;
    const y = 132 + row * 52;
    return `
      <g>
        <rect x="${x}" y="${y}" width="166" height="38" rx="12" fill="#07111a" fill-opacity="0.58" stroke="#86e8ff" stroke-opacity="0.38"/>
        <circle cx="${x + 18}" cy="${y + 19}" r="3.5" fill="#9feeff" fill-opacity="0.94"/>
        <text x="${x + 32}" y="${y + 24}" font-family="Arial, Helvetica, sans-serif" font-size="11.5" font-weight="700" letter-spacing="1.1" fill="#ecfbff">${escapeXml(label)}</text>
      </g>`;
  }).join("");

  const svg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="410" height="360">
      <defs>
        <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#0e2230" stop-opacity="0.50"/>
          <stop offset="0.55" stop-color="#071018" stop-opacity="0.42"/>
          <stop offset="1" stop-color="#112b37" stop-opacity="0.34"/>
        </linearGradient>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <rect x="10" y="10" width="390" height="340" rx="26" fill="url(#glass)" stroke="#91eaff" stroke-width="1.4" stroke-opacity="0.52"/>
      <rect x="18" y="18" width="374" height="324" rx="21" fill="none" stroke="#ffffff" stroke-opacity="0.08"/>
      <g filter="url(#glow)">
        <circle cx="52" cy="54" r="17" fill="none" stroke="#9feeff" stroke-width="1.4" stroke-opacity="0.82"/>
        <path d="M45 64 L52 42 L59 64 L55 64 L52 55 L49 64 Z" fill="#baf4ff" fill-opacity="0.96"/>
      </g>
      <text x="82" y="48" font-family="Arial, Helvetica, sans-serif" font-size="10.5" font-weight="700" letter-spacing="1.8" fill="#91eaff">${escapeXml(spec.eyebrow)}</text>
      <text x="82" y="76" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="700" letter-spacing="0.7" fill="#ffffff">${escapeXml(spec.title)}</text>
      <line x1="30" y1="106" x2="380" y2="106" stroke="#91eaff" stroke-opacity="0.30"/>
      ${rowMarkup}
      <line x1="30" y1="316" x2="380" y2="316" stroke="#91eaff" stroke-opacity="0.24"/>
      <text x="30" y="338" font-family="Arial, Helvetica, sans-serif" font-size="9.5" font-weight="600" letter-spacing="1.0" fill="#d5f8ff" fill-opacity="0.78">${escapeXml(spec.footer)}</text>
    </svg>
  `);

  await sharp(svg).png().toFile(target);
  return target;
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

    const panels = [];
    for (const window of segment.windows) {
      panels.push(await makePanel(directory, window.mode));
    }

    const args = [
      "-y",
      "-threads", "1",
      "-filter_threads", "1",
      "-filter_complex_threads", "1",
      "-i", input,
    ];

    for (const panel of panels) {
      args.push("-loop", "1", "-framerate", String(FPS), "-i", panel);
    }

    const filters = [
      `[0:v]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT},fps=${FPS},format=yuv420p[base0]`,
    ];

    segment.windows.forEach((window, index) => {
      const fadeOutStart = Math.max(window.start, window.end - 0.35);
      filters.push(
        `[${index + 1}:v]format=rgba,fade=t=in:st=${window.start}:d=0.35:alpha=1,fade=t=out:st=${fadeOutStart}:d=0.35:alpha=1[panel${index}]`,
      );
      filters.push(
        `[base${index}][panel${index}]overlay=x='W-w-52+4*sin(t*0.55)':y='H-h-54+4*cos(t*0.48)':enable='between(t,${window.start},${window.end})':format=auto[base${index + 1}]`,
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
      founder_hologram: "speech_window_composite",
      founder_hologram_segment: key,
      founder_hologram_windows: String(segment.windows.length),
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
      policy: "HOLOGRAM_ONLY_DURING_FOUNDER_SPEECH_WINDOWS",
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
        policy: "HOLOGRAM_ONLY_DURING_FOUNDER_SPEECH_WINDOWS",
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
        policy: "HOLOGRAM_ONLY_DURING_FOUNDER_SPEECH_WINDOWS",
        product_proof_untouched: true,
        results,
      });
    }

    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    return json({ success: false, error: error?.message || String(error) }, 500);
  }
}
