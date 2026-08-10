import fs from "node:fs";
import path from "node:path";

const BUNDLED_FFMPEG_RELATIVE_PATH = ".avantiqo/bin/ffmpeg";
const CONTRACT = "CREATIVE_MEDIA_BINARY_RUNTIME_V1";

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

function bundledFfmpegCandidates() {
  const roots = [
    process.env.LAMBDA_TASK_ROOT,
    process.cwd(),
  ]
    .map(text)
    .filter(Boolean);

  return [...new Set(
    roots.map((root) => path.resolve(root, BUNDLED_FFMPEG_RELATIVE_PATH)),
  )];
}

function resolveFfmpeg(policy = {}) {
  const policyPath = executable(policy.ffmpeg_path || policy.ffmpegPath);
  if (policyPath) return { path: policyPath, source: "POLICY" };

  const environmentPath = executable(process.env.CREATIVE_MEDIA_FFMPEG_PATH);
  if (environmentPath) {
    return { path: environmentPath, source: "ENVIRONMENT" };
  }

  for (const candidate of bundledFfmpegCandidates()) {
    const bundledPath = executable(candidate);
    if (bundledPath) {
      return { path: bundledPath, source: "BUNDLED_PINNED_BINARY" };
    }
  }

  return { path: null, source: "UNAVAILABLE" };
}

function resolveFfprobe(policy = {}) {
  const policyPath = executable(policy.ffprobe_path || policy.ffprobePath);
  if (policyPath) return { path: policyPath, source: "POLICY" };

  const environmentPath = executable(process.env.CREATIVE_MEDIA_FFPROBE_PATH);
  if (environmentPath) {
    return { path: environmentPath, source: "ENVIRONMENT" };
  }

  return { path: null, source: "UNAVAILABLE" };
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
  return {
    contract: CONTRACT,
    ffmpeg_configured: Boolean(ffmpeg.path),
    ffmpeg_source: ffmpeg.source,
    ffprobe_configured: Boolean(ffprobe.path),
    ffprobe_source: ffprobe.source,
    bundled_ffmpeg_relative_path: BUNDLED_FFMPEG_RELATIVE_PATH,
  };
}

export const CreativeMediaBinaryRuntime = Object.freeze({
  contract: CONTRACT,
  resolveFfmpegPath: resolveCreativeFfmpegPath,
  resolveFfprobePath: resolveCreativeFfprobePath,
  readiness: creativeMediaBinaryReadiness,
});
