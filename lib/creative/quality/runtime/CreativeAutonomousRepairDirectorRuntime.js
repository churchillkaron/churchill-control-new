import * as CreativeProjectRepository from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import { ProductionTaskRuntime } from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  assertAutomaticRepairAllowed,
  qualityFailures,
  qualityPassed,
  repairIdentity,
  repairInstructions,
  repairPolicy,
} from "./CreativeRepairContractRuntime";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function integerPriority(value, direction = 0) {
  const base = Number.isFinite(Number(value)) ? Math.round(Number(value)) : 100;
  return Math.max(0, base + direction);
}

function isQualityTask(task = {}) {
  return task.type === "QUALITY_REVIEW" ||
    task.metadata?.quality_gate === true ||
    task.metadata?.contract === "GENERATED_MEDIA_PERCEPTUAL_REVIEW_V1";
}

function completedQualityFailure(task = {}) {
  return task.status === "COMPLETED" && isQualityTask(task) && !qualityPassed(task.output);
}

function replaceDependency(ids = [], originalId, replacementId) {
  return [...new Set(list(ids).map((id) => id === originalId ? replacementId : id))];
}

function candidateForQuality(tasks, quality) {
  const dependencyIds = new Set(list(quality.depends_on));
  const explicitIds = [
    quality.metadata?.source_generation_task_id,
    quality.metadata?.perceptual_review_source_task_id,
    quality.metadata?.still_finish_task_id,
    quality.metadata?.website_build_task_id,
    quality.metadata?.software_build_task_id,
    quality.metadata?.audio_finish_task_id,
    quality.metadata?.campaign_package_task_id,
  ].filter(Boolean);
  for (const id of explicitIds) {
    const task = tasks.find((item) => item.id === id);
    if (task) return task;
  }
  return tasks
    .filter((task) => dependencyIds.has(task.id) && !isQualityTask(task))
    .sort((left, right) =>
      Number(right.metadata?.production_step_index || 0) -
      Number(left.metadata?.production_step_index || 0),
    )[0] || null;
}

function repairAllowance(project = {}) {
  const metadata = project.metadata || {};
  return Math.max(0, finite(
    metadata.quality_repair?.approved_incremental_budget ??
    metadata.repair?.approved_incremental_budget ??
    process.env.CREATIVE_APPROVED_INCREMENTAL_REPAIR_BUDGET,
    0,
  ));
}

function estimatedRepairCost(source, quality = null) {
  return Math.max(0, finite(source?.cost?.estimated, 0)) +
    Math.max(0, finite(quality?.cost?.estimated, 0));
}

function existingRepairCommitment(tasks = []) {
  return tasks
    .filter((task) => task.metadata?.autonomous_repair === true)
    .reduce((sum, task) => sum + Math.max(0, finite(task.cost?.estimated, 0)), 0);
}

function paidRepairAllowed({ source, quality = null, project, committed = 0 }) {
  const estimated = estimatedRepairCost(source, quality);
  const allowance = repairAllowance(project);
  const remaining = Math.max(0, allowance - committed);
  return {
    allowed: estimated <= 0 || remaining >= estimated,
    estimated,
    allowance,
    committed,
    remaining,
  };
}

function repairedMetadata(source, { attempt, identity, qualityTask = null, failures, instructions }) {
  const metadata = { ...(source.metadata || {}) };
  for (const key of [
    "still_finish_for_task_id",
    "website_validation_for_task_id",
    "software_validation_for_task_id",
    "audio_validation_for_task_id",
    "campaign_validation_for_task_id",
  ]) delete metadata[key];
  return {
    ...metadata,
    execution_node_id: `${metadata.execution_node_id || source.id}:repair:${attempt}`,
    execution_step_id: `${metadata.execution_step_id || source.id}:repair:${attempt}`,
    repair_attempt: attempt,
    repair_identity: identity,
    repair_of_task_id: source.id,
    repair_quality_task_id: qualityTask?.id || null,
    repair_failures: failures,
    repair_instructions: instructions,
    release_candidate: source.metadata?.release_candidate === true,
    autonomous_repair: true,
    release_hold: false,
    perceptual_quality_state: null,
  };
}

