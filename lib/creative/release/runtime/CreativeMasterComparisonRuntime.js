import crypto from "node:crypto";
import { spawn } from "node:child_process";

import {
  createCreativeAssetNode,
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import {
  materializeMedia,
} from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";
import {
  resolveCreativeFfmpegPath,
} from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";
import {
  creativePrimaryMasters,
} from "@/lib/creative/release/runtime/CreativeMasterVersionRuntime";

const CONTRACT = "CREATIVE_MASTER_FRAME_COMPARISON_V1";
const SSIM_CHANGE_THRESHOLD = 0.995;
const OUTPUT_LIMIT_BYTES = 8 * 1024 * 1024;

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function text(value) {
  return String(value ?? "").trim();
}

function closeEnough(left, right, tolerance = 0.0005) {
  return left !== null && right !== null && Math.abs(left - right) <= tolerance;
}

function technical(node = {}) {
  return {
    width: finite(node.technical?.width),
    height: finite(node.technical?.height),
    frame_rate:
      finite(node.technical?.frame_rate) ??
      finite(node.technical?.fps) ??
      finite(node.technical?.video_frame_rate),
    duration_seconds: finite(node.technical?.duration_seconds),
    checksum: node.technical?.checksum || null,
    audio_codec: node.technical?.audio_codec || null,
  };
}

function comparisonIdentity(left, right) {
  return crypto.createHash("sha256").update(JSON.stringify({
    contract: CONTRACT,
    left: {
      id: left.id,
      render_identity: left.metadata?.render_identity || null,
      checksum: left.technical?.checksum || null,
    },
    right: {
      id: right.id,
      render_identity: right.metadata?.render_identity || null,
      checksum: right.technical?.checksum || null,
    },
    visual_change_threshold_ssim: SSIM_CHANGE_THRESHOLD,
  })).digest("hex");
}

function appendCapped(chunks, state, chunk) {
  if (state.bytes >= OUTPUT_LIMIT_BYTES) return;
  const buffer = Buffer.from(chunk);
  const remaining = OUTPUT_LIMIT_BYTES - state.bytes;
  chunks.push(buffer.subarray(0, remaining));
  state.bytes += Math.min(buffer.length, remaining);
}

function run(command, args, timeoutMs = 300000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    const stdoutState = { bytes: 0 };
    const stderrState = { bytes: 0 };
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value);
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new Error("MASTER_COMPARISON_TIMEOUT"));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => appendCapped(stdout, stdoutState, chunk));
    child.stderr.on("data", (chunk) => appendCapped(stderr, stderrState, chunk));
    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      const output = `${Buffer.concat(stdout).toString("utf8")}\n${Buffer.concat(stderr).toString("utf8")}`;
      if (code !== 0) {
        finish(new Error(output.slice(-12000) || `MASTER_COMPARISON_EXIT_${code}`));
        return;
      }
      finish(null, output);
    });
  });
}

function parseVisual(output, frameRate) {
  const frames = [];
  const pattern = /n:\s*(\d+).*?All:\s*([0-9.]+)/g;
  for (const match of String(output || "").matchAll(pattern)) {
    const frame = Number(match[1]);
    const ssim = finite(match[2]);
    if (!Number.isInteger(frame) || ssim === null) continue;
    frames.push({
      frame_index: Math.max(0, frame - 1),
      time_seconds: Math.max(0, frame - 1) / frameRate,
      ssim,
    });
  }
  if (!frames.length) return null;

  const changed = frames.filter((frame) => frame.ssim < SSIM_CHANGE_THRESHOLD);
  const intervals = [];
  for (const frame of changed) {
    const last = intervals.at(-1);
    if (last && frame.frame_index === last.end_frame + 1) {
      last.end_frame = frame.frame_index;
      last.end_seconds = (frame.frame_index + 1) / frameRate;
      last.minimum_ssim = Math.min(last.minimum_ssim, frame.ssim);
      continue;
    }
    intervals.push({
      start_frame: frame.frame_index,
      end_frame: frame.frame_index,
      start_seconds: frame.time_seconds,
      end_seconds: (frame.frame_index + 1) / frameRate,
      minimum_ssim: frame.ssim,
    });
  }

  const values = frames.map((frame) => frame.ssim);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    exact_frame_alignment: true,
    compared_frame_count: frames.length,
    changed_frame_count: changed.length,
    changed_frame_ratio: changed.length / frames.length,
    mean_ssim: mean,
    minimum_ssim: Math.min(...values),
    maximum_ssim: Math.max(...values),
    visual_change_threshold_ssim: SSIM_CHANGE_THRESHOLD,
    changed_intervals: intervals.slice(0, 100),
    changed_intervals_total: intervals.length,
    changed_intervals_truncated: intervals.length > 100,
    worst_frames: [...frames]
      .sort((left, right) => left.ssim - right.ssim)
      .slice(0, 20),
  };
}

