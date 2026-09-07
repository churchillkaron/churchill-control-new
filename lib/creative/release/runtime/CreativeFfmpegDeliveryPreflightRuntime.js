import { spawn } from "node:child_process";

const CONTRACT = "AVANTIQO_FFMPEG_DELIVERY_PREFLIGHT_V1";
const CACHE = new Map();

function text(value) {
  return String(value ?? "").trim();
}

function extensionFor(profile = {}) {
  const value = text(
    profile.extension ||
    profile.output_extension ||
    profile.outputExtension ||
    profile.format ||
    profile.output_format ||
    profile.outputFormat ||
    "mp4",
  ).toLowerCase().replace(/^\./, "");
  return value || "mp4";
}

function muxerFor(extension) {
  const map = Object.freeze({
    mp4: "mp4",
    m4v: "mp4",
    mov: "mov",
    webm: "webm",
    mkv: "matroska",
    wav: "wav",
    m4a: "ipod",
    aac: "adts",
    flac: "flac",
  });
  return map[extension] || extension;
}

function run(command, args, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    let settled = false;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      if (!settled) {
        settled = true;
        reject(new Error("FFMPEG_DELIVERY_PREFLIGHT_TIMEOUT"));
      }
    }, timeoutMs);

    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const output = `${Buffer.concat(stdout).toString("utf8")}\n${Buffer.concat(stderr).toString("utf8")}`;
      if (code !== 0) {
        reject(new Error(output.trim() || `FFMPEG_DELIVERY_PREFLIGHT_EXIT_${code}`));
        return;
      }
      resolve(output);
    });
  });
}

async function assertHelp(ffmpegPath, type, name) {
  if (!name) return;
  try {
    await run(ffmpegPath, ["-hide_banner", "-h", `${type}=${name}`]);
  } catch (error) {
    const wrapped = new Error(`FFMPEG_DELIVERY_${type.toUpperCase()}_UNAVAILABLE:${name}`);
    wrapped.cause = error;
    throw wrapped;
  }
}

export const CreativeFfmpegDeliveryPreflightRuntime = Object.freeze({
  contract: CONTRACT,
  deterministic: true,
  provider_calls_executed: 0,

  async assert({ profile = {}, policy = {} } = {}) {
    const ffmpegPath = text(
      policy.ffmpeg_path ||
      policy.ffmpegPath ||
      process.env.CREATIVE_MEDIA_FFMPEG_PATH,
    );
    if (!ffmpegPath) throw new Error("FFMPEG_DELIVERY_PREFLIGHT_NOT_CONFIGURED");

    const extension = extensionFor(profile);
    const muxer = muxerFor(extension);
    const videoCodec = text(profile.video_codec || profile.videoCodec);
    const audioCodec = text(profile.audio_codec || profile.audioCodec);
    const needsScale = Boolean(text(profile.scale));
    const key = JSON.stringify({ ffmpegPath, muxer, videoCodec, audioCodec, needsScale });
    if (CACHE.has(key)) return CACHE.get(key);

    try {
      await run(ffmpegPath, ["-hide_banner", "-version"]);
      if (videoCodec) await assertHelp(ffmpegPath, "encoder", videoCodec);
      if (audioCodec && audioCodec !== "copy") await assertHelp(ffmpegPath, "encoder", audioCodec);
      if (muxer) await assertHelp(ffmpegPath, "muxer", muxer);
      if (needsScale) await assertHelp(ffmpegPath, "filter", "scale");
    } catch (error) {
      if (String(error?.message || error).startsWith("FFMPEG_DELIVERY_")) throw error;
      const wrapped = new Error("FFMPEG_DELIVERY_PREFLIGHT_FAILED");
      wrapped.cause = error;
      throw wrapped;
    }

    const result = Object.freeze({
      contract: CONTRACT,
      passed: true,
      ffmpeg_path_configured: true,
      muxer,
      video_codec: videoCodec || null,
      audio_codec: audioCodec || null,
      scale_filter_required: needsScale,
      encoder_preflight_required: true,
      muxer_preflight_required: true,
      filter_preflight_required_when_used: true,
      provider_calls_executed: 0,
    });
    CACHE.set(key, result);
    return result;
  },
});
