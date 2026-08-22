import fs from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

const CONTRACT = "CREATIVE_STILL_IMAGE_INPUT_RUNTIME_V1";
const DEFAULT_LIMIT_INPUT_PIXELS = 120_000_000;
const MAX_OUTPUT_EDGE = 16_384;

function finitePositiveInteger(value, fallback = null) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.round(number);
}

function safeName(value, fallback = "still-image") {
  const normalized = String(value || fallback)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || fallback;
}

function supportedInputFormats() {
  return Object.entries(sharp.format || {})
    .filter(([, capability]) => capability?.input?.file || capability?.input?.buffer)
    .map(([format]) => format)
    .sort();
}

function assertOutputEdge(value, label) {
  if (value == null) return;
  if (value > MAX_OUTPUT_EDGE) {
    throw new Error(`CREATIVE_STILL_IMAGE_${label}_TOO_LARGE:${value}`);
  }
}

function sourceForSharp({ input_path, input_buffer, svg_buffer }) {
  const provided = [input_path, input_buffer, svg_buffer].filter((value) => value != null);
  if (provided.length !== 1) {
    throw new Error("CREATIVE_STILL_IMAGE_EXACTLY_ONE_SOURCE_REQUIRED");
  }
  if (input_path) return input_path;
  if (Buffer.isBuffer(input_buffer)) return input_buffer;
  if (Buffer.isBuffer(svg_buffer)) return svg_buffer;
  throw new Error("CREATIVE_STILL_IMAGE_SOURCE_INVALID");
}

export function creativeRawStillInputArgs(asset, { fps = 24, loop = true } = {}) {
  if (!asset?.path || !asset?.width || !asset?.height) {
    throw new Error("CREATIVE_STILL_IMAGE_NORMALIZED_ASSET_REQUIRED");
  }
  const frameRate = finitePositiveInteger(fps, 24);
  return [
    ...(loop ? ["-stream_loop", "-1"] : []),
    "-f", "rawvideo",
    "-pixel_format", "rgba",
    "-video_size", `${asset.width}x${asset.height}`,
    "-framerate", String(frameRate),
    "-i", asset.path,
  ];
}

export async function normalizeCreativeStillImage({
  input_path = null,
  input_buffer = null,
  svg_buffer = null,
  output_directory,
  name = "still-image",
  width = null,
  height = null,
  fit = "contain",
  position = "centre",
  background = { r: 0, g: 0, b: 0, alpha: 0 },
  without_enlargement = false,
  limit_input_pixels = DEFAULT_LIMIT_INPUT_PIXELS,
} = {}) {
  if (!output_directory) throw new Error("CREATIVE_STILL_IMAGE_OUTPUT_DIRECTORY_REQUIRED");

  const targetWidth = finitePositiveInteger(width);
  const targetHeight = finitePositiveInteger(height);
  assertOutputEdge(targetWidth, "WIDTH");
  assertOutputEdge(targetHeight, "HEIGHT");

  await fs.mkdir(output_directory, { recursive: true });
  const source = sourceForSharp({ input_path, input_buffer, svg_buffer });
  const pipeline = sharp(source, {
    failOn: "warning",
    animated: false,
    sequentialRead: true,
    limitInputPixels: finitePositiveInteger(limit_input_pixels, DEFAULT_LIMIT_INPUT_PIXELS),
  }).rotate();

  let normalized = pipeline;
  if (targetWidth || targetHeight) {
    normalized = normalized.resize({
      width: targetWidth,
      height: targetHeight,
      fit,
      position,
      background,
      withoutEnlargement: without_enlargement === true,
    });
  }

  const { data, info } = await normalized
    .toColourspace("srgb")
    .ensureAlpha()
    .raw({ depth: "uchar" })
    .toBuffer({ resolveWithObject: true });

  if (!info?.width || !info?.height || Number(info.channels) !== 4) {
    throw new Error(`CREATIVE_STILL_IMAGE_RGBA_NORMALIZATION_FAILED:${JSON.stringify(info || {})}`);
  }
  assertOutputEdge(Number(info.width), "WIDTH");
  assertOutputEdge(Number(info.height), "HEIGHT");

  const outputPath = path.join(output_directory, `${safeName(name)}.rgba`);
  await fs.writeFile(outputPath, data);

  return {
    contract: CONTRACT,
    path: outputPath,
    width: Number(info.width),
    height: Number(info.height),
    channels: Number(info.channels),
    pixel_format: "rgba",
    ffmpeg_input_format: "rawvideo",
    decoder: "sharp",
    ffmpeg_image_decoder_required: false,
    bytes: data.length,
  };
}

export function creativeStillImageInputReadiness() {
  const formats = supportedInputFormats();
  return {
    contract: CONTRACT,
    ready: formats.length > 0,
    decoder: "sharp",
    normalization: "RAW_RGBA",
    ffmpeg_image_decoder_required: false,
    supported_input_formats: formats,
    max_output_edge: MAX_OUTPUT_EDGE,
    limit_input_pixels: DEFAULT_LIMIT_INPUT_PIXELS,
  };
}

export const CreativeStillImageInputRuntime = Object.freeze({
  contract: CONTRACT,
  normalize: normalizeCreativeStillImage,
  ffmpegInputArgs: creativeRawStillInputArgs,
  readiness: creativeStillImageInputReadiness,
});
