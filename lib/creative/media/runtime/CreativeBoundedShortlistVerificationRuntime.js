import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import {
  getServiceSupabase,
} from "@/lib/shared/supabase/service";
import {
  materializeMedia,
} from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";
import {
  CreativePerformanceVideoIntelligenceRuntime,
} from "@/lib/creative/media/runtime/CreativePerformanceVideoIntelligenceRuntime";
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
const NO_USABLE_SECTIONS = "PERFORMANCE_VIDEO_HAS_NO_VERIFIED_USABLE_SECTIONS";

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

function runProcess(command, args, timeoutMs = null) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    let settled = false;
    let timer = null;

    const finish = (error = null) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (error) reject(error);
      else resolve({
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    };

    if (timeoutMs) {
      timer = setTimeout(() => {
        child.kill("SIGKILL");
        finish(new Error("BOUNDED_SHORTLIST_VERIFICATION_TIMEOUT"));
      }, timeoutMs);
    }

    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", finish);
    child.on("close", (code) => {
      if (code !== 0) {
        finish(new Error(
          Buffer.concat(stderr).toString("utf8") ||
          `BOUNDED_SHORTLIST_VERIFICATION_EXIT_${code}`,
        ));
        return;
      }
      finish();
    });
  });
}

async function uploadExcerpt({
  organizationId,
  parent,
  candidate,
  inputPath,
  directory,
  ffmpegPath,
  timeoutMs,
  policy,
}) {
  const range = candidate.metadata?.original_source_range || {};
  const duration = finite(range.duration_seconds);
  const start = finite(range.start_seconds);
  if (start < 0 || duration <= 0) {
    throw new Error("LOCAL_SHORTLIST_RANGE_INVALID");
  }

  const outputPath = path.join(
    directory,
    `excerpt-${safe(candidate.id)}.mp4`,
  );
  await runProcess(ffmpegPath, [
    "-hide_banner",
    "-loglevel", "error",
    "-ss", String(start),
    "-i", inputPath,
    "-t", String(duration),
    "-map", "0:v:0",
    "-map", "0:a:0?",
    "-c:v", text(policy.video_codec || policy.videoCodec) || "libx264",
    "-preset", text(policy.video_preset || policy.videoPreset) || "medium",
    "-crf", String(finite(policy.video_crf ?? policy.videoCrf, 18)),
    "-c:a", text(policy.audio_codec || policy.audioCodec) || "aac",
    "-b:a", text(policy.audio_bitrate || policy.audioBitrate) || "192k",
    "-movflags", "+faststart",
    outputPath,
  ], timeoutMs);

  const bucket = text(process.env.CREATIVE_MEDIA_DERIVATIVE_BUCKET);
  if (!bucket) throw new Error("DERIVATIVE_STORAGE_BUCKET_REQUIRED");
  const buffer = await fs.readFile(outputPath);
  const storagePath = [
    safe(organizationId),
    "local-shortlist-excerpts",
    safe(parent.id),
    `${crypto.randomUUID()}.mp4`,
  ].join("/");
  const { error } = await supabaseAdmin.storage
    .from(bucket)
    .upload(storagePath, buffer, {
      contentType: "video/mp4",
      upsert: false,
      cacheControl: "3600",
    });
  if (error) throw error;

  const excerpt = createCreativeAssetNode({
    organization_id: organizationId,
    creative_project_id: parent.creative_project_id,
    creative_asset_id: parent.creative_asset_id,
    parent_asset_node_id: parent.id,
    type: CREATIVE_ASSET_NODE_TYPES.VIDEO,
    status: CREATIVE_ASSET_NODE_STATUS.DERIVED,
    name: `${parent.name || "Source video"} shortlist excerpt`,
    description:
      "Locally shortlisted source excerpt undergoing bounded semantic verification.",
    url: creativeStorageUri(bucket, storagePath),
    storage_path: storagePath,
    lineage: {
      source: "bounded_local_media_shortlist_verification",
      provider_id: null,
      capability: "creative.media.local.shortlist.verify",
      generation_version: 2,
    },
    technical: {
      mime_type: "video/mp4",
      duration_seconds: duration,
      media_kind: "video",
      file_size_bytes: buffer.length,
      source_width: parent.technical?.width || null,
      source_height: parent.technical?.height || null,
    },
    intelligence: {
      quality_score: finite(candidate.metadata?.local_score, 0),
      reuse_score: finite(candidate.metadata?.local_score, 0),
      safety_status: "PAID_VERIFICATION_IN_PROGRESS",
      tags: ["bounded-verification", "local-shortlist-excerpt"],
    },
    review: {
      ai_reviewed: false,
      human_reviewed: false,
      approved: false,
    },
    metadata: {
      source_asset_node_id: parent.id,
      local_shortlist_candidate_id: candidate.id,
      original_source_range: range,
      project_shortlist_identity:
        candidate.metadata?.project_shortlist_identity || null,
      production_started: false,
      created_at: new Date().toISOString(),
    },
  });

  return AssetGraphRepository.create(excerpt);
}

