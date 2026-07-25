import crypto from "node:crypto";
import dns from "node:dns/promises";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import sharp from "sharp";

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positiveInteger(value) {
  const number = finite(value);
  return number !== null && number > 0 ? Math.floor(number) : null;
}

function normalizeMime(value) {
  return String(value || "")
    .split(";")[0]
    .trim()
    .toLowerCase() || null;
}

function inferKind(mimeType, streams = []) {
  const root = normalizeMime(mimeType)?.split("/")[0];
  if (root && root !== "application" && root !== "binary") return root;
  if (streams.some((stream) => stream.codec_type === "video")) return "video";
  if (streams.some((stream) => stream.codec_type === "audio")) return "audio";
  return root || "binary";
}

function extensionFromName(value) {
  const clean = String(value || "").split(/[?#]/)[0];
  const extension = path.extname(clean).replace(/^\./, "");
  return extension.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "media";
}

function isPrivateIpv4(address) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

function isPrivateAddress(address) {
  const normalized = String(address || "").toLowerCase();
  const version = net.isIP(normalized);
  if (version === 4) return isPrivateIpv4(normalized);
  if (version !== 6) return true;
  if (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fe80:") ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd")
  ) return true;
  const mapped = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? isPrivateIpv4(mapped[1]) : false;
}

function hostAllowed(hostname, policy = {}) {
  const allowed = Array.isArray(policy.allowed_hosts)
    ? policy.allowed_hosts
    : Array.isArray(policy.allowedHosts)
      ? policy.allowedHosts
      : [];
  if (!allowed.length) return true;
  return allowed.some((entry) => {
    const candidate = String(entry || "").toLowerCase();
    const host = hostname.toLowerCase();
    return host === candidate || host.endsWith(`.${candidate}`);
  });
}

async function assertSafeRemoteUrl(value, policy = {}) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("MEDIA_URL_PROTOCOL_NOT_ALLOWED");
  }
  if (url.username || url.password) {
    throw new Error("MEDIA_URL_CREDENTIALS_NOT_ALLOWED");
  }
  if (!hostAllowed(url.hostname, policy)) {
    throw new Error("MEDIA_URL_HOST_NOT_ALLOWED");
  }
  const addresses = net.isIP(url.hostname)
    ? [{ address: url.hostname }]
    : await dns.lookup(url.hostname, { all: true, verbatim: true });
  if (
    policy.allow_private_networks !== true &&
    policy.allowPrivateNetworks !== true &&
    addresses.some((entry) => isPrivateAddress(entry.address))
  ) {
    throw new Error("MEDIA_URL_PRIVATE_NETWORK_NOT_ALLOWED");
  }
  return url;
}

function configuredNumber(policy, snakeName, camelName, environmentName) {
  return positiveInteger(
    policy?.[snakeName] ??
    policy?.[camelName] ??
    process.env[environmentName],
  );
}

