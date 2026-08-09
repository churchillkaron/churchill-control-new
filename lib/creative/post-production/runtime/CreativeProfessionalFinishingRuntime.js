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
  ShotRuntime,
} from "@/lib/creative/shots/runtime/ShotRuntime";

const CONTRACT = "CREATIVE_PROFESSIONAL_FINISHING_V1";
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

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function safe(value, fallback = "render") {
  return String(value || fallback)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || fallback;
}

function extension(profile = {}) {
  return safe(
    String(profile.extension || profile.container || "mp4")
      .replace(/^\./, "")
      .toLowerCase(),
    "mp4",
  );
}

function mime(ext) {
  return ({
    mp4: "video/mp4",
    mov: "video/quicktime",
    mkv: "video/x-matroska",
    webm: "video/webm",
  })[ext] || "application/octet-stream";
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
        finish(new Error("PROFESSIONAL_FINISHING_TIMEOUT"));
      }, timeoutMs);
    }

    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", finish);
    child.on("close", (code) => {
      if (code !== 0) {
        finish(new Error(
          Buffer.concat(stderr).toString("utf8") ||
          `PROFESSIONAL_FINISHING_EXIT_${code}`,
        ));
        return;
      }
      finish();
    });
  });
}

function hasAudio(node = {}) {
  const technical = object(node.technical);
  if (technical.audio_codec) return true;
  return list(technical.streams)
    .some((stream) => stream.codec_type === "audio");
}

function transition(value) {
  const source = typeof value === "string" ? { type: value } : object(value);
  const corpus = text(
    source.type || source.name || source.style || source.transition || value,
  ).toLowerCase();
  const configuredDuration = positive(
    source.duration_seconds ?? source.durationSeconds ?? source.duration,
  );
  const duration = clamp(configuredDuration || 0.24, 0.08, 0.75);

  if (!corpus || /\b(cut|hard cut|match cut|smash cut|straight cut)\b/.test(corpus)) {
    return { type: "CUT", duration_seconds: 0 };
  }
  if (/\b(fade|dip|black|white)\b/.test(corpus)) {
    return { type: "FADE", duration_seconds: duration };
  }
  if (/\b(dissolve|crossfade|cross fade|blend)\b/.test(corpus)) {
    return { type: "DISSOLVE_ENVELOPE", duration_seconds: duration };
  }
  return { type: "CUT", duration_seconds: 0 };
}

function serialized(value) {
  try {
    return JSON.stringify(value || {}).toLowerCase();
  } catch {
    return "";
  }
}

function gradeFilters(shot = {}) {
  const corpus = [
    serialized(shot.lighting),
    serialized(shot.production_design),
    serialized(shot.metadata?.visual_style),
    serialized(shot.metadata?.color),
  ].join(" ");
  const filters = [];
  let contrast = 1;
  let saturation = 1;

  if (/\b(warm|golden|amber|tungsten|sunset)\b/.test(corpus)) {
    filters.push("colorbalance=rs=.045:gs=.015:bs=-.035");
  } else if (/\b(cool|steel|cyan|blue hour|moonlight)\b/.test(corpus)) {
    filters.push("colorbalance=rs=-.03:gs=.005:bs=.045");
  }

  if (/\b(high contrast|hard contrast|deep blacks|punchy contrast)\b/.test(corpus)) {
    contrast = 1.08;
  } else if (/\b(low contrast|soft contrast|gentle contrast|milky)\b/.test(corpus)) {
    contrast = 0.95;
  }

  if (/\b(desaturated|muted|restrained saturation|monochrome)\b/.test(corpus)) {
    saturation = 0.82;
  } else if (/\b(vibrant|rich saturation|saturated|colour rich|color rich)\b/.test(corpus)) {
    saturation = 1.07;
  }

  if (contrast !== 1 || saturation !== 1) {
    filters.push(`eq=contrast=${contrast}:saturation=${saturation}`);
  }
  return filters;
}

