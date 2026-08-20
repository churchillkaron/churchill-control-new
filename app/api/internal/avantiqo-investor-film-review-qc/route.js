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

const TOKEN = "avq-investor-qc-20260820";
const BUCKET = "creative-assets";
const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const MASTER_PATH = `${ORGANIZATION_ID}/avantiqo-investor-film-20260819/avantiqo-investor-film-review-v4-cinematic.mp4`;
const OUTPUT_PATH = `${ORGANIZATION_ID}/avantiqo-investor-film-20260819/review/avantiqo-investor-film-v4-contact-sheet.jpg`;
const FRAME_TIMES = Object.freeze([
  1.0,
  4.0,
  8.0,
  20.0,
  35.0,
  55.0,
  75.0,
  95.0,
  115.0,
  135.0,
  155.0,
  174.0,
]);

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function run(command, args, timeoutMs = 260000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "ignore", "pipe"],
      env: { ...process.env, OMP_NUM_THREADS: "1" },
    });
    const stderr = [];
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("INVESTOR_QC_FFMPEG_TIMEOUT"));
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
          Buffer.concat(stderr).toString("utf8").slice(-12000) ||
          `INVESTOR_QC_FFMPEG_EXIT_${code}`,
        ));
        return;
      }
      resolve();
    });
  });
}

async function downloadMaster(targetPath) {
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .download(MASTER_PATH);
  if (error) throw error;
  if (!data) throw new Error("INVESTOR_MASTER_DOWNLOAD_EMPTY");
  await fs.writeFile(targetPath, Buffer.from(await data.arrayBuffer()));
}

function labelSvg(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);
  const label = `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
  return Buffer.from(`
    <svg width="320" height="180" xmlns="http://www.w3.org/2000/svg">
      <rect x="8" y="142" width="66" height="28" rx="9" fill="#020205" fill-opacity="0.78"/>
      <text x="20" y="162" fill="#f5dfaa" font-family="Arial,Helvetica,sans-serif" font-size="15" font-weight="700">${label}</text>
    </svg>
  `);
}

async function frame(ffmpeg, masterPath, directory, seconds, index) {
  const rawPath = path.join(directory, `frame-${index}.jpg`);
  await run(ffmpeg, [
    "-y",
    "-ss", String(seconds),
    "-i", masterPath,
    "-frames:v", "1",
    "-vf", "scale=320:180:force_original_aspect_ratio=increase,crop=320:180",
    "-q:v", "3",
    rawPath,
  ], 45000);

  return sharp(rawPath)
    .composite([{ input: labelSvg(seconds), top: 0, left: 0 }])
    .jpeg({ quality: 72, mozjpeg: true })
    .toBuffer();
}

async function makeContactSheet(ffmpeg, masterPath, directory) {
  const frames = [];
  for (let index = 0; index < FRAME_TIMES.length; index += 1) {
    frames.push(await frame(
      ffmpeg,
      masterPath,
      directory,
      FRAME_TIMES[index],
      index,
    ));
  }

  const cellWidth = 320;
  const cellHeight = 180;
  const gap = 6;
  const columns = 3;
  const rows = 4;
  const width = columns * cellWidth + (columns - 1) * gap;
  const height = rows * cellHeight + (rows - 1) * gap;
  const composites = frames.map((input, index) => ({
    input,
    left: (index % columns) * (cellWidth + gap),
    top: Math.floor(index / columns) * (cellHeight + gap),
  }));

  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 3, g: 3, b: 7 },
    },
  })
    .composite(composites)
    .jpeg({ quality: 68, mozjpeg: true })
    .toBuffer();
}

async function storeContactSheet(buffer) {
  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(OUTPUT_PATH, buffer, {
      contentType: "image/jpeg",
      cacheControl: "300",
      upsert: true,
    });
  if (error) throw error;

  const { data, error: signError } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(OUTPUT_PATH, 6 * 60 * 60);
  if (signError) throw signError;

  return data?.signedUrl || null;
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) {
      return json({ success: false }, 404);
    }

    const ffmpeg = resolveCreativeFfmpegPath();
    if (!ffmpeg) throw new Error("CREATIVE_MEDIA_FFMPEG_NOT_READY");

    const action = url.searchParams.get("action") || "contact-sheet";
    if (action !== "contact-sheet") {
      return json({ success: false, error: "Unsupported action" }, 400);
    }

    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-investor-qc-"));
    try {
      const master = path.join(directory, "master.mp4");
      await downloadMaster(master);
      const sheet = await makeContactSheet(ffmpeg, master, directory);
      const signedUrl = await storeContactSheet(sheet);

      return json({
        success: true,
        master_path: MASTER_PATH,
        contact_sheet_path: OUTPUT_PATH,
        frame_times_seconds: FRAME_TIMES,
        width: 972,
        height: 738,
        bytes: sheet.length,
        signed_url: signedUrl,
        jpeg_base64: sheet.toString("base64"),
      });
    } finally {
      await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
    }
  } catch (error) {
    return json({
      success: false,
      error: error?.message || String(error),
    }, 500);
  }
}
