import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { getServiceSupabase } from "@/lib/shared/supabase/service";
import {
  CreativeExecutionStepRepository,
} from "@/lib/creative/execution/repositories/CreativeExecutionStepRepository";
import {
  CreativePerformanceVideoIntelligenceRuntime,
} from "@/lib/creative/media/runtime/CreativePerformanceVideoIntelligenceRuntime";
import {
  materializeMedia,
} from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";
import {
  creativeStorageUri,
} from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";
import {
  createCreativeAssetNode,
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";

const supabaseAdmin = getServiceSupabase();
const NO_USABLE = "PERFORMANCE_VIDEO_HAS_NO_VERIFIED_USABLE_SECTIONS";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function sameMoney(left, right) {
  return Math.abs(finite(left) - finite(right)) <= 0.000001;
}

function safe(value, fallback = "media") {
  return text(value || fallback)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || fallback;
}

function runProcess(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stderr = [];
    let settled = false;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      if (!settled) {
        settled = true;
        reject(new Error("CHECKPOINTED_SHORTLIST_FFMPEG_TIMEOUT"));
      }
    }, timeoutMs);

    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(
          Buffer.concat(stderr).toString("utf8") ||
          `CHECKPOINTED_SHORTLIST_FFMPEG_EXIT_${code}`,
        ));
        return;
      }
      resolve();
    });
  });
}

async function activeJob({ organizationId, projectId }) {
  const { data, error } = await supabaseAdmin
    .from("creative_execution_jobs")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("creative_project_id", projectId)
    .eq("job_type", "SHORTLIST_VERIFY")
    .eq("status", "RUNNING")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id || !data?.lease_token) {
    throw new Error("CHECKPOINTED_SHORTLIST_ACTIVE_JOB_REQUIRED");
  }
  return data;
}

function authorizationMatches({ authorization, report }) {
  return (
    authorization?.approved === true &&
    text(authorization.project_shortlist_identity) ===
      text(report.metadata?.project_shortlist_identity) &&
    finite(authorization.maximum_ai_calls, -1) ===
      finite(report.metadata?.estimated_ai_calls, -2) &&
    sameMoney(
      authorization.maximum_customer_price,
      report.metadata?.cost_estimate?.estimated_customer_price,
    ) &&
    text(authorization.currency).toUpperCase() ===
      text(report.metadata?.cost_estimate?.currency).toUpperCase()
  );
}

