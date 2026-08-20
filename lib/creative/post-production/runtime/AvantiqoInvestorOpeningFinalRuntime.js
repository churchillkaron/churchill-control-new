import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import sharp from "sharp";

import { getServiceSupabase } from "@/lib/shared/supabase/service";
import { resolveCreativeFfmpegPath } from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";

const supabase = getServiceSupabase();

const BUCKET = "creative-assets";
const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const SEGMENT_DIR = `${ORGANIZATION_ID}/avantiqo-investor-film-20260820/segments`;
const OUTPUT_PATH = `${SEGMENT_DIR}/opening-final-v2.mp4`;
const APPROVED_LOGO_PATH = `${ORGANIZATION_ID}/unassigned/df1cdd49-68e2-4a77-956e-6c9565c0074d-google-veo-6c9upygjkui2.mp4`;
const FOUNDER_PATH = `${ORGANIZATION_ID}/avantiqo-investor-film-20260820/founder-v7/founder-opening-origin-synced-approved-v7.mp4`;

const SOURCE = Object.freeze({
  b01: `${ORGANIZATION_ID}/unassigned/7fb49565-ee64-4fc5-b336-64cb334fb758-gemini-tylp0qmz2bpi.mp4`,
  b02: `${ORGANIZATION_ID}/unassigned/8fce813d-68ac-4032-918e-0eee89871265-gemini-q1zghwo9x4g8.mp4`,
  b03: `${ORGANIZATION_ID}/unassigned/5a56a041-3f60-47ff-a67b-bb011db8874c-gemini-qwgea6koo5yg.mp4`,
  b04: `${ORGANIZATION_ID}/unassigned/752d3d33-c62c-402c-8459-62b04a9e4010-gemini-urre56o4cv2u.mp4`,
  b05: `${ORGANIZATION_ID}/unassigned/68fdaca9-8d0f-46c9-ac86-8a639a593b57-gemini-kh6kptlc7phe.mp4`,
});

const WIDTH = 1280;
const HEIGHT = 720;
const FPS = 24;
const TARGET_DURATION = 48.078;
const TOLERANCE = 0.25;

const SHOTS = Object.freeze([
  { key: "logo", duration: 8, source: APPROVED_LOGO_PATH, hologram: false },
  { key: "founder-origin", duration: 11.391, source: FOUNDER_PATH, hologram: false },
  { key: "world-building", duration: 6.609, source: SOURCE.b01, hologram: false },
  { key: "fractured-company", duration: 6.6, source: SOURCE.b02, hologram: false },
  { key: "first-reveal", duration: 5.775, source: SOURCE.b03, hologram: "context" },
  { key: "intelligence", duration: 7.172, source: SOURCE.b04, hologram: "intelligence" },
  { key: "why-avantiqo", duration: 2.531, source: SOURCE.b05, hologram: false },
]);

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
      reject(new Error("AVANTIQO_INVESTOR_OPENING_V2_TIMEOUT"));
    }, timeoutMs);
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const trace = Buffer.concat(stderr).toString("utf8");
      if (code !== 0) reject(new Error(trace.slice(-14000) || `FFMPEG_EXIT_${code}`));
      else resolve(trace);
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

async function storageExists(storagePath) {
  const directory = path.posix.dirname(storagePath);
  const filename = path.posix.basename(storagePath);
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .list(directory, { search: filename, limit: 10 });
  if (error) return false;
  return (data || []).some((row) => row.name === filename);
}

async function download(storagePath, localPath) {
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error) throw error;
  if (!data) throw new Error(`OPENING_V2_SOURCE_EMPTY:${storagePath}`);
  const bytes = Buffer.from(await data.arrayBuffer());
  await fs.writeFile(localPath, bytes);
  return bytes;
}

async function upload(storagePath, localPath) {
  const bytes = await fs.readFile(localPath);
  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType: "video/mp4",
    cacheControl: "3600",
    upsert: true,
    metadata: {
      organization_id: ORGANIZATION_ID,
      investor_film: "20260820",
      opening_contract: "AVANTIQO_INVESTOR_OPENING_FINAL_V2",
      spatial_glass: "partial_frame_only",
      repeated_founder_setup: "forbidden",
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
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, seconds);
  if (error) throw error;
  return data?.signedUrl || null;
}

