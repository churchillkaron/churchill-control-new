import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import {
  runAIService,
} from "@/lib/platform/service-runtime/ai";
import {
  CreativeAssetGraphRuntime,
} from "@/lib/creative/assets/graph/runtime/CreativeAssetGraphRuntime";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import {
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
  createCreativeAssetNode,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import {
  materializeMedia,
} from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";
import {
  resolveCreativeFfmpegPath,
} from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";
import {
  creativeStorageUri,
  signCreativeStorageReference,
} from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";
import {
  getServiceSupabase,
} from "@/lib/shared/supabase/service";
import {
  CreativeShotRuntime,
} from "@/lib/creative/video/runtime/CreativeShotVideoRoutingRuntime";
import {
  CreativeApprovedProductionSpendGuardRuntime,
} from "@/lib/creative/quality/runtime/CreativeApprovedProductionSpendGuardRuntime";

const CONTRACT = "CREATIVE_SHOT_CANDIDATE_REVIEW_V1";
const REVIEW_CHECKS = Object.freeze([
  "shot_purpose",
  "identity_continuity",
  "product_fidelity",
  "anatomy_and_object_integrity",
  "physics_and_contact",
  "camera_plausibility",
  "motion_cadence",
  "performance_authenticity",
  "environmental_coherence",
  "continuity",
  "exposure_colour_and_texture",
  "detectable_synthetic_artifacts",
]);
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

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function safe(value, fallback = "shot") {
  return text(value)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || fallback;
}

function run(command, args, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "ignore", "pipe"],
    });
    const stderr = [];
    let timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("SHOT_CANDIDATE_REVIEW_SAMPLING_TIMEOUT"));
    }, timeoutMs);
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(
          Buffer.concat(stderr).toString("utf8") ||
          `SHOT_CANDIDATE_REVIEW_SAMPLING_EXIT_${code}`,
        ));
        return;
      }
      resolve();
    });
  });
}

function parseJson(value) {
  const source = text(value)
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    const parsed = JSON.parse(source);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("object required");
    }
    return parsed;
  } catch (error) {
    throw new Error(`SHOT_CANDIDATE_REVIEW_INVALID_JSON:${error.message}`);
  }
}

function unwrapExecution(value = {}) {
  let current = value?.output || value;
  const seen = new Set();
  while (
    current && typeof current === "object" &&
    current.output && typeof current.output === "object" &&
    !seen.has(current)
  ) {
    seen.add(current);
    current = current.output;
  }
  return current || {};
}

function reviewPolicy(input = {}) {
  const policy = object(input.policy);
  return {
    version: text(policy.version || "CREATIVE_SHOT_CANDIDATE_REVIEW_POLICY_V1"),
    service_id: text(policy.service_id || "ai.image.analyze"),
    capability: text(policy.capability || "ai.image.analyze"),
    model: text(policy.model),
    provider_id: text(policy.provider_id) || null,
    minimum_score: Math.max(94, finite(policy.minimum_score, 94)),
    minimum_confidence: Math.max(85, finite(policy.minimum_confidence, 85)),
    sample_frame_count: Math.max(6, Math.min(12, finite(policy.sample_frame_count, 9))),
    evidence_bucket: text(
      policy.evidence_bucket ||
      process.env.CREATIVE_MEDIA_DERIVATIVE_BUCKET,
    ),
    provider_policy: object(policy.provider_policy),
    maximum_review_customer_price:
      finite(policy.maximum_review_customer_price),
  };
}