async function createExcerpt({
  organizationId,
  parent,
  candidate,
  inputPath,
  directory,
  ffmpegPath,
  timeoutMs,
}) {
  const existingId = text(candidate.metadata?.verification_excerpt_node_id);
  if (existingId) {
    const existing = await AssetGraphRepository.getById(existingId);
    if (existing && existing.status !== CREATIVE_ASSET_NODE_STATUS.ARCHIVED) {
      return existing;
    }
  }

  const range = object(candidate.metadata?.original_source_range);
  const start = finite(range.start_seconds, -1);
  const duration = finite(range.duration_seconds, 0);
  if (start < 0 || duration <= 0) {
    throw new Error("LOCAL_SHORTLIST_RANGE_INVALID");
  }

  const outputPath = path.join(directory, `excerpt-${safe(candidate.id)}.mp4`);
  await runProcess(ffmpegPath, [
    "-hide_banner",
    "-loglevel", "error",
    "-ss", String(start),
    "-i", inputPath,
    "-t", String(duration),
    "-map", "0:v:0",
    "-map", "0:a:0?",
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "18",
    "-c:a", "aac",
    "-b:a", "192k",
    "-movflags", "+faststart",
    outputPath,
  ], timeoutMs);

  const bucket = text(process.env.CREATIVE_MEDIA_DERIVATIVE_BUCKET);
  if (!bucket) throw new Error("DERIVATIVE_STORAGE_BUCKET_REQUIRED");
  const buffer = await fs.readFile(outputPath);
  const storagePath = [
    safe(organizationId),
    "checkpointed-shortlist-excerpts",
    safe(parent.id),
    `${crypto.randomUUID()}.mp4`,
  ].join("/");

  const { error: uploadError } = await supabaseAdmin.storage
    .from(bucket)
    .upload(storagePath, buffer, {
      contentType: "video/mp4",
      upsert: false,
      cacheControl: "3600",
    });
  if (uploadError) throw uploadError;

  const excerpt = await AssetGraphRepository.create(createCreativeAssetNode({
    organization_id: organizationId,
    creative_project_id: parent.creative_project_id,
    creative_asset_id: parent.creative_asset_id,
    parent_asset_node_id: parent.id,
    type: CREATIVE_ASSET_NODE_TYPES.VIDEO,
    status: CREATIVE_ASSET_NODE_STATUS.DERIVED,
    name: `${parent.name || "Source video"} checkpointed shortlist excerpt`,
    description: "Durable shortlist excerpt verified one paid frame at a time.",
    url: creativeStorageUri(bucket, storagePath),
    storage_path: storagePath,
    lineage: {
      source: "checkpointed_local_shortlist_verification",
      provider_id: null,
      capability: "creative.media.local.shortlist.verify",
      generation_version: 3,
    },
    technical: {
      mime_type: "video/mp4",
      duration_seconds: duration,
      media_kind: "video",
      file_size_bytes: buffer.length,
    },
    metadata: {
      source_asset_node_id: parent.id,
      local_shortlist_candidate_id: candidate.id,
      original_source_range: range,
      project_shortlist_identity:
        candidate.metadata?.project_shortlist_identity || null,
      production_started: false,
    },
  }));

  await AssetGraphRepository.update(candidate.id, {
    metadata: {
      ...object(candidate.metadata),
      verification_excerpt_node_id: excerpt.id,
      ai_verification_status: "RUNNING",
      ai_verification_started_at:
        candidate.metadata?.ai_verification_started_at || new Date().toISOString(),
      production_started: false,
    },
  });

  return excerpt;
}

function stepFingerprint({ candidate, excerpt, fraction, identity }) {
  return crypto.createHash("sha256").update(JSON.stringify({
    candidate_id: candidate.id,
    excerpt_id: excerpt.id,
    fraction,
    project_shortlist_identity: identity,
    runtime: "checkpointed-shortlist-frame-v1",
  })).digest("hex");
}

function transientNetworkFailure(error) {
  const value = [
    error?.message,
    error?.cause?.message,
    error?.code,
  ].map(text).join(" ").toUpperCase();
  return [
    "FETCH FAILED",
    "ECONNRESET",
    "ECONNREFUSED",
    "ETIMEDOUT",
    "ENOTFOUND",
    "UND_ERR",
    "SOCKET",
    "NETWORK",
  ].some((marker) => value.includes(marker));
}

