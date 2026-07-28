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
  CreativeDenseSemanticExecutionPlanRuntime,
} from "@/lib/creative/media/runtime/CreativeDenseSemanticExecutionPlanRuntime";
import {
  DENSE_SEMANTIC_RUNTIME_VERSION,
} from "@/lib/creative/media/runtime/CreativeDenseSemanticPlanRuntime";
import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
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

const supabaseAdmin = getServiceSupabase();
const RECOVERY_VERSION = "creative-dense-semantic-recovery-v1";

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

function upper(value) {
  return text(value).toUpperCase();
}

function clamp(value, minimum = 0, maximum = 100) {
  return Math.max(minimum, Math.min(maximum, finite(value, minimum)));
}

function average(values = [], fallback = 0) {
  const numbers = values
    .map((value) => finite(value, null))
    .filter((value) => value !== null);
  if (!numbers.length) return fallback;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function safe(value, fallback = "media") {
  return text(value || fallback)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || fallback;
}

function hash(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

function parseJson(value) {
  if (value && typeof value === "object") return value;
  const source = text(value);
  if (!source) return null;
  try {
    return JSON.parse(source);
  } catch {
    const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
    if (!fenced) return null;
    try {
      return JSON.parse(fenced);
    } catch {
      return null;
    }
  }
}

function executionOutput(execution = {}) {
  return execution?.output?.output || execution?.output?.text ||
    execution?.output || null;
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
        reject(new Error("DENSE_RECOVERY_FFMPEG_TIMEOUT"));
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
          `DENSE_RECOVERY_FFMPEG_EXIT_${code}`,
        ));
        return;
      }
      resolve();
    });
  });
}

function prompt({ requestedSubject, range, relativeTime, sourceTime }) {
  return `
Inspect this one live-performance video frame as editorial evidence. Do not
identify a private person by name. Determine whether the requested primary lead
vocalist is clearly visible and whether this exact moment is safe for a premium
showreel.

Requested performer role: ${requestedSubject}
Candidate range: ${range.start_seconds.toFixed(3)}-${range.end_seconds.toFixed(3)} seconds
Relative time: ${relativeTime.toFixed(3)} seconds
Absolute source time: ${sourceTime.toFixed(3)} seconds

Return strict JSON only:
{
  "status":"VERIFIED|UNVERIFIED",
  "primary_performer_present":true,
  "lead_vocalist_present":true,
  "microphone_visible":true,
  "face_visibility_score":0,
  "technical_quality_score":0,
  "performance_energy_score":0,
  "usable_for_showreel":true,
  "framing":"CLOSE_UP|MEDIUM|WIDE|DETAIL|UNUSABLE",
  "subject_anchor":{"x":0.5,"y":0.5},
  "crop_safety":{"left":0,"right":1,"top":0,"bottom":1},
  "occlusion_risk":"LOW|MEDIUM|HIGH",
  "reasons":[]
}
`;
}

function normalize(value = {}) {
  const result = object(value?.result || value);
  const anchor = object(result.subject_anchor);
  return {
    status: upper(result.status) === "VERIFIED" ? "VERIFIED" : "UNVERIFIED",
    primary_performer_present: result.primary_performer_present === true,
    lead_vocalist_present: result.lead_vocalist_present === true,
    microphone_visible: result.microphone_visible === true,
    face_visibility_score: clamp(result.face_visibility_score),
    technical_quality_score: clamp(result.technical_quality_score),
    performance_energy_score: clamp(result.performance_energy_score),
    usable_for_showreel: result.usable_for_showreel === true,
    framing: upper(result.framing) || "UNUSABLE",
    subject_anchor: {
      x: clamp(anchor.x, 0, 1),
      y: clamp(anchor.y, 0, 1),
    },
    crop_safety: result.crop_safety || null,
    occlusion_risk: upper(result.occlusion_risk) || "UNKNOWN",
    reasons: Array.isArray(result.reasons)
      ? result.reasons.map(text).filter(Boolean)
      : [],
  };
}

