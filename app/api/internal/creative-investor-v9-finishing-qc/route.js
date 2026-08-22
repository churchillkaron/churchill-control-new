export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import sharp from "sharp";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { resolveCreativeFfmpegPath } from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";
import { authorizeInvestorV9Render } from "@/lib/investor-film/InvestorV9RenderAuth";

const ORG = "33336a72-acb5-474e-856b-8be0269360e2";
const PROJECT = "37ca49f2-210d-4665-af6b-6b5fa834f750";
const BUCKET = "creative-assets";
const V8 = `${ORG}/${PROJECT}/spatial-master-v8-micro/chunks`;

const ASSETS = Object.freeze({
  opening_01: { path: `${V8}/chunk-01.mp4`, duration: 317 / 24 },
  opening_02: { path: `${V8}/chunk-02.mp4`, duration: 403 / 24 },
  opening_03: { path: `${V8}/chunk-03.mp4`, duration: 373 / 24 },
  business_partner: { path: `${ORG}/avantiqo-investor-film-20260821/business-partner-digital-twin-v1-922f.mp4`, duration: 922 / 24 },
  communication: { path: `${ORG}/avantiqo-investor-film-20260821/communication-intelligence-v3-911f.mp4`, duration: 911 / 24 },
  cross_domain: { path: `${ORG}/avantiqo-investor-film-20260821/cross-domain-governance-v1-1174f.mp4`, duration: 1174 / 24 },
  studio_marketing: { path: `${ORG}/avantiqo-investor-film-20260821/studio-marketing-cinema-v1-881f.mp4`, duration: 881 / 24 },
  proof_17: { path: `${V8}/chunk-17.mp4`, duration: 190 / 24 },
  strategy_18: { path: `${V8}/chunk-18.mp4`, duration: 212 / 24 },
  founder_close_19: { path: `${V8}/chunk-19.mp4`, duration: 236 / 24 },
  logo_close_20: { path: `${V8}/chunk-20.mp4`, duration: 81 / 24 },
});

const json = (value, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store, private" } });

function run(command, args, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "ignore", "pipe"],
      env: { ...process.env, OMP_NUM_THREADS: "1", OPENBLAS_NUM_THREADS: "1", MKL_NUM_THREADS: "1" },
    });
    const stderr = [];
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("V9_FINISHING_QC_TIMEOUT")); }, timeoutMs);
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(Buffer.concat(stderr).toString("utf8").slice(-5000) || `V9_FINISHING_QC_FFMPEG_${code}`));
    });
  });
}

async function signed(storagePath) {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(storagePath, 1800);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("V9_FINISHING_QC_SIGNED_URL_MISSING");
  return data.signedUrl;
}

function parseTimes(value, duration) {
  const requested = String(value || "").split(",").map((item) => Number(item.trim())).filter(Number.isFinite);
  const fallback = Array.from({ length: 9 }, (_, i) => Number((((i + 1) * duration) / 10).toFixed(3)));
  const times = (requested.length ? requested : fallback)
    .filter((seconds) => seconds >= 0 && seconds < duration)
    .slice(0, 16);
  if (!times.length) throw new Error("V9_FINISHING_QC_TIMES_INVALID");
  return times;
}

function labelSvg(assetKey, seconds) {
  const label = `${assetKey}  ${seconds.toFixed(2)}s`;
  return Buffer.from(`<svg width="320" height="180" xmlns="http://www.w3.org/2000/svg"><rect x="8" y="148" width="304" height="24" rx="6" fill="#030306" fill-opacity=".82"/><text x="16" y="165" fill="#f3deb0" font-family="Arial" font-size="12" font-weight="700">${label}</text></svg>`);
}

async function extractFrame(ffmpeg, sourceUrl, dir, assetKey, seconds, index) {
  const target = path.join(dir, `frame-${index}.jpg`);
  await run(ffmpeg, [
    "-y", "-threads", "1", "-ss", String(seconds), "-i", sourceUrl,
    "-frames:v", "1", "-vf", "scale=320:180:force_original_aspect_ratio=increase,crop=320:180",
    "-q:v", "3", target,
  ]);
  return sharp(target).composite([{ input: labelSvg(assetKey, seconds), top: 0, left: 0 }]).jpeg({ quality: 78, mozjpeg: true }).toBuffer();
}

export async function GET(request) {
  try {
    if (!(await authorizeInvestorV9Render(request))) return json({ success: false, error: "UNAUTHORIZED" }, 401);
    const url = new URL(request.url);
    const assetKey = String(url.searchParams.get("asset") || "").trim();
    const asset = ASSETS[assetKey];
    if (!asset) return json({ success: false, error: "ASSET_NOT_ALLOWED", allowed_assets: Object.keys(ASSETS) }, 400);
    const times = parseTimes(url.searchParams.get("times"), asset.duration);
    const ffmpeg = resolveCreativeFfmpegPath();
    if (!ffmpeg) throw new Error("V9_FINISHING_QC_FFMPEG_NOT_READY");
    const sourceUrl = await signed(asset.path);
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-v9-finishing-qc-"));
    try {
      const frames = [];
      for (let index = 0; index < times.length; index += 1) frames.push(await extractFrame(ffmpeg, sourceUrl, dir, assetKey, times[index], index));
      const cols = Math.min(4, frames.length);
      const rows = Math.ceil(frames.length / cols);
      const gap = 4;
      const width = cols * 320 + (cols - 1) * gap;
      const height = rows * 180 + (rows - 1) * gap;
      const sheet = await sharp({ create: { width, height, channels: 3, background: { r: 3, g: 3, b: 7 } } })
        .composite(frames.map((input, index) => ({ input, left: (index % cols) * (320 + gap), top: Math.floor(index / cols) * (180 + gap) })))
        .jpeg({ quality: 82, mozjpeg: true }).toBuffer();
      return json({ success: true, contract: "AVANTIQO_INVESTOR_V9_FINISHING_QC_V1", asset: assetKey, storage_path: asset.path, duration_seconds: asset.duration, frame_times_seconds: times, width, height, jpeg_base64: sheet.toString("base64") });
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  } catch (error) {
    return json({ success: false, error: error?.message || String(error) }, 500);
  }
}