function vfxFilters(shot = {}) {
  const corpus = serialized(shot.vfx);
  const filters = [];
  if (/\b(vignette|edge falloff)\b/.test(corpus)) {
    filters.push("vignette=PI/5");
  }
  if (/\b(film grain|grain|organic noise|texture noise)\b/.test(corpus)) {
    filters.push("noise=alls=2:allf=t+u");
  }
  if (/\b(sharpen|micro contrast|detail enhancement)\b/.test(corpus)) {
    filters.push("unsharp=5:5:0.35:5:5:0");
  }
  return filters;
}

function escapeDrawtext(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/:/g, "\\:")
    .replace(/%/g, "\\%")
    .replace(/,/g, "\\,")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/\r?\n/g, "\\n");
}

function titleEntries(shot = {}, duration = 0) {
  const graphics = object(shot.graphics);
  const titles = list(graphics.titles || shot.typography?.titles);
  return titles
    .map((entry) => typeof entry === "string" ? { text: entry } : object(entry))
    .map((entry) => ({
      text: text(entry.text || entry.title || entry.copy || entry.content || entry.label),
      position: text(entry.position || entry.placement || "BOTTOM").toUpperCase(),
      start_seconds: clamp(number(entry.start_seconds ?? entry.startSeconds) || 0.12, 0, Math.max(0, duration)),
      duration_seconds: positive(entry.duration_seconds ?? entry.durationSeconds) || Math.min(3, Math.max(0.5, duration - 0.12)),
    }))
    .filter((entry) => entry.text);
}

function drawtextFilter(title, segmentDuration) {
  const start = clamp(title.start_seconds, 0, Math.max(0, segmentDuration));
  const end = clamp(start + title.duration_seconds, start, Math.max(start, segmentDuration));
  const y = title.position.includes("TOP")
    ? "h*0.10"
    : title.position.includes("CENTER") || title.position.includes("MIDDLE")
      ? "(h-text_h)/2"
      : "h*0.82";
  return [
    `drawtext=text='${escapeDrawtext(title.text)}'`,
    "x=(w-text_w)/2",
    `y=${y}`,
    "fontsize=h/18",
    "fontcolor=white",
    "borderw=2",
    "bordercolor=black@0.55",
    `enable='between(t,${start.toFixed(3)},${end.toFixed(3)})'`,
  ].join(":");
}

function audioGain(shot = {}) {
  const audio = object(shot.audio);
  const silence = text(audio.silence || shot.sound_design?.silence).toLowerCase();
  if (!silence || /\b(no|none|without|not required|no intentional)\b/.test(silence)) {
    return 1;
  }
  if (/\b(silence|silent|mute|drop out|dropout|no sound)\b/.test(silence)) {
    return 0.04;
  }
  return 1;
}

function directorControls(shot = {}, duration = 0) {
  return {
    shot_id: shot.id || null,
    target_duration_seconds: positive(shot.duration_seconds),
    transition_in: transition(shot.transition_in),
    transition_out: transition(shot.transition_out),
    grade_filters: gradeFilters(shot),
    vfx_filters: vfxFilters(shot),
    titles: titleEntries(shot, duration),
    audio_gain: audioGain(shot),
  };
}

function requirementShotId(timeline = {}, edit = {}) {
  const index = Number(edit.requirement_index);
  if (!Number.isInteger(index) || index < 0) return null;
  const requirement = list(timeline.metadata?.requirements)[index];
  return requirement?.shot_id || null;
}