function parseAudio(output) {
  const source = String(output || "");
  const rms = [...source.matchAll(/RMS level dB:\s*(-?inf|-?[0-9.]+)/gi)].at(-1)?.[1] || null;
  const peak = [...source.matchAll(/Peak level dB:\s*(-?inf|-?[0-9.]+)/gi)].at(-1)?.[1] || null;
  const decode = (value) => {
    if (!value) return null;
    if (String(value).toLowerCase().includes("inf")) return null;
    return finite(value);
  };
  return {
    residual_rms_dbfs: decode(rms),
    residual_peak_dbfs: decode(peak),
    residual_is_silent_or_identical: Boolean(
      rms && String(rms).toLowerCase().includes("inf"),
    ),
    method: "PROGRAM_RESIDUAL_48KHZ_STEREO",
  };
}

function compactReport(node) {
  if (!node) return null;
  return {
    id: node.id,
    status: node.status,
    analysis_complete: node.metadata?.analysis_complete === true,
    comparison_identity: node.metadata?.master_comparison_identity || null,
    left_master_asset_node_id: node.metadata?.left_master_asset_node_id || null,
    right_master_asset_node_id: node.metadata?.right_master_asset_node_id || null,
    visual: node.metadata?.visual || null,
    audio: node.metadata?.audio || null,
    blockers: Array.isArray(node.metadata?.blockers) ? node.metadata.blockers : [],
    evaluated_at: node.metadata?.evaluated_at || node.created_at || null,
    method: node.metadata?.method || null,
  };
}

async function resolvePair({ organization_id, creative_project_id, left_master_asset_node_id, right_master_asset_node_id }) {
  const nodes = await AssetGraphRepository.listByProject({ organization_id, creative_project_id });
  const primary = creativePrimaryMasters(nodes);
  const left = primary.find((node) => node.id === left_master_asset_node_id) || null;
  const right = primary.find((node) => node.id === right_master_asset_node_id) || null;
  if (!left || !right) throw new Error("PRIMARY_MASTER_VERSION_REQUIRED");
  if (left.id === right.id) throw new Error("DISTINCT_MASTER_VERSIONS_REQUIRED");
  if (!left.url || !right.url) throw new Error("MASTER_MEDIA_REQUIRED");
  if (!left.technical?.checksum || !right.technical?.checksum) {
    throw new Error("MASTER_CHECKSUM_REQUIRED");
  }
  return { nodes, left, right };
}

function capabilities(left, right) {
  const leftTechnical = technical(left);
  const rightTechnical = technical(right);
  const dimensionsMatch = Boolean(
    leftTechnical.width && rightTechnical.width &&
    leftTechnical.height && rightTechnical.height &&
    leftTechnical.width === rightTechnical.width &&
    leftTechnical.height === rightTechnical.height,
  );
  const frameRateMatch = closeEnough(leftTechnical.frame_rate, rightTechnical.frame_rate);
  const visualExact = dimensionsMatch && frameRateMatch;
  const audio = Boolean(leftTechnical.audio_codec && rightTechnical.audio_codec);
  const blockers = [];
  if (!dimensionsMatch) blockers.push("DIMENSION_MISMATCH_EXACT_COMPARISON_UNAVAILABLE");
  if (!frameRateMatch) blockers.push("FRAME_RATE_MISMATCH_EXACT_COMPARISON_UNAVAILABLE");
  if (!audio) blockers.push("PROGRAM_AUDIO_COMPARISON_UNAVAILABLE");
  return {
    left: leftTechnical,
    right: rightTechnical,
    visual_exact_supported: visualExact,
    audio_supported: audio,
    blockers,
  };
}

