import { ProductionTaskRuntime } from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import * as ShotRepository from "@/lib/creative/shots/repositories/ShotRepository";
import * as AssetGraphRepository from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import {
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import { CreativeShotBibleRuntime } from "@/lib/creative/video/runtime/CreativeShotBibleRuntime";
import { CreativeMediaInspectionRuntime } from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";
import { resolveCreativeFfprobePath } from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";
import { CreativeVideoTemporalEvidenceRuntime } from "./CreativeVideoTemporalEvidenceRuntime";

const CONTRACT = "CREATIVE_VIDEO_TECHNICAL_QUALITY_V2";
const MINIMUM_WORLD_CLASS_FRAME_RATE = 23.9;
const MINIMUM_WORLD_CLASS_AUDIO_SAMPLE_RATE = 44100;
const ASPECT_RATIO_TOLERANCE = 0.035;

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function check(id, passed, evidence = {}, repair = null, applicable = true) {
  if (!applicable) {
    return { id, status: "NOT_APPLICABLE", evidence, repair_instruction: null };
  }
  return {
    id,
    status: passed ? "PASS" : "FAIL",
    evidence,
    repair_instruction: passed ? null : repair,
  };
}

function targetResolution(output = {}) {
  const width = finite(output.width);
  const height = finite(output.height);
  if (width && height) {
    return { width, height, mode: "EXACT" };
  }

  const value = text(output.resolution).toLowerCase();
  const exact = value.match(/(\d{3,5})\s*[x×]\s*(\d{3,5})/i);
  if (exact) {
    return {
      width: Number(exact[1]),
      height: Number(exact[2]),
      mode: "EXACT",
    };
  }
  if (/\b(4k|uhd|2160p?)\b/.test(value)) {
    return { long_edge: 3840, short_edge: 2160, mode: "MINIMUM" };
  }
  if (/\b(2k|1440p?)\b/.test(value)) {
    return { long_edge: 2560, short_edge: 1440, mode: "MINIMUM" };
  }
  if (/\b(1080p?|full\s*hd|fhd)\b/.test(value)) {
    return { long_edge: 1920, short_edge: 1080, mode: "MINIMUM" };
  }
  if (/\b720p?\b/.test(value)) {
    return { long_edge: 1280, short_edge: 720, mode: "MINIMUM" };
  }
  return null;
}

function resolutionPass(technical = {}, target = null) {
  if (!target) return true;
  const width = finite(technical.width, 0);
  const height = finite(technical.height, 0);
  if (target.mode === "EXACT") {
    return width === target.width && height === target.height;
  }
  const longEdge = Math.max(width, height);
  const shortEdge = Math.min(width, height);
  return longEdge >= target.long_edge && shortEdge >= target.short_edge;
}

function aspectRatio(value) {
  const raw = text(value);
  const match = raw.match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const left = Number(match[1]);
  const right = Number(match[2]);
  return left > 0 && right > 0 ? left / right : null;
}

function audioRequired(shotBible = {}) {
  const audio = object(shotBible.audio);
  return (
    list(audio.dialogue).length > 0 ||
    Object.keys(object(audio.narration)).length > 0 ||
    Object.keys(object(audio.audio)).length > 0 ||
    Object.keys(object(audio.music)).length > 0 ||
    list(audio.sound_effects).length > 0 ||
    Object.keys(object(audio.sound_design)).length > 0
  );
}

function evaluateTechnical({ inspection = {}, shotBible = {}, temporal = {} } = {}) {
  const technical = object(inspection.technical);
  const output = object(shotBible.output);
  const expectedDuration = finite(output.duration_seconds);
  const actualDuration = finite(technical.duration_seconds);
  const durationTolerance = expectedDuration
    ? Math.max(0.35, expectedDuration * 0.08)
    : null;
  const expectedAspect = aspectRatio(output.aspect_ratio);
  const actualAspect = technical.width && technical.height
    ? Number(technical.width) / Number(technical.height)
    : null;
  const expectedFrameRate = finite(output.frame_rate);
  const actualFrameRate = finite(technical.frame_rate);
  const resolutionTarget = targetResolution(output);
  const requiresAudio = audioRequired(shotBible);
  const temporalTiming = object(temporal.audio_video_timing);
  const checks = [
    check(
      "probe_complete",
      inspection.status === "COMPLETE",
      { status: inspection.status || null, reason: inspection.reason || null },
      "Make ffprobe available and re-inspect the exact generated master before release.",
    ),
    check(
      "video_stream",
      text(technical.media_kind).toLowerCase() === "video" &&
        Boolean(text(technical.video_codec)),
      {
        media_kind: technical.media_kind || null,
        video_codec: technical.video_codec || null,
      },
      "Regenerate or re-encode the candidate as a valid video master with a decodable video stream.",
    ),
    check(
      "resolution",
      resolutionPass(technical, resolutionTarget),
      {
        actual_width: finite(technical.width),
        actual_height: finite(technical.height),
        required: resolutionTarget,
      },
      "Render the shot at the Shot Bible delivery resolution; do not certify an upscale or undersized proxy as the master.",
      Boolean(resolutionTarget),
    ),
    check(
      "aspect_ratio",
      expectedAspect === null ||
        (actualAspect !== null && Math.abs(actualAspect - expectedAspect) <= ASPECT_RATIO_TOLERANCE),
      {
        actual: actualAspect,
        required: expectedAspect,
        tolerance: ASPECT_RATIO_TOLERANCE,
      },
      "Render the shot in the exact Shot Bible aspect ratio without stretch or unintended crop.",
      expectedAspect !== null,
    ),
    check(
      "duration",
      expectedDuration === null ||
        (actualDuration !== null && Math.abs(actualDuration - expectedDuration) <= durationTolerance),
      {
        actual_seconds: actualDuration,
        required_seconds: expectedDuration,
        tolerance_seconds: durationTolerance,
      },
      "Regenerate or trim the candidate to the Shot Bible duration while preserving the intended action and transition handles.",
      expectedDuration !== null,
    ),
    check(
      "frame_rate",
      actualFrameRate !== null &&
        actualFrameRate + 0.05 >= (expectedFrameRate || MINIMUM_WORLD_CLASS_FRAME_RATE),
      {
        actual_fps: actualFrameRate,
        required_fps: expectedFrameRate || MINIMUM_WORLD_CLASS_FRAME_RATE,
      },
      "Deliver the generated master at the requested frame rate, or at no less than cinema-rate 23.9 fps when no rate is specified.",
    ),
    check(
      "audio_delivery",
      !requiresAudio || (
        Boolean(text(technical.audio_codec)) &&
        finite(technical.sample_rate, 0) >= MINIMUM_WORLD_CLASS_AUDIO_SAMPLE_RATE &&
        finite(technical.channels, 0) >= 1
      ),
      {
        required: requiresAudio,
        audio_codec: technical.audio_codec || null,
        sample_rate: finite(technical.sample_rate),
        channels: finite(technical.channels),
      },
      "Deliver the Shot Bible audio with the video master at 44.1 kHz or better before perceptual review.",
      requiresAudio,
    ),
    check(
      "audio_video_timing",
      !requiresAudio || temporalTiming.passed === true,
      temporalTiming,
      "Rebuild the master so audio and video start together and finish within the deterministic sync tolerance before perceptual review.",
      requiresAudio,
    ),
    check(
      "temporal_evidence_ready",
      temporal.evidence_ready === true,
      {
        contract: temporal.contract || null,
        sampled_fps: temporal.sample?.sampled_fps || null,
        sampled_frame_count: temporal.sample?.sampled_frame_count || null,
        risk_flags: list(temporal.risk_flags),
      },
      "Re-run deterministic temporal sampling on the exact generated master before release.",
    ),
  ];
  const failed = checks.filter((item) => item.status === "FAIL");
  return {
    contract: CONTRACT,
    passed: failed.length === 0,
    checks,
    failed_checks: failed.map((item) => item.id),
    repair_instructions: failed
      .map((item) => item.repair_instruction)
      .filter(Boolean),
    technical,
    temporal_evidence: temporal,
  };
}

async function context({ organization_id, asset_node_id }) {
  const candidate = await AssetGraphRepository.getById(asset_node_id);
  if (
    !candidate ||
    text(candidate.organization_id) !== text(organization_id) ||
    candidate.type !== CREATIVE_ASSET_NODE_TYPES.VIDEO
  ) {
    throw new Error("CREATIVE_VIDEO_TECHNICAL_CANDIDATE_NOT_FOUND");
  }
  const taskId = text(candidate.production_task_id || candidate.metadata?.production_task_id);
  const task = taskId ? await ProductionTaskRuntime.get(taskId) : null;
  if (!task || text(task.organization_id) !== text(organization_id)) {
    throw new Error("CREATIVE_VIDEO_TECHNICAL_TASK_NOT_FOUND");
  }
  if (!task.shot_id) throw new Error("CREATIVE_VIDEO_TECHNICAL_SHOT_REQUIRED");
  const shot = await ShotRepository.get(task.shot_id);
  if (
    !shot ||
    text(shot.organization_id) !== text(organization_id) ||
    text(shot.creative_project_id) !== text(task.creative_project_id)
  ) {
    throw new Error("CREATIVE_VIDEO_TECHNICAL_SHOT_SCOPE_MISMATCH");
  }
  const shotBible = CreativeShotBibleRuntime.assert(
    CreativeShotBibleRuntime.build({ shot, task }),
  );
  return { candidate, task, shotBible };
}

function cachedResult(candidate = {}) {
  const metadata = object(candidate.metadata);
  if (
    metadata.video_technical_quality_contract !== CONTRACT ||
    metadata.video_technical_quality_source_url !== candidate.url ||
    typeof metadata.video_technical_quality_passed !== "boolean" ||
    candidate.technical?.temporal_evidence?.contract !==
      CreativeVideoTemporalEvidenceRuntime.contract
  ) {
    return null;
  }
  return {
    contract: CONTRACT,
    asset_node_id: candidate.id,
    passed: metadata.video_technical_quality_passed,
    failed_checks: list(metadata.video_technical_quality_failed_checks),
    repair_instructions: list(metadata.video_technical_quality_repair_instructions),
    checks: list(metadata.video_technical_quality_checks),
    technical: object(metadata.video_technical_quality_technical),
    temporal_evidence: object(candidate.technical?.temporal_evidence),
    reused: true,
  };
}

export const CreativeVideoTechnicalQualityRuntime = Object.freeze({
  contract: CONTRACT,
  minimum_world_class_frame_rate: MINIMUM_WORLD_CLASS_FRAME_RATE,
  minimum_world_class_audio_sample_rate: MINIMUM_WORLD_CLASS_AUDIO_SAMPLE_RATE,
  evaluate: evaluateTechnical,

  async assess({ organization_id, asset_node_id, policy = {} } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!asset_node_id) throw new Error("asset_node_id required");
    const resolved = await context({ organization_id, asset_node_id });
    const cached = cachedResult(resolved.candidate);
    if (cached) return cached;

    const ffprobePath = resolveCreativeFfprobePath(policy);
    if (!ffprobePath) {
      throw new Error("CREATIVE_VIDEO_TECHNICAL_FFPROBE_REQUIRED");
    }
    const inspectionPolicy = {
      ...object(policy),
      ffprobe_path: ffprobePath,
    };
    const inspection = await CreativeMediaInspectionRuntime.inspect({
      organization_id,
      url: resolved.candidate.url,
      file_name: resolved.candidate.name || null,
      mime_type: resolved.candidate.technical?.mime_type || null,
      policy: inspectionPolicy,
    });
    const temporal = await CreativeVideoTemporalEvidenceRuntime.analyze({
      organization_id,
      url: resolved.candidate.url,
      file_name: resolved.candidate.name || null,
      mime_type: resolved.candidate.technical?.mime_type || null,
      policy: inspectionPolicy,
      audio_required: audioRequired(resolved.shotBible),
    });
    const evaluation = evaluateTechnical({
      inspection,
      shotBible: resolved.shotBible,
      temporal,
    });

    await AssetGraphRepository.update(resolved.candidate.id, {
      status: evaluation.passed
        ? resolved.candidate.status
        : CREATIVE_ASSET_NODE_STATUS.REJECTED,
      technical: {
        ...(resolved.candidate.technical || {}),
        temporal_evidence: temporal,
      },
      metadata: {
        ...(resolved.candidate.metadata || {}),
        video_technical_quality_contract: CONTRACT,
        video_technical_quality_passed: evaluation.passed,
        video_technical_quality_failed_checks: evaluation.failed_checks,
        video_technical_quality_repair_instructions: evaluation.repair_instructions,
        video_technical_quality_checks: evaluation.checks,
        video_technical_quality_technical: evaluation.technical,
        video_temporal_evidence_contract: temporal.contract,
        video_temporal_evidence_risk_flags: temporal.risk_flags,
        video_temporal_evidence_hard_failures: temporal.hard_failures,
        video_technical_quality_source_url: resolved.candidate.url,
        video_technical_quality_checked_at: new Date().toISOString(),
      },
    });

    return {
      ...evaluation,
      asset_node_id: resolved.candidate.id,
      shot_id: resolved.task.shot_id,
      reused: false,
    };
  },
});