function buildSegments(timeline = {}, shots = []) {
  const shotMap = new Map(shots.map((shot) => [String(shot.id), shot]));
  const edits = list(timeline.metadata?.edit_decision_list);
  const segments = edits.map((edit, index) => {
    const inputDuration = positive(edit.duration_seconds) ||
      positive(Number(edit.timeline_out_seconds) - Number(edit.timeline_in_seconds)) ||
      positive(Number(edit.source_out_seconds) - Number(edit.source_in_seconds));
    if (!inputDuration) throw new Error(`PROFESSIONAL_FINISHING_EDIT_DURATION_REQUIRED:${index + 1}`);
    const shotId = requirementShotId(timeline, edit);
    const shot = shotId ? shotMap.get(String(shotId)) || null : null;
    return {
      index,
      edit,
      shot,
      input_start_seconds: number(edit.timeline_in_seconds) || 0,
      input_end_seconds: (number(edit.timeline_in_seconds) || 0) + inputDuration,
      input_duration_seconds: inputDuration,
      controls: directorControls(shot || {}, inputDuration),
    };
  });

  const completeDirectorCoverage = segments.length > 0 &&
    segments.every((segment) => segment.shot && positive(segment.controls.target_duration_seconds));
  const directorDuration = completeDirectorCoverage
    ? segments.reduce((sum, segment) => sum + segment.controls.target_duration_seconds, 0)
    : null;
  const timelineDuration = positive(timeline.technical?.duration_seconds);
  const exactDirectorCoverage = completeDirectorCoverage && timelineDuration &&
    Math.abs(directorDuration - timelineDuration) <= 0.05;

  let retimingSafe = Boolean(exactDirectorCoverage);
  if (retimingSafe) {
    for (const segment of segments) {
      const speed = segment.input_duration_seconds / segment.controls.target_duration_seconds;
      if (speed < 0.5 || speed > 2) {
        retimingSafe = false;
        break;
      }
    }
  }

  return {
    segments: segments.map((segment) => {
      const outputDuration = retimingSafe
        ? segment.controls.target_duration_seconds
        : segment.input_duration_seconds;
      return {
        ...segment,
        output_duration_seconds: outputDuration,
        playback_speed: segment.input_duration_seconds / outputDuration,
      };
    }),
    director_cut_timing_applied: retimingSafe,
    complete_director_coverage: completeDirectorCoverage,
    exact_director_duration_coverage: Boolean(exactDirectorCoverage),
  };
}

function hasFinishingIntent(segment) {
  const controls = segment.controls;
  return Boolean(
    controls.grade_filters.length ||
    controls.vfx_filters.length ||
    controls.titles.length ||
    controls.audio_gain !== 1 ||
    controls.transition_in.type !== "CUT" ||
    controls.transition_out.type !== "CUT" ||
    Math.abs(segment.playback_speed - 1) > 0.001
  );
}

function fadeFilters(transitionIn, transitionOut, duration) {
  const filters = [];
  if (transitionIn.type !== "CUT") {
    const d = Math.min(transitionIn.duration_seconds, duration / 3);
    if (d > 0.01) filters.push(`fade=t=in:st=0:d=${d.toFixed(3)}`);
  }
  if (transitionOut.type !== "CUT") {
    const d = Math.min(transitionOut.duration_seconds, duration / 3);
    if (d > 0.01) {
      filters.push(`fade=t=out:st=${Math.max(0, duration - d).toFixed(3)}:d=${d.toFixed(3)}`);
    }
  }
  return filters;
}

function audioFadeFilters(transitionIn, transitionOut, duration) {
  const filters = [];
  if (transitionIn.type !== "CUT") {
    const d = Math.min(transitionIn.duration_seconds, duration / 3);
    if (d > 0.01) filters.push(`afade=t=in:st=0:d=${d.toFixed(3)}`);
  }
  if (transitionOut.type !== "CUT") {
    const d = Math.min(transitionOut.duration_seconds, duration / 3);
    if (d > 0.01) {
      filters.push(`afade=t=out:st=${Math.max(0, duration - d).toFixed(3)}:d=${d.toFixed(3)}`);
    }
  }
  return filters;
}

