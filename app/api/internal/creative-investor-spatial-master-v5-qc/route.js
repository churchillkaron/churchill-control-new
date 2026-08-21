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

const TOKEN = "avq-investor-spatial-master-v5-qc-20260821";
const BUCKET = "creative-assets";
const ORG = "33336a72-acb5-474e-856b-8be0269360e2";
const PROJECT = "37ca49f2-210d-4665-af6b-6b5fa834f750";
const MASTER_PATH = `${ORG}/${PROJECT}/spatial-master-v5-final/avantiqo-investor-film-spatial-master-v5-ai-hero.mp4`;
const FRAME_TIMES = [1,7.5,9.5,30,65,110,155,200,230];

const json = (data, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store, private" } });

function run(command, args, timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ["ignore","ignore","pipe"] });
    const stderr = [];
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("V5_QC_TIMEOUT")); }, timeoutMs);
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(Buffer.concat(stderr).toString("utf8").slice(-12000) || `V5_QC_FFMPEG_${code}`));
      else resolve();
    });
  });
}

async function downloadMaster(target) {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(MASTER_PATH);
  if (error) throw error;
  if (!data) throw new Error("V5_QC_MASTER_EMPTY");
  await fs.writeFile(target, Buffer.from(await data.arrayBuffer()));
}

function labelSvg(seconds) {
  const m = Math.floor(seconds / 60), s = Math.floor(seconds % 60);
  const label = `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  return Buffer.from(`<svg width="220" height="124" xmlns="http://www.w3.org/2000/svg"><rect x="7" y="91" width="55" height="25" rx="7" fill="#020205" fill-opacity="0.8"/><text x="15" y="109" fill="#f5dfaa" font-family="Arial" font-size="13" font-weight="700">${label}</text></svg>`);
}

async function extractFrame(ffmpeg, master, dir, seconds, index) {
  const raw = path.join(dir, `f-${index}.jpg`);
  await run(ffmpeg, ["-y","-ss",String(seconds),"-i",master,"-frames:v","1","-vf","scale=220:124:force_original_aspect_ratio=increase,crop=220:124","-q:v","4",raw], 30000);
  return sharp(raw).composite([{ input: labelSvg(seconds), top: 0, left: 0 }]).jpeg({ quality: 58, mozjpeg: true }).toBuffer();
}

async function contactSheet(ffmpeg, master, dir) {
  const frames = [];
  for (let i = 0; i < FRAME_TIMES.length; i += 1) frames.push(await extractFrame(ffmpeg, master, dir, FRAME_TIMES[i], i));
  const cw = 220, ch = 124, gap = 5, cols = 3, rows = 3;
  const width = cols*cw + (cols-1)*gap, height = rows*ch + (rows-1)*gap;
  return sharp({ create: { width, height, channels: 3, background: { r: 3, g: 3, b: 7 } } })
    .composite(frames.map((input, i) => ({ input, left: (i%cols)*(cw+gap), top: Math.floor(i/cols)*(ch+gap) })))
    .jpeg({ quality: 56, mozjpeg: true })
    .toBuffer();
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) return json({ success: false }, 404);
    const ffmpeg = resolveCreativeFfmpegPath();
    if (!ffmpeg) throw new Error("V5_QC_FFMPEG_NOT_READY");
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-v5-qc-"));
    try {
      const master = path.join(dir, "master.mp4");
      await downloadMaster(master);
      const sheet = await contactSheet(ffmpeg, master, dir);
      return json({ success: true, master_path: MASTER_PATH, frame_times_seconds: FRAME_TIMES, width: 670, height: 382, bytes: sheet.length, jpeg_base64: sheet.toString("base64") });
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  } catch (error) {
    return json({ success: false, error: error?.message || String(error) }, 500);
  }
}
