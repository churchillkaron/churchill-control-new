import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import sharp from "sharp";

import {
  materializeMedia,
} from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";

const FRAME_FRACTIONS = Object.freeze([
  0.02,
  0.18,
  0.34,
  0.5,
  0.66,
  0.82,
  0.98,
]);
const FRAME_ROLE = "GENERATED_VIDEO_FRAME_UNDER_REVIEW";
const FRAME_CONTRACT = "OPENAI_VIDEO_ANALYSIS_FRAME_SET_V1";
const MAX_SOURCE_BYTES = 250 * 1024 * 1024;
const MAX_FRAME_DATA_URI_BYTES = 2 * 1024 * 1024;
const FRAME_MAX_DIMENSION = 1280;
const FRAME_JPEG_QUALITY = 82;
const frameCache = new Map();

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function directUrl(value) {
  if (!value) return null;
  if (typeof value === "string") return text(value) || null;
  if (typeof value !== "object") return null;
  return text(
    value.video_url ||
    value.videoUrl ||
    value.file_url ||
    value.fileUrl ||
    value.url ||
    value.media_url ||
    value.mediaUrl,
  ) || null;
}

function payloadInput(input = {}) {
  return object(input.payload);
}

function capabilityName(input = {}) {
  const payload = payloadInput(input);
  return text(
    input.capability ||
    payload.capability,
  ).toLowerCase();
}

function mediaKind(input = {}) {
  const payload = payloadInput(input);
  return text(
    input.media_kind ||
    input.mediaKind ||
    input.metadata?.media_kind ||
    input.requirements?.expected_contract?.media_kind ||
    input.provider_parameters?.media_kind ||
    payload.media_kind ||
    payload.mediaKind ||
    payload.metadata?.media_kind ||
    payload.requirements?.expected_contract?.media_kind ||
    payload.provider_parameters?.media_kind,
  ).toUpperCase();
}

function generatedVideoUrl(input = {}) {
  const payload = payloadInput(input);
  return directUrl(input.provider_parameters?.generated_media_url) ||
    directUrl(input.providerParameters?.generatedMediaUrl) ||
    directUrl(input.generation?.provider_parameters?.generated_media_url) ||
    directUrl(input.generation?.providerParameters?.generatedMediaUrl) ||
    directUrl(payload.provider_parameters?.generated_media_url) ||
    directUrl(payload.providerParameters?.generatedMediaUrl) ||
    directUrl(payload.generation?.provider_parameters?.generated_media_url) ||
    directUrl(payload.generation?.providerParameters?.generatedMediaUrl) ||
    null;
}

function primaryVideoUrl(input = {}) {
  const payload = payloadInput(input);
  const explicit = directUrl(input.video) || directUrl(payload.video);
  if (explicit) return explicit;
  if (mediaKind(input) !== "VIDEO") return null;

  return generatedVideoUrl(input) ||
    directUrl(input.media) ||
    directUrl(input.source) ||
    directUrl(input.image) ||
    directUrl(payload.media) ||
    directUrl(payload.source) ||
    directUrl(payload.image) ||
    list(input.assets)
      .map(directUrl)
      .find(Boolean) ||
    list(payload.assets)
      .map(directUrl)
      .find(Boolean) ||
    null;
}

function videoExpected(input = {}) {
  return mediaKind(input) === "VIDEO" ||
    Boolean(
      directUrl(input.video) ||
      directUrl(payloadInput(input).video) ||
      generatedVideoUrl(input),
    );
}

function preparedFrameEvidence(input = {}) {
  const contract = object(input.openai_video_analysis_frame_contract);
  const frameAssets = list(input.assets).filter((asset) =>
    text(asset?.role) === FRAME_ROLE &&
    /^data:image\//i.test(text(asset?.url)),
  );
  const contractFrames = list(contract.frames);

  return contract.contract === FRAME_CONTRACT &&
    contract.prepared === true &&
    Number(contract.frame_count) === FRAME_FRACTIONS.length &&
    contractFrames.length === FRAME_FRACTIONS.length &&
    frameAssets.length === FRAME_FRACTIONS.length;
}

function cacheKey(value) {
  try {
    const parsed = new URL(value);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return text(value);
  }
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
    throw new Error(
      `${label}_FAILED:${text(result.stderr) || result.status}`,
    );
  }
  return text(result.stdout);
}

