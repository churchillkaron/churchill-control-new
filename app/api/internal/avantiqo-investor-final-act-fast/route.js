export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import sharp from "sharp";

import { getServiceSupabase } from "@/lib/shared/supabase/service";
import { resolveCreativeFfmpegPath } from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";

const supabase = getServiceSupabase();
const TOKEN = "avq-investor-semantic-segments-20260820-v1";
const BUCKET = "creative-assets";
const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const UI_MANIFEST_PATH = `${ORGANIZATION_ID}/avantiqo-investor-film-20260820/ui/manifest-v1.json`;
const FOUNDER_DIR = `${ORGANIZATION_ID}/avantiqo-investor-film-20260820/founder-v6`;
const LOGO_PATH = `${ORGANIZATION_ID}/unassigned/df1cdd49-68e2-4a77-956e-6c9565c0074d-google-veo-6c9upygjkui2.mp4`;
const OUTPUT_PATH = `${ORGANIZATION_ID}/avantiqo-investor-film-20260820/segments/final-act-final-v1.mp4`;
const WIDTH = 1280;
const HEIGHT = 720;
const FPS = 24;
const TARGET = 93.234;
const TOLERANCE = 0.35;

const BEATS = Object.freeze([
  { id: "integration-01", duration: 3.797, type: "founder", file: "founder-mid-integration-synced-approved-v6.mp4" },
  { id: "integration-02", duration: 17.297, type: "ui", slot: "general_ledger" },
  { id: "channels-01", duration: 10.969, type: "ui", slot: "customer_communications" },
  { id: "channels-02", duration: 8.859, type: "ui", slot: "integrations_connected_services" },
  { id: "ai-01", duration: 6.328, type: "founder", file: "founder-mid-ai-synced-approved-v6.mp4" },
  { id: "ai-02", duration: 12.656, type: "ui", slot: "finance_governance_accounting_settings" },
  { id: "ai-03", duration: 3.375, type: "title" },
  { id: "proof-01", duration: 10.547, type: "ui", slot: "autonomous_marketing" },
  { id: "strategy-01", duration: 9.281, type: "ui", slot: "restaurant_operations" },
  { id: "close-01", duration: 2.953, type: "founder", file: "founder-close-synced-approved-v6.mp4", offset: 0 },
  { id: "close-02", duration: 3.797, type: "founder", file: "founder-close-synced-approved-v6.mp4", offset: 2.953 },
  { id: "close-03", duration: 0.422, type: "logo", offset: 4.625 },
  { id: "close-04", duration: 2.953, type: "logo", offset: 5.047 },
]);

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" } });
}

function text(value) {
  return String(value ?? "").trim();
}

function run(command, args, timeoutMs = 285000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ["ignore", "ignore", "pipe"], env: { ...process.env, OMP_NUM_THREADS: "1" } });
    const stderr = [];
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("FINAL_ACT_FAST_FFMPEG_TIMEOUT"));
    }, timeoutMs);
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timer);
      const trace = Buffer.concat(stderr).toString("utf8");
      if (code !== 0) reject(new Error(trace.slice(-12000) || `FFMPEG_EXIT_${code}`));
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
    const child = spawn(ffmpeg, ["-hide_banner", "-i", source], { shell: false, stdio: ["ignore", "ignore", "pipe"] });
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
  const { data, error } = await supabase.storage.from(BUCKET).list(directory, { search: filename, limit: 10 });
  if (error) return false;
  return (data || []).some((row) => row.name === filename);
}

async function download(storagePath, localPath) {
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error) throw error;
  if (!data) throw new Error(`FINAL_ACT_FAST_SOURCE_EMPTY:${storagePath}`);
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
      semantic_sync: "true",
      authentic_ui_only: "true",
      bounded_renderer: "true",
    },
  });
  if (error) throw error;
  return { bytes: bytes.length, sha256: crypto.createHash("sha256").update(bytes).digest("hex") };
}

async function signedUrl(storagePath, seconds = 86400) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, seconds);
  if (error) throw error;
  return data?.signedUrl || null;
}

async function readManifest() {
  const { data, error } = await supabase.storage.from(BUCKET).download(UI_MANIFEST_PATH);
  if (error) throw error;
  if (!data) throw new Error("FINAL_ACT_FAST_MANIFEST_EMPTY");
  const manifest = JSON.parse(Buffer.from(await data.arrayBuffer()).toString("utf8"));
  if (manifest?.synthetic_ui_allowed !== false) throw new Error("FINAL_ACT_FAST_UI_POLICY_INVALID");
  return manifest;
}

async function renderStill(ffmpeg, source, output, duration, zoom = 0.014) {
  const frames = Math.max(1, Math.round(duration * FPS));
  await run(ffmpeg, [
    "-y", "-loop", "1", "-framerate", String(FPS), "-i", source,
    "-t", String(duration), "-an",
    "-vf", [
      `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase`,
      `crop=${WIDTH}:${HEIGHT}`,
      `zoompan=z='1.0+${zoom}*(on/${frames})':d=1:s=${WIDTH}x${HEIGHT}:fps=${FPS}`,
      "eq=contrast=1.018:saturation=.97:brightness=-.004",
      "vignette=PI/14",
      "fade=t=in:st=0:d=0.22",
      `fade=t=out:st=${Math.max(0, duration - 0.22)}:d=0.22`,
      "format=yuv420p",
    ].join(","),
    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "18", "-pix_fmt", "yuv420p", "-r", String(FPS), output,
  ]);
}

