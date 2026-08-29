import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { materializeMedia } from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";

export const AVANTIQO_VIDEO_STUDIO_FOUNDATION_CONTRACT = "AVANTIQO_VIDEO_STUDIO_FOUNDATION_ASSEMBLY_V1";

function text(value) { return String(value ?? "").trim(); }
function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function run(command, args, timeoutMs = 20 * 60 * 1000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new Error("AVANTIQO_VIDEO_STUDIO_FOUNDATION_PROCESS_TIMEOUT"));
    }, timeoutMs);
    const finish = (error, value = null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value);
    };
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      const output = { stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8") };
      if (code === 0) finish(null, output);
      else finish(new Error(output.stderr || `AVANTIQO_VIDEO_STUDIO_FOUNDATION_PROCESS_EXIT_${code}`));
    });
  });
}

function parseNpyHeader(buffer) {
  if (buffer.length < 12 || buffer.subarray(0, 6).toString("latin1") !== "\x93NUMPY") {
    throw new Error("AVANTIQO_VIDEO_STUDIO_FOUNDATION_NPY_MAGIC_INVALID");
  }
  const major = buffer[6];
  const minor = buffer[7];
  if (major !== 1 || minor !== 0) throw new Error(`AVANTIQO_VIDEO_STUDIO_FOUNDATION_NPY_VERSION_UNSUPPORTED:${major}.${minor}`);
  const headerLength = buffer.readUInt16LE(8);
  const headerStart = 10;
  const headerEnd = headerStart + headerLength;
  if (headerEnd > buffer.length) throw new Error("AVANTIQO_VIDEO_STUDIO_FOUNDATION_NPY_HEADER_TRUNCATED");
  const header = buffer.subarray(headerStart, headerEnd).toString("latin1");
  if (!header.includes("'descr': '|u1'") || !header.includes("'fortran_order': False")) {
    throw new Error("AVANTIQO_VIDEO_STUDIO_FOUNDATION_NPY_FORMAT_INVALID");
  }
  const shapeMatch = header.match(/'shape':\s*\(([^)]*)\)/);
  if (!shapeMatch) throw new Error("AVANTIQO_VIDEO_STUDIO_FOUNDATION_NPY_SHAPE_REQUIRED");
  const shape = shapeMatch[1].split(",").map((value) => Number(value.trim())).filter(Number.isFinite);
  if (shape.length !== 4) throw new Error("AVANTIQO_VIDEO_STUDIO_FOUNDATION_NPY_SHAPE_INVALID");
  const [frames, height, width, channels] = shape.map((value) => Math.floor(value));
  if (frames < 1 || height < 1 || width < 1 || channels !== 3) {
    throw new Error("AVANTIQO_VIDEO_STUDIO_FOUNDATION_NPY_DIMENSIONS_INVALID");
  }
  const expectedBytes = frames * height * width * channels;
  if (buffer.length - headerEnd !== expectedBytes) {
    throw new Error(`AVANTIQO_VIDEO_STUDIO_FOUNDATION_NPY_BYTES_INVALID:${buffer.length - headerEnd}:${expectedBytes}`);
  }
  return { frames, height, width, channels, dataOffset: headerEnd, expectedBytes };
}

export async function assembleCreativeVideoStudioFoundation({
  organization_id,
  frame_tensor_reference,
  fps = 24,
  media_tools = {},
} = {}) {
  if (!organization_id) throw new Error("AVANTIQO_VIDEO_STUDIO_FOUNDATION_ORGANIZATION_REQUIRED");
  if (!frame_tensor_reference) throw new Error("AVANTIQO_VIDEO_STUDIO_FOUNDATION_TENSOR_REQUIRED");
  const effectiveFps = Math.max(16, Math.min(30, Math.round(finite(fps, 24))));
  const ffmpeg = text(media_tools.ffmpeg || process.env.CREATIVE_FFMPEG_PATH || process.env.CREATIVE_MEDIA_FFMPEG_PATH) || "ffmpeg";
  const source = await materializeMedia({
    organization_id,
    url: frame_tensor_reference,
    file_name: "avantiqo-video-gpu-frames.npy",
    mime_type: "application/octet-stream",
    policy: { max_bytes: 2_147_483_648, timeout_ms: 300_000, max_redirects: 0 },
  });
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-video-studio-foundation-"));
  try {
    const npy = await fs.readFile(source.file_path);
    const parsed = parseNpyHeader(npy);
    const rawPath = path.join(root, "frames.rgb");
    const outputPath = path.join(root, "foundation.mp4");
    await fs.writeFile(rawPath, npy.subarray(parsed.dataOffset));
    const startedAt = Date.now();
    await run(ffmpeg, [
      "-y",
      "-f", "rawvideo",
      "-pixel_format", "rgb24",
      "-video_size", `${parsed.width}x${parsed.height}`,
      "-framerate", String(effectiveFps),
      "-i", rawPath,
      "-frames:v", String(parsed.frames),
      "-c:v", "libx264",
      "-preset", "slow",
      "-crf", "14",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      outputPath,
    ]);
    const buffer = await fs.readFile(outputPath);
    if (!buffer.length) throw new Error("AVANTIQO_VIDEO_STUDIO_FOUNDATION_EMPTY_OUTPUT");
    return {
      success: true,
      contract: AVANTIQO_VIDEO_STUDIO_FOUNDATION_CONTRACT,
      buffer,
      fps: effectiveFps,
      frame_count: parsed.frames,
      width: parsed.width,
      height: parsed.height,
      duration_seconds: parsed.frames / effectiveFps,
      processing_ms: Date.now() - startedAt,
      studio_compute_only: true,
      gpu_compute_used: false,
      paid_provider_contacted: false,
      ffmpeg_location: "STUDIO",
    };
  } finally {
    await source.cleanup().catch(() => {});
    await fs.rm(root, { recursive: true, force: true });
  }
}

export const CreativeVideoStudioFoundationRuntime = {
  contract: AVANTIQO_VIDEO_STUDIO_FOUNDATION_CONTRACT,
  assemble: assembleCreativeVideoStudioFoundation,
};