async function verifyFrame({
  job,
  candidate,
  excerpt,
  fraction,
  fractionIndex,
  report,
  policy,
  ffmpegPath,
  timeoutMs,
}) {
  const stepKey = [
    "shortlist-frame",
    candidate.id,
    fractionIndex,
  ].join(":");
  const fingerprint = stepFingerprint({
    candidate,
    excerpt,
    fraction,
    identity: report.metadata?.project_shortlist_identity,
  });
  const step = await CreativeExecutionStepRepository.claim({
    job_id: job.id,
    job_lease_token: job.lease_token,
    step_key: stepKey,
    step_type: "AI_IMAGE_ANALYZE",
    input_fingerprint: fingerprint,
    payload: {
      candidate_id: candidate.id,
      excerpt_node_id: excerpt.id,
      sample_fraction: fraction,
      sample_index: fractionIndex,
      production_started: false,
    },
    lease_seconds: 900,
  });

  if (step.status === "COMPLETED" || step.status === "AMBIGUOUS") {
    return {
      status: step.status,
      result: object(step.result),
      provider_call_count: finite(step.provider_call_count),
      reused: true,
    };
  }
  if (step.status === "RUNNING" && !step.lease_token) {
    throw new Error("CHECKPOINTED_SHORTLIST_STEP_LEASE_REQUIRED");
  }
  if (step.status === "RUNNING" && step.attempt_count > 1) {
    return {
      status: "AMBIGUOUS",
      result: {
        usable: false,
        verified_moment_ids: [],
        reason: "PRIOR_FRAME_CALL_OUTCOME_AMBIGUOUS",
      },
      provider_call_count: 1,
      reused: true,
    };
  }

  try {
    const verified = await CreativePerformanceVideoIntelligenceRuntime.analyze({
      organization_id: job.organization_id,
      parent_asset_node_id: excerpt.id,
      force: false,
      policy: {
        version: [
          "checkpointed-shortlist-frame-v1",
          report.metadata?.project_shortlist_identity,
          candidate.id,
          fractionIndex,
        ].join("-"),
        requested_subject:
          text(policy.requested_subject || policy.requestedSubject) ||
          "primary requested subject",
        minimum_usable_sections: 1,
        minimum_verified_samples: 1,
        minimum_quality_score: finite(policy.minimum_quality_score, 55),
        minimum_primary_performer_ratio:
          finite(policy.minimum_primary_performer_ratio, 0.5),
        minimum_vocalist_ratio: finite(policy.minimum_vocalist_ratio, 0.5),
        minimum_section_seconds: 1,
        maximum_section_seconds:
          finite(excerpt.technical?.duration_seconds, 20) + 1,
        minimum_boundary_silence_seconds: 999999,
        sample_fractions: [fraction],
        output_width: finite(policy.output_width, 1920),
        output_height: finite(policy.output_height, 1080),
        frame_rate: finite(policy.frame_rate, 30),
        ffmpeg_path: ffmpegPath,
        timeout_ms: timeoutMs,
        max_bytes: Math.max(
          finite(excerpt.technical?.file_size_bytes, 0) + 1024 * 1024,
          finite(policy.max_bytes, 0),
        ),
      },
    });

    const momentIds = (verified.moments || []).map((moment) => moment.id);
    const usageIds = (verified.moments || [])
      .flatMap((moment) => moment.metadata?.performance_evidence?.frames || [])
      .map((frame) => frame.usage_id)
      .filter(Boolean);
    const result = {
      usable: momentIds.length > 0,
      verified_moment_ids: momentIds,
      analysis_identity: verified.analysis_identity || null,
      reused: verified.reused === true,
      production_started: false,
    };
    await CreativeExecutionStepRepository.complete({
      step_id: step.id,
      step_lease_token: step.lease_token,
      result,
      usage_ids: usageIds,
      provider_call_count: 1,
    });
    return {
      status: "COMPLETED",
      result,
      provider_call_count: 1,
      reused: false,
    };
  } catch (error) {
    if (error?.message === NO_USABLE) {
      const result = {
        usable: false,
        verified_moment_ids: [],
        reason: NO_USABLE,
        validation: error.validation || null,
        production_started: false,
      };
      await CreativeExecutionStepRepository.complete({
        step_id: step.id,
        step_lease_token: step.lease_token,
        result,
        usage_ids: [],
        provider_call_count: 1,
      });
      return {
        status: "COMPLETED",
        result,
        provider_call_count: 1,
        reused: false,
      };
    }

    if (transientNetworkFailure(error)) {
      const result = {
        usable: false,
        verified_moment_ids: [],
        reason: "PROVIDER_RESULT_AMBIGUOUS_AFTER_NETWORK_FAILURE",
        production_started: false,
      };
      await CreativeExecutionStepRepository.ambiguous({
        step_id: step.id,
        step_lease_token: step.lease_token,
        result,
        error: {
          message: error?.message || String(error),
          cause: error?.cause?.message || null,
          conservative_call_count: 1,
          retry_same_frame: false,
        },
        usage_ids: [],
        provider_call_count: 1,
      });
      return {
        status: "AMBIGUOUS",
        result,
        provider_call_count: 1,
        reused: false,
      };
    }

    await CreativeExecutionStepRepository.fail({
      step_id: step.id,
      step_lease_token: step.lease_token,
      error: {
        message: error?.message || String(error),
        cause: error?.cause?.message || null,
      },
    });
    throw error;
  }
}