function reviewPrompt({ shotBible, policy, candidate }) {
  return [
    "You are Avantiqo's senior film dailies reviewer. Judge the ACTUAL generated shot candidate, not the plan.",
    "Use only visible evidence from the supplied contact sheet plus the structured Shot Bible.",
    "Do not reward ambition. Fail any visible defect that would prevent major-brand release.",
    "Return JSON only. Every failed dimension must include bounded repair instructions that change only the failed requirement.",
    `World-class minimum score per applicable check: ${policy.minimum_score}`,
    `Minimum confidence: ${policy.minimum_confidence}`,
    `Checks: ${JSON.stringify(REVIEW_CHECKS)}`,
    `Candidate: ${JSON.stringify({
      asset_node_id: candidate.id,
      provider: candidate.lineage?.provider_id || null,
      technical: candidate.technical || {},
    })}`,
    `Shot Bible: ${JSON.stringify(shotBible)}`,
    "Required shape:",
    JSON.stringify({
      contract: CONTRACT,
      verdict: "PASS|FAIL",
      summary: "evidence-based conclusion",
      checks: Object.fromEntries(REVIEW_CHECKS.map((id) => [id, {
        status: "PASS|FAIL|NOT_APPLICABLE",
        score: 0,
        confidence: 0,
        evidence: [],
        repair_instructions: [],
      }])),
    }),
  ].join("\n\n");
}

function evaluate(review = {}, policy = {}) {
  const checks = REVIEW_CHECKS.map((id) => {
    const source = object(review.checks?.[id]);
    return {
      id,
      status: text(source.status).toUpperCase(),
      score: finite(source.score),
      confidence: finite(source.confidence),
      evidence: list(source.evidence).map(text).filter(Boolean),
      repair_instructions:
        list(source.repair_instructions).map(text).filter(Boolean),
    };
  });

  const failures = [];
  for (const check of checks) {
    if (!["PASS", "FAIL", "NOT_APPLICABLE"].includes(check.status)) {
      failures.push(`${check.id}:STATUS_REQUIRED`);
      continue;
    }
    if (check.status === "NOT_APPLICABLE") continue;
    if (!check.evidence.length) failures.push(`${check.id}:EVIDENCE_REQUIRED`);
    if (check.score === null || check.score < 0 || check.score > 100) {
      failures.push(`${check.id}:SCORE_INVALID`);
    }
    if (check.confidence === null || check.confidence < policy.minimum_confidence) {
      failures.push(`${check.id}:CONFIDENCE_LOW`);
    }
    if (check.status === "PASS" && check.score < policy.minimum_score) {
      failures.push(`${check.id}:SCORE_BELOW_WORLD_CLASS_FLOOR`);
    }
    if (check.status === "FAIL" && !check.repair_instructions.length) {
      failures.push(`${check.id}:REPAIR_INSTRUCTIONS_REQUIRED`);
    }
  }

  const failedChecks = checks.filter((check) => check.status === "FAIL");
  const scored = checks.filter((check) =>
    check.status !== "NOT_APPLICABLE" && check.score !== null,
  );
  const overall = scored.length
    ? Math.round(scored.reduce((sum, check) => sum + check.score, 0) / scored.length)
    : 0;
  const passed = failures.length === 0 && failedChecks.length === 0;

  return {
    passed,
    overall_score: overall,
    checks,
    failed_checks: failedChecks.map((check) => check.id),
    validation_failures: failures,
    repair_instructions: [...new Set(
      failedChecks.flatMap((check) => check.repair_instructions),
    )],
  };
}

async function createContactSheet({
  organization_id,
  creative_project_id,
  candidate,
  policy,
}) {
  const ffmpeg = resolveCreativeFfmpegPath(policy);
  if (!ffmpeg) throw new Error("SHOT_CANDIDATE_REVIEW_FFMPEG_REQUIRED");
  if (!policy.evidence_bucket) {
    throw new Error("SHOT_CANDIDATE_REVIEW_EVIDENCE_BUCKET_REQUIRED");
  }

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-shot-review-"));
  const materialized = await materializeMedia({
    organization_id,
    url: candidate.url,
    file_name: candidate.name || null,
    mime_type: candidate.technical?.mime_type || null,
    policy,
  });
  try {
    const outputPath = path.join(directory, "contact-sheet.jpg");
    const duration = Math.max(1, finite(candidate.technical?.duration_seconds, 5));
    const interval = Math.max(duration / policy.sample_frame_count, 0.2);
    const columns = Math.ceil(Math.sqrt(policy.sample_frame_count));
    const rows = Math.ceil(policy.sample_frame_count / columns);
    await run(ffmpeg, [
      "-y",
      "-i",
      materialized.file_path,
      "-vf",
      `fps=1/${interval},scale=512:-1,tile=${columns}x${rows}:padding=8:margin=8`,
      "-frames:v",
      "1",
      outputPath,
    ]);

    const storagePath = [
      safe(organization_id),
      "shot-candidate-review",
      safe(creative_project_id),
      safe(candidate.id),
      `${crypto.randomUUID()}.jpg`,
    ].join("/");
    const bytes = await fs.readFile(outputPath);
    const { error } = await supabaseAdmin.storage
      .from(policy.evidence_bucket)
      .upload(storagePath, bytes, {
        contentType: "image/jpeg",
        upsert: false,
      });
    if (error) throw error;
    return creativeStorageUri(policy.evidence_bucket, storagePath);
  } finally {
    await materialized.cleanup();
    await fs.rm(directory, { recursive: true, force: true });
  }
}

