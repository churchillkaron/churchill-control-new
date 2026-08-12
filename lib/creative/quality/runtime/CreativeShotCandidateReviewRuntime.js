import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { runAIService } from "@/lib/platform/service-runtime/ai";
import { ProductionTaskRuntime } from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import * as ShotRepository from "@/lib/creative/shots/repositories/ShotRepository";
import * as AssetGraphRepository from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import {
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
  createCreativeAssetNode,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import { CreativeShotBibleRuntime } from "@/lib/creative/video/runtime/CreativeShotBibleRuntime";
import { materializeMedia } from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";
import { resolveCreativeFfmpegPath } from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";
import {
  creativeStorageUri,
  signCreativeStorageReference,
} from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";
import { getServiceSupabase } from "@/lib/shared/supabase/service";
import { CreativeApprovedProductionSpendGuardRuntime } from "./CreativeApprovedProductionSpendGuardRuntime";

const CONTRACT = "CREATIVE_SHOT_CANDIDATE_REVIEW_V1";
const CHECKS = Object.freeze([
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

function safe(value, fallback = "shot") {
  return text(value)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || fallback;
}

function execute(command, args, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "ignore", "pipe"],
    });
    const stderr = [];
    const timer = setTimeout(() => {
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

function unwrap(value = {}) {
  let current = value?.output || value;
  const seen = new Set();
  while (
    current && typeof current === "object" && current.output &&
    typeof current.output === "object" && !seen.has(current)
  ) {
    seen.add(current);
    current = current.output;
  }
  return current || {};
}

function parseReview(value) {
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

function policy(value = {}) {
  const source = object(value);
  return {
    version: text(source.version || "CREATIVE_SHOT_CANDIDATE_REVIEW_POLICY_V1"),
    service_id: text(source.service_id || "ai.image.analyze"),
    capability: text(source.capability || "ai.image.analyze"),
    provider_id: text(source.provider_id) || null,
    model: text(source.model),
    minimum_score: Math.max(94, finite(source.minimum_score, 94)),
    minimum_confidence: Math.max(85, finite(source.minimum_confidence, 85)),
    sample_frame_count: Math.max(6, Math.min(12, finite(source.sample_frame_count, 9))),
    maximum_review_customer_price: finite(source.maximum_review_customer_price),
    evidence_bucket: text(
      source.evidence_bucket || process.env.CREATIVE_MEDIA_DERIVATIVE_BUCKET,
    ),
    provider_policy: object(source.provider_policy),
  };
}

function evaluate(review = {}, resolvedPolicy = {}) {
  const checks = CHECKS.map((id) => {
    const source = object(review.checks?.[id]);
    return {
      id,
      status: text(source.status).toUpperCase(),
      score: finite(source.score),
      confidence: finite(source.confidence),
      evidence: list(source.evidence).map(text).filter(Boolean),
      repair_instructions: list(source.repair_instructions).map(text).filter(Boolean),
    };
  });
  const validation = [];
  for (const check of checks) {
    if (!["PASS", "FAIL", "NOT_APPLICABLE"].includes(check.status)) {
      validation.push(`${check.id}:STATUS_REQUIRED`);
      continue;
    }
    if (check.status === "NOT_APPLICABLE") continue;
    if (!check.evidence.length) validation.push(`${check.id}:EVIDENCE_REQUIRED`);
    if (check.score === null || check.score < 0 || check.score > 100) {
      validation.push(`${check.id}:SCORE_INVALID`);
    }
    if (check.confidence === null || check.confidence < resolvedPolicy.minimum_confidence) {
      validation.push(`${check.id}:CONFIDENCE_LOW`);
    }
    if (check.status === "PASS" && check.score < resolvedPolicy.minimum_score) {
      validation.push(`${check.id}:SCORE_BELOW_WORLD_CLASS_FLOOR`);
    }
    if (check.status === "FAIL" && !check.repair_instructions.length) {
      validation.push(`${check.id}:REPAIR_INSTRUCTIONS_REQUIRED`);
    }
  }
  const failed = checks.filter((check) => check.status === "FAIL");
  const scored = checks.filter((check) =>
    check.status !== "NOT_APPLICABLE" && check.score !== null,
  );
  const overallScore = scored.length
    ? Math.round(scored.reduce((sum, check) => sum + check.score, 0) / scored.length)
    : 0;
  const weakestScore = scored.length
    ? Math.min(...scored.map((check) => check.score))
    : 0;
  return {
    passed: validation.length === 0 && failed.length === 0,
    overall_score: overallScore,
    weakest_score: weakestScore,
    checks,
    failed_checks: failed.map((check) => check.id),
    validation_failures: validation,
    repair_instructions: [...new Set(
      failed.flatMap((check) => check.repair_instructions),
    )],
  };
}

function prompt({ candidate, shotBible, resolvedPolicy }) {
  return [
    "You are Avantiqo's senior film dailies reviewer. Judge the actual generated shot, not the intended plan.",
    "Use only visible evidence from the contact sheet and the structured Shot Bible. Never invent evidence.",
    "A major-brand release must fail if identity, anatomy, product truth, physics, camera, performance, continuity or synthetic artifacts are visibly weak.",
    "Every FAIL must include bounded repair instructions that change only the failed requirement.",
    `Minimum applicable score: ${resolvedPolicy.minimum_score}`,
    `Minimum confidence: ${resolvedPolicy.minimum_confidence}`,
    `Checks: ${JSON.stringify(CHECKS)}`,
    `Candidate evidence: ${JSON.stringify({
      asset_node_id: candidate.id,
      provider: candidate.lineage?.provider_id || null,
      technical: candidate.technical || {},
    })}`,
    `Shot Bible: ${JSON.stringify(shotBible)}`,
    "Return strict JSON only with this shape:",
    JSON.stringify({
      contract: CONTRACT,
      verdict: "PASS|FAIL",
      summary: "specific evidence-based conclusion",
      checks: Object.fromEntries(CHECKS.map((id) => [id, {
        status: "PASS|FAIL|NOT_APPLICABLE",
        score: 0,
        confidence: 0,
        evidence: [],
        repair_instructions: [],
      }])),
    }),
  ].join("\n\n");
}

async function context({ organization_id, asset_node_id }) {
  const candidate = await AssetGraphRepository.getById(asset_node_id);
  if (
    !candidate || text(candidate.organization_id) !== text(organization_id) ||
    candidate.type !== CREATIVE_ASSET_NODE_TYPES.VIDEO
  ) {
    throw new Error("CREATIVE_SHOT_CANDIDATE_VIDEO_NOT_FOUND");
  }
  const taskId = text(candidate.production_task_id || candidate.metadata?.production_task_id);
  const task = taskId ? await ProductionTaskRuntime.get(taskId) : null;
  if (!task || text(task.organization_id) !== text(organization_id)) {
    throw new Error("CREATIVE_SHOT_CANDIDATE_TASK_NOT_FOUND");
  }
  if (text(task.creative_project_id) !== text(candidate.creative_project_id)) {
    throw new Error("CREATIVE_SHOT_CANDIDATE_TASK_SCOPE_MISMATCH");
  }
  if (!task.shot_id) throw new Error("CREATIVE_SHOT_CANDIDATE_SHOT_REQUIRED");
  const shot = await ShotRepository.get(task.shot_id);
  if (
    !shot || text(shot.organization_id) !== text(organization_id) ||
    text(shot.creative_project_id) !== text(task.creative_project_id)
  ) {
    throw new Error("CREATIVE_SHOT_CANDIDATE_SHOT_SCOPE_MISMATCH");
  }
  const shotBible = CreativeShotBibleRuntime.assert(
    CreativeShotBibleRuntime.build({ shot, task }),
  );
  return { candidate, task, shot, shotBible };
}

async function contactSheet({ organization_id, candidate, resolvedPolicy }) {
  const ffmpeg = resolveCreativeFfmpegPath(resolvedPolicy);
  if (!ffmpeg) throw new Error("SHOT_CANDIDATE_REVIEW_FFMPEG_REQUIRED");
  if (!resolvedPolicy.evidence_bucket) {
    throw new Error("SHOT_CANDIDATE_REVIEW_EVIDENCE_BUCKET_REQUIRED");
  }
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-shot-review-"));
  const media = await materializeMedia({
    organization_id,
    url: candidate.url,
    file_name: candidate.name || null,
    mime_type: candidate.technical?.mime_type || null,
    policy: resolvedPolicy,
  });
  try {
    const destination = path.join(directory, "contact-sheet.jpg");
    const duration = Math.max(1, finite(candidate.technical?.duration_seconds, 5));
    const interval = Math.max(duration / resolvedPolicy.sample_frame_count, 0.2);
    const columns = Math.ceil(Math.sqrt(resolvedPolicy.sample_frame_count));
    const rows = Math.ceil(resolvedPolicy.sample_frame_count / columns);
    await execute(ffmpeg, [
      "-y", "-i", media.file_path,
      "-vf", `fps=1/${interval},scale=512:-1,tile=${columns}x${rows}:padding=8:margin=8`,
      "-frames:v", "1", destination,
    ]);
    const storagePath = [
      safe(organization_id),
      "shot-candidate-review",
      safe(candidate.creative_project_id),
      safe(candidate.id),
      `${crypto.randomUUID()}.jpg`,
    ].join("/");
    const bytes = await fs.readFile(destination);
    const { error } = await supabaseAdmin.storage
      .from(resolvedPolicy.evidence_bucket)
      .upload(storagePath, bytes, { contentType: "image/jpeg", upsert: false });
    if (error) throw error;
    return creativeStorageUri(resolvedPolicy.evidence_bucket, storagePath);
  } finally {
    await media.cleanup();
    await fs.rm(directory, { recursive: true, force: true });
  }
}

export const CreativeShotCandidateReviewRuntime = {
  contract: CONTRACT,
  checks: CHECKS,

  async analyze({ organization_id, asset_node_id, policy: policyInput = {} } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!asset_node_id) throw new Error("asset_node_id required");
    const resolvedPolicy = policy(policyInput);
    if (!resolvedPolicy.model) throw new Error("SHOT_CANDIDATE_REVIEW_MODEL_REQUIRED");
    if (
      resolvedPolicy.maximum_review_customer_price === null ||
      resolvedPolicy.maximum_review_customer_price <= 0
    ) {
      throw new Error("SHOT_CANDIDATE_REVIEW_PRICE_CEILING_REQUIRED");
    }

    const resolved = await context({ organization_id, asset_node_id });
    const existingReportId = text(resolved.candidate.metadata?.shot_candidate_review_report_id);
    if (existingReportId) {
      const existing = await AssetGraphRepository.getById(existingReportId);
      if (existing) {
        return {
          contract: CONTRACT,
          candidate_asset_node_id: resolved.candidate.id,
          report: existing,
          reused: true,
        };
      }
    }

    const spendGuard = await CreativeApprovedProductionSpendGuardRuntime
      .assertAdditionalSpendAllowed({
        source_task: resolved.task,
        projected_cost: resolvedPolicy.maximum_review_customer_price,
      });
    const evidenceUri = await contactSheet({
      organization_id,
      candidate: resolved.candidate,
      resolvedPolicy,
    });
    const evidenceUrl = await signCreativeStorageReference({
      organization_id,
      reference: evidenceUri,
    });

    const execution = await runAIService.execute({
      organization_id,
      service_id: resolvedPolicy.service_id,
      provider_id: resolvedPolicy.provider_id,
      input: {
        capability: resolvedPolicy.capability,
        model: resolvedPolicy.model,
        image: evidenceUrl,
        quantity: 1,
        prompt: prompt({
          candidate: resolved.candidate,
          shotBible: resolved.shotBible,
          resolvedPolicy,
        }),
        temperature: 0,
        max_output_tokens: 9000,
      },
      metadata: {
        module: "CREATIVE",
        operation: "SHOT_CANDIDATE_VISUAL_REVIEW",
        creative_project_id: resolved.candidate.creative_project_id,
        production_graph_id: resolved.task.production_graph_id,
        production_task_id: resolved.task.id,
        shot_id: resolved.task.shot_id,
        candidate_asset_node_id: resolved.candidate.id,
        approved_spend_guard_contract: spendGuard.contract,
        approved_spend_ceiling: spendGuard.approved_ceiling,
      },
      provider_policy: resolvedPolicy.provider_policy,
    });
    if (execution.pending) throw new Error("SHOT_CANDIDATE_ASYNC_REVIEW_NOT_SUPPORTED");
    const actualPrice = Number(execution.pricing?.customer_price || 0);
    if (actualPrice > resolvedPolicy.maximum_review_customer_price + 0.000001) {
      throw new Error("SHOT_CANDIDATE_REVIEW_ACTUAL_PRICE_EXCEEDS_CEILING");
    }

    const providerOutput = unwrap(execution);
    const review = parseReview(
      providerOutput.text || providerOutput.response || providerOutput.result,
    );
    const evaluation = evaluate(review, resolvedPolicy);
    const report = await AssetGraphRepository.create(createCreativeAssetNode({
      organization_id,
      creative_project_id: resolved.candidate.creative_project_id,
      parent_asset_node_id: resolved.candidate.id,
      type: CREATIVE_ASSET_NODE_TYPES.QUALITY_REPORT,
      status: evaluation.passed
        ? CREATIVE_ASSET_NODE_STATUS.REVIEW
        : CREATIVE_ASSET_NODE_STATUS.REJECTED,
      name: `${resolved.candidate.name || "Shot"} candidate review`,
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
        actual: actualPrice,
      },
      review: {
        ai_reviewed: true,
        human_reviewed: false,
        approved: false,
        notes: review.summary || "",
      },
      metadata: {
        contract: CONTRACT,
        candidate_asset_node_id: resolved.candidate.id,
        production_task_id: resolved.task.id,
        production_graph_id: resolved.task.production_graph_id,
        shot_id: resolved.task.shot_id,
        shot_bible_contract: resolved.shotBible.contract,
        evidence_uri: evidenceUri,
        policy: resolvedPolicy,
        provider: execution.provider || null,
        model: execution.model || resolvedPolicy.model,
        usage_id: execution.usage?.id || null,
        ...evaluation,
      },
    }));

    await AssetGraphRepository.update(resolved.candidate.id, {
      status: evaluation.passed
        ? CREATIVE_ASSET_NODE_STATUS.REVIEW
        : CREATIVE_ASSET_NODE_STATUS.REJECTED,
      intelligence: {
        ...(resolved.candidate.intelligence || {}),
        quality_score: evaluation.overall_score,
        safety_status: evaluation.passed ? "REVIEW_REQUIRED" : "REJECTED",
      },
      review: {
        ...(resolved.candidate.review || {}),
        ai_reviewed: true,
        approved: false,
        notes: review.summary || "",
      },
      metadata: {
        ...(resolved.candidate.metadata || {}),
        shot_candidate_review_report_id: report.id,
        shot_candidate_review_passed: evaluation.passed,
        shot_candidate_review_score: evaluation.overall_score,
        shot_candidate_weakest_score: evaluation.weakest_score,
        shot_candidate_failed_checks: evaluation.failed_checks,
        shot_candidate_repair_instructions: evaluation.repair_instructions,
        shot_candidate_repair_required: !evaluation.passed,
        include_in_master: evaluation.passed,
      },
    });

    return {
      contract: CONTRACT,
      candidate_asset_node_id: resolved.candidate.id,
      report,
      evaluation,
      spend_guard: spendGuard,
      provider: execution.provider || null,
      model: execution.model || resolvedPolicy.model,
      pricing: execution.pricing || null,
      usage: execution.usage || null,
      billing: execution.billing || null,
      reused: false,
    };
  },
};
