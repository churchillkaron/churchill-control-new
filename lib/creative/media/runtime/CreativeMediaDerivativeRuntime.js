import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import sharp from "sharp";

import { getServiceSupabase } from "@/lib/shared/supabase/service";
import {
  creativeStorageUri,
} from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";
import {
  materializeMedia,
  CreativeMediaInspectionRuntime,
} from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";
import {
  createCreativeAssetNode,
  CREATIVE_ASSET_NODE_STATUS,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";

const supabaseAdmin = getServiceSupabase();

function safeSegment(value, fallback = "derivative") {
  const normalized = String(value || fallback)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized || fallback;
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function derivativeType(profile = {}) {
  const explicit = String(profile.asset_type || profile.assetType || "").toUpperCase();
  if (explicit) return explicit;

  const kind = String(profile.kind || profile.operation || "").toLowerCase();
  if (kind.includes("audio")) return "AUDIO";
  if (kind.includes("subtitle") || kind.includes("transcript")) return "SUBTITLE";
  if (kind.includes("video") || kind.includes("proxy") || kind.includes("mezzanine")) return "VIDEO";
  return "IMAGE";
}

function outputExtension(profile = {}) {
  const explicit = profile.extension || profile.output_extension || profile.outputExtension;
  if (explicit) return safeSegment(String(explicit).replace(/^\./, "").toLowerCase(), "bin");

  const format = profile.format || profile.output_format || profile.outputFormat;
  if (format) return safeSegment(String(format).replace(/^\./, "").toLowerCase(), "bin");

  const kind = String(profile.kind || profile.operation || "").toLowerCase();
  if (kind.includes("audio")) return "wav";
  if (kind.includes("video") || kind.includes("proxy") || kind.includes("mezzanine")) return "mp4";
  return "webp";
}

function mimeForExtension(extension) {
  const map = {
    webp: "image/webp",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    avif: "image/avif",
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    wav: "audio/wav",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    aac: "audio/aac",
    flac: "audio/flac",
    vtt: "text/vtt",
    srt: "application/x-subrip",
    json: "application/json",
  };
  return map[String(extension || "").toLowerCase()] || "application/octet-stream";
}

async function runProcess(command, args, timeoutMs = null) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "ignore", "pipe"],
    });
    const stderr = [];
    let timer = null;
    let settled = false;

    const finish = (error = null) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    };

    if (timeoutMs) {
      timer = setTimeout(() => {
        child.kill("SIGKILL");
        finish(new Error("MEDIA_DERIVATIVE_TIMEOUT"));
      }, timeoutMs);
    }

    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", finish);
    child.on("close", (code) => {
      if (code !== 0) {
        finish(new Error(
          Buffer.concat(stderr).toString("utf8") ||
          `MEDIA_DERIVATIVE_EXIT_${code}`,
        ));
        return;
      }
      finish();
    });
  });
}

async function createImageDerivative(inputPath, outputPath, profile = {}) {
  const resize = profile.resize || {};
  let pipeline = sharp(inputPath, {
    failOn: "none",
    animated: profile.animated === true,
  });

  if (resize.width || resize.height || profile.width || profile.height) {
    pipeline = pipeline.resize({
      width: finite(resize.width ?? profile.width),
      height: finite(resize.height ?? profile.height),
      fit: resize.fit || profile.fit,
      position: resize.position || profile.position,
      withoutEnlargement:
        resize.without_enlargement ??
        resize.withoutEnlargement ??
        profile.without_enlargement ??
        profile.withoutEnlargement,
      background: resize.background || profile.background,
    });
  }

  const format = outputExtension(profile);
  const formatOptions = profile.format_options || profile.formatOptions || {};
  await pipeline.toFormat(format, formatOptions).toFile(outputPath);
}

function buildFfmpegArgs(inputPath, outputPath, profile = {}, policy = {}) {
  const supplied = profile.args || profile.ffmpeg_args || profile.ffmpegArgs;
  const allowCustomArgs =
    policy.allow_custom_ffmpeg_args === true ||
    policy.allowCustomFfmpegArgs === true;

  if (Array.isArray(supplied) && supplied.length) {
    if (!allowCustomArgs) {
      throw new Error("CUSTOM_FFMPEG_ARGS_NOT_ALLOWED");
    }

    return supplied.map((value) =>
      String(value)
        .replaceAll("{input}", inputPath)
        .replaceAll("{output}", outputPath),
    );
  }

  const kind = String(profile.kind || profile.operation || "").toLowerCase();
  const args = ["-y", "-i", inputPath];

  if (kind.includes("audio")) {
    if (profile.audio_codec) args.push("-c:a", String(profile.audio_codec));
    if (profile.sample_rate) args.push("-ar", String(profile.sample_rate));
    if (profile.channels) args.push("-ac", String(profile.channels));
    if (profile.audio_bitrate) args.push("-b:a", String(profile.audio_bitrate));
    args.push("-vn");
  } else {
    if (profile.video_codec) args.push("-c:v", String(profile.video_codec));
    if (profile.audio_codec) args.push("-c:a", String(profile.audio_codec));
    if (profile.video_bitrate) args.push("-b:v", String(profile.video_bitrate));
    if (profile.audio_bitrate) args.push("-b:a", String(profile.audio_bitrate));
    if (profile.frame_rate) args.push("-r", String(profile.frame_rate));
    if (profile.scale) args.push("-vf", `scale=${profile.scale}`);
    if (profile.pixel_format) args.push("-pix_fmt", String(profile.pixel_format));
    if (profile.movable_metadata === false) args.push("-map_metadata", "-1");
  }

  args.push(outputPath);
  return args;
}