async function createGlassOverlay(directory, mode) {
  const output = path.join(directory, `glass-${mode}.rgba`);
  const title = mode === "context" ? "ONE SHARED CONTEXT" : "AVANTIQO INTELLIGENCE";
  const rows = mode === "context"
    ? ["FINANCE", "OPERATIONS", "PEOPLE", "CUSTOMERS"]
    : ["UNDERSTAND", "RECOMMEND", "APPROVE", "EXECUTE"];
  const rowMarkup = rows.map((label, index) => {
    const y = 116 + index * 58;
    return `
      <g>
        <rect x="34" y="${y}" width="390" height="44" rx="14" fill="#090b10" fill-opacity="0.36" stroke="#d7b66d" stroke-opacity="0.25"/>
        <circle cx="56" cy="${y + 22}" r="4" fill="#e4c679" fill-opacity="0.88"/>
        <text x="76" y="${y + 28}" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="700" letter-spacing="1.2" fill="#f4ead0">${label}</text>
        <line x1="288" y1="${y + 22}" x2="393" y2="${y + 22}" stroke="#d7b66d" stroke-opacity="0.35"/>
      </g>`;
  }).join("");

  const svg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="470" height="400">
      <defs>
        <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#1d222a" stop-opacity="0.46"/>
          <stop offset="0.58" stop-color="#0e1116" stop-opacity="0.30"/>
          <stop offset="1" stop-color="#302716" stop-opacity="0.24"/>
        </linearGradient>
        <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="4" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <rect x="10" y="10" width="450" height="380" rx="30" fill="url(#glass)" stroke="#d8b970" stroke-width="1.4" stroke-opacity="0.48"/>
      <rect x="18" y="18" width="434" height="364" rx="24" fill="none" stroke="#ffffff" stroke-opacity="0.05"/>
      <circle cx="58" cy="57" r="18" fill="none" stroke="#d8b970" stroke-width="1.4" stroke-opacity="0.72" filter="url(#glow)"/>
      <path d="M50 66 L58 43 L66 66 L61 66 L58 56 L55 66 Z" fill="#e7c980" fill-opacity="0.9"/>
      <text x="92" y="54" font-family="Arial, Helvetica, sans-serif" font-size="12" font-weight="700" letter-spacing="2" fill="#cdb170">AVANTIQO</text>
      <text x="92" y="76" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="700" letter-spacing="0.8" fill="#fff7e8">${title}</text>
      ${rowMarkup}
      <line x1="34" y1="354" x2="424" y2="354" stroke="#d7b66d" stroke-opacity="0.28"/>
      <text x="34" y="376" font-family="Arial, Helvetica, sans-serif" font-size="11" letter-spacing="1.2" fill="#d9caa8" fill-opacity="0.72">REAL BUSINESS CONTEXT / GOVERNED EXECUTION</text>
    </svg>
  `);

  const rendered = await sharp(svg)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  await fs.writeFile(output, rendered.data);
  return {
    path: output,
    width: rendered.info.width,
    height: rendered.info.height,
  };
}

async function renderClip(ffmpeg, source, output, duration, { hologram = null, directory }) {
  const localSource = path.join(directory, `${path.basename(output, ".mp4")}-source.mp4`);
  await download(source, localSource);

  if (!hologram) {
    await run(ffmpeg, [
      "-y",
      "-stream_loop", "-1",
      "-i", localSource,
      "-t", String(duration),
      "-an",
      "-vf", `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT},fps=${FPS},format=yuv420p`,
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "18",
      "-pix_fmt", "yuv420p",
      "-r", String(FPS),
      "-movflags", "+faststart",
      output,
    ]);
    return;
  }

  const overlay = await createGlassOverlay(directory, hologram);
  await run(ffmpeg, [
    "-y",
    "-stream_loop", "-1",
    "-i", localSource,
    "-f", "rawvideo",
    "-pixel_format", "rgba",
    "-video_size", `${overlay.width}x${overlay.height}`,
    "-framerate", String(FPS),
    "-stream_loop", "-1",
    "-i", overlay.path,
    "-t", String(duration),
    "-an",
    "-filter_complex", [
      `[0:v]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT},fps=${FPS}[base]`,
      "[1:v]scale=430:-1,format=rgba,colorchannelmixer=aa=0.88[glass]",
      `[base][glass]overlay=x='W-w-58+3*sin(t*0.55)':y='116+2*cos(t*0.42)':format=auto,` +
        "vignette=PI/5:0.18,format=yuv420p[out]",
    ].join(";"),
    "-map", "[out]",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "18",
    "-pix_fmt", "yuv420p",
    "-r", String(FPS),
    "-movflags", "+faststart",
    output,
  ]);
}

async function concatClips(ffmpeg, clips, output, directory) {
  const list = path.join(directory, "opening-v2.concat.txt");
  await fs.writeFile(
    list,
    clips.map((clip) => `file '${clip.replace(/'/g, "'\\''")}'`).join("\n"),
    "utf8",
  );
  await run(ffmpeg, [
    "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", list,
    "-an",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "18",
    "-pix_fmt", "yuv420p",
    "-r", String(FPS),
    "-movflags", "+faststart",
    output,
  ]);
}

