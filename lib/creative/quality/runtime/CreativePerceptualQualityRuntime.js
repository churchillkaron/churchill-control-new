import crypto from "node:crypto";
import { spawn } from "node:child_process";

import {
  materializeMedia,
} from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";
import {
  createCreativeAssetNode,
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function hasStream(render, type) {
  const expected = String(type || "").toLowerCase();
  if (expected === "audio" && render.technical?.audio_codec) return true;
  if (expected === "video" && render.technical?.video_codec) return true;
  return list(render.technical?.streams).some((stream) =>
    String(stream?.codec_type || stream?.media_type || "").toLowerCase() === expected,
  );
}

function run(command, args, timeoutMs = null) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const output = [];
    let timer = null;
    let settled = false;

    const finish = (error = null) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      const text = Buffer.concat(output).toString("utf8");
      if (error) reject(error);
      else resolve(text);
    };

    if (timeoutMs) {
      timer = setTimeout(() => {
        child.kill("SIGKILL");
        finish(new Error("PERCEPTUAL_QC_TIMEOUT"));
      }, timeoutMs);
    }

    child.stdout.on("data", (chunk) => output.push(chunk));
    child.stderr.on("data", (chunk) => output.push(chunk));
    child.on("error", finish);
    child.on("close", (code) => {
      if (code !== 0) {
        finish(new Error(Buffer.concat(output).toString("utf8") || `PERCEPTUAL_QC_EXIT_${code}`));
        return;
      }
      finish();
    });
  });
}

function occurrences(text, pattern, mapper) {
  const results = [];
  let match;
  while ((match = pattern.exec(text))) results.push(mapper(match));
  return results;
}

function identity(render, policy) {
  return crypto.createHash("sha256").update(JSON.stringify({
    render_id: render.id,
    checksum: render.technical?.checksum || null,
    policy,
  })).digest("hex");
}

function evaluate(events, policy) {
  const checks = [];
  const add = (id, configured, passed, evidence) => {
    if (!configured) return;
    checks.push({ id, passed, evidence });
  };

  const maxBlack = finite(policy.max_black_duration_seconds ?? policy.maxBlackDurationSeconds);
  const maxFreeze = finite(policy.max_freeze_duration_seconds ?? policy.maxFreezeDurationSeconds);
  const maxSilence = finite(policy.max_silence_duration_seconds ?? policy.maxSilenceDurationSeconds);
  const targetLoudness = finite(policy.target_integrated_lufs ?? policy.targetIntegratedLufs);
  const loudnessTolerance = finite(policy.loudness_tolerance_lufs ?? policy.loudnessToleranceLufs);
  const maxTruePeak = finite(policy.max_true_peak_dbtp ?? policy.maxTruePeakDbtp);

  add("black_duration", maxBlack !== null, events.video_present && events.black_duration_seconds <= maxBlack, {
    video_present: events.video_present,
    actual_seconds: events.black_duration_seconds,
    maximum_seconds: maxBlack,
    segments: events.black_segments,
  });
  add("freeze_duration", maxFreeze !== null, events.video_present && events.freeze_duration_seconds <= maxFreeze, {
    video_present: events.video_present,
    actual_seconds: events.freeze_duration_seconds,
    maximum_seconds: maxFreeze,
    segments: events.freeze_segments,
  });
  add("silence_duration", maxSilence !== null, events.audio_present && events.silence_duration_seconds <= maxSilence, {
    audio_present: events.audio_present,
    actual_seconds: events.silence_duration_seconds,
    maximum_seconds: maxSilence,
    segments: events.silence_segments,
  });
  add(
    "integrated_loudness",
    targetLoudness !== null && loudnessTolerance !== null,
    events.audio_present &&
      events.integrated_lufs !== null &&
      Math.abs(events.integrated_lufs - targetLoudness) <= loudnessTolerance,
    {
      audio_present: events.audio_present,
      actual_lufs: events.integrated_lufs,
      target_lufs: targetLoudness,
      tolerance_lufs: loudnessTolerance,
    },
  );
  add(
    "true_peak",
    maxTruePeak !== null,
    events.audio_present &&
      events.true_peak_dbtp !== null &&
      events.true_peak_dbtp <= maxTruePeak,
    {
      audio_present: events.audio_present,
      actual_dbtp: events.true_peak_dbtp,
      maximum_dbtp: maxTruePeak,
    },
  );

  return {
    passed: checks.length > 0 && checks.every((check) => check.passed),
    checks,
    failed_checks: checks.filter((check) => !check.passed).map((check) => check.id),
  };
}