function probeVideo(filePath) {
  const ffprobe = text(
    process.env.CREATIVE_MEDIA_FFPROBE_PATH ||
    process.env.FFPROBE_PATH ||
    "ffprobe",
  );
  const raw = runBinary(
    ffprobe,
    [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=codec_type,width,height,duration:format=duration",
      "-of", "json",
      filePath,
    ],
    "OPENAI_VIDEO_ANALYSIS_FFPROBE",
  );
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("OPENAI_VIDEO_ANALYSIS_FFPROBE_INVALID_JSON");
  }
  const stream = list(parsed.streams)[0] || null;
  const duration = Number(parsed.format?.duration ?? stream?.duration);
  if (!stream || stream.codec_type !== "video") {
    throw new Error("OPENAI_VIDEO_ANALYSIS_VIDEO_STREAM_REQUIRED");
  }
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("OPENAI_VIDEO_ANALYSIS_DURATION_REQUIRED");
  }
  return {
    duration_seconds: duration,
    source_width: Number(stream.width || 0),
    source_height: Number(stream.height || 0),
  };
}

function extractFrame({ inputPath, outputPath, second }) {
  const ffmpeg = text(
    process.env.CREATIVE_MEDIA_FFMPEG_PATH ||
    process.env.FFMPEG_PATH ||
    "ffmpeg",
  );
  runBinary(
    ffmpeg,
    [
      "-y",
      "-loglevel", "error",
      "-ss", String(second),
      "-i", inputPath,
      "-frames:v", "1",
      "-vf", `scale=${FRAME_MAX_DIMENSION}:-2:force_original_aspect_ratio=decrease`,
      "-q:v", "2",
      outputPath,
    ],
    "OPENAI_VIDEO_ANALYSIS_FFMPEG_FRAME",
  );
  if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size <= 0) {
    throw new Error("OPENAI_VIDEO_ANALYSIS_FRAME_EMPTY");
  }
}

