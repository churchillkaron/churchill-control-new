import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import sharp from "sharp";

import {
  resolveFirstCreativeProviderAssetUrl,
} from "@/lib/creative/assets/storage/resolveCreativeProviderAssetUrl";

const FRAME_FRACTION_DEFAULT = 0.5;
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

function selectedAssets(input = {}) {
  const assets = input.assets;
  if (Array.isArray(assets)) return assets;
  if (Array.isArray(assets?.selectedAssets)) return assets.selectedAssets;
  if (Array.isArray(input.source_assets)) return input.source_assets;
  if (Array.isArray(input.sourceAssets)) return input.sourceAssets;
  if (Array.isArray(input.selected_assets)) return input.selected_assets;
  if (Array.isArray(input.selectedAssets)) return input.selectedAssets;
  return [];
}

function identityReferenceIds(input = {}) {
  const lock = object(
    input.identity_lock ||
    input.identityLock ||
    input.generation?.identity_lock ||
    input.generation?.identityLock,
  );
  const values = [
    lock.reference_asset_node_ids,
    lock.referenceAssetNodeIds,
    lock.identity_reference_asset_ids,
    lock.identityReferenceAssetIds,
    lock.reference_asset_node_id,
    lock.referenceAssetNodeId,
    lock.reference_asset_ids,
    lock.referenceAssetIds,
    lock.reference_asset_id,
    lock.referenceAssetId,
    input.identity_reference_asset_ids,
    input.identityReferenceIds,
    input.requirements?.approved_identity_reference_node_ids,
    input.provider_parameters?.reference_asset_ids,
    input.generation?.provider_parameters?.reference_asset_ids,
  ].flat(Infinity);
  return [...new Set(values.map((value) => text(
    value?.asset_id || value?.assetId || value?.id || value,
  )).filter(Boolean))];
}

function sourceCandidates(input = {}) {
  const identityCandidates = identityReferenceIds(input).map((id) => ({
    id,
    asset_id: id,
    role: "IDENTITY_REFERENCE",
  }));
  return [
    input.identity_source,
    input.identitySource,
    input.prompt_image,
    input.promptImage,
    input.source,
    input.image,
    input.identity_reference_image,
    input.identityReferenceImage,
    identityCandidates,
    selectedAssets(input),
  ];
}

function boundedFraction(input = {}) {
  const options = {
    ...object(input.generation?.provider_parameters),
    ...object(input.provider_parameters),
    ...object(input.provider_options || input.providerOptions),
  };
  const number = Number(
    input.source_frame_fraction ??
    input.sourceFrameFraction ??
    options.source_frame_fraction ??
    options.sourceFrameFraction ??
    FRAME_FRACTION_DEFAULT,
  );
  if (!Number.isFinite(number) || number < 0 || number > 1) {
    throw new Error("RUNWAY_SOURCE_FRAME_FRACTION_INVALID");
  }
  return number;
}

function sourceExtension(url, contentType, signature) {
  const type = text(contentType).toLowerCase();
  if (signature === "WEBM" || type.includes("webm")) return ".webm";
  if (type.includes("quicktime")) return ".mov";
  if (type.startsWith("video/")) return ".mp4";
  try {
    const extension = path.extname(new URL(url).pathname).toLowerCase();
    if ([".mp4", ".mov", ".m4v", ".webm"].includes(extension)) {
      return extension;
    }
  } catch {
    // The resolved source is validated elsewhere.
  }
  return signature === "ISO_BASE_MEDIA" ? ".mp4" : ".bin";
}

function mediaSignature(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return "UNKNOWN";
  if (
    buffer.length >= 12 &&
    buffer.subarray(4, 8).toString("ascii") === "ftyp"
  ) {
    return "ISO_BASE_MEDIA";
  }
  if (
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3
  ) {
    return "WEBM";
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return "JPEG";
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
  ) {
    return "PNG";
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "WEBP";
  }
  return "UNKNOWN";
}

function videoEvidence({ url, contentType, signature }) {
  const type = text(contentType).toLowerCase();
  if (["ISO_BASE_MEDIA", "WEBM"].includes(signature)) {
    return `SIGNATURE_${signature}`;
  }
  if (type.startsWith("video/")) return "CONTENT_TYPE";
  try {
    if (/\.(mp4|mov|m4v|webm)$/i.test(new URL(url).pathname)) {
      return "PATH_EXTENSION";
    }
  } catch {
    return null;
  }
  return null;
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
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      filePath,
    ],
    "RUNWAY_FFPROBE",
  );
  const duration = Number(output);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("RUNWAY_SOURCE_VIDEO_DURATION_REQUIRED");
  }
  return duration;
}

