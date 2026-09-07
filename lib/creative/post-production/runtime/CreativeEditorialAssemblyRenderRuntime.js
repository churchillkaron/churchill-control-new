import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

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
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import {
  CreativeRenderTechnicalQualityRuntime,
} from "@/lib/creative/quality/runtime/CreativeRenderTechnicalQualityRuntime";
import {
  CreativeEdlRenderRuntime,
} from "./CreativeEdlRenderRuntime";
import {
  CreativeEditorialAssemblyRuntime,
} from "./CreativeEditorialAssemblyRuntime";

const CONTRACT = "AVANTIQO_EDITORIAL_ASSEMBLY_RENDER_V1";
const supabaseAdmin = getServiceSupabase();

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

function run(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "ignore", "pipe"],
    });
    const stderr = [];
    let settled = false;
    let timer = null;
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
        finish(new Error("EDITORIAL_ASSEMBLY_RENDER_TIMEOUT"));
      }, timeoutMs);
    }
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", finish);
    child.on("close", (code) => {
      if (code !== 0) {
        finish(new Error(
          Buffer.concat(stderr).toString("utf8") ||
          `EDITORIAL_ASSEMBLY_RENDER_EXIT_${code}`,
        ));
        return;
      }
      finish();
    });
  });
}

function escapeFilterPath(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'");
}

function validateProfile(profile = {}) {
  if (!profile.id && !profile.name) throw new Error("EXPORT_PROFILE_ID_REQUIRED");
  if (!profile.video_codec && !profile.videoCodec) throw new Error("EXPORT_VIDEO_CODEC_REQUIRED");
  if (!positive(profile.width) || !positive(profile.height)) throw new Error("EXPORT_DIMENSIONS_REQUIRED");
  if (!positive(profile.frame_rate ?? profile.frameRate)) throw new Error("EXPORT_FRAME_RATE_REQUIRED");
  return profile;
}

