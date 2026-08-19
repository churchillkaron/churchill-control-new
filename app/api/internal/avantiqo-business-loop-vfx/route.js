export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import sharp from "sharp";

import { AvantiqoInvestorFilmBusinessLoopRuntime } from "@/lib/investor-film/AvantiqoInvestorFilmBusinessLoopRuntime";
import { resolveCreativeFfmpegPath } from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TOKEN = "avq-business-loop-vfx-20260819";
const BUCKET = "creative-assets";

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function renderPpmFrame(ffmpeg, source, target, second) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      ffmpeg,
      [
        "-y",
        "-hide_banner",
        "-loglevel", "error",
        "-i", source,
        "-ss", String(second),
        "-frames:v", "1",
        "-vf", "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720",
        "-c:v", "ppm",
        "-f", "image2",
        target,
      ],
      {
        shell: false,
        stdio: ["ignore", "ignore", "pipe"],
        env: { ...process.env, OMP_NUM_THREADS: "1" },
      },
    );
    const stderr = [];
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(Buffer.concat(stderr).toString("utf8").slice(-8000) || `FFMPEG_FRAME_EXIT_${code}`));
        return;
      }
      resolve();
    });
  });
}

async function createReviewFrame(second) {
  const ffmpeg = resolveCreativeFfmpegPath();
  if (!ffmpeg) throw new Error("CREATIVE_MEDIA_FFMPEG_NOT_READY");

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-vfx-frame-"));
  try {
    const localVideo = path.join(directory, "business-loop.mp4");
    const ppmPath = path.join(directory, "frame.ppm");
    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .download(AvantiqoInvestorFilmBusinessLoopRuntime.OUTPUT_PATH);
    if (error) throw error;
    if (!data) throw new Error("BUSINESS_LOOP_VFX_NOT_READY");
    await fs.writeFile(localVideo, Buffer.from(await data.arrayBuffer()));

    await renderPpmFrame(ffmpeg, localVideo, ppmPath, second);
    const stat = await fs.stat(ppmPath).catch(() => null);
    if (!stat?.size) throw new Error("FRAME_PPM_EMPTY");

    return sharp(ppmPath)
      .resize(960, 540)
      .jpeg({ quality: 88, chromaSubsampling: "4:4:4" })
      .toBuffer();
  } finally {
    await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) {
      return json({ success: false }, 404);
    }

    const action = url.searchParams.get("action") || "status";

    if (action === "status") {
      return json({ success: true, ...(await AvantiqoInvestorFilmBusinessLoopRuntime.status()) });
    }

    if (action === "render") {
      return json(await AvantiqoInvestorFilmBusinessLoopRuntime.render());
    }

    if (action === "download") {
      const signed_url = await AvantiqoInvestorFilmBusinessLoopRuntime.downloadUrl(86400);
      if (!signed_url) return json({ success: false, error: "BUSINESS_LOOP_VFX_NOT_READY" }, 404);
      return json({ success: true, signed_url });
    }

    if (action === "file") {
      const { data, error } = await supabaseAdmin.storage
        .from(BUCKET)
        .download(AvantiqoInvestorFilmBusinessLoopRuntime.OUTPUT_PATH);
      if (error) throw error;
      if (!data) return json({ success: false, error: "BUSINESS_LOOP_VFX_NOT_READY" }, 404);
      return new Response(data, {
        status: 200,
        headers: {
          "Content-Type": "video/mp4",
          "Cache-Control": "no-store",
          "Content-Disposition": "inline; filename=avantiqo-business-loop-vfx-v1.mp4",
        },
      });
    }

    if (action === "frame") {
      const requested = Number(url.searchParams.get("time") || "1.3");
      const second = Number.isFinite(requested) ? Math.max(0, Math.min(47.9, requested)) : 1.3;
      const image = await createReviewFrame(second);
      return new Response(image, {
        status: 200,
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "no-store",
          "Content-Disposition": `inline; filename=avantiqo-vfx-${second.toFixed(2)}.jpg`,
          "X-Avantiqo-Frame-Time": second.toFixed(3),
        },
      });
    }

    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    return json({ success: false, error: error?.message || String(error) }, 500);
  }
}
