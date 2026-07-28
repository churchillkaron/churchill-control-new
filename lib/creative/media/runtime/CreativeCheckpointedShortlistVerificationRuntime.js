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
const FRAME_PROMPT_VERSION = "dense-performance-frame-v2";

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
  return (
    execution?.output?.output ||
    execution?.output?.text ||
    execution?.output ||
    null
  );
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
        reject(new Error("DENSE_SEMANTIC_FFMPEG_TIMEOUT"));
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
          `DENSE_SEMANTIC_FFMPEG_EXIT_${code}`,
        ));
        return;
      }
      resolve();
    });
  });
}

function framePrompt({ requestedSubject, relativeTime, sourceTime, range }) {
  return `
You are Avantiqo's evidence-grade live-performance picture editor. Inspect this
single video frame only. Do not identify any private person by name. Decide
whether this exact frame safely proves that the requested primary performer is
visibly leading the live vocal performance and is technically usable in a
premium artist showreel.

Requested performer role: ${requestedSubject}
Candidate source range: ${range.start_seconds.toFixed(3)}-${range.end_seconds.toFixed(3)} seconds
Frame position inside candidate: ${relativeTime.toFixed(3)} seconds
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

Rules:
- Scores are 0-100.
- VERIFIED requires visible evidence, not inference.
- primary_performer_present requires a clearly visible dominant performance subject.
- lead_vocalist_present requires visible evidence of active singing or lead-vocal performance.
- usable_for_showreel must be false for empty stages, a different dominant musician,
  severe blur, blocked face, unusable exposure, extreme digital zoom, or uncertain evidence.
- Do not infer identity, consent, profession, location, rights, or off-frame activity.
`;
}

