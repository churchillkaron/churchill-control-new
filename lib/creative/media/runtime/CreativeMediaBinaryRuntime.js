import fs from "node:fs";
import path from "node:path";

import { creativeStillImageInputReadiness } from "@/lib/creative/media/runtime/CreativeStillImageInputRuntime";

const BUNDLED_BINARY_RELATIVE_PATHS = Object.freeze({
  ffmpeg: ".avantiqo/bin/ffmpeg",
  ffprobe: ".avantiqo/bin/ffprobe",
});
const CONTRACT = "CREATIVE_MEDIA_BINARY_RUNTIME_V3";

function text(value) {
  return String(value ?? "").trim();
}

function executable(value) {
  const candidate = text(value);
  if (!candidate) return null;
  try {
    fs.accessSync(candidate, fs.constants.X_OK);
    return candidate;
  } catch {
    return null;
  }
}

function bundledCandidates(name) {
  const relativePath = BUNDLED_BINARY_RELATIVE_PATHS[name];
  if (!relativePath) return [];

  const roots = [
    process.env.LAMBDA_TASK_ROOT,
    process.cwd(),
  ]
    .map(text)
    .filter(Boolean);

  return [...new Set(
    roots.map((root) => path.resolve(root, relativePath)),
  )];
}

function resolveBinary({ name, policyPath, environmentPath }) {
  const explicitPolicyPath = executable(policyPath);
  if (explicitPolicyPath) return { path: explicitPolicyPath, source: "POLICY" };

  const explicitEnvironmentPath = executable(environmentPath);
  if (explicitEnvironmentPath) {
    return { path: explicitEnvironmentPath, source: "ENVIRONMENT" };
  }

  for (const candidate of bundledCandidates(name)) {
    const bundledPath = executable(candidate);
    if (bundledPath) {
      return { path: bundledPath, source: "BUNDLED_PINNED_BINARY" };
    }
  }

  return { path: null, source: "UNAVAILABLE" };
}

function resolveFfmpeg(policy = {}) {
  return resolveBinary({
    name: "ffmpeg",
    policyPath: policy.ffmpeg_path || policy.ffmpegPath,
    environmentPath: process.env.CREATIVE_MEDIA_FFMPEG_PATH,
  });
}

function resolveFfprobe(policy = {}) {
  return resolveBinary({
    name: "ffprobe",
    policyPath: policy.ffprobe_path || policy.ffprobePath,
    environmentPath: process.env.CREATIVE_MEDIA_FFPROBE_PATH,
  });
}

export function resolveCreativeFfmpegPath(policy = {}) {
  return resolveFfmpeg(policy).path;
}

export function resolveCreativeFfprobePath(policy = {}) {
  return resolveFfprobe(policy).path;
}

export function creativeMediaBinaryReadiness(policy = {}) {
  const ffmpeg = resolveFfmpeg(policy);
  const ffprobe = resolveFfprobe(policy);
  const stillImageInput = creativeStillImageInputReadiness();
  return {
    contract: CONTRACT,
    ffmpeg_configured: Boolean(ffmpeg.path),
    ffmpeg_source: ffmpeg.source,
    ffprobe_configured: Boolean(ffprobe.path),
    ffprobe_source: ffprobe.source,
    still_image_input_ready: stillImageInput.ready,
    still_image_decoder: stillImageInput.decoder,
    still_image_normalization: stillImageInput.normalization,
    ffmpeg_image_decoder_required: stillImageInput.ffmpeg_image_decoder_required,
    still_image_supported_input_formats: stillImageInput.supported_input_formats,
    bundled_binary_relative_paths: BUNDLED_BINARY_RELATIVE_PATHS,
  };
}

export const CreativeMediaBinaryRuntime = Object.freeze({
  contract: CONTRACT,
  resolveFfmpegPath: resolveCreativeFfmpegPath,
  resolveFfprobePath: resolveCreativeFfprobePath,
  readiness: creativeMediaBinaryReadiness,
});