function accepted(analysis, policy = {}) {
  const minimumQuality = finite(
    policy.minimum_verified_frame_quality_score ??
    policy.minimumVerifiedFrameQualityScore ??
    policy.minimum_quality_score,
    55,
  );
  return (
    analysis?.status === "VERIFIED" &&
    analysis.primary_performer_present === true &&
    analysis.lead_vocalist_present === true &&
    analysis.usable_for_showreel === true &&
    analysis.technical_quality_score >= minimumQuality &&
    analysis.occlusion_risk !== "HIGH"
  );
}

function storedFrames(candidate, plan) {
  const source = Array.isArray(candidate.metadata?.ai_verification_frame_results)
    ? candidate.metadata.ai_verification_frame_results
    : [];
  const map = new Map();
  for (const frame of source) {
    const index = finite(frame?.sample_index, -1);
    if (!Number.isInteger(index) || index < 0 || index >= plan.call_count) continue;
    map.set(index, {
      status: upper(frame.status || "COMPLETED"),
      accepted: frame.accepted === true,
      sample_index: index,
      sample_fraction: finite(frame.sample_fraction, plan.fractions[index]),
      relative_time_seconds: finite(frame.relative_time_seconds),
      source_time_seconds: finite(frame.source_time_seconds),
      analysis: frame.analysis || null,
      usage_id: frame.usage_id || null,
      provider: frame.provider || null,
      model: frame.model || null,
      reason: frame.reason || null,
      reused: true,
    });
  }
  return map;
}

async function frameImage({
  organizationId,
  parent,
  inputPath,
  sourceTime,
  directory,
  ffmpegPath,
  timeoutMs,
  candidateId,
  index,
}) {
  const localPath = path.join(directory, `recovery-${safe(candidateId)}-${index}.jpg`);
  await runProcess(ffmpegPath, [
    "-hide_banner", "-loglevel", "error",
    "-ss", String(sourceTime), "-i", inputPath,
    "-frames:v", "1",
    "-vf", "scale=w='min(1280,iw)':h=-2",
    "-q:v", "2", localPath,
  ], timeoutMs);

  const bucket = text(process.env.CREATIVE_MEDIA_DERIVATIVE_BUCKET);
  if (!bucket) throw new Error("DERIVATIVE_STORAGE_BUCKET_REQUIRED");
  const storagePath = [
    safe(organizationId), "dense-semantic-recovery", safe(parent.id),
    `${crypto.randomUUID()}.jpg`,
  ].join("/");
  const buffer = await fs.readFile(localPath);
  const { error: uploadError } = await supabaseAdmin.storage
    .from(bucket)
    .upload(storagePath, buffer, {
      contentType: "image/jpeg",
      upsert: false,
      cacheControl: "900",
    });
  if (uploadError) throw uploadError;
  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(storagePath, 15 * 60);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("DENSE_RECOVERY_SIGNED_URL_REQUIRED");
  return { bucket, storagePath, imageUrl: data.signedUrl };
}