function videoSegmentFilter(segment, outputIndex) {
  const controls = segment.controls;
  const filters = [
    `trim=start=${segment.input_start_seconds}:end=${segment.input_end_seconds}`,
    `setpts=(PTS-STARTPTS)/${segment.playback_speed}`,
    ...controls.grade_filters,
    ...controls.vfx_filters,
    ...fadeFilters(
      controls.transition_in,
      controls.transition_out,
      segment.output_duration_seconds,
    ),
    ...controls.titles.map((title) =>
      drawtextFilter(title, segment.output_duration_seconds)),
    "setsar=1",
  ];
  return `[0:v]${filters.join(",")}[v${outputIndex}]`;
}

function audioSegmentFilter(segment, outputIndex) {
  const controls = segment.controls;
  const filters = [
    `atrim=start=${segment.input_start_seconds}:end=${segment.input_end_seconds}`,
    "asetpts=PTS-STARTPTS",
  ];
  if (Math.abs(segment.playback_speed - 1) > 0.001) {
    filters.push(`atempo=${segment.playback_speed}`);
  }
  if (controls.audio_gain !== 1) {
    filters.push(`volume=${controls.audio_gain}`);
  }
  filters.push(...audioFadeFilters(
    controls.transition_in,
    controls.transition_out,
    segment.output_duration_seconds,
  ));
  return `[0:a]${filters.join(",")}[a${outputIndex}]`;
}

function finishingIdentity({ baseRender, timeline, segments, profile }) {
  return crypto.createHash("sha256").update(JSON.stringify({
    contract: CONTRACT,
    base_render_id: baseRender.id,
    base_checksum: baseRender.technical?.checksum || null,
    timeline_id: timeline.id,
    profile,
    segments: segments.map((segment) => ({
      input_start_seconds: segment.input_start_seconds,
      input_end_seconds: segment.input_end_seconds,
      output_duration_seconds: segment.output_duration_seconds,
      playback_speed: segment.playback_speed,
      controls: segment.controls,
    })),
  })).digest("hex");
}