function normalizeAnalysis(value = {}) {
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

function acceptedFrame(analysis, policy = {}) {
  const minimumQuality = finite(
    policy.minimum_verified_frame_quality_score ??
    policy.minimumVerifiedFrameQualityScore ??
    policy.minimum_quality_score,
    60,
  );
  return (
    analysis.status === "VERIFIED" &&
    analysis.primary_performer_present === true &&
    analysis.lead_vocalist_present === true &&
    analysis.usable_for_showreel === true &&
    analysis.technical_quality_score >= minimumQuality &&
    analysis.occlusion_risk !== "HIGH"
  );
}

function definitelyPreProviderFailure(error) {
  const message = [
    error?.message,
    error?.cause?.message,
    error?.code,
  ].map(text).join(" ").toUpperCase();
  return [
    "INSUFFICIENT",
    "WALLET",
    "NOT ENABLED FOR ORGANIZATION",
    "NO PRICING",
    "NO PRICED PROVIDER",
    "NO ENABLED CAPABILITY",
    "NO EXECUTION CAPABILITY",
    "CREDENTIAL",
    "FFMPEG",
    "SIGNED URL",
    "STORAGE",
  ].some((marker) => message.includes(marker));
}

function stepFingerprint({ parent, candidate, plan, fraction, index }) {
  return hash({
    runtime_version: DENSE_SEMANTIC_RUNTIME_VERSION,
    frame_prompt_version: FRAME_PROMPT_VERSION,
    candidate_id: candidate.id,
    source_asset_node_id: parent.id,
    source_checksum:
      parent.technical?.checksum || parent.technical?.checksum_sha256 || null,
    original_source_range: plan.original_source_range,
    candidate_plan_identity: plan.plan_identity,
    fraction,
    index,
  });
}

async function extractAndUploadFrame({
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
  const framePath = path.join(
    directory,
    `dense-${safe(candidateId)}-${index}.jpg`,
  );
  await runProcess(ffmpegPath, [
    "-hide_banner",
    "-loglevel", "error",
    "-ss", String(sourceTime),
    "-i", inputPath,
    "-frames:v", "1",
    "-vf", "scale=w='min(1280,iw)':h=-2",
    "-q:v", "2",
    framePath,
  ], timeoutMs);

  const bucket = text(process.env.CREATIVE_MEDIA_DERIVATIVE_BUCKET);
  if (!bucket) throw new Error("DERIVATIVE_STORAGE_BUCKET_REQUIRED");
  const storagePath = [
    safe(organizationId),
    "dense-semantic-frames",
    safe(parent.id),
    `${crypto.randomUUID()}.jpg`,
  ].join("/");
  const buffer = await fs.readFile(framePath);
  const { error: uploadError } = await supabaseAdmin.storage
    .from(bucket)
    .upload(storagePath, buffer, {
      contentType: "image/jpeg",
      upsert: false,
      cacheControl: "900",
    });
  if (uploadError) throw uploadError;

  const { data: signed, error: signedError } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(storagePath, 15 * 60);
  if (signedError) throw signedError;
  if (!signed?.signedUrl) throw new Error("DENSE_FRAME_SIGNED_URL_REQUIRED");

  return {
    image_url: signed.signedUrl,
    bucket,
    storage_path: storagePath,
  };
}

async function verifyFrame({
  job,
  parent,
  candidate,
  plan,
  fraction,
  index,
  policy,
  country,
  currency,
  inputPath,
  directory,
  ffmpegPath,
  timeoutMs,
  currentProviderCalls,
  maximumProviderCalls,
}) {
  const range = plan.original_source_range;
  const relativeTime = Number((range.duration_seconds * fraction).toFixed(6));
  const sourceTime = Number((range.start_seconds + relativeTime).toFixed(6));
  const stepKey = `dense-frame:${candidate.id}:${index}`;
  const step = await CreativeExecutionStepRepository.claim({
    job_id: job.id,
    job_lease_token: job.lease_token,
    step_key: stepKey,
    step_type: "AI_IMAGE_ANALYZE",
    input_fingerprint: stepFingerprint({
      parent,
      candidate,
      plan,
      fraction,
      index,
    }),
    payload: {
      candidate_id: candidate.id,
      source_asset_node_id: parent.id,
      candidate_plan_identity: plan.plan_identity,
      dense_semantic_plan_identity:
        job.payload?.dense_semantic_plan_identity || null,
      sample_fraction: fraction,
      sample_index: index,
      relative_time_seconds: relativeTime,
      source_time_seconds: sourceTime,
      production_started: false,
    },
    lease_seconds: 900,
  });

  if (["COMPLETED", "AMBIGUOUS"].includes(step.status)) {
    return {
      status: step.status,
      result: object(step.result),
      provider_call_count: finite(step.provider_call_count),
      new_provider_call_count: 0,
      reused: true,
    };
  }
  if (!step.lease_token) {
    throw new Error("DENSE_SEMANTIC_STEP_LEASE_REQUIRED");
  }
  if (step.attempt_count > 1) {
    const result = {
      accepted: false,
      sample_fraction: fraction,
      sample_index: index,
      relative_time_seconds: relativeTime,
      source_time_seconds: sourceTime,
      reason: "PRIOR_PROVIDER_OUTCOME_AMBIGUOUS",
      production_started: false,
    };
    await CreativeExecutionStepRepository.ambiguous({
      step_id: step.id,
      step_lease_token: step.lease_token,
      result,
      error: {
        message: "Provider outcome from the prior attempt cannot be proven safe to repeat",
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
      new_provider_call_count: 1,
      reused: false,
    };
  }
  if (currentProviderCalls + 1 > maximumProviderCalls) {
    await CreativeExecutionStepRepository.fail({
      step_id: step.id,
      step_lease_token: step.lease_token,
      error: { message: "DENSE_SEMANTIC_CALL_BUDGET_EXCEEDED" },
    });
    throw new Error("DENSE_SEMANTIC_CALL_BUDGET_EXCEEDED");
  }

  let uploaded = null;
  let providerAttempted = false;
  try {
    uploaded = await extractAndUploadFrame({
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
    providerAttempted = true;
    const requestedSubject =
      text(policy.requested_subject || policy.requestedSubject) ||
      "the primary requested lead vocalist";
    const execution = await ServiceExecutionRuntime.execute({
      organization_id: job.organization_id,
      service_id: "ai.image.analyze",
      provider_id: job.payload?.preflight?.cost_estimate?.provider || null,
      country,
      currency,
      provider_policy: {
        ...object(policy.provider_policy || policy.providerPolicy),
        ...(job.payload?.preflight?.cost_estimate?.provider
          ? {
              allowed_providers: [
                job.payload.preflight.cost_estimate.provider,
              ],
            }
          : {}),
      },
      input: {
        prompt: framePrompt({
          requestedSubject,
          relativeTime,
          sourceTime,
          range,
        }),
        image: uploaded.image_url,
        quantity: 1,
        country,
        currency,
      },
      metadata: {
        module: "CREATIVE",
        operation: "DENSE_SEMANTIC_PERFORMANCE_FRAME_ANALYSIS",
        creative_project_id: job.creative_project_id,
        creative_execution_job_id: job.id,
        source_asset_node_id: parent.id,
        shortlist_candidate_id: candidate.id,
        candidate_plan_identity: plan.plan_identity,
        dense_semantic_plan_identity:
          job.payload?.dense_semantic_plan_identity || null,
        sample_index: index,
        sample_fraction: fraction,
        relative_time_seconds: relativeTime,
        source_time_seconds: sourceTime,
        production_started: false,
      },
      category: "CREATIVE_DENSE_SEMANTIC_VERIFICATION",
    });
    const usageId = execution?.usage?.id || execution?.usage_id || null;

    if (execution?.pending === true) {
      const result = {
        accepted: false,
        sample_fraction: fraction,
        sample_index: index,
        relative_time_seconds: relativeTime,
        source_time_seconds: sourceTime,
        usage_id: usageId,
        provider: execution?.provider || null,
        model: execution?.model || null,
        provider_job_id: execution?.provider_job_id || null,
        reason: "ASYNC_PROVIDER_RESULT_REQUIRES_RECONCILIATION",
        production_started: false,
      };
      await CreativeExecutionStepRepository.ambiguous({
        step_id: step.id,
        step_lease_token: step.lease_token,
        result,
        error: {
          message: result.reason,
          provider_job_id: result.provider_job_id,
          retry_same_frame: false,
        },
        usage_ids: usageId ? [usageId] : [],
        provider_call_count: 1,
      });
      return {
        status: "AMBIGUOUS",
        result,
        provider_call_count: 1,
        new_provider_call_count: 1,
        reused: false,
      };
    }

    const parsed = parseJson(executionOutput(execution));
    const analysis = parsed ? normalizeAnalysis(parsed) : null;
    const accepted = analysis ? acceptedFrame(analysis, policy) : false;
    const result = {
      accepted,
      sample_fraction: fraction,
      sample_index: index,
      relative_time_seconds: relativeTime,
      source_time_seconds: sourceTime,
      analysis,
      usage_id: usageId,
      provider: execution?.provider || null,
      model: execution?.model || null,
      reason: parsed
        ? (accepted ? null : "DENSE_SEMANTIC_FRAME_REJECTED")
        : "DENSE_SEMANTIC_FRAME_INVALID_JSON",
      production_started: false,
    };
    await CreativeExecutionStepRepository.complete({
      step_id: step.id,
      step_lease_token: step.lease_token,
      result,
      usage_ids: usageId ? [usageId] : [],
      provider_call_count: 1,
    });
    return {
      status: "COMPLETED",
      result,
      provider_call_count: 1,
      new_provider_call_count: 1,
      reused: false,
    };
  } catch (error) {
    if (providerAttempted && !definitelyPreProviderFailure(error)) {
      const result = {
        accepted: false,
        sample_fraction: fraction,
        sample_index: index,
        relative_time_seconds: relativeTime,
        source_time_seconds: sourceTime,
        reason: "PROVIDER_RESULT_AMBIGUOUS_AFTER_FAILURE",
        error: error?.message || String(error),
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
        new_provider_call_count: 1,
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
  } finally {
    if (uploaded?.bucket && uploaded?.storage_path) {
      await supabaseAdmin.storage
        .from(uploaded.bucket)
        .remove([uploaded.storage_path])
        .catch(() => null);
    }
  }
}

function candidateTerminal(candidate, plan) {
  const metadata = object(candidate?.metadata);
  return (
    ["COMPLETE", "REJECTED"].includes(upper(metadata.ai_verification_status)) &&
    metadata.verification_runtime_version === DENSE_SEMANTIC_RUNTIME_VERSION &&
    metadata.dense_semantic_plan_identity === plan.plan_identity &&
    metadata.dense_semantic_terminal === true
  );
}

function performanceEvidence(plan, frameResults) {
  const frames = frameResults.map((frame) => ({
    time_seconds: frame.result.relative_time_seconds,
    source_time_seconds: frame.result.source_time_seconds,
    sample_fraction: frame.result.sample_fraction,
    analysis: frame.result.analysis || null,
    usage_id: frame.result.usage_id || null,
    provider: frame.result.provider || null,
    model: frame.result.model || null,
    accepted: frame.result.accepted === true,
    status: frame.status,
    reason: frame.result.reason || null,
  }));
  const analyses = frames.map((frame) => frame.analysis).filter(Boolean);
  const verified = analyses.filter((analysis) => analysis.status === "VERIFIED");
  const quality = average(analyses.map((analysis) => analysis.technical_quality_score));
  const face = average(analyses.map((analysis) => analysis.face_visibility_score));
  const energy = average(analyses.map((analysis) => analysis.performance_energy_score));
  const ratio = (predicate) => analyses.length
    ? analyses.filter(predicate).length / analyses.length
    : 0;
  const primaryRatio = ratio((analysis) => analysis.primary_performer_present);
  const vocalistRatio = ratio((analysis) => analysis.lead_vocalist_present);
  const usableRatio = ratio((analysis) => analysis.usable_for_showreel);
  const microphoneRatio = ratio((analysis) => analysis.microphone_visible);
  const score = clamp(
    quality * 0.4 +
    face * 0.2 +
    energy * 0.2 +
    primaryRatio * 100 * 0.1 +
    vocalistRatio * 100 * 0.1,
  );

  return {
    usable: frames.length === plan.call_count &&
      frames.every((frame) => frame.accepted === true),
    section: {
      start_seconds: 0,
      end_seconds: plan.original_source_range.duration_seconds,
      duration_seconds: plan.original_source_range.duration_seconds,
    },
    frames,
    score,
    quality_score: quality,
    face_visibility_score: face,
    performance_energy_score: energy,
    primary_performer_ratio: primaryRatio,
    lead_vocalist_ratio: vocalistRatio,
    usable_ratio: usableRatio,
    microphone_ratio: microphoneRatio,
    verified_sample_count: verified.length,
    maximum_semantic_sample_gap_seconds: plan.maximum_gap_seconds,
    observed_semantic_sample_gap_seconds: plan.actual_gap_seconds,
  };
}

async function createVerifiedMoment({
  organizationId,
  projectId,
  parent,
  candidate,
  plan,
  evidence,
}) {
  const node = createCreativeAssetNode({
    organization_id: organizationId,
    creative_project_id: projectId,
    creative_asset_id: parent.creative_asset_id,
    parent_asset_node_id: parent.id,
    type: CREATIVE_ASSET_NODE_TYPES.MOMENT,
    status: CREATIVE_ASSET_NODE_STATUS.DERIVED,
    name: `${parent.name || "Source video"} dense verified moment`,
    description:
      "Evidence-grade live-performance moment verified across its complete selected range.",
    url: parent.url,
    storage_path: parent.storage_path || null,
    lineage: {
      source: "dense_semantic_performance_verification",
      provider_id: null,
      capability: "ai.image.analyze",
      generation_version: 2,
    },
    technical: {
      ...object(parent.technical),
      duration_seconds: plan.original_source_range.duration_seconds,
      media_kind: "video",
    },
    intelligence: {
      quality_score: evidence.quality_score,
      reuse_score: evidence.score,
      safety_status: "REVIEW_REQUIRED",
      tags: [
        "dense-semantic-verification",
        "live-performance",
        "lead-vocalist-verified",
        "source-audio-preserved",
      ],
    },
    review: {
      ai_reviewed: true,
      human_reviewed: false,
      approved: false,
      notes: "Dense AI verification complete; final editorial approval remains required.",
    },
    metadata: {
      dense_semantic_verification: true,
      dense_semantic_plan_identity: plan.plan_identity,
      verification_runtime_version: DENSE_SEMANTIC_RUNTIME_VERSION,
      performance_verified: true,
      source_asset_node_id: parent.id,
      render_source_asset_node_id: parent.id,
      local_shortlist_candidate_id: candidate.id,
      project_shortlist_identity:
        candidate.metadata?.project_shortlist_identity || null,
      original_source_range: plan.original_source_range,
      original_source_range_exact: true,
      render_source_range: plan.original_source_range,
      clip_range: plan.original_source_range,
      performance_evidence: evidence,
      score: evidence.score,
      original_audio_preserved: true,
      exact_lip_sync_required: true,
      production_started: false,
      created_at: new Date().toISOString(),
    },
  });

  const created = await AssetGraphRepository.createOrFindByMetadataIdentity({
    node,
    metadata_key: "dense_semantic_plan_identity",
    metadata_value: plan.plan_identity,
  });
  return created.node;
}

async function verifyCandidate({
  job,
  parent,
  candidate,
  plan,
  policy,
  country,
  currency,
  inputPath,
  directory,
  ffmpegPath,
  timeoutMs,
  callCounter,
  maximumProviderCalls,
}) {
  if (candidateTerminal(candidate, plan)) {
    return {
      candidate_id: candidate.id,
      verification_status: upper(candidate.metadata?.ai_verification_status),
      reused: true,
      provider_call_count: finite(candidate.metadata?.paid_analysis_calls),
      verified_moment_ids: candidate.metadata?.verified_moment_ids || [],
    };
  }

  await AssetGraphRepository.update(candidate.id, {
    metadata: {
      ...object(candidate.metadata),
      ai_verification_status: "RUNNING",
      ai_verification_started_at:
        candidate.metadata?.ai_verification_started_at || new Date().toISOString(),
      verification_runtime_version: DENSE_SEMANTIC_RUNTIME_VERSION,
      dense_semantic_plan_identity: plan.plan_identity,
      dense_semantic_execution_identity:
        job.payload?.dense_semantic_plan_identity || null,
      dense_semantic_terminal: false,
      production_started: false,
    },
  });

  const frameResults = [];
  for (let index = 0; index < plan.fractions.length; index += 1) {
    const frame = await verifyFrame({
      job,
      parent,
      candidate,
      plan,
      fraction: plan.fractions[index],
      index,
      policy,
      country,
      currency,
      inputPath,
      directory,
      ffmpegPath,
      timeoutMs,
      currentProviderCalls: callCounter.value,
      maximumProviderCalls,
    });
    callCounter.value += finite(frame.new_provider_call_count);
    frameResults.push(frame);
    if (frame.status === "AMBIGUOUS" || frame.result?.accepted !== true) break;
  }

  const providerCalls = frameResults.reduce(
    (sum, frame) => sum + finite(frame.provider_call_count),
    0,
  );
  const allAccepted =
    frameResults.length === plan.call_count &&
    frameResults.every((frame) =>
      frame.status === "COMPLETED" && frame.result?.accepted === true
    );
  const evidence = performanceEvidence(plan, frameResults);
  let moment = null;

  if (allAccepted) {
    moment = await createVerifiedMoment({
      organizationId: job.organization_id,
      projectId: job.creative_project_id,
      parent,
      candidate,
      plan,
      evidence,
    });
  }

  const verificationStatus = allAccepted ? "COMPLETE" : "REJECTED";
  await AssetGraphRepository.update(candidate.id, {
    metadata: {
      ...object(candidate.metadata),
      ai_verification_status: verificationStatus,
      ai_verification_completed_at: new Date().toISOString(),
      verified_moment_ids: moment ? [moment.id] : [],
      paid_analysis_calls: providerCalls,
      ai_verification_frame_results: frameResults.map((frame) => ({
        status: frame.status,
        accepted: frame.result?.accepted === true,
        ...object(frame.result),
      })),
      ai_verification_error: allAccepted
        ? null
        : frameResults.at(-1)?.result?.reason || "DENSE_SEMANTIC_FRAME_REJECTED",
      verification_runtime_version: DENSE_SEMANTIC_RUNTIME_VERSION,
      dense_semantic_plan_identity: plan.plan_identity,
      dense_semantic_execution_identity:
        job.payload?.dense_semantic_plan_identity || null,
      dense_semantic_terminal: true,
      dense_semantic_verification: allAccepted,
      production_started: false,
    },
  });

  return {
    candidate_id: candidate.id,
    verification_status: verificationStatus,
    provider_call_count: providerCalls,
    verified_moment_ids: moment ? [moment.id] : [],
    frame_results: frameResults,
    production_started: false,
  };
}

export const CreativeCheckpointedShortlistVerificationRuntime = {
  async verifyProject({
    job,
    organization_id,
    creative_project_id,
    authorization = {},
    policy = {},
    country = null,
    currency = null,
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");
    if (!job?.id || !job?.lease_token) {
      throw new Error("DENSE_SEMANTIC_ACTIVE_JOB_REQUIRED");
    }
    if (
      String(job.organization_id) !== String(organization_id) ||
      String(job.creative_project_id) !== String(creative_project_id)
    ) {
      throw new Error("DENSE_SEMANTIC_JOB_CONTEXT_MISMATCH");
    }

    const preflight = await CreativeDenseSemanticExecutionPlanRuntime.preflight({
      organization_id,
      creative_project_id,
      policy,
      country,
      currency,
    });
    if (!preflight.ready) {
      const error = new Error(
        `DENSE_SEMANTIC_PREFLIGHT_FAILED:${preflight.reasons.join(",")}`,
      );
      error.validation = preflight;
      throw error;
    }
    if (
      text(job.payload?.dense_semantic_plan_identity) !==
      text(preflight.dense_semantic_plan_identity)
    ) {
      const error = new Error("DENSE_SEMANTIC_JOB_PLAN_IDENTITY_MISMATCH");
      error.validation = preflight;
      throw error;
    }
    CreativeDenseSemanticExecutionPlanRuntime.assertAuthorization({
      authorization,
      preflight,
    });

    const { report, candidates } =
      await CreativeDenseSemanticExecutionPlanRuntime.context({
        organization_id,
        creative_project_id,
      });
    if (
      text(authorization.project_shortlist_identity) !==
      text(report.metadata?.project_shortlist_identity)
    ) {
      throw new Error("PROJECT_SHORTLIST_IDENTITY_MISMATCH");
    }

    const ffmpegPath =
      text(policy.ffmpeg_path || policy.ffmpegPath) ||
      text(process.env.CREATIVE_MEDIA_FFMPEG_PATH);
    if (!ffmpegPath) throw new Error("FFMPEG_NOT_CONFIGURED");
    const timeoutMs = finite(
      policy.timeout_ms ?? policy.timeoutMs ??
      process.env.CREATIVE_MEDIA_TEMPORAL_TIMEOUT_MS,
      60 * 60 * 1000,
    );
    const maximumProviderCalls = finite(authorization.maximum_ai_calls, -1);
    if (maximumProviderCalls < 0) {
      throw new Error("DENSE_SEMANTIC_CALL_BUDGET_REQUIRED");
    }
    const existingSteps = await CreativeExecutionStepRepository.listByJob(job.id);
    const callCounter = {
      value: existingSteps.reduce(
        (sum, step) => sum + finite(step.provider_call_count),
        0,
      ),
    };
    if (callCounter.value > maximumProviderCalls) {
      throw new Error("DENSE_SEMANTIC_CALL_BUDGET_EXCEEDED");
    }

    const plansByCandidate = new Map(
      preflight.candidate_plans.map((plan) => [String(plan.candidate_id), plan]),
    );
    const pending = candidates.filter((candidate) => {
      const plan = plansByCandidate.get(String(candidate.id));
      return plan?.ready === true && !candidateTerminal(candidate, plan);
    });
    const sourceIds = [...new Set(
      pending
        .map((candidate) => text(candidate.metadata?.source_asset_node_id))
        .filter(Boolean),
    )];
    const results = [];

    for (const sourceId of sourceIds) {
      const parent = await AssetGraphRepository.getById(sourceId);
      if (!parent || String(parent.organization_id) !== String(organization_id)) {
        throw new Error(`LOCAL_SHORTLIST_SOURCE_NOT_FOUND:${sourceId}`);
      }
      if (!parent.url) throw new Error(`LOCAL_SHORTLIST_SOURCE_URL_REQUIRED:${sourceId}`);
      const materialized = await materializeMedia({
        url: parent.url,
        file_name: parent.name || null,
        mime_type: parent.technical?.mime_type || null,
        organization_id,
        policy,
      });
      const directory = await fs.mkdtemp(
        path.join(os.tmpdir(), "avantiqo-dense-semantic-"),
      );

      try {
        for (const candidate of pending.filter((item) =>
          text(item.metadata?.source_asset_node_id) === sourceId
        )) {
          const plan = plansByCandidate.get(String(candidate.id));
          results.push(await verifyCandidate({
            job,
            parent,
            candidate,
            plan,
            policy,
            country,
            currency,
            inputPath: materialized.file_path,
            directory,
            ffmpegPath,
            timeoutMs,
            callCounter,
            maximumProviderCalls,
          }));
        }
      } finally {
        await materialized.cleanup();
        await fs.rm(directory, { recursive: true, force: true });
      }
    }

    const refreshed = await CreativeDenseSemanticExecutionPlanRuntime.context({
      organization_id,
      creative_project_id,
    });
    const refreshedPlans = new Map(
      preflight.candidate_plans.map((plan) => [String(plan.candidate_id), plan]),
    );
    const terminalCandidates = refreshed.candidates.filter((candidate) => {
      const plan = refreshedPlans.get(String(candidate.id));
      return plan && candidateTerminal(candidate, plan);
    });
    if (terminalCandidates.length !== refreshed.candidates.length) {
      throw new Error("DENSE_SEMANTIC_VERIFICATION_INCOMPLETE");
    }

    const totalCalls = terminalCandidates.reduce(
      (sum, candidate) => sum + finite(candidate.metadata?.paid_analysis_calls),
      0,
    );
    const verifiedCount = terminalCandidates.filter((candidate) =>
      upper(candidate.metadata?.ai_verification_status) === "COMPLETE"
    ).length;
    const rejectedCount = terminalCandidates.length - verifiedCount;
    const completedAt = new Date().toISOString();

    await AssetGraphRepository.update(refreshed.report.id, {
      status: CREATIVE_ASSET_NODE_STATUS.GENERATED,
      review: {
        ...object(refreshed.report.review),
        ai_reviewed: true,
        human_reviewed: false,
        approved: false,
        notes:
          "Dense checkpointed verification completed; final editorial approval remains required.",
      },
      metadata: {
        ...object(refreshed.report.metadata),
        paid_analysis_authorized: true,
        paid_analysis_completed_at: completedAt,
        completed_ai_calls: totalCalls,
        verified_candidate_count: verifiedCount,
        rejected_candidate_count: rejectedCount,
        dense_semantic_verification_status: "COMPLETE",
        dense_semantic_plan_identity:
          preflight.dense_semantic_plan_identity,
        verification_runtime_version: DENSE_SEMANTIC_RUNTIME_VERSION,
        verification_results: terminalCandidates.map((candidate) => ({
          candidate_id: candidate.id,
          verification_status: candidate.metadata?.ai_verification_status,
          paid_analysis_calls: finite(candidate.metadata?.paid_analysis_calls),
          verified_moment_ids: candidate.metadata?.verified_moment_ids || [],
          error: candidate.metadata?.ai_verification_error || null,
        })),
        production_started: false,
      },
    });

    return {
      project_shortlist_identity: preflight.project_shortlist_identity,
      dense_semantic_plan_identity: preflight.dense_semantic_plan_identity,
      completed_ai_calls: totalCalls,
      configured_call_limit: maximumProviderCalls,
      configured_price_limit: finite(authorization.maximum_customer_price),
      currency: authorization.currency || preflight.cost_estimate?.currency || null,
      verified_candidate_count: verifiedCount,
      rejected_candidate_count: rejectedCount,
      results,
      production_started: false,
    };
  },
};
