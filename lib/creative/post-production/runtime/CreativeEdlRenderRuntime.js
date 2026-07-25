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

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positive(value) {
  const number = finite(value);
  return number !== null && number > 0 ? number : null;
}

function safeSegment(value, fallback = "render") {
  const normalized = String(value || fallback)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || fallback;
}

function extension(profile = {}) {
  return safeSegment(
    String(
      profile.extension ||
      profile.output_extension ||
      profile.outputExtension ||
      profile.container ||
      "mp4",
    ).replace(/^\./, "").toLowerCase(),
    "mp4",
  );
}

function contentType(value) {
  const map = {
    mp4: "video/mp4",
    mov: "video/quicktime",
    mkv: "video/x-matroska",
    webm: "video/webm",
  };
  return map[value] || "application/octet-stream";
}

function renderIdentity(timeline, profile, tracks) {
  return crypto.createHash("sha256").update(JSON.stringify({
    timeline_id: timeline.id,
    timeline_identity: timeline.metadata?.timeline_identity || null,
    profile,
    tracks: {
      subtitle_asset_node_id: tracks.subtitle_asset_node_id || tracks.subtitleAssetNodeId || null,
      audio: (tracks.audio || []).map((track) => ({
        asset_node_id: track.asset_node_id || track.assetNodeId || null,
        role: track.role || null,
        timeline_in_seconds: track.timeline_in_seconds ?? track.timelineInSeconds ?? null,
        source_in_seconds: track.source_in_seconds ?? track.sourceInSeconds ?? null,
        duration_seconds: track.duration_seconds ?? track.durationSeconds ?? null,
        gain: track.gain ?? null,
      })),
      overlays: (tracks.overlays || []).map((overlay) => ({
        asset_node_id: overlay.asset_node_id || overlay.assetNodeId || null,
        timeline_in_seconds: overlay.timeline_in_seconds ?? overlay.timelineInSeconds ?? null,
        duration_seconds: overlay.duration_seconds ?? overlay.durationSeconds ?? null,
        x: overlay.x ?? null,
        y: overlay.y ?? null,
        width: overlay.width ?? null,
        height: overlay.height ?? null,
      })),
    },
  })).digest("hex");
}

function runProcess(command, args, timeoutMs = null) {
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
      else resolve(Buffer.concat(stderr).toString("utf8"));
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

function validateTimeline(timeline = {}) {
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
    if (!edit.source_url) throw new Error("EDL_SOURCE_URL_REQUIRED");
    const sourceIn = finite(edit.source_in_seconds);
    const sourceOut = finite(edit.source_out_seconds);
    if (sourceIn === null || sourceOut === null || sourceOut <= sourceIn) {
      throw new Error("VALID_EDL_SOURCE_RANGE_REQUIRED");
    }
  }

  return edits;
}