function extractFrame({ inputPath, outputPath, duration, fraction }) {
  const second = Math.max(
    0,
    Math.min(Math.max(0, duration - 0.05), duration * fraction),
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

async function normalizedFrame(filePath) {
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

function cacheKey(url, fraction) {
  try {
    return `${new URL(url).pathname}|${fraction}`;
  } catch {
    return `${url}|${fraction}`;
  }
}

async function prepareVideoSource({
  resolvedSource,
  sourceBuffer,
  contentType,
  signature,
  detection,
  fraction,
}) {
  const key = cacheKey(resolvedSource, fraction);
  if (frameCache.has(key)) return frameCache.get(key);

  const tempDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "avantiqo-runway-frame-"),
  );
  const inputPath = path.join(
    tempDirectory,
    `source${sourceExtension(resolvedSource, contentType, signature)}`,
  );
  const outputPath = path.join(tempDirectory, "frame.jpg");

  try {
    fs.writeFileSync(inputPath, sourceBuffer);
    const duration = videoDuration(inputPath);
    const second = extractFrame({
      inputPath,
      outputPath,
      duration,
      fraction,
    });
    const normalized = await normalizedFrame(outputPath);
    const prepared = {
      ...normalized,
      contract: "RUNWAY_APPROVED_VIDEO_SOURCE_FRAME_V1",
      source_media_kind: "video",
      source_content_type: text(contentType) || null,
      source_signature: signature,
      video_detection: detection,
      source_bytes: sourceBuffer.length,
      sample_fraction: fraction,
      sample_second: Number(second.toFixed(6)),
      source_duration_seconds: Number(duration.toFixed(6)),
    };
    frameCache.set(key, prepared);
    return prepared;
  } finally {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
}

async function downloadSource(resolvedSource) {
  const response = await fetch(resolvedSource, {
    method: "GET",
    redirect: "follow",
    headers: {
      Accept: "image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm,*/*;q=0.1",
      "User-Agent": "Avantiqo-Runway-Input-Preparation/1.0",
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
    contentType: text(response.headers.get("content-type")),
  };
}

export async function prepareRunwayProviderInput(input = {}) {
  if (input.runway_source_frame_contract?.prepared === true) return input;

  const organizationId = text(input.context?.organization_id);
  if (!organizationId) return input;
  const resolvedSource = await resolveFirstCreativeProviderAssetUrl({
    organization_id: organizationId,
    values: sourceCandidates(input),
  });
  if (!resolvedSource || /^data:image\//i.test(resolvedSource)) return input;
  if (!/^https:\/\//i.test(resolvedSource)) return input;

  const downloaded = await downloadSource(resolvedSource);
  const signature = mediaSignature(downloaded.sourceBuffer);
  const detection = videoEvidence({
    url: resolvedSource,
    contentType: downloaded.contentType,
    signature,
  });
  if (!detection) return input;

  const frame = await prepareVideoSource({
    resolvedSource,
    sourceBuffer: downloaded.sourceBuffer,
    contentType: downloaded.contentType,
    signature,
    detection,
    fraction: boundedFraction(input),
  });
  const lock = object(
    input.identity_lock ||
    input.identityLock ||
    input.generation?.identity_lock ||
    input.generation?.identityLock,
  );

  return {
    ...input,
    ...(lock.required === true
      ? {
          identity_source: frame.data_uri,
          identitySource: undefined,
        }
      : {}),
    prompt_image: frame.data_uri,
    promptImage: undefined,
    runway_source_frame_contract: {
      contract: frame.contract,
      prepared: true,
      source_media_kind: frame.source_media_kind,
      source_content_type: frame.source_content_type,
      source_signature: frame.source_signature,
      video_detection: frame.video_detection,
      source_bytes: frame.source_bytes,
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

export const RunwayProviderInputRuntime = Object.freeze({
  contract: "RUNWAY_APPROVED_VIDEO_SOURCE_FRAME_V1",
  prepare: prepareRunwayProviderInput,
  sourceCandidates,
  boundedFraction,
  mediaSignature,
  videoEvidence,
});
