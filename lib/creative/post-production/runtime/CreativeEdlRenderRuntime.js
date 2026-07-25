import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { getServiceSupabase } from "@/lib/shared/supabase/service";
import {
  materializeMedia,
  CreativeMediaInspectionRuntime,
} from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";
import {
  createCreativeAssetNode,
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import {
  CreativeRenderTechnicalQualityRuntime,
} from "@/lib/creative/quality/runtime/CreativeRenderTechnicalQualityRuntime";

const supabaseAdmin = getServiceSupabase();

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function positive(value) {
  const parsed = number(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function safe(value, fallback = "render") {
  return String(value || fallback)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || fallback;
}

function ext(profile) {
  return safe(
    String(profile.extension || profile.container || "mp4")
      .replace(/^\./, "")
      .toLowerCase(),
    "mp4",
  );
}

function mime(extension) {
  return ({
    mp4: "video/mp4",
    mov: "video/quicktime",
    mkv: "video/x-matroska",
    webm: "video/webm",
  })[extension] || "application/octet-stream";
}

function identity(timeline, profile, tracks) {
  return crypto.createHash("sha256").update(JSON.stringify({
    timeline_id: timeline.id,
    timeline_identity: timeline.metadata?.timeline_identity || null,
    profile,
    tracks,
  })).digest("hex");
}

function run(command, args, timeoutMs) {
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
        finish(new Error("EDL_RENDER_TIMEOUT"));
      }, timeoutMs);
    }

    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", finish);
    child.on("close", (code) => {
      if (code !== 0) {
        finish(new Error(
          Buffer.concat(stderr).toString("utf8") ||
          `EDL_RENDER_EXIT_${code}`,
        ));
        return;
      }
      finish();
    });
  });
}

function validateTimeline(timeline) {
  if (timeline.type !== CREATIVE_ASSET_NODE_TYPES.TIMELINE) {
    throw new Error("TIMELINE_ASSET_NODE_REQUIRED");
  }
  if (timeline.metadata?.format !== "AVANTIQO_EDL_V1") {
    throw new Error("AVANTIQO_EDL_V1_REQUIRED");
  }

  const edits = timeline.metadata?.edit_decision_list;
  if (!Array.isArray(edits) || !edits.length) {
    throw new Error("EDL_ENTRIES_REQUIRED");
  }

  for (const edit of edits) {
    const start = number(edit.source_in_seconds);
    const end = number(edit.source_out_seconds);
    if (!edit.source_url || start === null || end === null || end <= start) {
      throw new Error("VALID_EDL_SOURCE_REQUIRED");
    }
  }

  return edits;
}

function validateProfile(profile = {}) {
  if (!profile.id && !profile.name) throw new Error("EXPORT_PROFILE_ID_REQUIRED");
  if (!profile.video_codec && !profile.videoCodec) throw new Error("EXPORT_VIDEO_CODEC_REQUIRED");
  if (!positive(profile.width) || !positive(profile.height)) throw new Error("EXPORT_DIMENSIONS_REQUIRED");
  if (!positive(profile.frame_rate ?? profile.frameRate)) throw new Error("EXPORT_FRAME_RATE_REQUIRED");
  return profile;
}

function escapeFilterPath(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'");
}