function validateProfile(profile = {}) {
  const profileId = profile.id || profile.name;
  if (!profileId) throw new Error("EXPORT_PROFILE_ID_REQUIRED");
  if (!profile.video_codec && !profile.videoCodec) {
    throw new Error("EXPORT_VIDEO_CODEC_REQUIRED");
  }
  if (!positive(profile.width) || !positive(profile.height)) {
    throw new Error("EXPORT_DIMENSIONS_REQUIRED");
  }
  if (!positive(profile.frame_rate ?? profile.frameRate)) {
    throw new Error("EXPORT_FRAME_RATE_REQUIRED");
  }
  return profile;
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

function videoFilter(index, edit, profile) {
  const sourceIn = Number(edit.source_in_seconds);
  const sourceOut = Number(edit.source_out_seconds);
  const width = Number(profile.width);
  const height = Number(profile.height);
  const frameRate = Number(profile.frame_rate ?? profile.frameRate);
  const fit = String(profile.fit || "contain").toLowerCase();
  let resize;

  if (fit === "cover") {
    resize = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;
  } else if (fit === "stretch") {
    resize = `scale=${width}:${height}`;
  } else {
    const background = String(profile.background || "black").replace(/[^a-zA-Z0-9#]/g, "");
    resize = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:${background}`;
  }

  return `[${index}:v]trim=start=${sourceIn}:end=${sourceOut},setpts=PTS-STARTPTS,${resize},fps=${frameRate},setsar=1[v${index}]`;
}

function sourceAudioFilter(index, edit) {
  const sourceIn = Number(edit.source_in_seconds);
  const sourceOut = Number(edit.source_out_seconds);
  return `[${index}:a]atrim=start=${sourceIn}:end=${sourceOut},asetpts=PTS-STARTPTS[a${index}]`;
}

function buildConcatFilters(edits, includeSourceAudio, profile) {
  const filters = [];
  edits.forEach((edit, index) => {
    filters.push(videoFilter(index, edit, profile));
    if (includeSourceAudio) filters.push(sourceAudioFilter(index, edit));
  });

  if (includeSourceAudio) {
    filters.push(
      `${edits.map((_, index) => `[v${index}][a${index}]`).join("")}concat=n=${edits.length}:v=1:a=1[basev][basea]`,
    );
  } else {
    filters.push(
      `${edits.map((_, index) => `[v${index}]`).join("")}concat=n=${edits.length}:v=1:a=0[basev]`,
    );
  }

  return filters;
}

function audioTrackFilter(inputIndex, outputIndex, track = {}, timelineDuration) {
  const timelineIn = Math.max(0, finite(track.timeline_in_seconds ?? track.timelineInSeconds) || 0);
  const sourceIn = Math.max(0, finite(track.source_in_seconds ?? track.sourceInSeconds) || 0);
  const duration = positive(track.duration_seconds ?? track.durationSeconds);
  const sourceOut = duration ? sourceIn + duration : null;
  const delayMs = Math.round(timelineIn * 1000);
  const gain = finite(track.gain);
  const parts = [];

  if (sourceOut) parts.push(`atrim=start=${sourceIn}:end=${sourceOut}`);
  else if (sourceIn) parts.push(`atrim=start=${sourceIn}`);
  parts.push("asetpts=PTS-STARTPTS");
  if (gain !== null) parts.push(`volume=${gain}`);
  if (delayMs > 0) parts.push(`adelay=${delayMs}:all=1`);
  if (timelineDuration) parts.push(`atrim=duration=${timelineDuration}`);

  return `[${inputIndex}:a]${parts.join(",")}[exta${outputIndex}]`;
}

function overlayFilter(inputIndex, outputIndex, overlay = {}) {
  const start = Math.max(0, finite(overlay.timeline_in_seconds ?? overlay.timelineInSeconds) || 0);
  const duration = positive(overlay.duration_seconds ?? overlay.durationSeconds);
  const end = duration ? start + duration : null;
  const width = positive(overlay.width);
  const height = positive(overlay.height);
  const opacity = finite(overlay.opacity);
  const x = overlay.x ?? 0;
  const y = overlay.y ?? 0;
  const operations = [];

  if (width || height) {
    operations.push(`scale=${width || -1}:${height || -1}`);
  }
  if (opacity !== null) {
    operations.push("format=rgba");
    operations.push(`colorchannelmixer=aa=${Math.max(0, Math.min(1, opacity))}`);
  }
  operations.push("setpts=PTS-STARTPTS");
  const prepared = operations.length ? operations.join(",") : "setpts=PTS-STARTPTS";
  const enable = end !== null
    ? `:enable='between(t,${start},${end})'`
    : `:enable='gte(t,${start})'`;

  return {
    prepare: `[${inputIndex}:v]${prepared}[ov${outputIndex}]`,
    overlay: `[video${outputIndex}][ov${outputIndex}]overlay=x=${x}:y=${y}${enable}[video${outputIndex + 1}]`,
  };
}

function subtitleFilter(inputIndex, style = null) {
  const styleValue = style
    ? `:force_style='${String(style).replace(/'/g, "\\'")}'`
    : "";
  return `[videoout][${inputIndex}:s]subtitles${styleValue}[subtitled]`;
}

async function uploadRender({ organizationId, projectId, renderId, outputPath, profile, policy }) {
  const bucket =
    policy.render_bucket ||
    policy.renderBucket ||
    process.env.CREATIVE_MEDIA_RENDER_BUCKET ||
    null;
  if (!bucket) throw new Error("RENDER_STORAGE_BUCKET_REQUIRED");

  const ext = extension(profile);
  const filename = `${safeSegment(profile.id || profile.name)}.${ext}`;
  const storagePath = [
    safeSegment(organizationId),
    safeSegment(projectId),
    "renders",
    safeSegment(renderId),
    filename,
  ].join("/");
  const buffer = await fs.readFile(outputPath);
  const checksum = crypto.createHash("sha256").update(buffer).digest("hex");
  const uploadOptions = {
    contentType: profile.mime_type || profile.mimeType || contentType(ext),
    upsert: false,
  };
  const cacheControl =
    policy.render_cache_control ||
    policy.renderCacheControl ||
    process.env.CREATIVE_MEDIA_RENDER_CACHE_CONTROL ||
    null;
  if (cacheControl) uploadOptions.cacheControl = String(cacheControl);

  const { error } = await supabaseAdmin.storage
    .from(bucket)
    .upload(storagePath, buffer, uploadOptions);
  if (error) throw error;

  const { data } = supabaseAdmin.storage
    .from(bucket)
    .getPublicUrl(storagePath);

  return {
    bucket,
    storage_path: storagePath,
    url: data.publicUrl,
    checksum,
    file_size_bytes: buffer.length,
    mime_type: uploadOptions.contentType,
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
    const identity = renderIdentity(timeline, profile, tracks || {});
    const projectNodes = await AssetGraphRepository.listByProject({
      organization_id,
      creative_project_id: timeline.creative_project_id,
    });
    const existing = !force
      ? projectNodes.find((node) =>
          node.type === CREATIVE_ASSET_NODE_TYPES.FINAL_RENDER &&
          node.metadata?.render_identity === identity,
        )
      : null;
    if (existing) return { render: existing, reused: true };

    const ffmpegPath =
      policy.ffmpeg_path ||
      policy.ffmpegPath ||
      process.env.CREATIVE_MEDIA_FFMPEG_PATH ||
      null;
    if (!ffmpegPath) throw new Error("FFMPEG_NOT_CONFIGURED");

    const timeoutMs = positive(
      policy.render_timeout_ms ||
      policy.renderTimeoutMs ||
      process.env.CREATIVE_MEDIA_RENDER_TIMEOUT_MS,
    );
    const includeSourceAudio =
      profile.include_source_audio === true ||
      profile.includeSourceAudio === true;
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-render-"));
    const materialized = [];

    try {
      const args = ["-y"];
      for (const edit of edits) {
        const source = await materializeMedia({
          url: edit.source_url,
          file_name: `source-${edit.index || materialized.length + 1}`,
          policy,
        });
        materialized.push(source);
        args.push("-i", source.file_path);
      }

      const audioTracks = Array.isArray(tracks.audio) ? tracks.audio : [];
      const audioInputs = [];
      for (const track of audioTracks) {
        const assetId = track.asset_node_id || track.assetNodeId;
        const node = await AssetGraphRepository.getById(assetId);
        if (!node || node.organization_id !== organization_id) {
          throw new Error("Audio track asset not found");
        }
        const source = await materializeNode(node, policy);
        const inputIndex = edits.length + audioInputs.length;
        materialized.push(source);
        args.push("-i", source.file_path);
        audioInputs.push({ inputIndex, track, node });
      }

      const overlays = Array.isArray(tracks.overlays) ? tracks.overlays : [];
      const overlayInputs = [];
      for (const overlay of overlays) {
        const assetId = overlay.asset_node_id || overlay.assetNodeId;
        const node = await AssetGraphRepository.getById(assetId);
        if (!node || node.organization_id !== organization_id) {
          throw new Error("Overlay asset not found");
        }
        const source = await materializeNode(node, policy);
        const inputIndex = edits.length + audioInputs.length + overlayInputs.length;
        materialized.push(source);
        args.push("-i", source.file_path);
        overlayInputs.push({ inputIndex, overlay, node });
      }

      let subtitleInput = null;
      const subtitleAssetId = tracks.subtitle_asset_node_id || tracks.subtitleAssetNodeId;
      if (subtitleAssetId) {
        const node = await AssetGraphRepository.getById(subtitleAssetId);
        if (!node || node.organization_id !== organization_id) {
          throw new Error("Subtitle asset not found");
        }
        const source = await materializeNode(node, policy);
        subtitleInput = {
          inputIndex: edits.length + audioInputs.length + overlayInputs.length,
          node,
        };
        materialized.push(source);
        args.push("-i", source.file_path);
      }

      const filters = buildConcatFilters(edits, includeSourceAudio, profile);
      filters.push("[basev]null[video0]");

      overlayInputs.forEach(({ inputIndex, overlay }, index) => {
        const layer = overlayFilter(inputIndex, index, overlay);
        filters.push(layer.prepare, layer.overlay);
      });
      const videoOutputLabel = overlayInputs.length
        ? `video${overlayInputs.length}`
        : "video0";
      filters.push(`[${videoOutputLabel}]null[videoout]`);

      if (subtitleInput && (profile.subtitle_mode || profile.subtitleMode) === "burn") {
        filters.push(subtitleFilter(
          subtitleInput.inputIndex,
          profile.subtitle_style || profile.subtitleStyle || null,
        ));
      }

      const timelineDuration = positive(timeline.technical?.duration_seconds);
      audioInputs.forEach(({ inputIndex, track }, index) => {
        filters.push(audioTrackFilter(inputIndex, index, track, timelineDuration));
      });

      const mixInputs = [];
      if (includeSourceAudio) mixInputs.push("[basea]");
      audioInputs.forEach((_, index) => mixInputs.push(`[exta${index}]`));
      if (mixInputs.length > 1) {
        const normalize = profile.audio_mix_normalize === true || profile.audioMixNormalize === true ? 1 : 0;
        filters.push(`${mixInputs.join("")}amix=inputs=${mixInputs.length}:normalize=${normalize}[audioout]`);
      } else if (mixInputs.length === 1) {
        filters.push(`${mixInputs[0]}anull[audioout]`);
      }

      const outputPath = path.join(directory, `render.${extension(profile)}`);
      args.push("-filter_complex", filters.join(";"));
      const mappedVideo =
        subtitleInput && (profile.subtitle_mode || profile.subtitleMode) === "burn"
          ? "[subtitled]"
          : "[videoout]";
      args.push("-map", mappedVideo);
      if (mixInputs.length) args.push("-map", "[audioout]");
      if (subtitleInput && (profile.subtitle_mode || profile.subtitleMode) === "mux") {
        args.push("-map", `${subtitleInput.inputIndex}:s:0`);
      }

      args.push(
        "-c:v",
        String(profile.video_codec || profile.videoCodec),
        "-r",
        String(profile.frame_rate || profile.frameRate),
      );
      if (profile.pixel_format || profile.pixelFormat) {
        args.push("-pix_fmt", String(profile.pixel_format || profile.pixelFormat));
      }
      if (profile.video_bitrate || profile.videoBitrate) {
        args.push("-b:v", String(profile.video_bitrate || profile.videoBitrate));
      }
      if (profile.video_options && typeof profile.video_options === "object") {
        for (const [key, value] of Object.entries(profile.video_options)) {
          args.push(`-${key}`, String(value));
        }
      }

      if (mixInputs.length) {
        if (!profile.audio_codec && !profile.audioCodec) {
          throw new Error("EXPORT_AUDIO_CODEC_REQUIRED");
        }
        args.push("-c:a", String(profile.audio_codec || profile.audioCodec));
        if (profile.audio_bitrate || profile.audioBitrate) {
          args.push("-b:a", String(profile.audio_bitrate || profile.audioBitrate));
        }
        if (profile.sample_rate || profile.sampleRate) {
          args.push("-ar", String(profile.sample_rate || profile.sampleRate));
        }
        if (profile.audio_channels || profile.audioChannels) {
          args.push("-ac", String(profile.audio_channels || profile.audioChannels));
        }
      }

      if (subtitleInput && (profile.subtitle_mode || profile.subtitleMode) === "mux") {
        if (!profile.subtitle_codec && !profile.subtitleCodec) {
          throw new Error("EXPORT_SUBTITLE_CODEC_REQUIRED");
        }
        args.push("-c:s", String(profile.subtitle_codec || profile.subtitleCodec));
      }
      if (timelineDuration) args.push("-t", String(timelineDuration));
      args.push(outputPath);

      await runProcess(ffmpegPath, args, timeoutMs);
      const renderId = crypto.randomUUID();
      const uploaded = await uploadRender({
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
        audio_expected: mixInputs.length > 0,
      });
      const node = createCreativeAssetNode({
        id: renderId,
        organization_id,
        creative_project_id: timeline.creative_project_id,
        parent_asset_node_id: timeline.id,
        type: CREATIVE_ASSET_NODE_TYPES.FINAL_RENDER,
        status: qc.passed
          ? CREATIVE_ASSET_NODE_STATUS.REVIEW
          : CREATIVE_ASSET_NODE_STATUS.REJECTED,
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
          render_identity: identity,
          timeline_asset_node_id: timeline.id,
          export_profile: profile,
          tracks,
          ffmpeg_argument_summary: {
            source_count: edits.length,
            external_audio_count: audioInputs.length,
            overlay_count: overlayInputs.length,
            subtitle_mode: profile.subtitle_mode || profile.subtitleMode || null,
          },
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
      await Promise.all(materialized.map((item) => item.cleanup()));
      await fs.rm(directory, { recursive: true, force: true });
    }
  },
};