function authorizationMatches({ authorization, plan }) {
  return (
    authorization?.approved === true &&
    text(authorization?.project_shortlist_identity) ===
      text(plan.project_shortlist_identity) &&
    finite(authorization?.maximum_ai_calls, -1) ===
      finite(plan.estimated_ai_calls, -2) &&
    sameMoney(
      authorization?.maximum_customer_price,
      plan.cost_estimate?.estimated_customer_price,
    ) &&
    text(authorization?.currency).toUpperCase() ===
      text(plan.cost_estimate?.currency).toUpperCase()
  );
}

function storedRejectedCalls(candidate, sampleFractions) {
  if (
    candidate.metadata?.ai_verification_status !== "FAILED" ||
    candidate.metadata?.ai_verification_error !== NO_USABLE_SECTIONS
  ) return null;

  const validation = object(candidate.metadata?.ai_verification_validation);
  const sections = Array.isArray(validation.detected_sections)
    ? validation.detected_sections.length
    : 0;
  const calls = sections * sampleFractions.length;
  return calls > 0 ? calls : null;
}

async function reconcilePriorCandidate(candidate, sampleFractions) {
  const status = text(candidate.metadata?.ai_verification_status).toUpperCase();
  const recordedCalls = finite(candidate.metadata?.paid_analysis_calls, 0);

  if (status === "COMPLETE" || status === "REJECTED") {
    if (recordedCalls <= 0) {
      throw new Error(
        `PAID_ANALYSIS_RECONCILIATION_REQUIRED:${candidate.id}:${status}`,
      );
    }
    return {
      terminal: true,
      calls: recordedCalls,
      status,
      reconciled: false,
    };
  }

  const rejectedCalls = storedRejectedCalls(candidate, sampleFractions);
  if (rejectedCalls) {
    await AssetGraphRepository.update(candidate.id, {
      metadata: {
        ...object(candidate.metadata),
        ai_verification_status: "REJECTED",
        paid_analysis_calls: rejectedCalls,
        ai_verification_reconciled_at: new Date().toISOString(),
        ai_verification_reconciliation_reason:
          "PRIOR_NO_USABLE_SECTIONS_CALLS_PERSISTED",
      },
    });
    return {
      terminal: true,
      calls: rejectedCalls,
      status: "REJECTED",
      reconciled: true,
    };
  }

  if (
    status === "FAILED" ||
    status === "RUNNING" ||
    status === "FAILED_RECONCILIATION_REQUIRED"
  ) {
    throw new Error(
      `PAID_ANALYSIS_RECONCILIATION_REQUIRED:${candidate.id}:${status}`,
    );
  }

  return {
    terminal: false,
    calls: 0,
    status: status || "PENDING_AUTHORIZATION",
    reconciled: false,
  };
}