async function fetchRemoteToFile({ url, filePath, policy = {} }) {
  const maximumBytes = configuredNumber(policy, "max_bytes", "maxBytes", "CREATIVE_MEDIA_MAX_INSPECTION_BYTES");
  const timeoutMs = configuredNumber(policy, "timeout_ms", "timeoutMs", "CREATIVE_MEDIA_INSPECTION_TIMEOUT_MS");
  const maximumRedirects = Number(
    policy.max_redirects ?? policy.maxRedirects ?? process.env.CREATIVE_MEDIA_MAX_REDIRECTS ?? 0,
  );
  const controller = new AbortController();
  const timer = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : null;
  let current = await assertSafeRemoteUrl(url, policy);
  let redirects = 0;

  try {
    while (true) {
      const response = await fetch(current, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: policy.headers || {},
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || redirects >= maximumRedirects) {
          throw new Error("MEDIA_REDIRECT_NOT_ALLOWED");
        }
        current = await assertSafeRemoteUrl(new URL(location, current).toString(), policy);
        redirects += 1;
        continue;
      }
      if (!response.ok) throw new Error(`MEDIA_DOWNLOAD_FAILED_${response.status}`);
      const contentLength = positiveInteger(response.headers.get("content-length"));
      const effectiveMaximum = maximumBytes || contentLength;
      if (!effectiveMaximum) throw new Error("MEDIA_MAX_BYTES_REQUIRED_FOR_UNBOUNDED_RESPONSE");
      if (contentLength && contentLength > effectiveMaximum) {
        throw new Error("MEDIA_EXCEEDS_INSPECTION_LIMIT");
      }
      if (!response.body) throw new Error("MEDIA_RESPONSE_BODY_REQUIRED");

      const handle = await fs.open(filePath, "w");
      const reader = response.body.getReader();
      const hash = crypto.createHash("sha256");
      let bytes = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > effectiveMaximum) {
            await reader.cancel();
            throw new Error("MEDIA_EXCEEDS_INSPECTION_LIMIT");
          }
          const buffer = Buffer.from(value);
          hash.update(buffer);
          await handle.write(buffer);
        }
      } finally {
        await handle.close();
      }
      return {
        final_url: current.toString(),
        file_size_bytes: bytes,
        checksum: hash.digest("hex"),
        mime_type: normalizeMime(response.headers.get("content-type")),
      };
    }
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function materializeMedia({
  file = null,
  url = null,
  file_name = null,
  mime_type = null,
  policy = {},
} = {}) {
  if (!file && !url) throw new Error("MEDIA_FILE_OR_URL_REQUIRED");
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-media-"));
  const sourceName = file_name || file?.name || url || "media";
  const filePath = path.join(directory, `source.${extensionFromName(sourceName)}`);
  let details;
  try {
    if (file && typeof file.arrayBuffer === "function") {
      const buffer = Buffer.from(await file.arrayBuffer());
      const maximumBytes = configuredNumber(policy, "max_bytes", "maxBytes", "CREATIVE_MEDIA_MAX_INSPECTION_BYTES");
      if (maximumBytes && buffer.length > maximumBytes) {
        throw new Error("MEDIA_EXCEEDS_INSPECTION_LIMIT");
      }
      await fs.writeFile(filePath, buffer);
      details = {
        final_url: null,
        file_size_bytes: buffer.length,
        checksum: crypto.createHash("sha256").update(buffer).digest("hex"),
        mime_type: normalizeMime(file.type || mime_type),
      };
    } else {
      details = await fetchRemoteToFile({ url, filePath, policy });
      details.mime_type = details.mime_type || normalizeMime(mime_type);
    }
    return {
      ...details,
      file_path: filePath,
      original_file_name: file?.name || file_name || null,
      async cleanup() {
        await fs.rm(directory, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await fs.rm(directory, { recursive: true, force: true });
    throw error;
  }
}

function fraction(value) {
  if (!value) return null;
  const [numerator, denominator] = String(value).split("/").map(Number);
  if (!Number.isFinite(numerator)) return null;
  if (!Number.isFinite(denominator) || denominator === 0) return numerator;
  return numerator / denominator;
}

function rotation(stream = {}) {
  const sideData = Array.isArray(stream.side_data_list)
    ? stream.side_data_list.find((item) => item.rotation !== undefined)
    : null;
  return finite(sideData?.rotation ?? stream.tags?.rotate);
}

function normalizeProbe(probe = {}, seedMime = null) {
  const streams = Array.isArray(probe.streams) ? probe.streams : [];
  const video = streams.find((stream) => stream.codec_type === "video") || null;
  const audio = streams.find((stream) => stream.codec_type === "audio") || null;
  const format = probe.format || {};
  return {
    media_kind: inferKind(seedMime, streams),
    mime_type: normalizeMime(seedMime),
    container: format.format_name || null,
    format_long_name: format.format_long_name || null,
    duration_seconds: finite(format.duration ?? video?.duration ?? audio?.duration),
    bitrate: finite(format.bit_rate),
    width: finite(video?.width),
    height: finite(video?.height),
    display_aspect_ratio: video?.display_aspect_ratio || null,
    pixel_format: video?.pix_fmt || null,
    frame_rate: fraction(video?.avg_frame_rate || video?.r_frame_rate),
    video_codec: video?.codec_name || null,
    video_profile: video?.profile || null,
    rotation_degrees: rotation(video),
    audio_codec: audio?.codec_name || null,
    sample_rate: finite(audio?.sample_rate),
    channels: finite(audio?.channels),
    channel_layout: audio?.channel_layout || null,
    stream_count: streams.length,
    streams: streams.map((stream) => ({
      index: stream.index,
      codec_type: stream.codec_type || null,
      codec_name: stream.codec_name || null,
      duration_seconds: finite(stream.duration),
      bitrate: finite(stream.bit_rate),
      width: finite(stream.width),
      height: finite(stream.height),
      frame_rate: fraction(stream.avg_frame_rate || stream.r_frame_rate),
      sample_rate: finite(stream.sample_rate),
      channels: finite(stream.channels),
      language: stream.tags?.language || null,
    })),
  };
}

async function runJsonCommand(command, args, timeoutMs = null) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    let timer = null;
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (error) reject(error);
      else resolve(value);
    };
    if (timeoutMs) {
      timer = setTimeout(() => {
        child.kill("SIGKILL");
        finish(new Error("MEDIA_PROBE_TIMEOUT"));
      }, timeoutMs);
    }
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      if (code !== 0) {
        finish(new Error(Buffer.concat(stderr).toString("utf8") || `MEDIA_PROBE_EXIT_${code}`));
        return;
      }
      try {
        finish(null, JSON.parse(Buffer.concat(stdout).toString("utf8")));
      } catch {
        finish(new Error("MEDIA_PROBE_INVALID_JSON"));
      }
    });
  });
}