async function createReplacement({ source, qualityTask = null, failures, instructions, policy }) {
  const attempt = assertAutomaticRepairAllowed({ policy, sourceTask: source, instructions });
  const identity = repairIdentity({
    source_task_id: source.id,
    quality_task_id: qualityTask?.id || null,
    attempt,
    failures,
    instructions,
  });
  const replacement = await ProductionTaskRuntime.create({
    organization_id: source.organization_id,
    creative_project_id: source.creative_project_id,
    production_graph_id: source.production_graph_id,
    scene_id: source.scene_id || null,
    shot_id: source.shot_id || null,
    type: source.type,
    status: "WAITING",
    title: `Repair ${source.title || "creative production task"}`,
    description: `Bounded autonomous repair attempt ${attempt} for ${source.title || source.id}.`,
    service_id: source.service_id,
    service_code: source.service_code,
    capability: source.capability,
    provider_id: null,
    priority: integerPriority(source.priority, -1),
    depends_on: list(source.depends_on),
    input: {
      ...(source.input || {}),
      provider_policy: {
        ...(source.input?.provider_policy || {}),
        blocked_providers: [
          ...new Set([
            ...(source.input?.provider_policy?.blocked_providers || []),
            source.provider_id,
          ].filter(Boolean)),
        ],
      },
      repair_contract: {
        version: policy.version,
        attempt,
        failures,
        instructions,
        preserve_approved_direction: true,
        change_only_failed_requirements: true,
        source_task_id: source.id,
        quality_task_id: qualityTask?.id || null,
      },
      prompt: [
        source.input?.prompt || source.input?.provider_prompt || "",
        "REPAIR ONLY THE FAILED REQUIREMENTS BELOW. Preserve all approved identity, strategy, continuity, factual claims, timing and unaffected work.",
        ...instructions.map((instruction, index) => `${index + 1}. ${instruction}`),
      ].filter(Boolean).join("\n"),
    },
    cost: {
      ...(source.cost || {}),
      actual: 0,
      approved: true,
    },
    timing: { estimated_seconds: Number(source.timing?.estimated_seconds || 0) },
    review: { required: source.review?.required === true, approved: false },
    metadata: repairedMetadata(source, {
      attempt,
      identity,
      qualityTask,
      failures,
      instructions,
    }),
  });
  await ProductionTaskRuntime.update(source.id, {
    metadata: {
      ...(source.metadata || {}),
      superseded_by_repair_task_id: replacement.id,
      repair_identity: identity,
      repair_attempted: true,
    },
  });
  return replacement;
}

function reviewMetadata(quality, replacement, attempt, identity) {
  const metadata = {
    ...(quality.metadata || {}),
    execution_node_id: `${quality.metadata?.execution_node_id || quality.id}:repair-review:${attempt}`,
    execution_step_id: `${quality.metadata?.execution_step_id || quality.id}:repair-review:${attempt}`,
    repair_attempt: attempt,
    repair_identity: identity,
    repair_review_of_task_id: quality.id,
    repaired_source_task_id: replacement.id,
    source_generation_task_id: replacement.id,
    autonomous_repair: true,
    release_candidate: false,
    release_hold: false,
    perceptual_quality_state: null,
  };
  if (metadata.still_finish_task_id) metadata.still_finish_task_id = replacement.id;
  if (metadata.website_build_task_id) metadata.website_build_task_id = replacement.id;
  if (metadata.software_build_task_id) metadata.software_build_task_id = replacement.id;
  if (metadata.audio_finish_task_id) metadata.audio_finish_task_id = replacement.id;
  if (metadata.campaign_package_task_id) metadata.campaign_package_task_id = replacement.id;
  delete metadata.still_finish_review_bound;
  delete metadata.website_screenshot_review_bound;
  delete metadata.software_evidence_review_bound;
  delete metadata.audio_evidence_review_bound;
  delete metadata.campaign_package_review_bound;
  return metadata;
}

async function createRepairReview({ quality, replacement, failures, instructions, policy }) {
  const attempt = Number(replacement.metadata?.repair_attempt || 1);
  const identity = replacement.metadata?.repair_identity;
  const review = await ProductionTaskRuntime.create({
    organization_id: quality.organization_id,
    creative_project_id: quality.creative_project_id,
    production_graph_id: quality.production_graph_id,
    scene_id: quality.scene_id || null,
    shot_id: quality.shot_id || null,
    type: quality.type,
    status: "WAITING",
    title: `Review repaired ${quality.title || "deliverable"}`,
    description: "Re-run the original quality gate against the repaired artifact and the exact failed requirements.",
    service_id: quality.service_id,
    service_code: quality.service_code,
    capability: quality.capability,
    provider_id: null,
    priority: integerPriority(quality.priority, 1),
    depends_on: [replacement.id],
    input: {
      ...(quality.input || {}),
      repair_evaluation: {
        version: policy.version,
        source_quality_task_id: quality.id,
        repaired_source_task_id: replacement.id,
        failed_checks: failures,
        required_repairs: instructions,
        reject_regressions: true,
      },
    },
    cost: {
      ...(quality.cost || {}),
      actual: 0,
      approved: true,
    },
    timing: { estimated_seconds: Number(quality.timing?.estimated_seconds || 0) },
    review: { required: true, approved: false },
    metadata: reviewMetadata(quality, replacement, attempt, identity),
  });
  await ProductionTaskRuntime.update(quality.id, {
    metadata: {
      ...(quality.metadata || {}),
      superseded_by_repair_review_task_id: review.id,
      repair_identity: identity,
      repair_attempted: true,
    },
  });
  return review;
}

