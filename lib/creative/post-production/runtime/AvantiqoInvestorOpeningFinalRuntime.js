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
const FOUNDER_DIR = `${ORGANIZATION_ID}/avantiqo-investor-film-20260820/founder-v6`;
const OUTPUT_PATH = `${SEGMENT_DIR}/opening-final-v1.mp4`;
const APPROVED_LOGO_PATH = `${ORGANIZATION_ID}/unassigned/df1cdd49-68e2-4a77-956e-6c9565c0074d-google-veo-6c9upygjkui2.mp4`;

const WIDTH = 1280;
const HEIGHT = 720;
const FPS = 24;
const TARGET_DURATION = 48.078;
const TOLERANCE = 0.25;

const SHOTS = Object.freeze([
  { key: "logo", duration: 8, type: "logo" },
  { key: "opening-founder-origin", duration: 11.391, type: "founder" },
  { key: "systems", duration: 16.875, type: "systems" },
  { key: "opening-founder-obvious", duration: 2.109, type: "founder" },
  { key: "intelligence", duration: 7.172, type: "intelligence" },
  { key: "opening-founder-why", duration: 2.531, type: "founder" },
]);

const FOUNDER_FILES = Object.freeze({
  "opening-founder-origin": "opening-founder-origin-synced-approved-v6.mp4",
  "opening-founder-obvious": "opening-founder-obvious-synced-approved-v6.mp4",
  "opening-founder-why": "opening-founder-why-synced-approved-v6.mp4",
});

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
      reject(new Error("AVANTIQO_INVESTOR_OPENING_FINAL_TIMEOUT"));
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
  if (!data) throw new Error(`OPENING_FINAL_SOURCE_EMPTY:${storagePath}`);
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
      founder_lipsync: "approved",
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

