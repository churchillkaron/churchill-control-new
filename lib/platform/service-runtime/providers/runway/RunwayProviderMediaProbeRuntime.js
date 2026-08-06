import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import sharp from "sharp";

import {
  resolveFirstCreativeProviderAssetUrl,
} from "@/lib/creative/assets/storage/resolveCreativeProviderAssetUrl";
import {
  RunwayProviderInputRuntime,
} from "./RunwayProviderInputRuntime";

const FRAME_FRACTION = 0.5;
const MAX_SOURCE_BYTES = 250 * 1024 * 1024;
const MAX_DATA_URI_BYTES = 5 * 1024 * 1024;
const TARGET_JPEG_BYTES = 3_300_000;
const frameCache = new Map();

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function runBinary(binary, args, label) {
  const result = spawnSync(binary, args, {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.error) {
    throw new Error(`${label}_UNAVAILABLE:${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`${label}_FAILED:${text(result.stderr) || result.status}`);
  }
  return text(result.stdout);
}

function videoDuration(filePath) {
  const output = runBinary(
    "ffprobe",
    [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      filePath,
    ],
    "RUNWAY_FFPROBE_DURATION",
  );
  const duration = Number(output);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("RUNWAY_SOURCE_VIDEO_DURATION_REQUIRED");
  }
  return duration;
}

function hasVideoStream(filePath) {
  const output = runBinary(
    "ffprobe",
    [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=codec_type",
      "-of", "default=noprint_wrappers=1:nokey=1",
      filePath,
    ],
    "RUNWAY_FFPROBE_STREAM",
  );
  return output.split(/\s+/).includes("video");
}

function extractFrame({ inputPath, outputPath, duration }) {
  const second = Math.max(
    0,
    Math.min(Math.max(0, duration - 0.05), duration * FRAME_FRACTION),
  );
  runBinary(
    "ffmpeg",
    [
      "-y",
      "-loglevel", "error",
      "-ss", String(second),
      "-i", inputPath,
      "-frames:v", "1",
      "-vf", "scale=1600:-2:force_original_aspect_ratio=decrease",
      "-q:v", "2",
      outputPath,
    ],
    "RUNWAY_FFMPEG_FRAME_EXTRACTION",
  );
  if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size <= 0) {
    throw new Error("RUNWAY_SOURCE_VIDEO_FRAME_EMPTY");
  }
  return second;
}

function imageDataUri(buffer) {
  return `data:image/jpeg;base64,${buffer.toString("base64")}`;
}

async function normalizeFrame(filePath) {
  const sourceBuffer = fs.readFileSync(filePath);
  const metadata = await sharp(sourceBuffer, { failOn: "error" }).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("RUNWAY_SOURCE_VIDEO_FRAME_DIMENSIONS_REQUIRED");
  }

  const aspectRatio = metadata.width / metadata.height;
  if (aspectRatio < 0.5 || aspectRatio > 2.358) {
    throw new Error(
      `RUNWAY_SOURCE_VIDEO_FRAME_ASPECT_RATIO_INVALID:${aspectRatio.toFixed(6)}`,
    );
  }

  const attempts = [
    { max: 1600, quality: 88 },
    { max: 1440, quality: 84 },
    { max: 1280, quality: 80 },
    { max: 1080, quality: 76 },
  ];

  for (const attempt of attempts) {
    const buffer = await sharp(sourceBuffer, { failOn: "error" })
      .rotate()
      .resize({
        width: attempt.max,
        height: attempt.max,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({
        quality: attempt.quality,
        mozjpeg: true,
        chromaSubsampling: "4:4:4",
      })
      .toBuffer();
    const dataUri = imageDataUri(buffer);
    if (
      buffer.length <= TARGET_JPEG_BYTES &&
      Buffer.byteLength(dataUri, "utf8") <= MAX_DATA_URI_BYTES
    ) {
      return {
        data_uri: dataUri,
        frame_bytes: buffer.length,
        encoded_bytes: Buffer.byteLength(dataUri, "utf8"),
        width: metadata.width,
        height: metadata.height,
        aspect_ratio: Number(aspectRatio.toFixed(6)),
        max_dimension: attempt.max,
        quality: attempt.quality,
      };
    }
  }

  throw new Error("RUNWAY_SOURCE_VIDEO_FRAME_NORMALIZATION_SIZE_FAILED");
}

async function isDecodableImage(buffer) {
  try {
    const metadata = await sharp(buffer, { failOn: "error" }).metadata();
    return Boolean(metadata.width && metadata.height);
  } catch {
    return false;
  }
}

function cacheKey(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

async function downloadSource(resolvedSource) {
  const response = await fetch(resolvedSource, {
    method: "GET",
    redirect: "follow",
    headers: {
      Accept: "image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm,*/*;q=0.1",
      "User-Agent": "Avantiqo-Runway-Media-Probe/1.0",
    },
  });
  if (!response.ok) {
    throw new Error(`RUNWAY_SOURCE_MEDIA_FETCH_FAILED:${response.status}`);
  }

  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > MAX_SOURCE_BYTES) {
    throw new Error(`RUNWAY_SOURCE_MEDIA_TOO_LARGE:${declaredLength}`);
  }

  const sourceBuffer = Buffer.from(await response.arrayBuffer());
  if (!sourceBuffer.length) throw new Error("RUNWAY_SOURCE_MEDIA_EMPTY");
  if (sourceBuffer.length > MAX_SOURCE_BYTES) {
    throw new Error(`RUNWAY_SOURCE_MEDIA_TOO_LARGE:${sourceBuffer.length}`);
  }

  return {
    sourceBuffer,
    contentType: text(response.headers.get("content-type")) || null,
  };
}

async function extractVideoFrame({ resolvedSource, sourceBuffer, contentType }) {
  const key = cacheKey(resolvedSource);
  if (frameCache.has(key)) return frameCache.get(key);

  const tempDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "avantiqo-runway-probe-"),
  );
  const inputPath = path.join(tempDirectory, "source-media");
  const outputPath = path.join(tempDirectory, "frame.jpg");

  try {
    fs.writeFileSync(inputPath, sourceBuffer);
    if (!hasVideoStream(inputPath)) {
      throw new Error("RUNWAY_SOURCE_MEDIA_UNSUPPORTED");
    }
    const duration = videoDuration(inputPath);
    const second = extractFrame({ inputPath, outputPath, duration });
    const normalized = await normalizeFrame(outputPath);
    const frame = {
      ...normalized,
      contract: "RUNWAY_APPROVED_VIDEO_SOURCE_FRAME_V2",
      prepared: true,
      source_media_kind: "video",
      source_content_type: contentType,
      source_bytes: sourceBuffer.length,
      detection: "FFPROBE_VIDEO_STREAM",
      sample_fraction: FRAME_FRACTION,
      sample_second: Number(second.toFixed(6)),
      source_duration_seconds: Number(duration.toFixed(6)),
    };
    frameCache.set(key, frame);
    return frame;
  } finally {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
}

export async function prepareRunwayProviderInputByProbe(input = {}) {
  if (input.runway_source_frame_contract?.prepared === true) return input;

  const organizationId = text(input.context?.organization_id);
  if (!organizationId) return input;

  const resolvedSource = await resolveFirstCreativeProviderAssetUrl({
    organization_id: organizationId,
    values: RunwayProviderInputRuntime.sourceCandidates(input),
  });
  if (!resolvedSource || /^data:image\//i.test(resolvedSource)) return input;
  if (!/^https:\/\//i.test(resolvedSource)) return input;

  const downloaded = await downloadSource(resolvedSource);
  if (await isDecodableImage(downloaded.sourceBuffer)) return input;

  const frame = await extractVideoFrame({
    resolvedSource,
    sourceBuffer: downloaded.sourceBuffer,
    contentType: downloaded.contentType,
  });

  return {
    ...input,
    identity_source: undefined,
    identitySource: undefined,
    prompt_image: frame.data_uri,
    promptImage: undefined,
    runway_source_frame_contract: {
      contract: frame.contract,
      prepared: true,
      source_media_kind: frame.source_media_kind,
      source_content_type: frame.source_content_type,
      source_bytes: frame.source_bytes,
      detection: frame.detection,
      sample_fraction: frame.sample_fraction,
      sample_second: frame.sample_second,
      source_duration_seconds: frame.source_duration_seconds,
      frame_bytes: frame.frame_bytes,
      encoded_bytes: frame.encoded_bytes,
      width: frame.width,
      height: frame.height,
      aspect_ratio: frame.aspect_ratio,
      max_dimension: frame.max_dimension,
      quality: frame.quality,
      source_url_persisted: false,
    },
  };
}

export const RunwayProviderMediaProbeRuntime = Object.freeze({
  contract: "RUNWAY_APPROVED_VIDEO_SOURCE_FRAME_V2",
  prepare: prepareRunwayProviderInputByProbe,
});
