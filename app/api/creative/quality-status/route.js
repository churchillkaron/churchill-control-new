export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import * as CreativeAssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import * as CreativeProjectRepository
from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  repairPolicy,
  qualityFailures,
  repairInstructions,
  unwrapRepairEvidence,
} from "@/lib/creative/quality/runtime/CreativeRepairContractRuntime";
import {
  WORLD_CLASS_QUALITY_FLOORS,
} from "@/lib/creative/quality/runtime/CreativeWorldClassQualityBootstrap";

function text(value) {
  return String(value ?? "").trim();
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function timestamp(value = {}) {
  return Date.parse(value.updated_at || value.created_at || 0) || 0;
}

function newest(items = []) {
  let selected = null;
  let selectedTime = -1;
  for (const item of items) {
    const time = timestamp(item);
    if (time >= selectedTime) {
      selected = item;
      selectedTime = time;
    }
  }
  return selected;
}

function taskEvidence(task = {}) {
  return unwrapRepairEvidence(task.output || {});
}

function assetEvidence(node = {}) {
  const metadata = object(node.metadata);
  const nested = object(metadata.evidence);
  return Object.keys(nested).length ? { ...metadata, ...nested } : metadata;
}

function dimensionFloor(id) {
  const key = `minimum_${id}_score`;
  return finite(WORLD_CLASS_QUALITY_FLOORS.generated_media[key]) ??
    WORLD_CLASS_QUALITY_FLOORS.minimum_release_score;
}

function scoreEntries(evidence = {}) {
  const root = object(evidence);
  const scores = object(root.scores);
  const entries = [];
  const push = (id, value) => {
    const score = finite(value);
    if (score === null) return;
    entries.push({ id, score, minimum: dimensionFloor(id) });
  };

  for (const [key, value] of Object.entries(scores)) {
    if (key.endsWith("_score")) push(key.replace(/_score$/, ""), value);
  }

  const checks = object(root.checks);
  for (const [key, value] of Object.entries(checks)) {
    push(key, object(value).score);
  }

  const directFields = [
    "overall_score",
    "story_score",
    "environment_score",
    "camera_score",
    "anatomy_score",
    "identity_score",
    "product_fidelity_score",
    "music_energy_score",
    "performance_score",
    "continuity_score",
    "physics_score",
    "artifact_score",
  ];
  for (const key of directFields) {
    push(key.replace(/_score$/, ""), root[key]);
  }

  const deduplicated = new Map();
  for (const entry of entries) deduplicated.set(entry.id, entry);
  return [...deduplicated.values()];
}

function overallScore(evidence = {}, node = null) {
  const root = object(evidence);
  return finite(
    root.overall_score ??
    object(root.scores).overall_score ??
    node?.intelligence?.quality_score,
  );
}

function passedEvidence(evidence = {}) {
  const root = object(evidence);
  if (root.passed === false || root.release_readiness === false) return false;
  if (root.passed === true || root.release_readiness === true) return true;
  const verdict = text(root.verdict || root.status || root.result || root.decision).toUpperCase();
  return ["PASS", "PASSED", "APPROVED", "READY", "RELEASE_READY"].includes(verdict);
}

function displayName(value) {
  return text(value)
    .replace(/_score$/i, "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function summarizeEvidence(evidence = {}, node = null) {
  const entries = scoreEntries(evidence);
  const weakest = entries.reduce(
    (current, entry) => {
      if (!current) return entry;
      const currentMargin = current.score - current.minimum;
      const nextMargin = entry.score - entry.minimum;
      return nextMargin < currentMargin ? entry : current;
    },
    null,
  );
  const overall = overallScore(evidence, node);
  const failures = qualityFailures(evidence);
  const repairs = repairInstructions(evidence);
  const explicitPassed = passedEvidence(evidence);
  const weakestPassed = entries.every((entry) => entry.score >= entry.minimum);
  const aGrade = Boolean(
    explicitPassed &&
    overall !== null &&
    overall >= WORLD_CLASS_QUALITY_FLOORS.minimum_release_score &&
    weakestPassed &&
    failures.length === 0,
  );

  return {
    passed: explicitPassed,
    a_grade: aGrade,
    overall_score: overall,
    weakest_dimension: weakest
      ? {
          id: weakest.id,
          label: displayName(weakest.id),
          score: weakest.score,
          minimum: weakest.minimum,
        }
      : null,
    scored_dimension_count: entries.length,
    failed_checks: failures.slice(0, 12),
    repair_instructions: repairs.slice(0, 12),
  };
}

function isQualityTask(task = {}) {
  return task.type === "QUALITY_REVIEW" || task.metadata?.quality_gate === true;
}

function isRepairTask(task = {}) {
  return Boolean(
    task.metadata?.autonomous_repair === true ||
    task.metadata?.repair_attempt ||
    task.metadata?.repair_of_task_id ||
    task.metadata?.repair_review_of_task_id,
  );
}

function activeTask(task = {}) {
  return !["COMPLETED", "FAILED", "SKIPPED", "CANCELLED"].includes(
    text(task.status).toUpperCase(),
  );
}

function nodeType(node = {}) {
  return text(node.type).toUpperCase();
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = text(
      url.searchParams.get("organization_id") ||
      url.searchParams.get("organizationId"),
    );
    const creativeProjectId = text(
      url.searchParams.get("creative_project_id") ||
      url.searchParams.get("creativeProjectId") ||
      url.searchParams.get("project_id"),
    );

    if (!organizationId || !creativeProjectId) {
      return Response.json(
        {
          success: false,
          error: "organization_id and creative_project_id required",
        },
        { status: 400 },
      );
    }

    const access = await requireOrganizationAccess({
      organizationId,
      request,
      requiredAnyPermission: [
        "creative.*",
        "creative.execute",
        "creative.production.run",
        "creative.release.approve",
      ],
    });
    if (!access.success) {
      return Response.json(access, { status: access.status || 403 });
    }

    const [project, nodes, tasks] = await Promise.all([
      CreativeProjectRepository.getById(creativeProjectId),
      CreativeAssetGraphRepository.listByProject({
        organization_id: organizationId,
        creative_project_id: creativeProjectId,
      }),
      ProductionTaskRuntime.list({
        organization_id: organizationId,
        creative_project_id: creativeProjectId,
      }),
    ]);

    if (!project || String(project.organization_id) !== String(organizationId)) {
      return Response.json(
        { success: false, error: "Creative project not found" },
        { status: 404 },
      );
    }

    const policy = repairPolicy(project);
    const qualityNodes = nodes.filter((node) => nodeType(node) === "QUALITY_REPORT");
    const qualityTasks = tasks.filter(isQualityTask);
    const repairTasks = tasks.filter(isRepairTask);
    const activeRepairs = repairTasks.filter(activeTask);
    const failedQualityTasks = qualityTasks.filter((task) => {
      if (text(task.status).toUpperCase() !== "COMPLETED") return false;
      return !passedEvidence(taskEvidence(task));
    });

    const latestQualityNode = newest(qualityNodes);
    const latestQualityTask = newest(qualityTasks);
    const nodeSummary = latestQualityNode
      ? summarizeEvidence(assetEvidence(latestQualityNode), latestQualityNode)
      : null;
    const taskSummary = latestQualityTask
      ? summarizeEvidence(taskEvidence(latestQualityTask))
      : null;
    const quality = timestamp(latestQualityTask) > timestamp(latestQualityNode)
      ? taskSummary
      : nodeSummary || taskSummary;

    const completedProductionTasks = tasks.filter((task) =>
      text(task.status).toUpperCase() === "COMPLETED" && !isQualityTask(task),
    );
    const activeProductionTasks = tasks.filter((task) =>
      activeTask(task) && !isQualityTask(task),
    );

    let status = "AWAITING_PRODUCTION";
    if (activeRepairs.length) status = "REPAIRING";
    else if (quality?.a_grade) status = "A_GRADE";
    else if (failedQualityTasks.length || quality?.passed === false) status = "REPAIR_REQUIRED";
    else if (qualityTasks.some(activeTask)) status = "REVIEWING";
    else if (completedProductionTasks.length) status = "AWAITING_REVIEW";
    else if (activeProductionTasks.length) status = "PRODUCING";

    const repairAttempts = repairTasks.reduce(
      (maximum, task) => Math.max(maximum, Number(task.metadata?.repair_attempt || 0)),
      0,
    );

    return Response.json({
      success: true,
      standard: {
        contract: "AVANTIQO_WORLD_CLASS_QUALITY_V1",
        label: "A-grade release standard",
        minimum_release_score: WORLD_CLASS_QUALITY_FLOORS.minimum_release_score,
        minimum_confidence: WORLD_CLASS_QUALITY_FLOORS.minimum_confidence,
        b_grade_release_forbidden: true,
        weakest_link_enforced: true,
      },
      status,
      quality,
      repair: {
        automatic: policy.allow_automatic_repair === true,
        max_attempts: policy.max_attempts,
        attempts_observed: repairAttempts,
        active_task_count: activeRepairs.length,
        blocked_by_cost_without_approval:
          policy.preserve_approved_cost_ceiling === true,
      },
      counts: {
        quality_reports: qualityNodes.length,
        quality_tasks: qualityTasks.length,
        repair_tasks: repairTasks.length,
        production_tasks: tasks.length - qualityTasks.length,
      },
      latest_quality_report_id: latestQualityNode?.id || null,
      latest_quality_task_id: latestQualityTask?.id || null,
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error?.message || String(error),
      },
      { status: 500 },
    );
  }
}