async function normalizeFrame({ filePath, fraction, second, index }) {
  const buffer = await sharp(filePath, { failOn: "error" })
    .rotate()
    .resize({
      width: FRAME_MAX_DIMENSION,
      height: FRAME_MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({
      quality: FRAME_JPEG_QUALITY,
      mozjpeg: true,
      chromaSubsampling: "4:4:4",
    })
    .toBuffer();
  const metadata = await sharp(buffer, { failOn: "error" }).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("OPENAI_VIDEO_ANALYSIS_FRAME_DIMENSIONS_REQUIRED");
  }
  const dataUri = `data:image/jpeg;base64,${buffer.toString("base64")}`;
  const encodedBytes = Buffer.byteLength(dataUri, "utf8");
  if (encodedBytes > MAX_FRAME_DATA_URI_BYTES) {
    throw new Error(
      `OPENAI_VIDEO_ANALYSIS_FRAME_TOO_LARGE:${index}:${encodedBytes}`,
    );
  }
  return {
    index,
    fraction,
    timestamp_seconds: Number(second.toFixed(6)),
    width: metadata.width,
    height: metadata.height,
    jpeg_bytes: buffer.length,
    encoded_bytes: encodedBytes,
    url: dataUri,
    role: FRAME_ROLE,
  };
}

async function buildFrames({ videoUrl, organizationId, mediaPolicy = {} }) {
  const key = cacheKey(videoUrl);
  if (frameCache.has(key)) return frameCache.get(key);

  const preparation = (async () => {
    const materialized = await materializeMedia({
      url: videoUrl,
      organization_id: organizationId,
      policy: {
        max_bytes: MAX_SOURCE_BYTES,
        timeout_ms: 120_000,
        max_redirects: 5,
        ...object(mediaPolicy),
      },
    });
    try {
      const probe = probeVideo(materialized.file_path);
      const directory = path.dirname(materialized.file_path);
      const frames = [];
      for (const [offset, fraction] of FRAME_FRACTIONS.entries()) {
        const second = Math.max(
          0,
          Math.min(
            Math.max(0, probe.duration_seconds - 0.05),
            probe.duration_seconds * fraction,
          ),
        );
        const outputPath = path.join(
          directory,
          `openai-review-frame-${String(offset + 1).padStart(2, "0")}.jpg`,
        );
        extractFrame({
          inputPath: materialized.file_path,
          outputPath,
          second,
        });
        frames.push(await normalizeFrame({
          filePath: outputPath,
          fraction,
          second,
          index: offset + 1,
        }));
      }
      return {
        contract: FRAME_CONTRACT,
        source_media_kind: "video",
        source_url_persisted: false,
        source_file_size_bytes: materialized.file_size_bytes,
        source_checksum_sha256: materialized.checksum,
        source_duration_seconds: Number(
          probe.duration_seconds.toFixed(6),
        ),
        source_width: probe.source_width,
        source_height: probe.source_height,
        frame_count: frames.length,
        fractions: [...FRAME_FRACTIONS],
        frames,
      };
    } finally {
      await materialized.cleanup();
    }
  })();

  frameCache.set(key, preparation);
  try {
    return await preparation;
  } catch (error) {
    frameCache.delete(key);
    throw error;
  }
}

function preservedAssets(values, videoUrl) {
  return list(values).filter((value) =>
    directUrl(value) !== videoUrl &&
    text(value?.role) !== FRAME_ROLE,
  );
}

function frameManifest(frameSet) {
  return [
    "VIDEO FRAME EVIDENCE — TRANSPORT ONLY",
    `Source duration: ${frameSet.source_duration_seconds} seconds.`,
    "Images are ordered chronologically and sampled at these fractions:",
    ...frameSet.frames.map((frame) =>
      `Frame ${frame.index}: fraction ${frame.fraction}, timestamp ${frame.timestamp_seconds}s.`,
    ),
    "Judge opening, progression, midpoint, closing, continuity, physics, camera stability, environment stability and synthetic artifacts across the ordered frame sequence.",
  ].join("\n");
}

export async function prepareOpenAIVideoAnalysisInput(input = {}) {
  if (preparedFrameEvidence(input)) return input;
  if (capabilityName(input) !== "ai.image.analyze") return input;

  const expectsVideo = videoExpected(input);
  const videoUrl = primaryVideoUrl(input);
  if (!videoUrl) {
    if (expectsVideo) {
      throw new Error("OPENAI_VIDEO_ANALYSIS_SOURCE_REQUIRED");
    }
    return input;
  }
  if (!/^https?:\/\//i.test(videoUrl)) {
    throw new Error("OPENAI_VIDEO_ANALYSIS_HTTPS_SOURCE_REQUIRED");
  }

  const payload = payloadInput(input);
  const organizationId = text(
    input.context?.organization_id ||
    input.organization_id ||
    payload.context?.organization_id ||
    payload.organization_id,
  );
  if (!organizationId) {
    throw new Error("OPENAI_VIDEO_ANALYSIS_ORGANIZATION_REQUIRED");
  }

  const frameSet = await buildFrames({
    videoUrl,
    organizationId,
    mediaPolicy:
      input.media_policy ||
      input.mediaPolicy ||
      payload.media_policy ||
      payload.mediaPolicy ||
      {},
  });
  const retainedAssets = preservedAssets(input.assets, videoUrl);
  const frames = frameSet.frames.map((frame) => ({
    url: frame.url,
    role: frame.role,
    frame_index: frame.index,
    frame_fraction: frame.fraction,
    timestamp_seconds: frame.timestamp_seconds,
  }));
  const prompt = [
    text(input.prompt || input.instructions?.prompt),
    frameManifest(frameSet),
  ].filter(Boolean).join("\n\n");

  return {
    ...input,
    image: undefined,
    media: undefined,
    source: undefined,
    video: undefined,
    assets: [...frames, ...retainedAssets],
    prompt,
    provider_prompt: prompt,
    openai_video_analysis_frame_contract: {
      contract: frameSet.contract,
      prepared: true,
      source_media_kind: frameSet.source_media_kind,
      source_file_size_bytes: frameSet.source_file_size_bytes,
      source_checksum_sha256: frameSet.source_checksum_sha256,
      source_duration_seconds: frameSet.source_duration_seconds,
      source_width: frameSet.source_width,
      source_height: frameSet.source_height,
      frame_count: frameSet.frame_count,
      fractions: frameSet.fractions,
      frames: frameSet.frames.map((frame) => ({
        index: frame.index,
        fraction: frame.fraction,
        timestamp_seconds: frame.timestamp_seconds,
        width: frame.width,
        height: frame.height,
        jpeg_bytes: frame.jpeg_bytes,
        encoded_bytes: frame.encoded_bytes,
      })),
      source_url_persisted: false,
      frame_data_persisted: false,
      boundary: "OPENAI_ANALYSIS_TRANSPORT_ONLY",
    },
  };
}

export const OpenAIVideoAnalysisFrameRuntime = Object.freeze({
  contract: FRAME_CONTRACT,
  prepare: prepareOpenAIVideoAnalysisInput,
  primaryVideoUrl,
  frameFractions: () => [...FRAME_FRACTIONS],
  preparedFrameEvidence,
});