async function analyseFrame({
  job,
  parent,
  candidate,
  plan,
  index,
  policy,
  country,
  currency,
  inputPath,
  directory,
  ffmpegPath,
  timeoutMs,
}) {
  const fraction = plan.fractions[index];
  const relativeTime = Number((plan.original_source_range.duration_seconds * fraction).toFixed(6));
  const sourceTime = Number((plan.original_source_range.start_seconds + relativeTime).toFixed(6));
  const step = await CreativeExecutionStepRepository.claim({
    job_id: job.id,
    job_lease_token: job.lease_token,
    step_key: `dense-recovery:${candidate.id}:${index}`,
    step_type: "AI_IMAGE_ANALYZE",
    input_fingerprint: hash({
      recovery_version: RECOVERY_VERSION,
      candidate_plan_identity: plan.plan_identity,
      source_asset_node_id: parent.id,
      source_checksum:
        parent.technical?.checksum || parent.technical?.checksum_sha256 || null,
      index,
      fraction,
    }),
    payload: {
      candidate_id: candidate.id,
      candidate_plan_identity: plan.plan_identity,
      sample_index: index,
      sample_fraction: fraction,
      relative_time_seconds: relativeTime,
      source_time_seconds: sourceTime,
      production_started: false,
    },
    lease_seconds: 900,
  });

  if (["COMPLETED", "AMBIGUOUS"].includes(step.status)) {
    return {
      status: step.status,
      ...object(step.result),
      reused: true,
    };
  }

  let uploaded = null;
  try {
    uploaded = await frameImage({
      organizationId: job.organization_id,
      parent,
      inputPath,
      sourceTime,
      directory,
      ffmpegPath,
      timeoutMs,
      candidateId: candidate.id,
      index,
    });
    const execution = await ServiceExecutionRuntime.execute({
      organization_id: job.organization_id,
      service_id: "ai.image.analyze",
      provider_id: job.payload?.preflight?.cost_estimate?.provider || null,
      country,
      currency,
      input: {
        prompt: prompt({
          requestedSubject:
            text(policy.requested_subject || policy.requestedSubject) ||
            "the primary requested lead vocalist",
          range: plan.original_source_range,
          relativeTime,
          sourceTime,
        }),
        image: uploaded.imageUrl,
        quantity: 1,
        country,
        currency,
      },
      metadata: {
        module: "CREATIVE",
        operation: "DENSE_SEMANTIC_RECOVERY_FRAME_ANALYSIS",
        creative_project_id: job.creative_project_id,
        creative_execution_job_id: job.id,
        candidate_id: candidate.id,
        candidate_plan_identity: plan.plan_identity,
        sample_index: index,
        production_started: false,
      },
      category: "CREATIVE_DENSE_SEMANTIC_VERIFICATION",
    });
    const usageId = execution?.usage?.id || execution?.usage_id || null;
    if (execution?.pending === true) {
      const result = {
        accepted: false,
        sample_index: index,
        sample_fraction: fraction,
        relative_time_seconds: relativeTime,
        source_time_seconds: sourceTime,
        usage_id: usageId,
        provider: execution.provider || null,
        model: execution.model || null,
        reason: "ASYNC_PROVIDER_RESULT_REQUIRES_RECONCILIATION",
      };
      await CreativeExecutionStepRepository.ambiguous({
        step_id: step.id,
        step_lease_token: step.lease_token,
        result,
        error: { message: result.reason, retry_same_frame: false },
        usage_ids: usageId ? [usageId] : [],
        provider_call_count: 1,
      });
      return { status: "AMBIGUOUS", ...result, reused: false };
    }

    const parsed = parseJson(executionOutput(execution));
    const analysis = parsed ? normalize(parsed) : null;
    const result = {
      accepted: analysis ? accepted(analysis, policy) : false,
      sample_index: index,
      sample_fraction: fraction,
      relative_time_seconds: relativeTime,
      source_time_seconds: sourceTime,
      analysis,
      usage_id: usageId,
      provider: execution.provider || null,
      model: execution.model || null,
      reason: parsed ? null : "DENSE_RECOVERY_INVALID_JSON",
    };
    await CreativeExecutionStepRepository.complete({
      step_id: step.id,
      step_lease_token: step.lease_token,
      result,
      usage_ids: usageId ? [usageId] : [],
      provider_call_count: 1,
    });
    return { status: "COMPLETED", ...result, reused: false };
  } catch (error) {
    await CreativeExecutionStepRepository.ambiguous({
      step_id: step.id,
      step_lease_token: step.lease_token,
      result: {
        accepted: false,
        sample_index: index,
        sample_fraction: fraction,
        relative_time_seconds: relativeTime,
        source_time_seconds: sourceTime,
        reason: "DENSE_RECOVERY_PROVIDER_OUTCOME_AMBIGUOUS",
      },
      error: {
        message: error?.message || String(error),
        cause: error?.cause?.message || null,
        retry_same_frame: false,
      },
      usage_ids: [],
      provider_call_count: 1,
    });
    return {
      status: "AMBIGUOUS",
      accepted: false,
      sample_index: index,
      sample_fraction: fraction,
      relative_time_seconds: relativeTime,
      source_time_seconds: sourceTime,
      reason: "DENSE_RECOVERY_PROVIDER_OUTCOME_AMBIGUOUS",
      reused: false,
    };
  } finally {
    if (uploaded) {
      await supabaseAdmin.storage
        .from(uploaded.bucket)
        .remove([uploaded.storagePath])
        .catch(() => null);
    }
  }
}

