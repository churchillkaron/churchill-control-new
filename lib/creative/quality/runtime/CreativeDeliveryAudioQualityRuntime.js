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
  resolveCreativeDeliveryAudioPolicy,
} from "@/lib/creative/quality/runtime/CreativeDeliveryAudioPolicy";

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function run(command, args, timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "ignore", "pipe"],
    });
    const stderr = [];
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
      finish(new Error("DELIVERY_AUDIO_QC_TIMEOUT"));
    }, timeoutMs);
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      const output = Buffer.concat(stderr).toString("utf8");
      if (code !== 0) {
        finish(new Error(output.slice(-12000) || `DELIVERY_AUDIO_QC_EXIT_${code}`));
        return;
      }
      finish(null, output);
    });
  });
}

function lastNumber(text, pattern) {
  const matches = [...String(text || "").matchAll(pattern)];
  if (!matches.length) return null;
  return finite(matches.at(-1)?.[1]);
}

function measure(output) {
  return {
    integrated_lufs: lastNumber(output, /I:\s*(-?[0-9.]+)\s*LUFS/g),
    loudness_range_lu: lastNumber(output, /LRA:\s*([0-9.]+)\s*LU/g),
    true_peak_dbtp: lastNumber(output, /Peak:\s*(-?[0-9.]+)\s*dBFS/g),
  };
}

function evaluate(measurements, policy) {
  const checks = [];
  const add = (id, passed, actual, expected) => {
    checks.push({ id, passed, actual, expected });
  };

  add(
    "integrated_loudness",
    measurements.integrated_lufs !== null &&
      Math.abs(measurements.integrated_lufs - policy.target_integrated_lufs) <=
        policy.loudness_tolerance_lu,
    measurements.integrated_lufs,
    {
      target_lufs: policy.target_integrated_lufs,
      tolerance_lu: policy.loudness_tolerance_lu,
    },
  );
  add(
    "true_peak",
    measurements.true_peak_dbtp !== null &&
      measurements.true_peak_dbtp <= policy.max_true_peak_dbtp,
    measurements.true_peak_dbtp,
    { maximum_dbtp: policy.max_true_peak_dbtp },
  );

  if (policy.minimum_loudness_range_lu !== null) {
    add(
      "minimum_loudness_range",
      measurements.loudness_range_lu !== null &&
        measurements.loudness_range_lu >= policy.minimum_loudness_range_lu,
      measurements.loudness_range_lu,
      { minimum_lu: policy.minimum_loudness_range_lu },
    );
  }
  if (policy.maximum_loudness_range_lu !== null) {
    add(
      "maximum_loudness_range",
      measurements.loudness_range_lu !== null &&
        measurements.loudness_range_lu <= policy.maximum_loudness_range_lu,
      measurements.loudness_range_lu,
      { maximum_lu: policy.maximum_loudness_range_lu },
    );
  }

  return {
    passed: checks.length > 0 && checks.every((check) => check.passed),
    checks,
    failed_checks: checks.filter((check) => !check.passed).map((check) => check.id),
  };
}

function identity(render, policy) {
  return crypto.createHash("sha256").update(JSON.stringify({
    render_asset_node_id: render.id,
    render_identity: render.metadata?.render_identity || null,
    checksum: render.technical?.checksum || null,
    policy_identity: policy.identity,
  })).digest("hex");
}

function compactReport(node) {
  if (!node) return null;
  return {
    id: node.id,
    status: node.status,
    passed: node.metadata?.passed === true,
    policy: node.metadata?.policy || null,
    measurements: node.metadata?.measurements || null,
    checks: Array.isArray(node.metadata?.checks) ? node.metadata.checks : [],
    failed_checks: Array.isArray(node.metadata?.failed_checks)
      ? node.metadata.failed_checks
      : [],
    evaluated_at: node.metadata?.evaluated_at || node.created_at || null,
  };
}