export const CreativeBoundedShortlistVerificationRuntime = {
  async verifyProject({
    organization_id,
    creative_project_id,
    authorization = {},
    policy = {},
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");

    const nodes = await AssetGraphRepository.listByProject({
      organization_id,
      creative_project_id,
    });
    const reports = nodes.filter((node) =>
      node.type === CREATIVE_ASSET_NODE_TYPES.QUALITY_REPORT &&
      node.metadata?.project_shortlist_report === true &&
      node.status !== CREATIVE_ASSET_NODE_STATUS.ARCHIVED,
    ).sort((left, right) =>
      Date.parse(right.created_at || 0) - Date.parse(left.created_at || 0),
    );
    const report = reports[0];
    if (!report) throw new Error("PROJECT_SHORTLIST_REPORT_REQUIRED");

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

    const plan = {
      project_shortlist_identity:
        report.metadata?.project_shortlist_identity,
      estimated_ai_calls: finite(report.metadata?.estimated_ai_calls, 0),
      cost_estimate: object(report.metadata?.cost_estimate),
    };
    if (!plan.cost_estimate?.ready) {
      throw new Error(
        plan.cost_estimate?.blocking_reason ||
        "PAID_ANALYSIS_COST_ESTIMATE_NOT_READY",
      );
    }
    if (!authorizationMatches({ authorization, plan })) {
      const error = new Error("PAID_ANALYSIS_AUTHORIZATION_MISMATCH");
      error.validation = {
        required: {
          approved: true,
          project_shortlist_identity: plan.project_shortlist_identity,
          maximum_ai_calls: plan.estimated_ai_calls,
          maximum_customer_price:
            plan.cost_estimate.estimated_customer_price,
          currency: plan.cost_estimate.currency,
        },
      };
      throw error;
    }

    const sampleFractions = Array.isArray(report.metadata?.ai_sample_fractions)
      ? report.metadata.ai_sample_fractions
      : [0.35, 0.7];
    const expectedCallsPerCandidate = sampleFractions.length;
    if (expectedCallsPerCandidate <= 0) {
      throw new Error("PAID_ANALYSIS_SAMPLE_FRACTIONS_REQUIRED");
    }

    const reconciliation = new Map();
    let completedCalls = 0;
    const results = [];

    for (const candidate of candidates) {
      const prior = await reconcilePriorCandidate(candidate, sampleFractions);
      reconciliation.set(candidate.id, prior);
      completedCalls += prior.calls;
      if (completedCalls > plan.estimated_ai_calls) {
        throw new Error("PAID_ANALYSIS_CALL_BUDGET_EXCEEDED");
      }
      if (prior.terminal) {
        results.push({
          candidate_id: candidate.id,
          reused: true,
          reconciled: prior.reconciled,
          verification_status: prior.status,
          paid_analysis_calls: prior.calls,
          verified_moment_ids:
            candidate.metadata?.verified_moment_ids || [],
        });
      }
    }

    const pending = candidates.filter((candidate) =>
      reconciliation.get(candidate.id)?.terminal !== true,
    );
    const sourceIds = [...new Set(pending
      .map((candidate) => text(candidate.metadata?.source_asset_node_id))
      .filter(Boolean))];
    const sources = new Map();
    for (const sourceId of sourceIds) {
      const source = await AssetGraphRepository.getById(sourceId);
      if (
        !source ||
        String(source.organization_id) !== String(organization_id) ||
        String(source.creative_project_id) !== String(creative_project_id)
      ) {
        throw new Error(`LOCAL_SHORTLIST_SOURCE_NOT_FOUND:${sourceId}`);
      }
      sources.set(sourceId, source);
    }

    const ffmpegPath =
      text(policy.ffmpeg_path || policy.ffmpegPath) ||
      text(process.env.CREATIVE_MEDIA_FFMPEG_PATH) ||
      null;
    if (!ffmpegPath) throw new Error("FFMPEG_NOT_CONFIGURED");
    const timeoutMs = finite(
      policy.timeout_ms ?? policy.timeoutMs ??
      process.env.CREATIVE_MEDIA_TEMPORAL_TIMEOUT_MS,
      60 * 60 * 1000,
    );

    for (const sourceId of sourceIds) {
      const parent = sources.get(sourceId);
      const sourceCandidates = pending.filter((candidate) =>
        text(candidate.metadata?.source_asset_node_id) === sourceId,
      );
      const materialized = await materializeMedia({
        url: parent.url,
        file_name: parent.name || null,
        mime_type: parent.technical?.mime_type || null,
        organization_id,
        policy,
      });
      const directory = await fs.mkdtemp(
        path.join(os.tmpdir(), "avantiqo-bounded-shortlist-verify-"),
      );

      try {
        for (const candidate of sourceCandidates) {
          if (
            completedCalls + expectedCallsPerCandidate >
            plan.estimated_ai_calls
          ) {
            throw new Error("PAID_ANALYSIS_CALL_BUDGET_EXCEEDED");
          }

          await AssetGraphRepository.update(candidate.id, {
            metadata: {
              ...object(candidate.metadata),
              ai_verification_status: "RUNNING",
              ai_verification_started_at: new Date().toISOString(),
            },
          });

          let excerpt = null;
          try {
            excerpt = await uploadExcerpt({
              organizationId: organization_id,
              parent,
              candidate,
              inputPath: materialized.file_path,
              directory,
              ffmpegPath,
              timeoutMs,
              policy,
            });
            const verified = await CreativePerformanceVideoIntelligenceRuntime.analyze({
              organization_id,
              parent_asset_node_id: excerpt.id,
              policy: {
                version: `bounded-shortlist-v2-${plan.project_shortlist_identity}`,
                requested_subject:
                  text(policy.requested_subject || policy.requestedSubject) ||
                  "primary requested subject",
                minimum_usable_sections: 1,
                minimum_verified_samples: sampleFractions.length,
                minimum_quality_score:
                  finite(policy.minimum_quality_score, 55),
                minimum_primary_performer_ratio:
                  finite(policy.minimum_primary_performer_ratio, 0.5),
                minimum_vocalist_ratio:
                  finite(policy.minimum_vocalist_ratio, 0.5),
                minimum_section_seconds: 1,
                maximum_section_seconds:
                  finite(candidate.technical?.duration_seconds, 20) + 1,
                minimum_boundary_silence_seconds: 999999,
                sample_fractions: sampleFractions,
                output_width: finite(policy.output_width, 1920),
                output_height: finite(policy.output_height, 1080),
                frame_rate: finite(policy.frame_rate, 30),
                video_codec: text(policy.video_codec) || "libx264",
                video_preset: text(policy.video_preset) || "medium",
                video_crf: finite(policy.video_crf, 18),
                audio_codec: text(policy.audio_codec) || "aac",
                audio_bitrate: text(policy.audio_bitrate) || "192k",
                ffmpeg_path: ffmpegPath,
                timeout_ms: timeoutMs,
                max_bytes: Math.max(
                  finite(excerpt.technical?.file_size_bytes, 0) + 1024 * 1024,
                  finite(policy.max_bytes, 0),
                ),
              },
            });

            completedCalls += expectedCallsPerCandidate;
            const verifiedMomentIds = [];
            for (const moment of verified.moments || []) {
              const updated = await AssetGraphRepository.update(moment.id, {
                metadata: {
                  ...object(moment.metadata),
                  source_asset_node_id: parent.id,
                  original_source_range:
                    candidate.metadata?.original_source_range || null,
                  local_shortlist_candidate_id: candidate.id,
                  project_shortlist_identity:
                    plan.project_shortlist_identity,
                  bounded_paid_verification: true,
                  paid_analysis_calls: expectedCallsPerCandidate,
                  configured_cost_estimate: plan.cost_estimate,
                  production_started: false,
                },
              });
              verifiedMomentIds.push(updated.id);
            }

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
                paid_analysis_calls: expectedCallsPerCandidate,
              },
            });
            results.push({
              candidate_id: candidate.id,
              source_asset_node_id: parent.id,
              excerpt_node_id: excerpt.id,
              verified_moment_ids: verifiedMomentIds,
              verification_status: verificationStatus,
              paid_analysis_calls: expectedCallsPerCandidate,
              reused: verified.reused === true,
            });
          } catch (error) {
            if (error?.message === NO_USABLE_SECTIONS) {
              completedCalls += expectedCallsPerCandidate;
              await AssetGraphRepository.update(candidate.id, {
                metadata: {
                  ...object(candidate.metadata),
                  ai_verification_status: "REJECTED",
                  ai_verification_completed_at: new Date().toISOString(),
                  verification_excerpt_node_id: excerpt?.id || null,
                  verified_moment_ids: [],
                  paid_analysis_calls: expectedCallsPerCandidate,
                  ai_verification_error: error.message,
                  ai_verification_validation: error.validation || null,
                },
              });
              results.push({
                candidate_id: candidate.id,
                source_asset_node_id: parent.id,
                excerpt_node_id: excerpt?.id || null,
                verified_moment_ids: [],
                verification_status: "REJECTED",
                rejection_reason: NO_USABLE_SECTIONS,
                paid_analysis_calls: expectedCallsPerCandidate,
                reused: false,
              });
              continue;
            }

            await AssetGraphRepository.update(candidate.id, {
              metadata: {
                ...object(candidate.metadata),
                ai_verification_status: "FAILED_RECONCILIATION_REQUIRED",
                ai_verification_failed_at: new Date().toISOString(),
                verification_excerpt_node_id: excerpt?.id || null,
                ai_verification_error: error?.message || String(error),
                ai_verification_validation: error?.validation || null,
              },
            });
            throw error;
          }
        }
      } finally {
        await materialized.cleanup();
        await fs.rm(directory, { recursive: true, force: true });
      }
    }

    if (completedCalls > plan.estimated_ai_calls) {
      throw new Error("PAID_ANALYSIS_CALL_BUDGET_EXCEEDED");
    }

    const rejectedCount = results.filter((item) =>
      item.verification_status === "REJECTED",
    ).length;
    const completedCount = results.filter((item) =>
      item.verification_status === "COMPLETE",
    ).length;

    await AssetGraphRepository.update(report.id, {
      status: CREATIVE_ASSET_NODE_STATUS.GENERATED,
      review: {
        ...object(report.review),
        ai_reviewed: true,
        approved: false,
        notes:
          "Bounded paid verification completed; rejected candidates were preserved as evidence and human review remains required.",
      },
      metadata: {
        ...object(report.metadata),
        paid_analysis_authorized: true,
        paid_analysis_completed_at: new Date().toISOString(),
        completed_ai_calls: completedCalls,
        verified_candidate_count: completedCount,
        rejected_candidate_count: rejectedCount,
        verification_results: results,
        verification_runtime_version:
          "creative-bounded-shortlist-verification-v2",
        production_started: false,
      },
    });

    return {
      project_shortlist_identity: plan.project_shortlist_identity,
      completed_ai_calls: completedCalls,
      configured_call_limit: finite(authorization.maximum_ai_calls),
      configured_price_limit: finite(authorization.maximum_customer_price),
      currency: plan.cost_estimate.currency,
      verified_candidate_count: completedCount,
      rejected_candidate_count: rejectedCount,
      results,
      production_started: false,
    };
  },
};