function acceptedRanges(plan, frames) {
  const ordered = [...frames].sort((a, b) => a.sample_index - b.sample_index);
  const points = ordered.map((frame) => frame.relative_time_seconds);
  const segments = ordered.map((frame, index) => {
    const start = index === 0
      ? 0
      : (points[index - 1] + points[index]) / 2;
    const end = index === ordered.length - 1
      ? plan.original_source_range.duration_seconds
      : (points[index] + points[index + 1]) / 2;
    return {
      accepted: frame.accepted === true && frame.status === "COMPLETED",
      start_seconds: start,
      end_seconds: end,
      frames: [frame],
    };
  });

  const groups = [];
  for (const segment of segments) {
    if (!segment.accepted) continue;
    const previous = groups.at(-1);
    if (previous && Math.abs(previous.end_seconds - segment.start_seconds) <= 0.001) {
      previous.end_seconds = segment.end_seconds;
      previous.frames.push(...segment.frames);
    } else {
      groups.push({ ...segment });
    }
  }

  return groups
    .filter((group) => group.end_seconds - group.start_seconds >= 0.75)
    .map((group, index) => ({
      index,
      relative_range: {
        start_seconds: Number(group.start_seconds.toFixed(6)),
        end_seconds: Number(group.end_seconds.toFixed(6)),
        duration_seconds: Number((group.end_seconds - group.start_seconds).toFixed(6)),
      },
      original_source_range: {
        start_seconds: Number((
          plan.original_source_range.start_seconds + group.start_seconds
        ).toFixed(6)),
        end_seconds: Number((
          plan.original_source_range.start_seconds + group.end_seconds
        ).toFixed(6)),
        duration_seconds: Number((group.end_seconds - group.start_seconds).toFixed(6)),
      },
      frames: group.frames,
    }));
}

async function createMoments({ job, parent, candidate, plan, ranges }) {
  const moments = [];
  for (const range of ranges) {
    const analyses = range.frames.map((frame) => frame.analysis).filter(Boolean);
    const quality = average(analyses.map((analysis) => analysis.technical_quality_score));
    const energy = average(analyses.map((analysis) => analysis.performance_energy_score));
    const face = average(analyses.map((analysis) => analysis.face_visibility_score));
    const score = clamp(quality * 0.5 + energy * 0.25 + face * 0.25);
    const identity = hash({
      recovery_version: RECOVERY_VERSION,
      candidate_plan_identity: plan.plan_identity,
      original_source_range: range.original_source_range,
    });
    const node = createCreativeAssetNode({
      organization_id: job.organization_id,
      creative_project_id: job.creative_project_id,
      creative_asset_id: parent.creative_asset_id,
      parent_asset_node_id: parent.id,
      type: CREATIVE_ASSET_NODE_TYPES.MOMENT,
      status: CREATIVE_ASSET_NODE_STATUS.DERIVED,
      name: `${parent.name || "Source video"} verified performance range`,
      description:
        "Dense semantic analysis verified this exact contiguous source range for editorial use.",
      url: parent.url,
      storage_path: parent.storage_path || null,
      lineage: {
        source: "dense_semantic_recovery",
        provider_id: null,
        capability: "ai.image.analyze",
        generation_version: 3,
      },
      technical: {
        ...object(parent.technical),
        duration_seconds: range.original_source_range.duration_seconds,
        media_kind: "video",
      },
      intelligence: {
        quality_score: quality,
        reuse_score: score,
        safety_status: "REVIEW_REQUIRED",
        tags: [
          "dense-semantic-verification",
          "lead-vocalist-verified",
          "exact-source-range",
        ],
      },
      review: {
        ai_reviewed: true,
        human_reviewed: false,
        approved: false,
        notes: "Dense AI evidence complete; editorial approval remains required.",
      },
      metadata: {
        dense_semantic_verification: true,
        dense_semantic_recovery_identity: identity,
        dense_semantic_plan_identity: plan.plan_identity,
        verification_runtime_version: DENSE_SEMANTIC_RUNTIME_VERSION,
        performance_verified: true,
        source_asset_node_id: parent.id,
        render_source_asset_node_id: parent.id,
        local_shortlist_candidate_id: candidate.id,
        project_shortlist_identity:
          candidate.metadata?.project_shortlist_identity || null,
        original_source_range: range.original_source_range,
        original_source_range_exact: true,
        render_source_range: range.original_source_range,
        clip_range: range.original_source_range,
        performance_evidence: {
          usable: true,
          section: range.relative_range,
          frames: range.frames,
          score,
          quality_score: quality,
          face_visibility_score: face,
          performance_energy_score: energy,
          verified_sample_count: range.frames.length,
        },
        score,
        original_audio_preserved: true,
        exact_lip_sync_required: true,
        production_started: false,
      },
    });
    const created = await AssetGraphRepository.createOrFindByMetadataIdentity({
      node,
      metadata_key: "dense_semantic_recovery_identity",
      metadata_value: identity,
    });
    moments.push(created.node);
  }
  return moments;
}