function videoChain(index, edit, profile) {
  const width = Number(profile.width);
  const height = Number(profile.height);
  const fps = Number(profile.frame_rate ?? profile.frameRate);
  const fit = String(profile.fit || "contain").toLowerCase();
  const background = String(profile.background || "black")
    .replace(/[^a-zA-Z0-9#]/g, "");
  const resize = fit === "cover"
    ? `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`
    : fit === "stretch"
      ? `scale=${width}:${height}`
      : `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:${background}`;
  return `[${index}:v]trim=start=${Number(edit.source_in_seconds)}:end=${Number(edit.source_out_seconds)},setpts=PTS-STARTPTS,${resize},fps=${fps},setsar=1[v${index}]`;
}

function audioFormat(profile) {
  return {
    sample_rate: Number(profile.sample_rate ?? profile.sampleRate),
    channel_layout: String(
      profile.audio_channel_layout ||
      profile.audioChannelLayout ||
      "stereo",
    ).replace(/[^a-zA-Z0-9_.+-]/g, ""),
  };
}

function sourceAudioEvidence(edit, nodes = []) {
  const ids = [
    edit.source_asset_node_id,
    edit.source_clip_node_id,
    edit.source_moment_node_id,
  ].filter(Boolean);
  for (const id of ids) {
    const node = nodes.find((candidate) => candidate.id === id);
    if (!node) continue;
    const technical = object(node.technical);
    if (technical.audio_codec) return true;
    const streams = list(technical.streams);
    if (streams.some((stream) => stream.codec_type === "audio")) return true;
    if (technical.stream_count !== undefined || technical.media_kind || streams.length) {
      return false;
    }
  }
  return null;
}

function sourceAudioChain(index, entry, state, profile) {
  const format = audioFormat(profile);
  const audio = object(entry.source_audio);
  const sourceIn = Number(audio.source_in_seconds);
  const sourceOut = Number(audio.source_out_seconds);
  const timelineIn = Math.max(0, Number(audio.timeline_in_seconds || 0));
  const duration = sourceOut - sourceIn;
  const filters = [];

  if (state === true) {
    filters.push(
      `[${index}:a]atrim=start=${sourceIn}:end=${sourceOut}`,
      "asetpts=PTS-STARTPTS",
      `aformat=sample_rates=${format.sample_rate}:channel_layouts=${format.channel_layout}`,
    );
  } else if (state === false) {
    filters.push(
      `anullsrc=r=${format.sample_rate}:cl=${format.channel_layout}`,
      `atrim=duration=${duration}`,
      "asetpts=PTS-STARTPTS",
    );
  } else {
    throw new Error("SOURCE_AUDIO_EVIDENCE_REQUIRED");
  }

  const fadeIn = positive(audio.fade_in_seconds);
  const fadeOut = positive(audio.fade_out_seconds);
  if (fadeIn) filters.push(`afade=t=in:st=0:d=${fadeIn}`);
  if (fadeOut) {
    filters.push(`afade=t=out:st=${Math.max(0, duration - fadeOut)}:d=${fadeOut}`);
  }
  if (timelineIn) {
    filters.push(`adelay=${Math.round(timelineIn * 1000)}:all=1`);
  }
  return `${filters.join(",")}[sa${index}]`;
}

function externalAudioChain(inputIndex, outputIndex, track, duration, profile, assembly) {
  const sourceIn = Math.max(
    0,
    number(track.source_in_seconds ?? track.sourceInSeconds) || 0,
  );
  const trackDuration = positive(
    track.duration_seconds ?? track.durationSeconds,
  );
  const originalTimelineIn = Math.max(
    0,
    number(track.timeline_in_seconds ?? track.timelineInSeconds) || 0,
  );
  const timelineIn = CreativeEditorialAssemblyRuntime.mapTimelineTime(
    assembly,
    originalTimelineIn,
  );
  const gain = number(track.gain);
  const filters = [];
  if (trackDuration) {
    filters.push(`atrim=start=${sourceIn}:end=${sourceIn + trackDuration}`);
  } else if (sourceIn) {
    filters.push(`atrim=start=${sourceIn}`);
  }
  filters.push("asetpts=PTS-STARTPTS");
  const format = audioFormat(profile);
  filters.push(`aformat=sample_rates=${format.sample_rate}:channel_layouts=${format.channel_layout}`);
  if (gain !== null) filters.push(`volume=${gain}`);
  if (timelineIn) filters.push(`adelay=${Math.round(timelineIn * 1000)}:all=1`);
  if (duration) filters.push(`atrim=duration=${duration}`);
  return `[${inputIndex}:a]${filters.join(",")}[exta${outputIndex}]`;
}

function renderIdentity(timeline, profile, tracks, assembly) {
  return crypto.createHash("sha256").update(JSON.stringify({
    timeline_id: timeline.id,
    timeline_identity: timeline.metadata?.timeline_identity || null,
    profile,
    tracks,
    assembly_hash: assembly.assembly_hash,
  })).digest("hex");
}

async function materializeNode(node, organizationId, policy) {
  if (!node?.url) throw new Error("TRACK_ASSET_URL_REQUIRED");
  return materializeMedia({
    url: node.url,
    file_name: node.name || null,
    mime_type: node.technical?.mime_type || null,
    organization_id: organizationId,
    policy,
  });
}

async function upload({ organizationId, projectId, renderId, outputPath, profile, policy }) {
  const bucket =
    policy.render_bucket ||
    policy.renderBucket ||
    process.env.CREATIVE_MEDIA_RENDER_BUCKET ||
    null;
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
  const cacheControl =
    policy.render_cache_control ||
    policy.renderCacheControl ||
    process.env.CREATIVE_MEDIA_RENDER_CACHE_CONTROL;
  if (cacheControl) uploadOptions.cacheControl = String(cacheControl);
  const { error } = await supabaseAdmin.storage
    .from(bucket)
    .upload(storagePath, buffer, uploadOptions);
  if (error) throw error;
  return {
    bucket,
    storage_path: storagePath,
    url: creativeStorageUri(bucket, storagePath),
    mime_type: contentType,
    file_size_bytes: buffer.length,
    checksum: crypto.createHash("sha256").update(buffer).digest("hex"),
  };
}

function appendVideoAssembly(filters, assembly) {
  if (assembly.entries.length === 1) return "v0";
  let current = "v0";
  for (let index = 0; index < assembly.boundaries.length; index += 1) {
    const boundary = assembly.boundaries[index];
    const nextInput = `v${index + 1}`;
    const nextOutput = `assembledv${index + 1}`;
    if (boundary.visual_mode === "XFADE") {
      filters.push(
        `[${current}][${nextInput}]xfade=transition=${boundary.ffmpeg_transition}:duration=${boundary.visual_overlap_seconds}:offset=${boundary.assembly_transition_start_seconds}[${nextOutput}]`,
      );
    } else {
      filters.push(
        `[${current}][${nextInput}]concat=n=2:v=1:a=0[${nextOutput}]`,
      );
    }
    current = nextOutput;
  }
  return current;
}

export const CreativeEditorialAssemblyRenderRuntime = Object.freeze({
  contract: CONTRACT,

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
    const assembly = await CreativeEditorialAssemblyRuntime.plan({
      organization_id,
      creative_project_id: timeline.creative_project_id,
      timeline_asset_node_id,
    });
    if (!assembly.passed) {
      const error = new Error(
        `EDITORIAL_ASSEMBLY_BLOCKED:${assembly.blockers.join(",")}`,
      );
      error.assembly = assembly;
      throw error;
    }

    if (!assembly.transition_render_required) {
      const result = await CreativeEdlRenderRuntime.render({
        organization_id,
        timeline_asset_node_id,
        export_profile,
        tracks,
        policy,
        force,
      });
      if (result.render?.id) {
        result.render = await AssetGraphRepository.update(result.render.id, {
          metadata: {
            ...object(result.render.metadata),
            editorial_assembly_render_contract: CONTRACT,
            editorial_assembly_contract: assembly.contract,
            editorial_assembly_hash: assembly.assembly_hash,
            editorial_transition_count: assembly.boundaries.length,
            editorial_transition_counts: assembly.transition_counts,
            editorial_hard_cut_fast_path: true,
          },
        });
      }
      return {
        ...result,
        assembly,
        contract: CONTRACT,
      };
    }

    const profile = validateProfile(export_profile || {});
    const renderId = crypto.randomUUID();
    const renderHash = renderIdentity(timeline, profile, tracks, assembly);
    const nodes = await AssetGraphRepository.listByProject({
      organization_id,
      creative_project_id: timeline.creative_project_id,
    });
    const existing = !force
      ? nodes.find((node) =>
          node.type === CREATIVE_ASSET_NODE_TYPES.FINAL_RENDER &&
          node.metadata?.render_identity === renderHash,
        )
      : null;
    if (existing) {
      return {
        render: existing,
        reused: true,
        assembly,
        contract: CONTRACT,
      };
    }

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
    if (includeSourceAudio) {
      if (!positive(profile.sample_rate ?? profile.sampleRate)) {
        throw new Error("SOURCE_AUDIO_SAMPLE_RATE_REQUIRED");
      }
      if (!text(profile.audio_channel_layout || profile.audioChannelLayout)) {
        throw new Error("SOURCE_AUDIO_CHANNEL_LAYOUT_REQUIRED");
      }
    }

    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-editorial-render-"));
    const materials = [];
    try {
      const args = ["-y"];
      for (const entry of assembly.entries) {
        const source = await materializeMedia({
          url: entry.source_url,
          organization_id,
          policy,
        });
        materials.push(source);
        args.push("-i", source.file_path);
      }

      let nextInputIndex = assembly.entries.length;
      const audioTracks = [];
      for (const track of list(tracks.audio)) {
        const node = await AssetGraphRepository.getById(
          track.asset_node_id || track.assetNodeId,
        );
        if (!node || node.organization_id !== organization_id) {
          throw new Error("Audio track asset not found");
        }
        const source = await materializeNode(node, organization_id, policy);
        materials.push(source);
        args.push("-i", source.file_path);
        audioTracks.push({ inputIndex: nextInputIndex, track });
        nextInputIndex += 1;
      }

      const overlays = [];
      for (const overlay of list(tracks.overlays)) {
        const node = await AssetGraphRepository.getById(
          overlay.asset_node_id || overlay.assetNodeId,
        );
        if (!node || node.organization_id !== organization_id) {
          throw new Error("Overlay asset not found");
        }
        const source = await materializeNode(node, organization_id, policy);
        materials.push(source);
        if (String(node.technical?.media_kind || node.type).toUpperCase().includes("IMAGE")) {
          args.push("-loop", "1");
        }
        args.push("-i", source.file_path);
        overlays.push({ inputIndex: nextInputIndex, overlay });
        nextInputIndex += 1;
      }

      let subtitle = null;
      const subtitleId = tracks.subtitle_asset_node_id || tracks.subtitleAssetNodeId;
      if (subtitleId) {
        if (assembly.total_visual_overlap_seconds > 0) {
          throw new Error("EDITORIAL_SUBTITLE_RETIME_REQUIRED_BEFORE_TRANSITION_RENDER");
        }
        const node = await AssetGraphRepository.getById(subtitleId);
        if (!node || node.organization_id !== organization_id) {
          throw new Error("Subtitle asset not found");
        }
        const source = await materializeNode(node, organization_id, policy);
        materials.push(source);
        subtitle = { node, source, inputIndex: nextInputIndex };
        if ((profile.subtitle_mode || profile.subtitleMode) === "mux") {
          args.push("-i", source.file_path);
          nextInputIndex += 1;
        }
      }

      const filters = [];
      assembly.entries.forEach((entry, index) => {
        filters.push(videoChain(index, entry, profile));
        if (includeSourceAudio) {
          filters.push(sourceAudioChain(
            index,
            entry,
            sourceAudioEvidence(entry, nodes),
            profile,
          ));
        }
      });
      let videoLabel = appendVideoAssembly(filters, assembly);

      overlays.forEach(({ inputIndex, overlay }, index) => {
        const originalStart = Math.max(
          0,
          number(overlay.timeline_in_seconds ?? overlay.timelineInSeconds) || 0,
        );
        const start = CreativeEditorialAssemblyRuntime.mapTimelineTime(
          assembly,
          originalStart,
        );
        const overlayDuration = positive(
          overlay.duration_seconds ?? overlay.durationSeconds,
        );
        const end = overlayDuration ? start + overlayDuration : null;
        const width = positive(overlay.width);
        const height = positive(overlay.height);
        const opacity = number(overlay.opacity);
        const prep = [];
        if (width || height) prep.push(`scale=${width || -1}:${height || -1}`);
        if (opacity !== null) {
          prep.push("format=rgba", `colorchannelmixer=aa=${Math.max(0, Math.min(1, opacity))}`);
        }
        prep.push("setpts=PTS-STARTPTS");
        filters.push(`[${inputIndex}:v]${prep.join(",")}[ov${index}]`);
        const next = `video${index}`;
        const enable = end === null
          ? `gte(t,${start})`
          : `between(t,${start},${end})`;
        filters.push(`[${videoLabel}][ov${index}]overlay=x=${overlay.x ?? 0}:y=${overlay.y ?? 0}:enable='${enable}'[${next}]`);
        videoLabel = next;
      });

      const subtitleMode = profile.subtitle_mode || profile.subtitleMode || null;
      if (subtitle && subtitleMode === "burn") {
        const escaped = escapeFilterPath(subtitle.source.file_path);
        const style = profile.subtitle_style || profile.subtitleStyle;
        const styleOption = style
          ? `:force_style='${String(style).replace(/'/g, "\\'")}'`
          : "";
        filters.push(`[${videoLabel}]subtitles='${escaped}'${styleOption}[videoout]`);
        videoLabel = "videoout";
      }

      const duration = positive(assembly.output_duration_seconds);
      const audioLabels = [];
      if (includeSourceAudio) {
        assembly.entries.forEach((_, index) => audioLabels.push(`[sa${index}]`));
      }
      audioTracks.forEach(({ inputIndex, track }, index) => {
        filters.push(
          externalAudioChain(
            inputIndex,
            index,
            track,
            duration,
            profile,
            assembly,
          ),
        );
        audioLabels.push(`[exta${index}]`);
      });
      if (audioLabels.length > 1) {
        const normalize =
          profile.audio_mix_normalize === true ||
          profile.audioMixNormalize === true
            ? 1
            : 0;
        filters.push(`${audioLabels.join("")}amix=inputs=${audioLabels.length}:normalize=${normalize}:duration=longest[audioout]`);
      } else if (audioLabels.length === 1) {
        filters.push(`${audioLabels[0]}anull[audioout]`);
      }

      const outputPath = path.join(directory, `render.${ext(profile)}`);
      args.push("-filter_complex", filters.join(";"), "-map", `[${videoLabel}]`);
      if (audioLabels.length) args.push("-map", "[audioout]");
      if (subtitle && subtitleMode === "mux") {
        args.push("-map", `${subtitle.inputIndex}:s:0`);
      }
      args.push("-c:v", String(profile.video_codec || profile.videoCodec));
      args.push("-r", String(profile.frame_rate || profile.frameRate));
      if (profile.pixel_format || profile.pixelFormat) {
        args.push("-pix_fmt", String(profile.pixel_format || profile.pixelFormat));
      }
      if (profile.video_bitrate || profile.videoBitrate) {
        args.push("-b:v", String(profile.video_bitrate || profile.videoBitrate));
      }
      if (audioLabels.length) {
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
      if (subtitle && subtitleMode === "mux") {
        if (!profile.subtitle_codec && !profile.subtitleCodec) {
          throw new Error("EXPORT_SUBTITLE_CODEC_REQUIRED");
        }
        args.push("-c:s", String(profile.subtitle_codec || profile.subtitleCodec));
      }
      if (duration) args.push("-t", String(duration));
      args.push(outputPath);

      await run(ffmpegPath, args, timeoutMs);
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
        organization_id,
        policy,
      });
      const qc = CreativeRenderTechnicalQualityRuntime.evaluate({
        technical: inspection.technical || {},
        profile,
        expected_duration_seconds: assembly.output_duration_seconds,
        audio_expected: audioLabels.length > 0,
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
          source: "governed_editorial_assembly_render",
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
          notes: qc.passed
            ? "Editorial assembly technical QC passed"
            : "Editorial assembly technical QC failed",
        },
        metadata: {
          render_identity: renderHash,
          timeline_asset_node_id: timeline.id,
          export_profile: profile,
          tracks,
          editorial_assembly_render_contract: CONTRACT,
          editorial_assembly_contract: assembly.contract,
          editorial_assembly_hash: assembly.assembly_hash,
          editorial_transition_count: assembly.boundaries.length,
          editorial_transition_counts: assembly.transition_counts,
          editorial_transition_boundaries: assembly.boundaries,
          editorial_source_gates: assembly.source_gates,
          editorial_output_duration_seconds: assembly.output_duration_seconds,
          editorial_total_visual_overlap_seconds: assembly.total_visual_overlap_seconds,
          editorial_time_map: assembly.time_map,
          source_audio_split_edits_rendered: true,
          decorative_transition_invention_forbidden: true,
          generative_morph_transition_forbidden: true,
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
        assembly,
        contract: CONTRACT,
      };
    } finally {
      await Promise.all(materials.map((material) => material.cleanup()));
      await fs.rm(directory, { recursive: true, force: true });
    }
  },
});