async function renderVideo(ffmpeg, source, output, duration, offset = 0) {
  const args = ["-y"];
  if (offset > 0) args.push("-ss", String(offset));
  args.push("-i", source, "-t", String(duration), "-an",
    "-vf", `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT},fps=${FPS},format=yuv420p`,
    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "18", "-pix_fmt", "yuv420p", "-r", String(FPS), output);
  await run(ffmpeg, args);
}

async function makeIntelligenceCard(directory) {
  const target = path.join(directory, "ai-intelligence.jpg");
  const svg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">
      <defs><radialGradient id="bg"><stop offset="0" stop-color="#151b26"/><stop offset="1" stop-color="#020305"/></radialGradient></defs>
      <rect width="1280" height="720" fill="url(#bg)"/>
      <line x1="450" y1="260" x2="830" y2="260" stroke="#cdb16e" stroke-opacity=".7"/>
      <text x="640" y="235" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="14" font-weight="700" letter-spacing="2.8" fill="#d2b670">SHARED OPERATING CONTEXT</text>
      <text x="640" y="360" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="700" letter-spacing="1.6" fill="#ffffff">AVANTIQO INTELLIGENCE</text>
      <text x="640" y="415" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="17" fill="#aeb3bc">The business stops looking like fragments.</text>
    </svg>`);
  await sharp(svg).jpeg({ quality: 96, chromaSubsampling: "4:4:4" }).toFile(target);
  return target;
}

async function concatClips(ffmpeg, clips, output, directory) {
  const list = path.join(directory, "final-act-fast.concat.txt");
  await fs.writeFile(list, clips.map((clip) => `file '${clip.replace(/'/g, "'\\''")}'`).join("\n"), "utf8");
  await run(ffmpeg, ["-y", "-f", "concat", "-safe", "0", "-i", list, "-an", "-c", "copy", "-movflags", "+faststart", output], 60000);
}

async function renderFinalAct() {
  const ffmpeg = resolveCreativeFfmpegPath();
  if (!ffmpeg) throw new Error("CREATIVE_MEDIA_FFMPEG_NOT_READY");
  const manifest = await readManifest();
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-final-act-fast-"));
  try {
    const logoLocal = path.join(directory, "approved-logo.mp4");
    await download(LOGO_PATH, logoLocal);
    const founderCache = new Map();
    const clips = [];

    for (const [index, beat] of BEATS.entries()) {
      const output = path.join(directory, `${String(index).padStart(2, "0")}-${beat.id}.mp4`);
      if (beat.type === "ui") {
        const item = manifest?.slots?.[beat.slot];
        if (!item?.normalized_path) throw new Error(`FINAL_ACT_FAST_UI_NOT_READY:${beat.slot}`);
        const raw = path.join(directory, `${beat.id}.png`);
        const jpg = path.join(directory, `${beat.id}.jpg`);
        await download(item.normalized_path, raw);
        await sharp(raw).jpeg({ quality: 96, chromaSubsampling: "4:4:4" }).toFile(jpg);
        await renderStill(ffmpeg, jpg, output, beat.duration, index % 2 ? 0.012 : 0.016);
      } else if (beat.type === "founder") {
        let local = founderCache.get(beat.file);
        if (!local) {
          local = path.join(directory, beat.file);
          await download(`${FOUNDER_DIR}/${beat.file}`, local);
          founderCache.set(beat.file, local);
        }
        await renderVideo(ffmpeg, local, output, beat.duration, beat.offset || 0);
      } else if (beat.type === "title") {
        const card = await makeIntelligenceCard(directory);
        await renderStill(ffmpeg, card, output, beat.duration, 0.01);
      } else if (beat.type === "logo") {
        await renderVideo(ffmpeg, logoLocal, output, beat.duration, beat.offset || 0);
      }
      clips.push(output);
    }

    const finished = path.join(directory, "final-act-final-v1.mp4");
    await concatClips(ffmpeg, clips, finished, directory);
    const actual = await mediaDuration(ffmpeg, finished);
    const delta = Math.abs(actual - TARGET);
    if (delta > TOLERANCE) throw new Error(`FINAL_ACT_FAST_DURATION_OUT_OF_TOLERANCE:${actual}`);
    const stored = await upload(OUTPUT_PATH, finished);
    return {
      success: true,
      rendered: true,
      output_path: OUTPUT_PATH,
      signed_url: await signedUrl(OUTPUT_PATH),
      expected_duration_seconds: TARGET,
      actual_duration_seconds: actual,
      duration_delta_seconds: delta,
      bytes: stored.bytes,
      sha256: stored.sha256,
      authentic_ui_only: true,
      semantic_sync: true,
      bounded_renderer: true,
    };
  } finally {
    await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (text(url.searchParams.get("token")) !== TOKEN) return json({ success: false }, 404);
    const action = text(url.searchParams.get("action") || "status").toLowerCase();
    if (action === "status") {
      return json({ success: true, output_ready: await storageExists(OUTPUT_PATH), output_path: OUTPUT_PATH, target_duration_seconds: TARGET });
    }
    if (action === "render") return json(await renderFinalAct());
    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    return json({ success: false, error: error?.message || String(error) }, 500);
  }
}