async function candidateContext({ organization_id, asset_node_id }) {
  const candidate = await AssetGraphRepository.getById(asset_node_id);
  if (
    !candidate ||
    text(candidate.organization_id) !== text(organization_id) ||
    candidate.type !== CREATIVE_ASSET_NODE_TYPES.VIDEO
  ) {
    throw new Error("CREATIVE_SHOT_CANDIDATE_VIDEO_NOT_FOUND");
  }
  const taskId = text(
    candidate.production_task_id || candidate.metadata?.production_task_id,
  );
  if (!taskId) throw new Error("CREATIVE_SHOT_CANDIDATE_TASK_REQUIRED");
  const task = await CreativeShotRuntime.enrichTask(taskId);
  return {
    candidate,
    task,
    shot_bible: task.input?.shot_bible,
  };
}

export const CreativeShotCandidateReviewRuntime = {
  async analyze({
    organization_id,
    asset_node_id,
    policy = {},
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!asset_node_id) throw new Error("asset_node_id required");

    const resolvedPolicy = reviewPolicy({ policy });
    if (!resolvedPolicy.model) {
      throw new Error("SHOT_CANDIDATE_REVIEW_MODEL_REQUIRED");
    }
    if (
      resolvedPolicy.maximum_review_customer_price === null ||
      resolvedPolicy.maximum_review_customer_price <= 0
    ) {
      throw new Error("SHOT_CANDIDATE_REVIEW_PRICE_CEILING_REQUIRED");
    }

    const context = await candidateContext({ organization_id, asset_node_id });
    if (!context.shot_bible) {
      throw new Error("SHOT_CANDIDATE_REVIEW_SHOT_BIBLE_REQUIRED");
    }

    const spend = await CreativeApprovedProductionSpendGuardRuntime
      .assertAdditionalSpendAllowed({
        source_task: context.task,
        projected_cost: resolvedPolicy.maximum_review_customer_price,
      });

    const evidenceUri = await createContactSheet({
      organization_id,
      creative_project_id: context.candidate.creative_project_id,
      candidate: context.candidate,
      policy: resolvedPolicy,
    });
    const evidenceUrl = await signCreativeStorageReference({
      organization_id,
      reference: evidenceUri,
    });

    const execution = await runAIService.execute({
      organization_id,
      service_id: resolvedPolicy.service_id,
      provider_id: resolvedPolicy.provider_id,
      capability: resolvedPolicy.capability,
      input: {
        capability: resolvedPolicy.capability,
        model: resolvedPolicy.model,
        image: evidenceUrl,
        quantity: 1,
        prompt: reviewPrompt({
          shotBible: context.shot_bible,
          policy: resolvedPolicy,
          candidate: context.candidate,
        }),
        temperature: 0,
        max_output_tokens: 9000,
      },
      metadata: {
        module: "CREATIVE",
        operation: "SHOT_CANDIDATE_VISUAL_REVIEW",
        creative_project_id: context.candidate.creative_project_id,
        production_graph_id: context.task.production_graph_id,
        production_task_id: context.task.id,
        shot_id: context.task.shot_id,
        candidate_asset_node_id: context.candidate.id,
        approved_spend_guard_contract: spend.contract,
        approved_spend_ceiling: spend.approved_ceiling,
      },
      provider_policy: resolvedPolicy.provider_policy,
    });
    if (execution.pending) {
      throw new Error("SHOT_CANDIDATE_ASYNC_REVIEW_NOT_SUPPORTED");
    }

    const output = unwrapExecution(execution);
    const review = parseJson(output.text || output.response || output.result);
    const evaluation = evaluate(review, resolvedPolicy);
    if (Number(execution.pricing?.customer_price || 0) >
        resolvedPolicy.maximum_review_customer_price + 0.000001) {
      throw new Error("SHOT_CANDIDATE_REVIEW_ACTUAL_PRICE_EXCEEDS_CEILING");
    }

    const report = createCreativeAssetNode({
      organization_id,
      creative_project_id: context.candidate.creative_project_id,
      parent_asset_node_id: context.candidate.id,
      type: CREATIVE_ASSET_NODE_TYPES.QUALITY_REPORT,
      status: evaluation.passed
        ? CREATIVE_ASSET_NODE_STATUS.REVIEW
        : CREATIVE_ASSET_NODE_STATUS.REJECTED,
      name: `${context.candidate.name || "Shot"} candidate review`,
      description: review.summary || "World-class shot candidate visual review.",
      lineage: {
        source: "shot_candidate_visual_review",
        provider_id: execution.provider || null,
        capability: resolvedPolicy.capability,
        generation_version: resolvedPolicy.version,
      },
      intelligence: {
        quality_score: evaluation.overall_score,
        safety_status: evaluation.passed ? "REVIEW_REQUIRED" : "REJECTED",
        tags: ["shot-candidate", "visual-review", "world-class-gate"],
      },
      cost: {
        currency: execution.pricing?.currency || null,
        estimated: resolvedPolicy.maximum_review_customer_price,
        actual: Number(execution.pricing?.customer_price || 0),
      },
      review: {
        ai_reviewed: true,
        human_reviewed: false,
        approved: false,
        notes: review.summary || "",
      },
      metadata: {
        contract: CONTRACT,
        candidate_asset_node_id: context.candidate.id,
        production_task_id: context.task.id,
        production_graph_id: context.task.production_graph_id,
        shot_id: context.task.shot_id,
        shot_bible_contract: context.shot_bible.contract,
        policy: resolvedPolicy,
        evidence_uri: evidenceUri,
        provider: execution.provider || null,
        model: execution.model || resolvedPolicy.model,
        pricing: execution.pricing || null,
        usage_id: execution.usage?.id || null,
        ...evaluation,
      },
    });
    const recorded = await AssetGraphRepository.create(report);

    await AssetGraphRepository.update(context.candidate.id, {
      status: evaluation.passed
        ? CREATIVE_ASSET_NODE_STATUS.REVIEW
        : CREATIVE_ASSET_NODE_STATUS.REJECTED,
      intelligence: {
        ...(context.candidate.intelligence || {}),
        quality_score: evaluation.overall_score,
        safety_status: evaluation.passed ? "REVIEW_REQUIRED" : "REJECTED",
      },
      review: {
        ...(context.candidate.review || {}),
        ai_reviewed: true,
        approved: false,
        notes: review.summary || "",
      },
      metadata: {
        ...(context.candidate.metadata || {}),
        shot_candidate_review_report_id: recorded.id,
        shot_candidate_review_passed: evaluation.passed,
        shot_candidate_review_score: evaluation.overall_score,
        shot_candidate_failed_checks: evaluation.failed_checks,
        shot_candidate_repair_instructions: evaluation.repair_instructions,
        include_in_master: evaluation.passed,
      },
    });

    return {
      contract: CONTRACT,
      candidate_asset_node_id: context.candidate.id,
      report: recorded,
      evaluation,
      spend_guard: spend,
      provider: execution.provider || null,
      model: execution.model || resolvedPolicy.model,
      pricing: execution.pricing || null,
      usage: execution.usage || null,
      billing: execution.billing || null,
    };
  },
};