async function upload({
  organizationId,
  projectId,
  renderId,
  outputPath,
  profile,
  policy,
}) {
  const bucket =
    policy.render_bucket ||
    policy.renderBucket ||
    process.env.CREATIVE_MEDIA_RENDER_BUCKET ||
    null;
  if (!bucket) throw new Error("RENDER_STORAGE_BUCKET_REQUIRED");

  const ext = extension(profile);
  const storagePath = [
    safe(organizationId),
    safe(projectId),
    "renders",
    safe(renderId),
    `professional-finish.${ext}`,
  ].join("/");
  const buffer = await fs.readFile(outputPath);
  const contentType = profile.mime_type || profile.mimeType || mime(ext);
  const options = { contentType, upsert: false };
  const cacheControl =
    policy.render_cache_control ||
    policy.renderCacheControl ||
    process.env.CREATIVE_MEDIA_RENDER_CACHE_CONTROL;
  if (cacheControl) options.cacheControl = String(cacheControl);

  const { error } = await supabaseAdmin.storage
    .from(bucket)
    .upload(storagePath, buffer, options);
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

function reportFor(plan, applied, reason = null) {
  return {
    contract: CONTRACT,
    applied,
    reason,
    director_cut_timing_applied: plan.director_cut_timing_applied,
    complete_director_coverage: plan.complete_director_coverage,
    exact_director_duration_coverage: plan.exact_director_duration_coverage,
    segment_count: plan.segments.length,
    controlled_segment_count: plan.segments.filter(hasFinishingIntent).length,
  };
}

export const CreativeProfessionalFinishingRuntime = Object.freeze({
  contract: CONTRACT,

  async finish({
    organization_id,
    timeline_asset_node_id,
    base_render,
    export_profile = {},
    policy = {},
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!timeline_asset_node_id) throw new Error("timeline_asset_node_id required");
    if (!base_render?.id || !base_render?.url) {
      throw new Error("BASE_RENDER_ASSET_REQUIRED");
    }
    if (base_render.organization_id !== organization_id) {
      throw new Error("BASE_RENDER_ORGANIZATION_MISMATCH");
    }

    const timeline = await AssetGraphRepository.getById(timeline_asset_node_id);
    if (!timeline || timeline.organization_id !== organization_id) {
      throw new Error("Timeline asset node not found");
    }
    const shots = await ShotRuntime.list({
      organization_id,
      creative_project_id: timeline.creative_project_id,
    });
    const plan = buildSegments(timeline, shots);
    if (!plan.segments.some(hasFinishingIntent)) {
      return {
        render: base_render,
        technical_qc: base_render.metadata?.technical_qc || null,
        report: reportFor(plan, false, "NO_EXECUTABLE_FINISHING_INTENT"),
        reused: true,
      };
    }

    const identity = finishingIdentity({
      baseRender: base_render,
      timeline,
      segments: plan.segments,
      profile: export_profile,
    });
    const nodes = await AssetGraphRepository.listByProject({
      organization_id,
      creative_project_id: timeline.creative_project_id,
    });
    const existing = nodes.find((node) =>
      node.type === CREATIVE_ASSET_NODE_TYPES.FINAL_RENDER &&
      node.metadata?.finishing_identity === identity,
    );
    if (existing) {
      return {
        render: existing,
        technical_qc: existing.metadata?.technical_qc || null,
        report: existing.metadata?.professional_finishing || reportFor(plan, true),
        reused: true,
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

    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "avantiqo-finishing-"),
    );
    const source = await materializeMedia({
      url: base_render.url,
      file_name: base_render.name || null,
      mime_type: base_render.technical?.mime_type || null,
      organization_id,
      policy,
    });

    try {
      const audio = hasAudio(base_render);
      const filters = [];
      plan.segments.forEach((segment, index) => {
        filters.push(videoSegmentFilter(segment, index));
        if (audio) filters.push(audioSegmentFilter(segment, index));
      });
      filters.push(audio
        ? `${plan.segments.map((_, index) => `[v${index}][a${index}]`).join("")}concat=n=${plan.segments.length}:v=1:a=1[vout][aout]`
        : `${plan.segments.map((_, index) => `[v${index}]`).join("")}concat=n=${plan.segments.length}:v=1:a=0[vout]`);

      const outputPath = path.join(directory, `professional-finish.${extension(export_profile)}`);
      const args = [
        "-y",
        "-i",
        source.file_path,
        "-filter_complex",
        filters.join(";"),
        "-map",
        "[vout]",
      ];
      if (audio) args.push("-map", "[aout]");
      const subtitleMode = export_profile.subtitle_mode || export_profile.subtitleMode;
      if (subtitleMode === "mux") {
        args.push("-map", "0:s?");
      }
      args.push("-c:v", String(export_profile.video_codec || export_profile.videoCodec));
      if (export_profile.frame_rate || export_profile.frameRate) {
        args.push("-r", String(export_profile.frame_rate || export_profile.frameRate));
      }
      if (export_profile.pixel_format || export_profile.pixelFormat) {
        args.push("-pix_fmt", String(export_profile.pixel_format || export_profile.pixelFormat));
      }
      if (export_profile.video_bitrate || export_profile.videoBitrate) {
        args.push("-b:v", String(export_profile.video_bitrate || export_profile.videoBitrate));
      }
      if (audio) {
        const audioCodec = export_profile.audio_codec || export_profile.audioCodec;
        if (!audioCodec) throw new Error("EXPORT_AUDIO_CODEC_REQUIRED");
        args.push("-c:a", String(audioCodec));
        if (export_profile.audio_bitrate || export_profile.audioBitrate) {
          args.push("-b:a", String(export_profile.audio_bitrate || export_profile.audioBitrate));
        }
        if (export_profile.sample_rate || export_profile.sampleRate) {
          args.push("-ar", String(export_profile.sample_rate || export_profile.sampleRate));
        }
        if (export_profile.audio_channels || export_profile.audioChannels) {
          args.push("-ac", String(export_profile.audio_channels || export_profile.audioChannels));
        }
      }
      const subtitleModeForCodec = export_profile.subtitle_mode || export_profile.subtitleMode;
      if (subtitleModeForCodec === "mux") {
        args.push("-c:s", String(export_profile.subtitle_codec || export_profile.subtitleCodec || "copy"));
      }
      args.push(outputPath);

      await run(ffmpegPath, args, timeoutMs);
      const renderId = crypto.randomUUID();
      const uploaded = await upload({
        organizationId: organization_id,
        projectId: timeline.creative_project_id,
        renderId,
        outputPath,
        profile: export_profile,
        policy,
      });
      const inspection = await CreativeMediaInspectionRuntime.inspect({
        url: uploaded.url,
        file_name: path.basename(outputPath),
        mime_type: uploaded.mime_type,
        organization_id,
        policy,
      });
      const expectedDuration = plan.segments.reduce(
        (sum, segment) => sum + segment.output_duration_seconds,
        0,
      );
      const qc = CreativeRenderTechnicalQualityRuntime.evaluate({
        technical: inspection.technical || {},
        profile: export_profile,
        expected_duration_seconds: expectedDuration,
        audio_expected: audio,
      });
      const report = reportFor(plan, true);
      const node = createCreativeAssetNode({
        id: renderId,
        organization_id,
        creative_project_id: timeline.creative_project_id,
        parent_asset_node_id: base_render.id,
        type: CREATIVE_ASSET_NODE_TYPES.FINAL_RENDER,
        status: qc.passed
          ? CREATIVE_ASSET_NODE_STATUS.REVIEW
          : CREATIVE_ASSET_NODE_STATUS.REJECTED,
        name: `${base_render.name || "Creative master"} - professional finish`,
        description: "Director-controlled professional finishing master",
        url: uploaded.url,
        storage_path: uploaded.storage_path,
        lineage: {
          source: "professional_finishing",
          capability: "creative.post_production.finish",
          generation_version: 1,
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
          tags: ["professional-finishing", "director-controlled"],
        },
        reuse: {
          reusable: false,
          approved_for_reuse: false,
        },
        review: {
          ai_reviewed: true,
          human_reviewed: false,
          approved: false,
          notes: qc.passed
            ? "Professional finishing technical QC passed"
            : "Professional finishing technical QC failed",
        },
        metadata: {
          finishing_identity: identity,
          professional_finishing: report,
          professional_finishing_contract: CONTRACT,
          base_render_asset_node_id: base_render.id,
          timeline_asset_node_id: timeline.id,
          director_cut_timing_applied: plan.director_cut_timing_applied,
          segment_controls: plan.segments.map((segment) => ({
            shot_id: segment.controls.shot_id,
            input_start_seconds: segment.input_start_seconds,
            input_end_seconds: segment.input_end_seconds,
            output_duration_seconds: segment.output_duration_seconds,
            playback_speed: segment.playback_speed,
            transition_in: segment.controls.transition_in,
            transition_out: segment.controls.transition_out,
            grade_filters: segment.controls.grade_filters,
            vfx_filters: segment.controls.vfx_filters,
            title_count: segment.controls.titles.length,
            audio_gain: segment.controls.audio_gain,
          })),
          export_profile: export_profile,
          storage_bucket: uploaded.bucket,
          inspection_status: inspection.status,
          inspection_reason: inspection.reason,
          technical_qc: qc,
          created_at: new Date().toISOString(),
        },
      });

      return {
        render: await AssetGraphRepository.create(node),
        technical_qc: qc,
        report,
        reused: false,
      };
    } finally {
      await source.cleanup();
      await fs.rm(directory, { recursive: true, force: true });
    }
  },
});