export const CreativePerceptualQualityRuntime = {
  async analyze({
    organization_id,
    render_asset_node_id,
    policy = {},
    force = false,
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!render_asset_node_id) throw new Error("render_asset_node_id required");

    const render = await AssetGraphRepository.getById(render_asset_node_id);
    if (
      !render ||
      render.organization_id !== organization_id ||
      render.type !== CREATIVE_ASSET_NODE_TYPES.FINAL_RENDER
    ) {
      throw new Error("Final render asset not found");
    }

    const analysisIdentity = identity(render, policy);
    const projectNodes = await AssetGraphRepository.listByProject({
      organization_id,
      creative_project_id: render.creative_project_id,
    });
    const existing = !force
      ? projectNodes.find((node) =>
          node.type === CREATIVE_ASSET_NODE_TYPES.QUALITY_REPORT &&
          node.metadata?.perceptual_qc_identity === analysisIdentity,
        )
      : null;
    if (existing) return { report: existing, reused: true };

    const ffmpegPath =
      policy.ffmpeg_path ||
      policy.ffmpegPath ||
      process.env.CREATIVE_MEDIA_FFMPEG_PATH ||
      null;
    if (!ffmpegPath) throw new Error("FFMPEG_NOT_CONFIGURED");

    const timeoutMs = finite(
      policy.quality_timeout_ms ??
      policy.qualityTimeoutMs ??
      process.env.CREATIVE_MEDIA_QUALITY_TIMEOUT_MS,
    );
    const blackPictureThreshold = finite(policy.black_picture_threshold ?? policy.blackPictureThreshold);
    const blackPixelThreshold = finite(policy.black_pixel_threshold ?? policy.blackPixelThreshold);
    const freezeNoise = finite(policy.freeze_noise ?? policy.freezeNoise);
    const silenceNoise = policy.silence_noise_db ?? policy.silenceNoiseDb;
    const videoPresent = hasStream(render, "video") || String(render.technical?.media_kind || "").toUpperCase().includes("VIDEO");
    const audioPresent = hasStream(render, "audio");
    const videoFilters = [];
    const audioFilters = [];
    let configuredChecks = 0;

    if (blackPictureThreshold !== null && blackPixelThreshold !== null) {
      configuredChecks += 1;
      if (videoPresent) {
        videoFilters.push(`blackdetect=d=${blackPictureThreshold}:pix_th=${blackPixelThreshold}`);
      }
    }
    if (freezeNoise !== null) {
      configuredChecks += 1;
      if (videoPresent) videoFilters.push(`freezedetect=n=${freezeNoise}`);
    }
    if (silenceNoise !== undefined && silenceNoise !== null) {
      configuredChecks += 1;
      if (audioPresent) audioFilters.push(`silencedetect=n=${silenceNoise}`);
    }
    if (
      finite(policy.target_integrated_lufs ?? policy.targetIntegratedLufs) !== null ||
      finite(policy.max_true_peak_dbtp ?? policy.maxTruePeakDbtp) !== null
    ) {
      configuredChecks += 1;
      if (audioPresent) audioFilters.push("ebur128=peak=true");
    }
    if (!configuredChecks) throw new Error("PERCEPTUAL_QC_POLICY_REQUIRED");

    const materialized = await materializeMedia({
      url: render.url,
      file_name: render.name || null,
      mime_type: render.technical?.mime_type || null,
      policy,
    });

    try {
      const args = ["-hide_banner", "-i", materialized.file_path];
      if (videoFilters.length) args.push("-vf", videoFilters.join(","));
      if (audioFilters.length) args.push("-af", audioFilters.join(","));
      args.push("-f", "null", "-");

      const text = await run(ffmpegPath, args, timeoutMs);
      const blackSegments = occurrences(
        text,
        /black_start:([0-9.]+)\s+black_end:([0-9.]+)\s+black_duration:([0-9.]+)/g,
        (match) => ({ start_seconds: Number(match[1]), end_seconds: Number(match[2]), duration_seconds: Number(match[3]) }),
      );
      const freezeStarts = occurrences(text, /freeze_start:\s*([0-9.]+)/g, (match) => Number(match[1]));
      const freezeEnds = occurrences(text, /freeze_end:\s*([0-9.]+)\s*\|\s*freeze_duration:\s*([0-9.]+)/g, (match) => ({ end_seconds: Number(match[1]), duration_seconds: Number(match[2]) }));
      const freezeSegments = freezeEnds.map((item, index) => ({
        start_seconds: freezeStarts[index] ?? null,
        ...item,
      }));
      const silenceSegments = occurrences(
        text,
        /silence_start:\s*([0-9.]+)[\s\S]*?silence_end:\s*([0-9.]+)\s*\|\s*silence_duration:\s*([0-9.]+)/g,
        (match) => ({ start_seconds: Number(match[1]), end_seconds: Number(match[2]), duration_seconds: Number(match[3]) }),
      );
      const integratedMatches = [...text.matchAll(/I:\s*(-?[0-9.]+)\s*LUFS/g)];
      const peakMatches = [...text.matchAll(/Peak:\s*(-?[0-9.]+)\s*dBFS/g)];
      const events = {
        video_present: videoPresent,
        audio_present: audioPresent,
        video_filters: videoFilters,
        audio_filters: audioFilters,
        black_segments: blackSegments,
        black_duration_seconds: blackSegments.reduce((sum, item) => sum + item.duration_seconds, 0),
        freeze_segments: freezeSegments,
        freeze_duration_seconds: freezeSegments.reduce((sum, item) => sum + item.duration_seconds, 0),
        silence_segments: silenceSegments,
        silence_duration_seconds: silenceSegments.reduce((sum, item) => sum + item.duration_seconds, 0),
        integrated_lufs: integratedMatches.length ? Number(integratedMatches.at(-1)[1]) : null,
        true_peak_dbtp: peakMatches.length ? Number(peakMatches.at(-1)[1]) : null,
      };
      const evaluation = evaluate(events, policy);
      const node = createCreativeAssetNode({
        organization_id,
        creative_project_id: render.creative_project_id,
        parent_asset_node_id: render.id,
        type: CREATIVE_ASSET_NODE_TYPES.QUALITY_REPORT,
        status: evaluation.passed
          ? CREATIVE_ASSET_NODE_STATUS.REVIEW
          : CREATIVE_ASSET_NODE_STATUS.REJECTED,
        name: `${render.name || "Render"} perceptual QC`,
        description: "Perceptual video and audio quality evidence.",
        lineage: {
          source: "perceptual_qc",
          capability: "creative.render.quality.perceptual",
          generation_version: policy.version || 2,
        },
        intelligence: {
          safety_status: "UNKNOWN",
          tags: ["perceptual-qc"],
        },
        reuse: { reusable: false, approved_for_reuse: false },
        review: { ai_reviewed: true, human_reviewed: false, approved: false },
        metadata: {
          perceptual_qc_identity: analysisIdentity,
          render_asset_node_id: render.id,
          policy,
          ffmpeg_arguments: args,
          events,
          ...evaluation,
          created_at: new Date().toISOString(),
        },
      });

      return {
        report: await AssetGraphRepository.create(node),
        reused: false,
      };
    } finally {
      await materialized.cleanup();
    }
  },
};