export const CreativeDenseSemanticRecoveryRuntime = {
  async execute({
    job,
    organization_id,
    creative_project_id,
    authorization = {},
    policy = {},
    country = null,
    currency = null,
  } = {}) {
    if (!job?.id || !job?.lease_token) throw new Error("DENSE_RECOVERY_ACTIVE_JOB_REQUIRED");
    const preflight = await CreativeDenseSemanticExecutionPlanRuntime.preflight({
      organization_id,
      creative_project_id,
      policy,
      country,
      currency,
    });
    CreativeDenseSemanticExecutionPlanRuntime.assertAuthorization({
      authorization,
      preflight,
    });
    if (
      text(job.payload?.dense_semantic_plan_identity) !==
      text(preflight.dense_semantic_plan_identity)
    ) throw new Error("DENSE_RECOVERY_PLAN_IDENTITY_MISMATCH");

    const { report, candidates } =
      await CreativeDenseSemanticExecutionPlanRuntime.context({
        organization_id,
        creative_project_id,
      });
    const plans = new Map(
      preflight.candidate_plans.map((plan) => [String(plan.candidate_id), plan]),
    );
    const ffmpegPath =
      text(policy.ffmpeg_path || policy.ffmpegPath) ||
      text(process.env.CREATIVE_MEDIA_FFMPEG_PATH);
    if (!ffmpegPath) throw new Error("FFMPEG_NOT_CONFIGURED");
    const timeoutMs = finite(
      policy.timeout_ms ?? policy.timeoutMs ??
      process.env.CREATIVE_MEDIA_TEMPORAL_TIMEOUT_MS,
      60 * 60 * 1000,
    );
    const results = [];

    for (const candidate of candidates) {
      const plan = plans.get(String(candidate.id));
      if (!plan?.ready || plan.reusable) continue;
      const parent = await AssetGraphRepository.getById(
        candidate.metadata?.source_asset_node_id,
      );
      if (!parent?.url) {
        throw new Error(`DENSE_RECOVERY_SOURCE_REQUIRED:${candidate.id}`);
      }
      const materialized = await materializeMedia({
        url: parent.url,
        file_name: parent.name || null,
        mime_type: parent.technical?.mime_type || null,
        organization_id,
        policy,
      });
      const directory = await fs.mkdtemp(
        path.join(os.tmpdir(), "avantiqo-dense-recovery-"),
      );
      try {
        const frames = storedFrames(candidate, plan);
        for (let index = 0; index < plan.call_count; index += 1) {
          if (frames.has(index)) continue;
          const frame = await analyseFrame({
            job,
            parent,
            candidate,
            plan,
            index,
            policy,
            country,
            currency,
            inputPath: materialized.file_path,
            directory,
            ffmpegPath,
            timeoutMs,
          });
          frames.set(index, frame);
          const ordered = [...frames.values()].sort(
            (left, right) => left.sample_index - right.sample_index,
          );
          await AssetGraphRepository.update(candidate.id, {
            metadata: {
              ...object(candidate.metadata),
              ai_verification_status: "RUNNING",
              paid_analysis_calls: ordered.length,
              ai_verification_frame_results: ordered,
              verification_runtime_version: DENSE_SEMANTIC_RUNTIME_VERSION,
              dense_semantic_plan_identity: plan.plan_identity,
              dense_semantic_execution_identity:
                preflight.dense_semantic_plan_identity,
              dense_semantic_terminal: false,
              production_started: false,
            },
          });
        }

        const ordered = [...frames.values()].sort(
          (left, right) => left.sample_index - right.sample_index,
        );
        if (ordered.length !== plan.call_count) {
          throw new Error(`DENSE_RECOVERY_INCOMPLETE:${candidate.id}`);
        }
        const ranges = acceptedRanges(plan, ordered);
        const moments = await createMoments({
          job,
          parent,
          candidate,
          plan,
          ranges,
        });
        const status = moments.length ? "COMPLETE" : "REJECTED";
        await AssetGraphRepository.update(candidate.id, {
          metadata: {
            ...object(candidate.metadata),
            ai_verification_status: status,
            ai_verification_completed_at: new Date().toISOString(),
            paid_analysis_calls: ordered.length,
            ai_verification_frame_results: ordered,
            verified_moment_ids: moments.map((moment) => moment.id),
            ai_verification_error: moments.length
              ? null
              : "NO_CONTIGUOUS_VERIFIED_PERFORMANCE_RANGE",
            verification_runtime_version: DENSE_SEMANTIC_RUNTIME_VERSION,
            dense_semantic_plan_identity: plan.plan_identity,
            dense_semantic_execution_identity:
              preflight.dense_semantic_plan_identity,
            dense_semantic_terminal: true,
            dense_semantic_verification: moments.length > 0,
            production_started: false,
          },
        });
        results.push({
          candidate_id: candidate.id,
          verification_status: status,
          paid_analysis_calls: ordered.length,
          accepted_range_count: ranges.length,
          verified_moment_ids: moments.map((moment) => moment.id),
        });
      } finally {
        await materialized.cleanup();
        await fs.rm(directory, { recursive: true, force: true });
      }
    }

    const refreshed = await CreativeDenseSemanticExecutionPlanRuntime.context({
      organization_id,
      creative_project_id,
    });
    const terminal = refreshed.candidates.filter((candidate) =>
      candidate.metadata?.dense_semantic_terminal === true &&
      candidate.metadata?.verification_runtime_version ===
        DENSE_SEMANTIC_RUNTIME_VERSION
    );
    if (terminal.length !== refreshed.candidates.length) {
      throw new Error("DENSE_RECOVERY_PROJECT_INCOMPLETE");
    }
    const completedCalls = terminal.reduce(
      (sum, candidate) => sum + finite(candidate.metadata?.paid_analysis_calls),
      0,
    );
    const verifiedCount = terminal.filter((candidate) =>
      upper(candidate.metadata?.ai_verification_status) === "COMPLETE"
    ).length;
    const rejectedCount = terminal.length - verifiedCount;

    await AssetGraphRepository.update(report.id, {
      status: CREATIVE_ASSET_NODE_STATUS.GENERATED,
      review: {
        ...object(report.review),
        ai_reviewed: true,
        human_reviewed: false,
        approved: false,
        notes:
          "Dense semantic recovery completed across all planned frame positions.",
      },
      metadata: {
        ...object(report.metadata),
        paid_analysis_authorized: true,
        paid_analysis_completed_at: new Date().toISOString(),
        completed_ai_calls: completedCalls,
        verified_candidate_count: verifiedCount,
        rejected_candidate_count: rejectedCount,
        dense_semantic_verification_status: "COMPLETE",
        dense_semantic_plan_identity: preflight.dense_semantic_plan_identity,
        verification_runtime_version: DENSE_SEMANTIC_RUNTIME_VERSION,
        recovery_runtime_version: RECOVERY_VERSION,
        production_started: false,
      },
    });

    return {
      project_shortlist_identity: preflight.project_shortlist_identity,
      dense_semantic_plan_identity: preflight.dense_semantic_plan_identity,
      completed_ai_calls: completedCalls,
      configured_call_limit: finite(authorization.maximum_ai_calls),
      configured_price_limit: finite(authorization.maximum_customer_price),
      currency: authorization.currency,
      verified_candidate_count: verifiedCount,
      rejected_candidate_count: rejectedCount,
      results,
      production_started: false,
    };
  },
};