export const CreativeCheckpointedShortlistVerificationRuntime = {
  async verifyProject({
    organization_id,
    creative_project_id,
    authorization = {},
    policy = {},
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");

    const job = await activeJob({
      organizationId: organization_id,
      projectId: creative_project_id,
    });
    const nodes = await AssetGraphRepository.listByProject({
      organization_id,
      creative_project_id,
    });
    const report = nodes.filter((node) =>
      node.type === CREATIVE_ASSET_NODE_TYPES.QUALITY_REPORT &&
      node.metadata?.project_shortlist_report === true &&
      node.status !== CREATIVE_ASSET_NODE_STATUS.ARCHIVED,
    ).sort((left, right) =>
      Date.parse(right.created_at || 0) - Date.parse(left.created_at || 0),
    )[0];
    if (!report) throw new Error("PROJECT_SHORTLIST_REPORT_REQUIRED");
    if (!authorizationMatches({ authorization, report })) {
      throw new Error("PAID_ANALYSIS_AUTHORIZATION_MISMATCH");
    }

    const candidates = nodes.filter((node) =>
      node.type === CREATIVE_ASSET_NODE_TYPES.MOMENT &&
      node.metadata?.local_shortlist_candidate === true &&
      node.metadata?.selected_for_ai_verification === true &&
      node.metadata?.project_shortlist_identity ===
        report.metadata?.project_shortlist_identity &&
      node.status !== CREATIVE_ASSET_NODE_STATUS.ARCHIVED,
    ).sort((left, right) =>
      finite(left.metadata?.shortlist_rank, 9999) -
      finite(right.metadata?.shortlist_rank, 9999),
    );
    if (!candidates.length) {
      throw new Error("PROJECT_SHORTLIST_SELECTION_REQUIRED");
    }

    const sampleFractions = Array.isArray(report.metadata?.ai_sample_fractions)
      ? report.metadata.ai_sample_fractions
      : [0.35, 0.7];
    const configuredLimit = finite(report.metadata?.estimated_ai_calls);
    const existingTerminalCalls = candidates.reduce((sum, candidate) => {
      const status = text(candidate.metadata?.ai_verification_status).toUpperCase();
      return sum + (["COMPLETE", "REJECTED"].includes(status)
        ? finite(candidate.metadata?.paid_analysis_calls)
        : 0);
    }, 0);

    const ffmpegPath =
      text(policy.ffmpeg_path || policy.ffmpegPath) ||
      text(process.env.CREATIVE_MEDIA_FFMPEG_PATH);
    if (!ffmpegPath) throw new Error("FFMPEG_NOT_CONFIGURED");
    const timeoutMs = finite(
      policy.timeout_ms ?? policy.timeoutMs ??
      process.env.CREATIVE_MEDIA_TEMPORAL_TIMEOUT_MS,
      60 * 60 * 1000,
    );

    let completedCalls = existingTerminalCalls;
    const results = [];
    const pendingCandidates = candidates.filter((candidate) =>
      !["COMPLETE", "REJECTED"].includes(
        text(candidate.metadata?.ai_verification_status).toUpperCase(),
      ),
    );
    const sourceIds = [...new Set(pendingCandidates
      .map((candidate) => text(candidate.metadata?.source_asset_node_id))
      .filter(Boolean))];

    for (const sourceId of sourceIds) {
      const parent = await AssetGraphRepository.getById(sourceId);
      if (!parent) throw new Error(`LOCAL_SHORTLIST_SOURCE_NOT_FOUND:${sourceId}`);
      const materialized = await materializeMedia({
        url: parent.url,
        file_name: parent.name || null,
        mime_type: parent.technical?.mime_type || null,
        organization_id,
        policy,
      });
      const directory = await fs.mkdtemp(
        path.join(os.tmpdir(), "avantiqo-checkpointed-shortlist-"),
      );

      try {
        const sourceCandidates = pendingCandidates.filter((candidate) =>
          text(candidate.metadata?.source_asset_node_id) === sourceId,
        );
        for (const candidate of sourceCandidates) {
          const excerpt = await createExcerpt({
            organizationId: organization_id,
            parent,
            candidate,
            inputPath: materialized.file_path,
            directory,
            ffmpegPath,
            timeoutMs,
          });
          const frameResults = [];
          for (let index = 0; index < sampleFractions.length; index += 1) {
            if (completedCalls + 1 > configuredLimit) {
              throw new Error("PAID_ANALYSIS_CALL_BUDGET_EXCEEDED");
            }
            const frameResult = await verifyFrame({
              job,
              candidate,
              excerpt,
              fraction: sampleFractions[index],
              fractionIndex: index,
              report,
              policy,
              ffmpegPath,
              timeoutMs,
            });
            completedCalls += finite(frameResult.provider_call_count);
            frameResults.push(frameResult);
          }

          const verifiedMomentIds = [...new Set(frameResults
            .flatMap((item) => item.result?.verified_moment_ids || []))];
          const verificationStatus = verifiedMomentIds.length
            ? "COMPLETE"
            : "REJECTED";
          await AssetGraphRepository.update(candidate.id, {
            metadata: {
              ...object(candidate.metadata),
              ai_verification_status: verificationStatus,
              ai_verification_completed_at: new Date().toISOString(),
              verification_excerpt_node_id: excerpt.id,
              verified_moment_ids: verifiedMomentIds,
              paid_analysis_calls: frameResults.reduce(
                (sum, item) => sum + finite(item.provider_call_count),
                0,
              ),
              ai_verification_frame_results: frameResults,
              ai_verification_error: verifiedMomentIds.length
                ? null
                : NO_USABLE,
              verification_runtime_version:
                "creative-checkpointed-shortlist-verification-v1",
              production_started: false,
            },
          });
          results.push({
            candidate_id: candidate.id,
            verification_status: verificationStatus,
            verified_moment_ids: verifiedMomentIds,
            frame_results: frameResults,
            production_started: false,
          });
        }
      } finally {
        await materialized.cleanup();
        await fs.rm(directory, { recursive: true, force: true });
      }
    }

    const refreshed = await AssetGraphRepository.listByProject({
      organization_id,
      creative_project_id,
    });
    const refreshedCandidates = refreshed.filter((node) =>
      node.type === CREATIVE_ASSET_NODE_TYPES.MOMENT &&
      node.metadata?.local_shortlist_candidate === true &&
      node.metadata?.selected_for_ai_verification === true &&
      node.metadata?.project_shortlist_identity ===
        report.metadata?.project_shortlist_identity,
    );
    const totalCalls = refreshedCandidates.reduce((sum, candidate) =>
      sum + finite(candidate.metadata?.paid_analysis_calls),
      0,
    );
    const verifiedCount = refreshedCandidates.filter((candidate) =>
      candidate.metadata?.ai_verification_status === "COMPLETE",
    ).length;
    const rejectedCount = refreshedCandidates.filter((candidate) =>
      candidate.metadata?.ai_verification_status === "REJECTED",
    ).length;

    await AssetGraphRepository.update(report.id, {
      status: CREATIVE_ASSET_NODE_STATUS.GENERATED,
      review: {
        ...object(report.review),
        ai_reviewed: true,
        approved: false,
        notes:
          "Checkpointed paid verification completed with durable per-frame evidence.",
      },
      metadata: {
        ...object(report.metadata),
        paid_analysis_authorized: true,
        paid_analysis_completed_at: new Date().toISOString(),
        completed_ai_calls: totalCalls,
        verified_candidate_count: verifiedCount,
        rejected_candidate_count: rejectedCount,
        verification_results: results,
        verification_runtime_version:
          "creative-checkpointed-shortlist-verification-v1",
        production_started: false,
      },
    });

    return {
      project_shortlist_identity: report.metadata?.project_shortlist_identity,
      completed_ai_calls: totalCalls,
      configured_call_limit: configuredLimit,
      configured_price_limit: finite(authorization.maximum_customer_price),
      currency: report.metadata?.cost_estimate?.currency,
      verified_candidate_count: verifiedCount,
      rejected_candidate_count: rejectedCount,
      results,
      production_started: false,
    };
  },
};