export const CreativeDeliveryAudioQualityRuntime = Object.freeze({
  contract: "CREATIVE_DELIVERY_AUDIO_QUALITY_V1",

  async inspect({ organization_id, render_asset_node_id } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!render_asset_node_id) throw new Error("render_asset_node_id required");
    const render = await AssetGraphRepository.getById(render_asset_node_id);
    if (
      !render ||
      String(render.organization_id) !== String(organization_id) ||
      render.type !== CREATIVE_ASSET_NODE_TYPES.FINAL_RENDER
    ) {
      throw new Error("Final render asset not found");
    }

    const profile = render.metadata?.export_profile || {};
    const policy = resolveCreativeDeliveryAudioPolicy(profile);
    const expectedIdentity = identity(render, policy);
    const nodes = await AssetGraphRepository.listByProject({
      organization_id,
      creative_project_id: render.creative_project_id,
    });
    const report = nodes
      .filter((node) =>
        node.type === CREATIVE_ASSET_NODE_TYPES.QUALITY_REPORT &&
        node.parent_asset_node_id === render.id &&
        node.metadata?.delivery_audio_qc_identity === expectedIdentity,
      )
      .sort((left, right) =>
        Date.parse(right.updated_at || right.created_at || 0) -
        Date.parse(left.updated_at || left.created_at || 0),
      )[0] || null;

    return {
      contract: "CREATIVE_DELIVERY_AUDIO_QUALITY_V1",
      render_asset_node_id: render.id,
      policy,
      required: policy.required,
      report: compactReport(report),
      passed: !policy.required || report?.metadata?.passed === true,
      can_measure: Boolean(policy.required && policy.complete && render.url),
      blocker: !policy.required
        ? null
        : !policy.complete
          ? "DELIVERY_AUDIO_POLICY_INCOMPLETE"
          : report?.metadata?.passed === true
            ? null
            : "DELIVERY_AUDIO_QC_REQUIRED",
    };
  },

  async analyze({ organization_id, render_asset_node_id, force = false } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!render_asset_node_id) throw new Error("render_asset_node_id required");
    const render = await AssetGraphRepository.getById(render_asset_node_id);
    if (
      !render ||
      String(render.organization_id) !== String(organization_id) ||
      render.type !== CREATIVE_ASSET_NODE_TYPES.FINAL_RENDER
    ) {
      throw new Error("Final render asset not found");
    }
    if (!render.url) throw new Error("FINAL_RENDER_MEDIA_REQUIRED");

    const profile = render.metadata?.export_profile || {};
    const policy = resolveCreativeDeliveryAudioPolicy(profile);
    if (!policy.required) {
      return { skipped: true, reason: "DELIVERY_AUDIO_QC_NOT_REQUIRED", policy };
    }
    if (!policy.complete) {
      throw new Error(`DELIVERY_AUDIO_POLICY_INCOMPLETE:${policy.missing_requirements.join(",")}`);
    }

    const analysisIdentity = identity(render, policy);
    if (!force) {
      const existing = await this.inspect({ organization_id, render_asset_node_id });
      if (existing.report) {
        return { report: existing.report, reused: true, policy };
      }
    }

    const ffmpegPath = resolveCreativeFfmpegPath();
    if (!ffmpegPath) throw new Error("FFMPEG_NOT_CONFIGURED_FOR_DELIVERY_AUDIO_QC");
    const materialized = await materializeMedia({
      url: render.url,
      file_name: render.name || "final-render",
      mime_type: render.technical?.mime_type || null,
      organization_id,
    });

    try {
      const output = await run(ffmpegPath, [
        "-hide_banner",
        "-nostats",
        "-i", materialized.file_path,
        "-vn",
        "-af", "ebur128=peak=true",
        "-f", "null",
        "-",
      ]);
      const measurements = measure(output);
      const evaluation = evaluate(measurements, policy);
      const node = createCreativeAssetNode({
        organization_id,
        creative_project_id: render.creative_project_id,
        parent_asset_node_id: render.id,
        type: CREATIVE_ASSET_NODE_TYPES.QUALITY_REPORT,
        status: evaluation.passed
          ? CREATIVE_ASSET_NODE_STATUS.REVIEW
          : CREATIVE_ASSET_NODE_STATUS.REJECTED,
        name: `${render.name || "Final render"} delivery audio QC`,
        description: "Delivery-profile loudness, loudness-range and true-peak evidence.",
        lineage: {
          source: "delivery_audio_qc",
          capability: "creative.render.quality.delivery-audio",
          generation_version: 1,
        },
        intelligence: {
          safety_status: "UNKNOWN",
          tags: ["delivery-audio-qc", "loudness", "true-peak"],
        },
        reuse: { reusable: false, approved_for_reuse: false },
        review: { ai_reviewed: true, human_reviewed: false, approved: false },
        metadata: {
          delivery_audio_qc_identity: analysisIdentity,
          render_asset_node_id: render.id,
          render_identity: render.metadata?.render_identity || null,
          policy_identity: policy.identity,
          profile_id: policy.profile_id,
          policy,
          measurements,
          ...evaluation,
          method: "FFMPEG_EBUR128_PROGRAM_INTEGRATED",
          evaluated_at: new Date().toISOString(),
        },
      });
      const report = await AssetGraphRepository.create(node);
      await AssetGraphRepository.update(render.id, {
        metadata: {
          ...(render.metadata || {}),
          delivery_audio_qc_required: true,
          delivery_audio_qc_passed: evaluation.passed,
          delivery_audio_qc_policy_identity: policy.identity,
          delivery_audio_qc_report_asset_node_id: report.id,
          delivery_audio_qc_measurements: measurements,
          delivery_audio_qc_evaluated_at: report.metadata?.evaluated_at || new Date().toISOString(),
        },
      });

      return {
        report: compactReport(report),
        reused: false,
        policy,
      };
    } finally {
      await materialized.cleanup();
    }
  },
});