async function rewireDownstream(tasks, originalId, replacementId, excluded = []) {
  const excludedIds = new Set(excluded);
  for (const task of tasks) {
    if (excludedIds.has(task.id) || !list(task.depends_on).includes(originalId)) continue;
    await ProductionTaskRuntime.update(task.id, {
      depends_on: replaceDependency(task.depends_on, originalId, replacementId),
      metadata: {
        ...(task.metadata || {}),
        repaired_dependency_replacements: {
          ...(task.metadata?.repaired_dependency_replacements || {}),
          [originalId]: replacementId,
        },
      },
    });
  }
}

export const CreativeAutonomousRepairDirectorRuntime = {
  async ensure({ organization_id, creative_project_id, production_graph_id = null } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");
    const [project, tasks] = await Promise.all([
      CreativeProjectRepository.getById(creative_project_id),
      ProductionTaskRuntime.list({
        organization_id,
        creative_project_id,
        production_graph_id,
      }),
    ]);
    if (!project || project.organization_id !== organization_id) {
      throw new Error("Creative project not found");
    }
    const policy = repairPolicy(project);
    if (!policy.allow_automatic_repair || policy.max_attempts <= 0) {
      return { created: [], blocked: [], policy, enabled: false };
    }

    const created = [];
    const blocked = [];
    let committedRepairEstimate = existingRepairCommitment(tasks);

    for (const task of tasks) {
      if (task.metadata?.superseded_by_repair_task_id || task.metadata?.superseded_by_repair_review_task_id) {
        continue;
      }
      const providerFailure = task.status === "FAILED" && !isQualityTask(task);
      const qualityFailure = completedQualityFailure(task) && policy.allow_quality_repair;
      if (!providerFailure && !qualityFailure) continue;
      const quality = qualityFailure ? task : null;
      const source = providerFailure ? task : candidateForQuality(tasks, task);
      if (!source) {
        blocked.push({ task_id: task.id, reason: "REPAIR_SOURCE_TASK_NOT_FOUND" });
        continue;
      }
      if (source.status !== "COMPLETED" && source.status !== "FAILED") {
        blocked.push({ task_id: task.id, reason: "REPAIR_SOURCE_TASK_NOT_SETTLED" });
        continue;
      }

      const failures = quality
        ? qualityFailures(quality.output)
        : [text(source.error) || "PROVIDER_EXECUTION_FAILED"];
      const instructions = quality
        ? repairInstructions(quality.output)
        : [
            `Retry the failed production stage and correct this execution failure: ${text(source.error) || "unknown provider failure"}.`,
            "Preserve the approved creative direction, assets, identity, continuity and unaffected requirements.",
          ];

      const spending = paidRepairAllowed({
        source,
        quality,
        project,
        committed: committedRepairEstimate,
      });
      if (!spending.allowed) {
        blocked.push({
          task_id: task.id,
          source_task_id: source.id,
          reason: "CREATIVE_INCREMENTAL_REPAIR_BUDGET_APPROVAL_REQUIRED",
          estimated_cost: spending.estimated,
          cumulative_committed_estimate: spending.committed,
          approved_incremental_budget: spending.allowance,
          remaining_incremental_budget: spending.remaining,
        });
        await ProductionTaskRuntime.update(task.id, {
          metadata: {
            ...(task.metadata || {}),
            quality_repair_required: true,
            quality_repair_blocked_reason: "CREATIVE_INCREMENTAL_REPAIR_BUDGET_APPROVAL_REQUIRED",
            quality_repair_estimated_cost: spending.estimated,
            cumulative_committed_repair_estimate: spending.committed,
            approved_incremental_repair_budget: spending.allowance,
            remaining_incremental_repair_budget: spending.remaining,
            release_hold: true,
          },
        });
        continue;
      }

      try {
        const replacement = await createReplacement({
          source,
          qualityTask: quality,
          failures,
          instructions,
          policy,
        });
        let terminalReplacement = replacement;
        let review = null;
        if (quality) {
          review = await createRepairReview({
            quality,
            replacement,
            failures,
            instructions,
            policy,
          });
          terminalReplacement = review;
        }
        await rewireDownstream(
          tasks,
          task.id,
          terminalReplacement.id,
          [replacement.id, review?.id].filter(Boolean),
        );
        committedRepairEstimate += spending.estimated;
        created.push({
          source_task_id: source.id,
          failed_or_rejected_task_id: task.id,
          replacement_task_id: replacement.id,
          repair_review_task_id: review?.id || null,
          repair_identity: replacement.metadata?.repair_identity,
          incremental_estimated_cost: spending.estimated,
          cumulative_committed_estimate: committedRepairEstimate,
          approved_incremental_budget: spending.allowance,
        });
      } catch (error) {
        blocked.push({ task_id: task.id, reason: error.message });
      }
    }
    return {
      created,
      blocked,
      policy,
      enabled: true,
      approved_incremental_budget: repairAllowance(project),
      cumulative_committed_estimate: committedRepairEstimate,
    };
  },
};