export async function getAvantiqoInvestorOpeningFinalStatus() {
  const sourceEntries = await Promise.all(
    SHOTS.map(async (shot) => ({
      key: shot.key,
      path: shot.source,
      ready: await storageExists(shot.source),
      hologram: Boolean(shot.hologram),
    })),
  );

  return {
    success: true,
    contract: "AVANTIQO_INVESTOR_OPENING_FINAL_V2",
    output_path: OUTPUT_PATH,
    output_ready: await storageExists(OUTPUT_PATH),
    source_entries: sourceEntries,
    release_ready: sourceEntries.every((item) => item.ready),
    target_duration_seconds: TARGET_DURATION,
    founder_visible_count: 1,
    repeated_founder_setup_allowed: false,
    hologram_policy: "PARTIAL_FRAME_LIVE_ACTION_OVERLAY_ONLY",
    hologram_transport: "RAW_RGBA_DECODER_FREE",
    full_screen_ui_allowed: false,
    synthetic_metrics_allowed: false,
  };
}

export async function renderAvantiqoInvestorOpeningFinal({ force = false } = {}) {
  const ffmpeg = resolveCreativeFfmpegPath();
  if (!ffmpeg) throw new Error("CREATIVE_MEDIA_FFMPEG_NOT_READY");
  if (!force && await storageExists(OUTPUT_PATH)) {
    return {
      success: true,
      reused: true,
      output_path: OUTPUT_PATH,
      signed_url: await signedUrl(OUTPUT_PATH),
    };
  }

  const status = await getAvantiqoInvestorOpeningFinalStatus();
  if (!status.release_ready) {
    return {
      success: false,
      rendered: false,
      error: "OPENING_V2_RELEASE_GATES_NOT_READY",
      status,
    };
  }

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-investor-opening-v2-"));
  try {
    const clips = [];
    for (const [index, shot] of SHOTS.entries()) {
      const output = path.join(directory, `${String(index).padStart(2, "0")}-${shot.key}.mp4`);
      await renderClip(ffmpeg, shot.source, output, shot.duration, {
        hologram: shot.hologram,
        directory,
      });
      clips.push(output);
    }

    const finished = path.join(directory, "opening-final-v2.mp4");
    await concatClips(ffmpeg, clips, finished, directory);
    const actual = await mediaDuration(ffmpeg, finished);
    const delta = Math.abs(actual - TARGET_DURATION);
    if (delta > TOLERANCE) {
      throw new Error(`OPENING_V2_DURATION_OUT_OF_TOLERANCE:${actual}`);
    }

    const stored = await upload(OUTPUT_PATH, finished);
    return {
      success: true,
      rendered: true,
      output_path: OUTPUT_PATH,
      signed_url: await signedUrl(OUTPUT_PATH),
      bytes: stored.bytes,
      sha256: stored.sha256,
      duration_seconds: actual,
      founder_visible_count: 1,
      hologram_policy: "PARTIAL_FRAME_LIVE_ACTION_OVERLAY_ONLY",
      hologram_transport: "RAW_RGBA_DECODER_FREE",
      full_screen_ui_allowed: false,
    };
  } finally {
    await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}