function videoChain(index, edit, profile) {
  const width = Number(profile.width);
  const height = Number(profile.height);
  const fps = Number(profile.frame_rate ?? profile.frameRate);
  const fit = String(profile.fit || "contain").toLowerCase();
  const background = String(profile.background || "black").replace(/[^a-zA-Z0-9#]/g, "");
  const resize = fit === "cover"
    ? `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`
    : fit === "stretch"
      ? `scale=${width}:${height}`
      : `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:${background}`;

  return `[${index}:v]trim=start=${Number(edit.source_in_seconds)}:end=${Number(edit.source_out_seconds)},setpts=PTS-STARTPTS,${resize},fps=${fps},setsar=1[v${index}]`;
}

function audioChain(index, edit) {
  return `[${index}:a]atrim=start=${Number(edit.source_in_seconds)}:end=${Number(edit.source_out_seconds)},asetpts=PTS-STARTPTS[a${index}]`;
}

function externalAudioChain(index, outputIndex, track, duration) {
  const sourceIn = Math.max(0, number(track.source_in_seconds ?? track.sourceInSeconds) || 0);
  const trackDuration = positive(track.duration_seconds ?? track.durationSeconds);
  const timelineIn = Math.max(0, number(track.timeline_in_seconds ?? track.timelineInSeconds) || 0);
  const gain = number(track.gain);
  const filters = [];

  if (trackDuration) filters.push(`atrim=start=${sourceIn}:end=${sourceIn + trackDuration}`);
  else if (sourceIn) filters.push(`atrim=start=${sourceIn}`);
  filters.push("asetpts=PTS-STARTPTS");
  if (gain !== null) filters.push(`volume=${gain}`);
  if (timelineIn) filters.push(`adelay=${Math.round(timelineIn * 1000)}:all=1`);
  if (duration) filters.push(`atrim=duration=${duration}`);

  return `[${index}:a]${filters.join(",")}[exta${outputIndex}]`;
}

async function materializeNode(node, policy) {
  if (!node?.url) throw new Error("TRACK_ASSET_URL_REQUIRED");
  return materializeMedia({
    url: node.url,
    file_name: node.name || null,
    mime_type: node.technical?.mime_type || null,
    policy,
  });
}

async function upload({ organizationId, projectId, renderId, outputPath, profile, policy }) {
  const bucket = policy.render_bucket || policy.renderBucket || process.env.CREATIVE_MEDIA_RENDER_BUCKET || null;
  if (!bucket) throw new Error("RENDER_STORAGE_BUCKET_REQUIRED");

  const extension = ext(profile);
  const storagePath = [
    safe(organizationId),
    safe(projectId),
    "renders",
    safe(renderId),
    `${safe(profile.id || profile.name)}.${extension}`,
  ].join("/");
  const buffer = await fs.readFile(outputPath);
  const contentType = profile.mime_type || profile.mimeType || mime(extension);
  const uploadOptions = { contentType, upsert: false };
  const cacheControl = policy.render_cache_control || policy.renderCacheControl || process.env.CREATIVE_MEDIA_RENDER_CACHE_CONTROL;
  if (cacheControl) uploadOptions.cacheControl = String(cacheControl);

  const { error } = await supabaseAdmin.storage
    .from(bucket)
    .upload(storagePath, buffer, uploadOptions);
  if (error) throw error;

  const { data } = supabaseAdmin.storage.from(bucket).getPublicUrl(storagePath);
  return {
    bucket,
    storage_path: storagePath,
    url: data.publicUrl,
    mime_type: contentType,
    file_size_bytes: buffer.length,
    checksum: crypto.createHash("sha256").update(buffer).digest("hex"),
  };
}

export const CreativeEdlRenderRuntime = {
  async render({
    organization_id,
    timeline_asset_node_id,
    export_profile,
    tracks = {},
    policy = {},
    force = false,
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!timeline_asset_node_id) throw new Error("timeline_asset_node_id required");

    const timeline = await AssetGraphRepository.getById(timeline_asset_node_id);
    if (!timeline || timeline.organization_id !== organization_id) {
      throw new Error("Timeline asset node not found");
    }

    const edits = validateTimeline(timeline);
    const profile = validateProfile(export_profile || {});
    const renderIdentity = identity(timeline, profile, tracks || {});
    const nodes = await AssetGraphRepository.listByProject({
      organization_id,
      creative_project_id: timeline.creative_project_id,
    });
    const existing = !force
      ? nodes.find((node) =>
          node.type === CREATIVE_ASSET_NODE_TYPES.FINAL_RENDER &&
          node.metadata?.render_identity === renderIdentity,
        )
      : null;
    if (existing) return { render: existing, reused: true };

    const ffmpegPath = policy.ffmpeg_path || policy.ffmpegPath || process.env.CREATIVE_MEDIA_FFMPEG_PATH || null;
    if (!ffmpegPath) throw new Error("FFMPEG_NOT_CONFIGURED");

    const timeoutMs = positive(policy.render_timeout_ms || policy.renderTimeoutMs || process.env.CREATIVE_MEDIA_RENDER_TIMEOUT_MS);
    const includeSourceAudio = profile.include_source_audio === true || profile.includeSourceAudio === true;
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-render-"));
    const materials = [];

    try {
      const args = ["-y"];
      for (const edit of edits) {
        const source = await materializeMedia({ url: edit.source_url, policy });
        materials.push(source);
        args.push("-i", source.file_path);
      }

      const audioTracks = [];
      for (const track of Array.isArray(tracks.audio) ? tracks.audio : []) {
        const node = await AssetGraphRepository.getById(track.asset_node_id || track.assetNodeId);
        if (!node || node.organization_id !== organization_id) throw new Error("Audio track asset not found");
        const source = await materializeNode(node, policy);
        const inputIndex = edits.length + audioTracks.length;
        materials.push(source);
        args.push("-i", source.file_path);
        audioTracks.push({ inputIndex, track });
      }

      const overlays = [];
      for (const overlay of Array.isArray(tracks.overlays) ? tracks.overlays : []) {
        const node = await AssetGraphRepository.getById(overlay.asset_node_id || overlay.assetNodeId);
        if (!node || node.organization_id !== organization_id) throw new Error("Overlay asset not found");
        const source = await materializeNode(node, policy);
        const inputIndex = edits.length + audioTracks.length + overlays.length;
        materials.push(source);
        if (String(node.technical?.media_kind || node.type).toUpperCase().includes("IMAGE")) {
          args.push("-loop", "1");
        }
        args.push("-i", source.file_path);
        overlays.push({ inputIndex, overlay });
      }

      let subtitle = null;
      const subtitleId = tracks.subtitle_asset_node_id || tracks.subtitleAssetNodeId;
      if (subtitleId) {
        const node = await AssetGraphRepository.getById(subtitleId);
        if (!node || node.organization_id !== organization_id) throw new Error("Subtitle asset not found");
        const source = await materializeNode(node, policy);
        materials.push(source);
        subtitle = { node, source };
      }

      const filters = [];
      edits.forEach((edit, index) => {
        filters.push(videoChain(index, edit, profile));
        if (includeSourceAudio) filters.push(audioChain(index, edit));
      });
      filters.push(includeSourceAudio
        ? `${edits.map((_, index) => `[v${index}][a${index}]`).join("")}concat=n=${edits.length}:v=1:a=1[basev][basea]`
        : `${edits.map((_, index) => `[v${index}]`).join("")}concat=n=${edits.length}:v=1:a=0[basev]`);

      let videoLabel = "basev";
      overlays.forEach(({ inputIndex, overlay }, index) => {
        const start = Math.max(0, number(overlay.timeline_in_seconds ?? overlay.timelineInSeconds) || 0);
        const duration = positive(overlay.duration_seconds ?? overlay.durationSeconds);
        const end = duration ? start + duration : null;
        const width = positive(overlay.width);
        const height = positive(overlay.height);
        const opacity = number(overlay.opacity);
        const prep = [];
        if (width || height) prep.push(`scale=${width || -1}:${height || -1}`);
        if (opacity !== null) prep.push("format=rgba", `colorchannelmixer=aa=${Math.max(0, Math.min(1, opacity))}`);
        prep.push("setpts=PTS-STARTPTS");
        filters.push(`[${inputIndex}:v]${prep.join(",")}[ov${index}]`);
        const next = `video${index}`;
        const enable = end === null ? `gte(t,${start})` : `between(t,${start},${end})`;
        filters.push(`[${videoLabel}][ov${index}]overlay=x=${overlay.x ?? 0}:y=${overlay.y ?? 0}:enable='${enable}'[${next}]`);
        videoLabel = next;
      });

      const subtitleMode = profile.subtitle_mode || profile.subtitleMode || null;
      if (subtitle && subtitleMode === "burn") {
        const escaped = escapeFilterPath(subtitle.source.file_path);
        const style = profile.subtitle_style || profile.subtitleStyle;
        const styleOption = style ? `:force_style='${String(style).replace(/'/g, "\\'")}'` : "";
        filters.push(`[${videoLabel}]subtitles='${escaped}'${styleOption}[videoout]`);
        videoLabel = "videoout";
      }

      const duration = positive(timeline.technical?.duration_seconds);
      audioTracks.forEach(({ inputIndex, track }, index) => {
        filters.push(externalAudioChain(inputIndex, index, track, duration));
      });
      const audioLabels = [];
      if (includeSourceAudio) audioLabels.push("[basea]");
      audioTracks.forEach((_, index) => audioLabels.push(`[exta${index}]`));
      if (audioLabels.length > 1) {
        const normalize = profile.audio_mix_normalize === true || profile.audioMixNormalize === true ? 1 : 0;
        filters.push(`${audioLabels.join("")}amix=inputs=${audioLabels.length}:normalize=${normalize}[audioout]`);
      } else if (audioLabels.length === 1) {
        filters.push(`${audioLabels[0]}anull[audioout]`);
      }

      const outputPath = path.join(directory, `render.${ext(profile)}`);
      args.push("-filter_complex", filters.join(";"), "-map", `[${videoLabel}]`);
      if (audioLabels.length) args.push("-map", "[audioout]");
      if (subtitle && subtitleMode === "mux") {
        args.push("-i", subtitle.source.file_path, "-map", `${edits.length + audioTracks.length + overlays.length}:s:0`);
      }

      args.push("-c:v", String(profile.video_codec || profile.videoCodec));
      args.push("-r", String(profile.frame_rate || profile.frameRate));
      if (profile.pixel_format || profile.pixelFormat) args.push("-pix_fmt", String(profile.pixel_format || profile.pixelFormat));
      if (profile.video_bitrate || profile.videoBitrate) args.push("-b:v", String(profile.video_bitrate || profile.videoBitrate));
      if (audioLabels.length) {
        if (!profile.audio_codec && !profile.audioCodec) throw new Error("EXPORT_AUDIO_CODEC_REQUIRED");
        args.push("-c:a", String(profile.audio_codec || profile.audioCodec));
        if (profile.audio_bitrate || profile.audioBitrate) args.push("-b:a", String(profile.audio_bitrate || profile.audioBitrate));
        if (profile.sample_rate || profile.sampleRate) args.push("-ar", String(profile.sample_rate || profile.sampleRate));
        if (profile.audio_channels || profile.audioChannels) args.push("-ac", String(profile.audio_channels || profile.audioChannels));
      }
      if (subtitle && subtitleMode === "mux") {
        if (!profile.subtitle_codec && !profile.subtitleCodec) throw new Error("EXPORT_SUBTITLE_CODEC_REQUIRED");
        args.push("-c:s", String(profile.subtitle_codec || profile.subtitleCodec));
      }
      if (duration) args.push("-t", String(duration));
      args.push(outputPath);

      await run(ffmpegPath, args, timeoutMs);
      const renderId = crypto.randomUUID();
      const uploaded = await upload({
        organizationId: organization_id,
        projectId: timeline.creative_project_id,
        renderId,
        outputPath,
        profile,
        policy,
      });
      const inspection = await CreativeMediaInspectionRuntime.inspect({
        url: uploaded.url,
        file_name: path.basename(outputPath),
        mime_type: uploaded.mime_type,
        policy,
      });
      const qc = CreativeRenderTechnicalQualityRuntime.evaluate({
        technical: inspection.technical || {},
        profile,
        expected_duration_seconds: timeline.technical?.duration_seconds || null,
        audio_expected: audioLabels.length > 0,
      });
      const node = createCreativeAssetNode({
        id: renderId,
        organization_id,
        creative_project_id: timeline.creative_project_id,
        parent_asset_node_id: timeline.id,
        type: CREATIVE_ASSET_NODE_TYPES.FINAL_RENDER,
        status: qc.passed ? CREATIVE_ASSET_NODE_STATUS.REVIEW : CREATIVE_ASSET_NODE_STATUS.REJECTED,
        name: profile.name || profile.id,
        description: profile.description || "",
        url: uploaded.url,
        storage_path: uploaded.storage_path,
        lineage: {
          source: "edl_render",
          capability: "creative.timeline.render",
          generation_version: profile.version || 1,
        },
        technical: {
          ...(inspection.technical || {}),
          mime_type: uploaded.mime_type,
          checksum: uploaded.checksum,
          file_size_bytes: uploaded.file_size_bytes,
        },
        intelligence: {
          quality_score: null,
          brand_match_score: null,
          reuse_score: null,
          safety_status: "UNKNOWN",
          tags: Array.isArray(profile.tags) ? profile.tags : [],
        },
        reuse: { reusable: false, approved_for_reuse: false },
        review: {
          ai_reviewed: true,
          human_reviewed: false,
          approved: false,
          notes: qc.passed ? "Technical QC passed" : "Technical QC failed",
        },
        metadata: {
          render_identity: renderIdentity,
          timeline_asset_node_id: timeline.id,
          export_profile: profile,
          tracks,
          storage_bucket: uploaded.bucket,
          inspection_status: inspection.status,
          inspection_reason: inspection.reason,
          technical_qc: qc,
          created_at: new Date().toISOString(),
        },
      });

      return {
        render: await AssetGraphRepository.create(node),
        reused: false,
        technical_qc: qc,
      };
    } finally {
      await Promise.all(materials.map((material) => material.cleanup()));
      await fs.rm(directory, { recursive: true, force: true });
    }
  },
};