async function renderVideo(ffmpeg, source, output, duration) {
  await run(ffmpeg, [
    "-y",
    "-stream_loop", "-1",
    "-i", source,
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
}

async function makeSystemsFrame(directory) {
  const target = path.join(directory, "systems.png");
  const labels = [
    ["FINANCE", 90, 150], ["OPERATIONS", 90, 285], ["CUSTOMERS", 90, 420],
    ["PEOPLE", 930, 150], ["SUPPLIERS", 930, 285], ["MARKETING", 930, 420],
  ];
  const cards = labels.map(([label, x, y]) => `
    <rect x="${x}" y="${y}" width="260" height="88" rx="18" fill="#090c12" stroke="#bea466" stroke-opacity=".62"/>
    <text x="${x + 24}" y="${y + 52}" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="700" letter-spacing="1.4" fill="#e1c681">${label}</text>
  `).join("");
  const svg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">
      <defs>
        <radialGradient id="bg" cx="50%" cy="45%" r="75%">
          <stop offset="0" stop-color="#101621"/>
          <stop offset=".55" stop-color="#06090e"/>
          <stop offset="1" stop-color="#020305"/>
        </radialGradient>
      </defs>
      <rect width="1280" height="720" fill="url(#bg)"/>
      ${cards}
      <text x="640" y="604" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="16" fill="#9fa5ae">Different systems. Different truths. One business.</text>
    </svg>
  `);
  await sharp(svg).png().toFile(target);
  return target;
}

async function makeIntelligenceFrame(directory) {
  const target = path.join(directory, "intelligence.png");
  const svg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">
      <defs>
        <radialGradient id="bg" cx="50%" cy="45%" r="75%">
          <stop offset="0" stop-color="#111722"/>
          <stop offset=".55" stop-color="#06090e"/>
          <stop offset="1" stop-color="#020305"/>
        </radialGradient>
      </defs>
      <rect width="1280" height="720" fill="url(#bg)"/>
      <rect x="370" y="240" width="540" height="210" rx="32" fill="#070a0f" stroke="#dcc27f" stroke-width="2" stroke-opacity=".82"/>
      <text x="640" y="315" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="700" letter-spacing="2.4" fill="#d2b670">ONE SHARED OPERATING CONTEXT</text>
      <text x="640" y="372" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="38" font-weight="700" letter-spacing="1.4" fill="#ffffff">AVANTIQO</text>
      <text x="640" y="414" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="27" font-weight="600" letter-spacing="2" fill="#ffffff">INTELLIGENCE</text>
      <text x="640" y="518" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="15" fill="#9fa5ae">The software should understand the business.</text>
    </svg>
  `);
  await sharp(svg).png().toFile(target);
  return target;
}

async function renderStill(ffmpeg, source, output, duration, zoom = 0.018) {
  const frames = Math.max(1, Math.round(duration * FPS));
  await run(ffmpeg, [
    "-y",
    "-loop", "1",
    "-framerate", String(FPS),
    "-i", source,
    "-t", String(duration),
    "-an",
    "-vf", [
      `zoompan=z='1.0+${zoom}*(on/${frames})':d=1:s=${WIDTH}x${HEIGHT}:fps=${FPS}`,
      "fade=t=in:st=0:d=.3",
      `fade=t=out:st=${Math.max(0, duration - .3)}:d=.3`,
      "format=yuv420p",
    ].join(","),
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
  const list = path.join(directory, "opening.concat.txt");
  await fs.writeFile(list, clips.map((clip) => `file '${clip.replace(/'/g, "'\\''")}'`).join("\n"), "utf8");
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
  const founder = await Promise.all(Object.entries(FOUNDER_FILES).map(async ([key, filename]) => ({
    key,
    path: `${FOUNDER_DIR}/${filename}`,
    ready: await storageExists(`${FOUNDER_DIR}/${filename}`),
  })));
  return {
    success: true,
    contract: "AVANTIQO_INVESTOR_OPENING_FINAL_V1",
    output_path: OUTPUT_PATH,
    output_ready: await storageExists(OUTPUT_PATH),
    approved_logo_ready: await storageExists(APPROVED_LOGO_PATH),
    founder_lipsync: founder,
    release_ready: (await storageExists(APPROVED_LOGO_PATH)) && founder.every((item) => item.ready),
    target_duration_seconds: TARGET_DURATION,
  };
}

export async function renderAvantiqoInvestorOpeningFinal({ force = false } = {}) {
  const ffmpeg = resolveCreativeFfmpegPath();
  if (!ffmpeg) throw new Error("CREATIVE_MEDIA_FFMPEG_NOT_READY");
  if (!force && await storageExists(OUTPUT_PATH)) {
    return { success: true, reused: true, output_path: OUTPUT_PATH, signed_url: await signedUrl(OUTPUT_PATH) };
  }

  const status = await getAvantiqoInvestorOpeningFinalStatus();
  if (!status.release_ready) {
    return { success: false, rendered: false, error: "OPENING_FINAL_RELEASE_GATES_NOT_READY", status };
  }

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-investor-opening-final-"));
  try {
    const clips = [];
    for (const [index, shot] of SHOTS.entries()) {
      const output = path.join(directory, `${String(index).padStart(2, "0")}-${shot.key}.mp4`);
      if (shot.type === "logo") {
        const source = path.join(directory, "logo.mp4");
        await download(APPROVED_LOGO_PATH, source);
        await renderVideo(ffmpeg, source, output, shot.duration);
      } else if (shot.type === "founder") {
        const filename = FOUNDER_FILES[shot.key];
        const source = path.join(directory, `${shot.key}.mp4`);
        await download(`${FOUNDER_DIR}/${filename}`, source);
        await renderVideo(ffmpeg, source, output, shot.duration);
      } else if (shot.type === "systems") {
        const frame = await makeSystemsFrame(directory);
        await renderStill(ffmpeg, frame, output, shot.duration, 0.012);
      } else if (shot.type === "intelligence") {
        const frame = await makeIntelligenceFrame(directory);
        await renderStill(ffmpeg, frame, output, shot.duration, 0.025);
      }
      clips.push(output);
    }

    const finished = path.join(directory, "opening-final.mp4");
    await concatClips(ffmpeg, clips, finished, directory);
    const actual = await mediaDuration(ffmpeg, finished);
    const delta = Math.abs(actual - TARGET_DURATION);
    if (delta > TOLERANCE) throw new Error(`OPENING_FINAL_DURATION_OUT_OF_TOLERANCE:${actual}`);

    const stored = await upload(OUTPUT_PATH, finished);
    return {
      success: true,
      rendered: true,
      output_path: OUTPUT_PATH,
      signed_url: await signedUrl(OUTPUT_PATH),
      bytes: stored.bytes,
      sha256: stored.sha256,
      target_duration_seconds: TARGET_DURATION,
      actual_duration_seconds: actual,
      duration_delta_seconds: delta,
    };
  } finally {
    await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}

export const AvantiqoInvestorOpeningFinalRuntime = Object.freeze({
  status: getAvantiqoInvestorOpeningFinalStatus,
  render: renderAvantiqoInvestorOpeningFinal,
  output_path: OUTPUT_PATH,
});
