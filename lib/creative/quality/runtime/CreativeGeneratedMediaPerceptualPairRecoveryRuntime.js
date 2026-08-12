import crypto from "node:crypto";

import * as CreativeProjectRepository
from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  CreativeGeneratedMediaPerceptualPairRepairRuntime,
} from "./CreativeGeneratedMediaPerceptualPairRepairRuntime";
import {
  CreativeApprovedProductionSpendGuardRuntime,
} from "./CreativeApprovedProductionSpendGuardRuntime";
import {
  repairIdentity,
  repairPolicy,
} from "./CreativeRepairContractRuntime";

const CONTRACT = "CREATIVE_GENERATED_MEDIA_PERCEPTUAL_PAIR_RECOVERY_V1";
const REVIEW_CONTRACT = "GENERATED_MEDIA_PERCEPTUAL_REVIEW_V1";
const REPLACEMENT_REVIEW_CONTRACT =
  "GENERATED_MEDIA_PERCEPTUAL_REPLACEMENT_REVIEW_V1";

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

function money(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0
    ? Number(number.toFixed(6))
    : 0;
}

function hash(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

function unique(values = []) {
  return [...new Set(list(values).map(text).filter(Boolean))];
}

function perceptualReview(task = {}) {
  return text(task.metadata?.contract) === REVIEW_CONTRACT ||
    text(task.metadata?.repair_payload_contract) === REPLACEMENT_REVIEW_CONTRACT;
}

function superseded(task = {}) {
  return Boolean(
    text(task.metadata?.superseded_by_repair_task_id) ||
    text(task.metadata?.superseded_by_repair_review_task_id),
  );
}

function failedPairReview(task = {}) {
  return text(task.status).toUpperCase() === "FAILED" &&
    perceptualReview(task) &&
    !superseded(task);
}

function sourceTaskId(review = {}) {
  return text(
    review.metadata?.source_generation_task_id ||
    review.metadata?.repaired_source_task_id ||
    review.input?.provider_parameters?.source_generation_task_id ||
    list(review.depends_on)[0],
  ) || null;
}

function validationEvidence(review = {}) {
  return object(
    review.output?.perceptual_validation ||
    review.output?.output?.perceptual_validation,
  );
}

function failedChecks(review = {}) {
  const validation = validationEvidence(review);
  const checks = object(validation.checks);
  const evidence = object(validation.evidence);
  return unique([
    ...Object.entries(checks)
      .filter(([, passed]) => passed === false)
      .map(([id]) => id),
    ...list(evidence.failures).map((item) =>
      typeof item === "string" ? item : item?.code || item?.message,
    ),
    ...list(validation.validation_failures).map((item) =>
      typeof item === "string" ? item : item?.code || item?.message,
    ),
  ]);
}

function boundedRepairInstructions(review = {}) {
  const validation = validationEvidence(review);
  const evidence = object(validation.evidence);
  const explicit = unique([
    ...list(evidence.repair_instructions),
    ...list(validation.repair_instructions),
  ]);
  if (explicit.length) return explicit;

  const failed = failedChecks(review);
  return failed.length
    ? failed.map((failure) =>
        `Correct only the failed perceptual requirement ${failure}; preserve the approved Shot Bible, identity, product truth, timing, continuity and every unaffected requirement.`,
      )
    : [
        "Regenerate only this rejected shot against the same approved Shot Bible and perceptual contract; preserve every unaffected requirement and remove the observed release-blocking defect.",
      ];
}

function repairAttempt(source = {}, review = {}) {
  return Math.max(
    Number(source.metadata?.repair_attempt || 0),
    Number(review.metadata?.repair_attempt || 0),
    0,
  ) + 1;
}

function structuredRepairSpecification({ source, review, failures, instructions }) {
  const failedProvider = text(
    source.provider_id ||
    source.output?.provider ||
    source.output?.provider_submission?.provider,
  );
  const validation = validationEvidence(review);
  return {
    contract: "CREATIVE_GENERATED_MEDIA_PERCEPTUAL_STRUCTURED_REPAIR_V1",
    promptless_source_of_truth: true,
    preserve_approved_direction: true,
    preserve_shot_bible: true,
    preserve_identity_truth: true,
    preserve_product_truth: true,
    preserve_timing: true,
    preserve_continuity: true,
    change_only_failed_requirements: true,
    failed_checks: failures,
    repair_instructions: instructions,
    blocked_provider_ids: failedProvider ? [failedProvider] : [],
    failed_provider_id: failedProvider || null,
    perceptual_evidence: {
      checks: object(validation.checks),
      score_contract: object(validation.score_contract),
      evidence_policy: object(validation.evidence_policy),
    },
  };
}

function applyChallengerPolicy(task = {}, specification = {}) {
  const policy = object(task.input?.provider_policy);
  const blocked = unique([
    ...list(policy.blocked_providers || policy.blockedProviders),
    ...list(specification.blocked_provider_ids),
  ]);
  return {
    ...task,
    provider_id: null,
    input: {
      ...object(task.input),
      provider_policy: {
        ...policy,
        blocked_providers: blocked,
      },
      repair_specification: specification,
    },
    metadata: {
      ...object(task.metadata),
      perceptual_pair_recovery_contract: CONTRACT,
      failed_provider_id: specification.failed_provider_id || null,
      blocked_provider_ids: blocked,
      challenger_provider_required: blocked.length > 0,
      provider_selection_pending: true,
      provider_selection_owned_by_service_domain: true,
    },
  };
}

async function ensureTask(payload = {}) {
  const existing = await ProductionTaskRuntime.get(payload.id);
  if (!existing) return ProductionTaskRuntime.create(payload);
  if (
    text(existing.organization_id) !== text(payload.organization_id) ||
    text(existing.creative_project_id) !== text(payload.creative_project_id) ||
    text(existing.production_graph_id) !== text(payload.production_graph_id) ||
    text(existing.metadata?.repair_identity) !== text(payload.metadata?.repair_identity)
  ) {
    throw new Error(`PERCEPTUAL_PAIR_REPAIR_ID_COLLISION:${payload.id}`);
  }
  return existing;
}

async function createPair({ source, review, project }) {
  const policy = repairPolicy(project);
  if (!policy.allow_automatic_repair || !policy.allow_quality_repair) {
    throw new Error("PERCEPTUAL_PAIR_AUTOMATIC_REPAIR_DISABLED");
  }

  const attempt = repairAttempt(source, review);
  if (attempt > Number(policy.max_attempts || 0)) {
    throw new Error("PERCEPTUAL_PAIR_REPAIR_ATTEMPT_LIMIT_REACHED");
  }

  const sourceEstimated = money(source.cost?.estimated);
  const reviewEstimated = money(review.cost?.estimated);
  if (sourceEstimated <= 0) {
    throw new Error("PERCEPTUAL_PAIR_SOURCE_APPROVED_COST_REQUIRED");
  }
  if (reviewEstimated <= 0) {
    throw new Error("PERCEPTUAL_PAIR_REVIEW_APPROVED_COST_REQUIRED");
  }

  const failures = failedChecks(review);
  const instructions = boundedRepairInstructions(review);
  const identity = repairIdentity({
    source_task_id: source.id,
    quality_task_id: review.id,
    attempt,
    failures,
    instructions,
  });
  const specification = structuredRepairSpecification({
    source,
    review,
    failures,
    instructions,
  });
  const plan = {
    source_task_id: source.id,
    review_task_id: review.id,
    repair_identity: identity,
    repair_attempt: attempt,
    failed_checks: failures,
    provider_failures: specification.failed_provider_id
      ? [specification.failed_provider_id]
      : [],
    provider_repair_instructions: instructions,
    structured_repair_specification: specification,
  };

  const preview = CreativeGeneratedMediaPerceptualPairRepairRuntime.previewPair({
    source,
    review,
    plan,
  });
  const replacementSource = applyChallengerPolicy(
    preview.replacement_source_task,
    specification,
  );
  const replacementReview = {
    ...preview.replacement_review_task,
    metadata: {
      ...object(preview.replacement_review_task.metadata),
      perceptual_pair_recovery_contract: CONTRACT,
      provider_selection_owned_by_service_domain: true,
    },
  };
  const projectedCost = money(
    money(replacementSource.cost?.estimated) +
    money(replacementReview.cost?.estimated),
  );
  const spend = await CreativeApprovedProductionSpendGuardRuntime
    .assertAdditionalSpendAllowed({
      source_task: source,
      projected_cost: projectedCost,
    });
  if (spend.governed !== true) {
    throw new Error("PERCEPTUAL_PAIR_SEALED_APPROVED_SPEND_REQUIRED");
  }

  const pairExecutionIdentity = hash({
    runtime: CONTRACT,
    pair_payload_sha256: preview.pair_payload_sha256,
    source_task_id: source.id,
    review_task_id: review.id,
    repair_identity: identity,
    blocked_provider_ids: specification.blocked_provider_ids,
    projected_cost: projectedCost,
    approved_ceiling: spend.approved_ceiling,
  });

  replacementSource.metadata = {
    ...object(replacementSource.metadata),
    pair_execution_identity: pairExecutionIdentity,
    pair_payload_sha256: preview.pair_payload_sha256,
    approved_spend_guard_contract: spend.contract,
    approved_spend_ceiling: spend.approved_ceiling,
    committed_total_before_repair: spend.committed_total_before_new_spend,
    projected_total_after_repair: spend.projected_total_spend,
  };
  replacementReview.metadata = {
    ...object(replacementReview.metadata),
    pair_execution_identity: pairExecutionIdentity,
    pair_payload_sha256: preview.pair_payload_sha256,
    approved_spend_guard_contract: spend.contract,
  };

  const createdSource = await ensureTask(replacementSource);
  const createdReview = await ensureTask(replacementReview);

  await ProductionTaskRuntime.update(source.id, {
    metadata: {
      ...object(source.metadata),
      superseded_by_repair_task_id: createdSource.id,
      repair_identity: identity,
      repair_attempt: attempt,
      repair_attempted: true,
      pair_aware_repair: true,
      generated_media_perceptual_pair_repair: true,
      pair_execution_identity: pairExecutionIdentity,
    },
  });
  await ProductionTaskRuntime.update(review.id, {
    metadata: {
      ...object(review.metadata),
      superseded_by_repair_review_task_id: createdReview.id,
      repair_identity: identity,
      repair_attempt: attempt,
      repair_attempted: true,
      pair_aware_repair: true,
      generated_media_perceptual_pair_repair: true,
      pair_execution_identity: pairExecutionIdentity,
    },
  });

  return {
    source_task_id: source.id,
    review_task_id: review.id,
    replacement_source_task_id: createdSource.id,
    replacement_review_task_id: createdReview.id,
    repair_identity: identity,
    repair_attempt: attempt,
    failed_provider_id: specification.failed_provider_id,
    blocked_provider_ids: specification.blocked_provider_ids,
    projected_cost: projectedCost,
    spend,
  };
}

export const CreativeGeneratedMediaPerceptualPairRecoveryRuntime = {
  contract: CONTRACT,

  async ensure({ organization_id, creative_project_id } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");

    const [project, tasks] = await Promise.all([
      CreativeProjectRepository.getById(creative_project_id),
      ProductionTaskRuntime.list({ organization_id, creative_project_id }),
    ]);
    if (!project || text(project.organization_id) !== text(organization_id)) {
      throw new Error("Creative project not found");
    }

    const taskMap = new Map(tasks.map((task) => [text(task.id), task]));
    const reviews = tasks.filter(failedPairReview);
    const created = [];
    const blocked = [];

    for (const review of reviews) {
      const sourceId = sourceTaskId(review);
      const source = sourceId ? taskMap.get(sourceId) : null;
      if (!source) {
        blocked.push({
          review_task_id: review.id,
          reason: "PERCEPTUAL_PAIR_SOURCE_TASK_NOT_FOUND",
        });
        continue;
      }
      if (
        text(source.status).toUpperCase() !== "FAILED" ||
        source.metadata?.perceptual_validation_failed !== true
      ) {
        blocked.push({
          source_task_id: source.id,
          review_task_id: review.id,
          reason: "PERCEPTUAL_PAIR_FAILED_SOURCE_REQUIRED",
        });
        continue;
      }
      if (superseded(source)) continue;

      try {
        created.push(await createPair({ source, review, project }));
      } catch (error) {
        blocked.push({
          source_task_id: source.id,
          review_task_id: review.id,
          reason: error?.message || String(error),
        });
      }
    }

    return {
      contract: CONTRACT,
      enabled: true,
      failed_pair_count: reviews.length,
      created,
      blocked,
      created_pair_count: created.length,
      blocked_pair_count: blocked.length,
      unresolved_pair_count: Math.max(
        0,
        reviews.length - created.length,
      ),
      provider_calls_executed: false,
      provider_selection_executed: false,
      wallet_changes_executed: false,
    };
  },
};
