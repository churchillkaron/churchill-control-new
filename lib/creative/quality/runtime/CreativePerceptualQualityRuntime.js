import crypto from "node:crypto";
import { spawn } from "node:child_process";

import {
  materializeMedia,
} from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";
import {
  CreativeStorageRuntime,
} from "@/lib/creative/storage/runtime/CreativeStorageRuntime";
import {
  createCreativeAssetNode,
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
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
        finish(new Error(
          Buffer.concat(output).toString("utf8") ||
          `PERCEPTUAL_QC_EXIT_${code}`,
        ));
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

function evidencePolicy(policy = {}) {
  return canonical({
    black_picture_threshold:
      policy.black_picture_threshold ?? policy.blackPictureThreshold ?? null,
    black_pixel_threshold:
      policy.black_pixel_threshold ?? policy.blackPixelThreshold ?? null,
    max_black_duration_seconds:
      policy.max_black_duration_seconds ?? policy.maxBlackDurationSeconds ?? null,
    freeze_noise:
      policy.freeze_noise ?? policy.freezeNoise ?? null,
    max_freeze_duration_seconds:
      policy.max_freeze_duration_seconds ?? policy.maxFreezeDurationSeconds ?? null,
    silence_noise_db:
      policy.silence_noise_db ?? policy.silenceNoiseDb ?? null,
    max_silence_duration_seconds:
      policy.max_silence_duration_seconds ?? policy.maxSilenceDurationSeconds ?? null,
    target_integrated_lufs:
      policy.target_integrated_lufs ?? policy.targetIntegratedLufs ?? null,
    loudness_tolerance_lufs:
      policy.loudness_tolerance_lufs ?? policy.loudnessToleranceLufs ?? null,
    max_true_peak_dbtp:
      policy.max_true_peak_dbtp ?? policy.maxTruePeakDbtp ?? null,
    version: policy.version ?? 1,
  });
}

function identity(render, policy) {
  const checksum = render.technical?.checksum || null;
  if (!checksum) throw new Error("RENDER_CHECKSUM_REQUIRED_FOR_PERCEPTUAL_QC");
  if (!render.storage_path) {
    throw new Error("PRIVATE_RENDER_STORAGE_PATH_REQUIRED_FOR_PERCEPTUAL_QC");
  }

  return crypto.createHash("sha256").update(JSON.stringify(canonical({
    render_id: render.id,
    render_identity: render.metadata?.render_identity || null,
    checksum,
    storage_path: render.storage_path,
    policy: evidencePolicy(policy),
  }))).digest("hex");
}

function evaluate(events, policy) {
  const checks = [];
  const add = (id, configured, passed, evidence) => {
    if (!configured) return;
    checks.push({ id, passed: Boolean(passed), evidence });
  };

  const maxBlack = finite(
    policy.max_black_duration_seconds ?? policy.maxBlackDurationSeconds,
  );
  const maxFreeze = finite(
    policy.max_freeze_duration_seconds ?? policy.maxFreezeDurationSeconds,
  );
  const maxSilence = finite(
    policy.max_silence_duration_seconds ?? policy.maxSilenceDurationSeconds,
  );
  const targetLoudness = finite(
    policy.target_integrated_lufs ?? policy.targetIntegratedLufs,
  );
  const loudnessTolerance = finite(
    policy.loudness_tolerance_lufs ?? policy.loudnessToleranceLufs,
  );
  const maxTruePeak = finite(
    policy.max_true_peak_dbtp ?? policy.maxTruePeakDbtp,
  );

  add(
    "black_duration",
    maxBlack !== null,
    events.black_duration_seconds <= maxBlack,
    {
      actual_seconds: events.black_duration_seconds,
      maximum_seconds: maxBlack,
      segments: events.black_segments,
    },
  );
  add(
    "freeze_duration",
    maxFreeze !== null,
    events.freeze_duration_seconds <= maxFreeze,
    {
      actual_seconds: events.freeze_duration_seconds,
      maximum_seconds: maxFreeze,
      segments: events.freeze_segments,
    },
  );
  add(
    "silence_duration",
    maxSilence !== null,
    events.silence_duration_seconds <= maxSilence,
    {
      actual_seconds: events.silence_duration_seconds,
      maximum_seconds: maxSilence,
      segments: events.silence_segments,
    },
  );
  add(
    "integrated_loudness",
    targetLoudness !== null && loudnessTolerance !== null,
    events.integrated_lufs !== null &&
      Math.abs(events.integrated_lufs - targetLoudness) <= loudnessTolerance,
    {
      actual_lufs: events.integrated_lufs,
      target_lufs: targetLoudness,
      tolerance_lufs: loudnessTolerance,
    },
  );
  add(
    "true_peak",
    maxTruePeak !== null,
    events.true_peak_dbtp !== null && events.true_peak_dbtp <= maxTruePeak,
    {
      actual_dbtp: events.true_peak_dbtp,
      maximum_dbtp: maxTruePeak,
    },
  );

  if (!checks.length) throw new Error("PERCEPTUAL_QC_CHECKS_REQUIRED");

  return {
    passed: checks.every((check) => check.passed),
    checks,
    failed_checks: checks
      .filter((check) => !check.passed)
      .map((check) => check.id),
  };
}

function uniqueViolation(error) {
  return error?.code === "23505" ||
    String(error?.message || "").toLowerCase().includes("duplicate key");
}

async function createOrRecover(node, analysisIdentity) {
  try {
    return {
      report: await AssetGraphRepository.create(node),
      reused: false,
    };
  } catch (error) {
    if (!uniqueViolation(error)) throw error;
    const nodes = await AssetGraphRepository.listByProject({
      organization_id: node.organization_id,
      creative_project_id: node.creative_project_id,
    });
    const existing = nodes.find((candidate) =>
      candidate.type === CREATIVE_ASSET_NODE_TYPES.QUALITY_REPORT &&
      candidate.metadata?.perceptual_qc_identity === analysisIdentity,
    );
    if (!existing) throw error;
    return { report: existing, reused: true };
  }
}

export const CreativePerceptualQualityRuntime = {
  async analyze({
    organization_id,
    render_asset_node_id,
    policy = {},
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
    const existing = projectNodes.find((node) =>
      node.type === CREATIVE_ASSET_NODE_TYPES.QUALITY_REPORT &&
      node.metadata?.perceptual_qc_identity === analysisIdentity,
    );
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
    const blackPictureThreshold = finite(
      policy.black_picture_threshold ?? policy.blackPictureThreshold,
    );
    const blackPixelThreshold = finite(
      policy.black_pixel_threshold ?? policy.blackPixelThreshold,
    );
    const freezeNoise = finite(policy.freeze_noise ?? policy.freezeNoise);
    const silenceNoise = policy.silence_noise_db ?? policy.silenceNoiseDb;
    const filters = [];

    if (blackPictureThreshold !== null && blackPixelThreshold !== null) {
      filters.push(
        `blackdetect=d=${blackPictureThreshold}:pix_th=${blackPixelThreshold}`,
      );
    }
    if (freezeNoise !== null) {
      filters.push(`freezedetect=n=${freezeNoise}`);
    }
    if (silenceNoise !== undefined && silenceNoise !== null) {
      filters.push(`silencedetect=n=${silenceNoise}`);
    }
    if (
      finite(
        policy.target_integrated_lufs ?? policy.targetIntegratedLufs,
      ) !== null ||
      finite(policy.max_true_peak_dbtp ?? policy.maxTruePeakDbtp) !== null
    ) {
      filters.push("ebur128=peak=true");
    }
    if (!filters.length) throw new Error("PERCEPTUAL_QC_POLICY_REQUIRED");

    const delivery = await CreativeStorageRuntime.createSignedUrl(
      render.storage_path,
      900,
    );
    const materialized = await materializeMedia({
      url: delivery.signed_url,
      file_name: render.name || null,
      mime_type: render.technical?.mime_type || null,
      policy,
    });

    try {
      if (materialized.checksum !== render.technical?.checksum) {
        throw new Error("PERCEPTUAL_QC_RENDER_CHECKSUM_MISMATCH");
      }

      const text = await run(
        ffmpegPath,
        [
          "-hide_banner",
          "-i",
          materialized.file_path,
          "-filter_complex",
          filters.join(","),
          "-f",
          "null",
          "-",
        ],
        timeoutMs,
      );
      const blackSegments = occurrences(
        text,
        /black_start:([0-9.]+)\s+black_end:([0-9.]+)\s+black_duration:([0-9.]+)/g,
        (match) => ({
          start_seconds: Number(match[1]),
          end_seconds: Number(match[2]),
          duration_seconds: Number(match[3]),
        }),
      );
      const freezeStarts = occurrences(
        text,
        /freeze_start:\s*([0-9.]+)/g,
        (match) => Number(match[1]),
      );
      const freezeEnds = occurrences(
        text,
        /freeze_end:\s*([0-9.]+)\s*\|\s*freeze_duration:\s*([0-9.]+)/g,
        (match) => ({
          end_seconds: Number(match[1]),
          duration_seconds: Number(match[2]),
        }),
      );
      const freezeSegments = freezeEnds.map((item, index) => ({
        start_seconds: freezeStarts[index] ?? null,
        ...item,
      }));
      const silenceSegments = occurrences(
        text,
        /silence_start:\s*([0-9.]+)[\s\S]*?silence_end:\s*([0-9.]+)\s*\|\s*silence_duration:\s*([0-9.]+)/g,
        (match) => ({
          start_seconds: Number(match[1]),
          end_seconds: Number(match[2]),
          duration_seconds: Number(match[3]),
        }),
      );
      const integratedMatches = [
        ...text.matchAll(/I:\s*(-?[0-9.]+)\s*LUFS/g),
      ];
      const peakMatches = [
        ...text.matchAll(/Peak:\s*(-?[0-9.]+)\s*dBFS/g),
      ];
      const events = {
        black_segments: blackSegments,
        black_duration_seconds: blackSegments.reduce(
          (sum, item) => sum + item.duration_seconds,
          0,
        ),
        freeze_segments: freezeSegments,
        freeze_duration_seconds: freezeSegments.reduce(
          (sum, item) => sum + item.duration_seconds,
          0,
        ),
        silence_segments: silenceSegments,
        silence_duration_seconds: silenceSegments.reduce(
          (sum, item) => sum + item.duration_seconds,
          0,
        ),
        integrated_lufs: integratedMatches.length
          ? Number(integratedMatches.at(-1)[1])
          : null,
        true_peak_dbtp: peakMatches.length
          ? Number(peakMatches.at(-1)[1])
          : null,
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
          generation_version: policy.version || 1,
        },
        intelligence: {
          safety_status: "UNKNOWN",
          tags: ["perceptual-qc"],
        },
        reuse: { reusable: false, approved_for_reuse: false },
        review: {
          ai_reviewed: true,
          human_reviewed: false,
          approved: false,
        },
        metadata: {
          perceptual_qc_identity: analysisIdentity,
          render_asset_node_id: render.id,
          render_identity: render.metadata?.render_identity || null,
          render_checksum: render.technical?.checksum,
          render_storage_path: render.storage_path,
          delivery_mode: "PRIVATE_SIGNED_URL",
          policy: evidencePolicy(policy),
          events,
          ...evaluation,
          created_at: new Date().toISOString(),
        },
      });

      return createOrRecover(node, analysisIdentity);
    } finally {
      await materialized.cleanup();
    }
  },
};