async function createFfmpegDerivative(inputPath, outputPath, profile = {}, policy = {}) {
  const ffmpegPath =
    policy.ffmpeg_path ||
    policy.ffmpegPath ||
    process.env.CREATIVE_MEDIA_FFMPEG_PATH ||
    null;

  if (!ffmpegPath) throw new Error("FFMPEG_NOT_CONFIGURED");

  const timeoutMs = finite(
    profile.timeout_ms ??
    profile.timeoutMs ??
    policy.derivative_timeout_ms ??
    policy.derivativeTimeoutMs ??
    process.env.CREATIVE_MEDIA_DERIVATIVE_TIMEOUT_MS,
  );

  await runProcess(
    ffmpegPath,
    buildFfmpegArgs(inputPath, outputPath, profile, policy),
    timeoutMs,
  );
}

async function uploadDerivative({
  organizationId,
  parentId,
  profile,
  outputPath,
  extension,
  policy = {},
}) {
  const bucket =
    policy.derivative_bucket ||
    policy.derivativeBucket ||
    process.env.CREATIVE_MEDIA_DERIVATIVE_BUCKET ||
    null;
  if (!bucket) throw new Error("DERIVATIVE_STORAGE_BUCKET_REQUIRED");
  const profileId = safeSegment(profile.id || profile.name || profile.kind);
  const fileName = `${profileId}.${extension}`;
  const storagePath = [
    safeSegment(organizationId),
    "derivatives",
    safeSegment(parentId),
    crypto.randomUUID(),
    fileName,
  ].join("/");
  const content = await fs.readFile(outputPath);
  const mimeType = profile.mime_type || profile.mimeType || mimeForExtension(extension);

  const { error } = await supabaseAdmin.storage
    .from(bucket)
    .upload(storagePath, content, {
      contentType: mimeType,
      cacheControl: String(profile.cache_control || profile.cacheControl || "3600"),
      upsert: false,
    });

  if (error) throw error;

  return {
    bucket,
    storage_path: storagePath,
    url: creativeStorageUri(bucket, storagePath),
    mime_type: mimeType,
    file_size_bytes: content.length,
  };
}

export const CreativeMediaDerivativeRuntime = {
  async create({
    organization_id,
    parent_asset_node_id,
    profiles = [],
    policy = {},
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!parent_asset_node_id) throw new Error("parent_asset_node_id required");
    if (!Array.isArray(profiles) || !profiles.length) {
      throw new Error("At least one derivative profile is required");
    }

    const parent = await AssetGraphRepository.getById(parent_asset_node_id);
    if (!parent || parent.organization_id !== organization_id) {
      throw new Error("Parent asset node not found");
    }
    if (!parent.url) throw new Error("Parent asset node has no media URL");

    const materialized = await materializeMedia({
      url: parent.url,
      file_name: parent.name || null,
      mime_type: parent.technical?.mime_type || null,
      organization_id,
      policy,
    });
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-derivative-"));
    const results = [];

    try {
      for (const profile of profiles) {
        const profileId = profile.id || profile.name || profile.kind;
        if (!profileId) throw new Error("Derivative profile id required");

        const extension = outputExtension(profile);
        const outputPath = path.join(
          directory,
          `${safeSegment(profileId)}.${extension}`,
        );
        const engine = String(profile.engine || "").toLowerCase();
        const kind = String(profile.kind || profile.operation || "").toLowerCase();
        const useImageEngine =
          engine === "sharp" ||
          (!engine && (kind.includes("thumbnail") || kind.includes("image")));

        if (useImageEngine) {
          await createImageDerivative(materialized.file_path, outputPath, profile);
        } else {
          await createFfmpegDerivative(materialized.file_path, outputPath, profile, policy);
        }

        const uploaded = await uploadDerivative({
          organizationId: organization_id,
          parentId: parent.id,
          profile,
          outputPath,
          extension,
          policy,
        });
        const inspection = await CreativeMediaInspectionRuntime.inspect({
          url: uploaded.url,
          file_name: path.basename(outputPath),
          mime_type: uploaded.mime_type,
          organization_id,
          policy,
        });
        const node = createCreativeAssetNode({
          organization_id,
          creative_project_id: parent.creative_project_id,
          creative_asset_id: parent.creative_asset_id,
          parent_asset_node_id: parent.id,
          type: derivativeType(profile),
          status: CREATIVE_ASSET_NODE_STATUS.DERIVED,
          name: profile.name || `${parent.name || "Asset"} ${profileId}`,
          description: profile.description || "",
          url: uploaded.url,
          storage_path: uploaded.storage_path,
          lineage: {
            source: "media_derivative",
            provider_id: null,
            capability: profile.capability || profile.kind || null,
            generation_version: profile.version || 1,
          },
          technical: {
            ...(inspection.technical || {}),
            mime_type: uploaded.mime_type,
            checksum:
              inspection.technical?.checksum_sha256 ||
              inspection.technical?.checksum ||
              null,
          },
          intelligence: {
            tags: Array.isArray(profile.tags) ? profile.tags : [],
            safety_status: "UNKNOWN",
          },
          reuse: {
            reusable: false,
            approved_for_reuse: false,
          },
          review: {
            ai_reviewed: false,
            human_reviewed: false,
            approved: false,
          },
          metadata: {
            derivative_profile: profile,
            derivative_engine: useImageEngine ? "sharp" : "ffmpeg",
            inspection_status: inspection.status,
            inspection_reason: inspection.reason,
            source_asset_node_id: parent.id,
            bucket: uploaded.bucket,
          },
        });

        results.push(await AssetGraphRepository.create(node));
      }

      return results;
    } finally {
      await materialized.cleanup();
      await fs.rm(directory, { recursive: true, force: true });
    }
  },
};