async function inspectImage(filePath, mimeType) {
  const metadata = await sharp(filePath, { failOn: "none", animated: true }).metadata();
  if (!metadata.format) throw new Error("NOT_AN_IMAGE");
  return {
    media_kind: "image",
    mime_type: normalizeMime(mimeType) || `image/${metadata.format}`,
    format: metadata.format || null,
    width: finite(metadata.width),
    height: finite(metadata.height),
    pages: finite(metadata.pages),
    page_height: finite(metadata.pageHeight),
    orientation: finite(metadata.orientation),
    density: finite(metadata.density),
    colour_space: metadata.space || null,
    channels: finite(metadata.channels),
    has_alpha: metadata.hasAlpha ?? null,
    is_animated: Number(metadata.pages || 1) > 1,
  };
}

async function detectImage(filePath, mimeType) {
  try {
    return await inspectImage(filePath, mimeType);
  } catch {
    return null;
  }
}

export const CreativeMediaInspectionRuntime = {
  async inspect(input = {}) {
    const materialized = await materializeMedia(input);
    const policy = input.policy || {};
    try {
      const mimeType = materialized.mime_type || normalizeMime(input.mime_type);
      const root = mimeType?.split("/")[0] || null;
      let technical = null;
      let probeStatus = "COMPLETE";
      let probeReason = null;

      if (root === "image") {
        technical = await inspectImage(materialized.file_path, mimeType);
      } else {
        technical = await detectImage(materialized.file_path, mimeType);
        if (!technical) {
          const ffprobePath =
            policy.ffprobe_path ||
            policy.ffprobePath ||
            process.env.CREATIVE_MEDIA_FFPROBE_PATH ||
            null;
          if (ffprobePath) {
            const timeoutMs = configuredNumber(
              policy,
              "probe_timeout_ms",
              "probeTimeoutMs",
              "CREATIVE_MEDIA_PROBE_TIMEOUT_MS",
            );
            const probe = await runJsonCommand(
              ffprobePath,
              ["-v", "error", "-show_format", "-show_streams", "-of", "json", materialized.file_path],
              timeoutMs,
            );
            technical = normalizeProbe(probe, mimeType);
          } else {
            probeStatus = "PARTIAL";
            probeReason = "FFPROBE_NOT_CONFIGURED";
            technical = {
              media_kind: inferKind(mimeType),
              mime_type: mimeType,
            };
          }
        }
      }

      return {
        status: probeStatus,
        reason: probeReason,
        technical: {
          ...technical,
          checksum_sha256: materialized.checksum,
          file_size_bytes: materialized.file_size_bytes,
          original_file_name: materialized.original_file_name,
          source_url: materialized.final_url || input.url || null,
          inspected_at: new Date().toISOString(),
        },
      };
    } finally {
      await materialized.cleanup();
    }
  },
};