export const CreativeMasterComparisonRuntime = Object.freeze({
  contract: CONTRACT,

  async inspect({
    organization_id,
    creative_project_id,
    left_master_asset_node_id,
    right_master_asset_node_id,
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");
    if (!left_master_asset_node_id || !right_master_asset_node_id) {
      throw new Error("left_master_asset_node_id and right_master_asset_node_id required");
    }
    const { nodes, left, right } = await resolvePair({
      organization_id,
      creative_project_id,
      left_master_asset_node_id,
      right_master_asset_node_id,
    });
    const identity = comparisonIdentity(left, right);
    const report = nodes
      .filter((node) =>
        node.type === CREATIVE_ASSET_NODE_TYPES.QUALITY_REPORT &&
        node.lineage?.source === "master_version_comparison" &&
        node.metadata?.master_comparison_identity === identity,
      )
      .sort((a, b) =>
        Date.parse(b.updated_at || b.created_at || 0) -
        Date.parse(a.updated_at || a.created_at || 0),
      )[0] || null;
    const support = capabilities(left, right);
    return {
      contract: CONTRACT,
      comparison_identity: identity,
      left_master_asset_node_id: left.id,
      right_master_asset_node_id: right.id,
      support,
      report: compactReport(report),
      can_analyze: Boolean(
        resolveCreativeFfmpegPath() &&
        (support.visual_exact_supported || support.audio_supported),
      ),
      blocker: resolveCreativeFfmpegPath()
        ? support.visual_exact_supported || support.audio_supported
          ? null
          : "MASTER_COMPARISON_EVIDENCE_UNAVAILABLE"
        : "FFMPEG_NOT_CONFIGURED_FOR_MASTER_COMPARISON",
    };
  },

  async analyze({
    organization_id,
    creative_project_id,
    left_master_asset_node_id,
    right_master_asset_node_id,
    force = false,
  } = {}) {
    const inspected = await this.inspect({
      organization_id,
      creative_project_id,
      left_master_asset_node_id,
      right_master_asset_node_id,
    });
    if (inspected.report && !force) {
      return { ...inspected, reused: true };
    }
    if (!inspected.can_analyze) throw new Error(inspected.blocker || "MASTER_COMPARISON_EVIDENCE_UNAVAILABLE");

    const { left, right } = await resolvePair({
      organization_id,
      creative_project_id,
      left_master_asset_node_id,
      right_master_asset_node_id,
    });
    const ffmpegPath = resolveCreativeFfmpegPath();
    const [leftMedia, rightMedia] = await Promise.all([
      materializeMedia({
        url: left.url,
        file_name: left.name || "left-master",
        mime_type: left.technical?.mime_type || null,
        organization_id,
      }),
      materializeMedia({
        url: right.url,
        file_name: right.name || "right-master",
        mime_type: right.technical?.mime_type || null,
        organization_id,
      }),
    ]);

    try {
      let visual = null;
      let audio = null;
      const support = inspected.support;
      if (support.visual_exact_supported) {
        const output = await run(ffmpegPath, [
          "-hide_banner",
          "-nostats",
          "-i", leftMedia.file_path,
          "-i", rightMedia.file_path,
          "-filter_complex",
          "[0:v]settb=AVTB,setpts=PTS-STARTPTS,format=yuv420p[left];[1:v]settb=AVTB,setpts=PTS-STARTPTS,format=yuv420p[right];[left][right]ssim=stats_file=-[v]",
          "-map", "[v]",
          "-an",
          "-shortest",
          "-f", "null",
          "-",
        ]);
        visual = parseVisual(output, support.right.frame_rate);
        if (!visual) throw new Error("MASTER_VISUAL_COMPARISON_EVIDENCE_MISSING");
      }

      if (support.audio_supported) {
        const output = await run(ffmpegPath, [
          "-hide_banner",
          "-nostats",
          "-i", leftMedia.file_path,
          "-i", rightMedia.file_path,
          "-filter_complex",
          "[0:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=PTS-STARTPTS[a0];[1:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=PTS-STARTPTS[a1];[a0][a1]amix=inputs=2:duration=shortest:dropout_transition=0:weights=1 -1:normalize=0,astats=metadata=0:reset=0[a]",
          "-map", "[a]",
          "-vn",
          "-f", "null",
          "-",
        ]);
        audio = parseAudio(output);
      }

      const node = createCreativeAssetNode({
        organization_id,
        creative_project_id,
        parent_asset_node_id: right.id,
        type: CREATIVE_ASSET_NODE_TYPES.QUALITY_REPORT,
        status: CREATIVE_ASSET_NODE_STATUS.REVIEW,
        name: `${right.name || "Current master"} comparison evidence`,
        description: "Deterministic decoded-frame and program-audio comparison evidence between two immutable primary master versions.",
        lineage: {
          source: "master_version_comparison",
          capability: "creative.master.compare",
          generation_version: 1,
        },
        intelligence: {
          safety_status: "UNKNOWN",
          tags: ["master-comparison", "frame-accurate", "ssim", "audio-residual"],
        },
        reuse: { reusable: false, approved_for_reuse: false },
        review: {
          ai_reviewed: true,
          human_reviewed: false,
          approved: false,
          notes: "Comparison evidence is review evidence only and does not approve either master.",
        },
        metadata: {
          contract: CONTRACT,
          master_comparison_identity: inspected.comparison_identity,
          left_master_asset_node_id: left.id,
          left_master_render_identity: left.metadata?.render_identity || null,
          left_master_checksum: left.technical?.checksum || null,
          right_master_asset_node_id: right.id,
          right_master_render_identity: right.metadata?.render_identity || null,
          right_master_checksum: right.technical?.checksum || null,
          analysis_complete: true,
          visual,
          audio,
          blockers: support.blockers,
          not_release_gate: true,
          method: "FFMPEG_DECODED_FRAME_SSIM_AND_PROGRAM_AUDIO_RESIDUAL_V1",
          evaluated_at: new Date().toISOString(),
        },
      });
      const claimed = await AssetGraphRepository.createOrFindByMetadataIdentity({
        node,
        metadata_key: "master_comparison_identity",
        metadata_value: inspected.comparison_identity,
      });
      return {
        ...await this.inspect({
          organization_id,
          creative_project_id,
          left_master_asset_node_id,
          right_master_asset_node_id,
        }),
        report: compactReport(claimed.node),
        reused: !claimed.created,
      };
    } finally {
      await Promise.allSettled([leftMedia.cleanup(), rightMedia.cleanup()]);
    }
  },
});

export const CREATIVE_MASTER_FRAME_COMPARISON_CONTRACT = CONTRACT;
