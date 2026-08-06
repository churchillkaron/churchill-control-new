import crypto from "node:crypto";

import {
  preparePromptlessPersistence,
  persistedPromptFieldPaths,
} from "@/lib/creative/execution/runtime/CreativePromptlessPersistenceRuntime";
import {
  CreativeProductionTaskMaterializationRuntime,
} from "@/lib/creative/execution/runtime/CreativeProductionTaskMaterializationRuntime";

const RUNTIME_CONTRACT = "GENERATED_MEDIA_PERCEPTUAL_PAIR_REPAIR_RUNTIME_V1";
const SOURCE_PAYLOAD_CONTRACT = "GENERATED_MEDIA_PERCEPTUAL_REPLACEMENT_SOURCE_V1";
const REVIEW_PAYLOAD_CONTRACT = "GENERATED_MEDIA_PERCEPTUAL_REPLACEMENT_REVIEW_V1";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function money(value) {
  return Number(Number(value || 0).toFixed(6));
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stable(value[key])]),
  );
}

function sha256(value) {
  return crypto
    .createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(stable(value)))
    .digest("hex");
}

function deterministicUuid(value) {
  const hex = sha256(value).slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = ["8", "9", "a", "b"][Number.parseInt(hex[16], 16) % 4];
  const joined = hex.join("");
  return [
    joined.slice(0, 8),
    joined.slice(8, 12),
    joined.slice(12, 16),
    joined.slice(16, 20),
    joined.slice(20, 32),
  ].join("-");
}

function removeKeys(value = {}, keys = []) {
  const output = { ...object(value) };
  for (const key of keys) delete output[key];
  return output;
}

function cleanRequirements(value = {}) {
  return removeKeys(value, ["task_materialization_contract"]);
}

function cleanSourceMetadata(source = {}) {
  return removeKeys(source.metadata, [
    "superseded_by_repair_task_id",
    "superseded_by_repair_review_task_id",
    "repair_identity",
    "repair_attempt",
    "repair_attempted",
    "repair_of_task_id",
    "repair_quality_task_id",
    "repair_failures",
    "repair_instructions",
    "perceptual_validation_failed",
    "perceptual_review_task_id",
    "rejected_before_editing",
    "automated_perceptual_validation_passed",
    "approved_for_downstream_after_perceptual_review",
    "targeted_perceptual_reconciliation",
    "targeted_perceptual_reconciliation_id",
    "targeted_perceptual_reconciled_at",
    "task_materialization_contract",
    "task_materialization_contract_hash",
    "task_materialization_verified",
    "task_type",
    "provider_id",
  ]);
}

function cleanReviewMetadata(review = {}) {
  return removeKeys(review.metadata, [
    "superseded_by_repair_task_id",
    "superseded_by_repair_review_task_id",
    "repair_identity",
    "repair_attempt",
    "repair_attempted",
    "repair_review_of_task_id",
    "repaired_source_task_id",
    "automated_perceptual_validation_passed",
    "generated_media_released_for_downstream",
    "targeted_perceptual_reconciliation",
    "targeted_perceptual_reconciliation_id",
    "targeted_perceptual_reconciled_at",
    "generated_media_url_bound",
    "reference_count",
    "task_materialization_contract",
    "task_materialization_contract_hash",
    "task_materialization_verified",
    "task_type",
    "provider_id",
  ]);
}

function cleanReviewInput(review = {}) {
  const input = removeKeys(review.input, [
    "image",
    "media",
    "source",
    "video",
    "assets",
    "reference_images",
    "finished_still",
  ]);
  const requirements = cleanRequirements(input.requirements);
  const providerParameters = removeKeys(input.provider_parameters, [
    "generated_media_url",
    "references",
    "source_generation_task_id",
    "source_generation_node_id",
  ]);
  return {
    ...input,
    requirements,
    provider_parameters: providerParameters,
  };
}

function sourceExecutionNodeId(source = {}, attempt = 1) {
  const base = text(source.metadata?.execution_node_id || source.id);
  return `${base}:pair-repair:${attempt}`;
}

function reviewExecutionNodeId(review = {}, attempt = 1) {
  const base = text(review.metadata?.execution_node_id || review.id);
  return `${base}:pair-repair-review:${attempt}`;
}

function materializationContract({
  id,
  nodeType,
  title,
  description,
  serviceId,
  capability,
  sceneId,
  shotId,
  requirements,
  reviewRequired,
  metadata,
}) {
  const normalizedRequirements = cleanRequirements(requirements);
  return CreativeProductionTaskMaterializationRuntime.contractFor({
    id,
    type: nodeType,
    title,
    description,
    generation: {
      required: true,
      service: serviceId || capability || null,
      capability: capability || serviceId || null,
      provider: "AUTO",
      output_spec: object(normalizedRequirements.output_spec),
    },
    requirements: {
      ...normalizedRequirements,
      scene_id: sceneId || normalizedRequirements.scene_id || null,
      human_approval_required: reviewRequired === true,
      review: {
        ...object(normalizedRequirements.review),
        human_approval_required: reviewRequired === true,
      },
    },
    review: {
      required: reviewRequired === true,
    },
    metadata: {
      ...object(metadata),
      scene_id: sceneId || null,
      shot_id: shotId || null,
      provider_id: null,
      review_required: reviewRequired === true,
    },
  });
}

function assertScope(source = {}, review = {}, plan = {}) {
  const fields = [
    "organization_id",
    "creative_project_id",
    "production_graph_id",
  ];
  for (const key of fields) {
    if (!text(source[key]) || text(source[key]) !== text(review[key])) {
      throw new Error(`PAIR_REPAIR_SCOPE_MISMATCH:${key}`);
    }
  }
  if (text(plan.source_task_id) !== text(source.id)) {
    throw new Error("PAIR_REPAIR_SOURCE_ID_MISMATCH");
  }
  if (text(plan.review_task_id) !== text(review.id)) {
    throw new Error("PAIR_REPAIR_REVIEW_ID_MISMATCH");
  }
  if (text(source.status) !== "FAILED" || text(review.status) !== "FAILED") {
    throw new Error("PAIR_REPAIR_REQUIRES_FAILED_PAIR");
  }
  if (!text(plan.repair_identity)) {
    throw new Error("PAIR_REPAIR_IDENTITY_REQUIRED");
  }
  if (!Number.isInteger(Number(plan.repair_attempt)) || Number(plan.repair_attempt) <= 0) {
    throw new Error("PAIR_REPAIR_ATTEMPT_INVALID");
  }
  if (!object(plan.structured_repair_specification).promptless_source_of_truth) {
    throw new Error("PAIR_REPAIR_PROMPTLESS_SPECIFICATION_REQUIRED");
  }
}

function buildSourcePayload({ source, review, plan }) {
  const attempt = Number(plan.repair_attempt);
  const repairIdentity = text(plan.repair_identity);
  const executionNodeId = sourceExecutionNodeId(source, attempt);
  const id = deterministicUuid({
    contract: SOURCE_PAYLOAD_CONTRACT,
    organization_id: source.organization_id,
    production_graph_id: source.production_graph_id,
    source_task_id: source.id,
    review_task_id: review.id,
    repair_identity: repairIdentity,
    attempt,
  });
  const title = `Repair ${source.title || "generated media"}`;
  const description =
    "Pair-aware replacement generated from the failed perceptual review contract and bounded structured repair evidence.";
  const metadata = {
    ...cleanSourceMetadata(source),
    execution_node_id: executionNodeId,
    execution_step_id: executionNodeId,
    repair_attempt: attempt,
    repair_identity: repairIdentity,
    repair_of_task_id: source.id,
    repair_quality_task_id: review.id,
    pair_aware_repair: true,
    generated_media_perceptual_pair_repair: true,
    repair_payload_contract: SOURCE_PAYLOAD_CONTRACT,
    release_candidate: false,
    provider_selection_pending: true,
  };
  const requirements = cleanRequirements(source.input?.requirements);
  const taskMaterializationContract = materializationContract({
    id: executionNodeId,
    nodeType: source.input?.node_type || source.metadata?.node_type || source.type,
    title,
    description,
    serviceId: source.service_code || source.service_id || null,
    capability: source.capability || source.service_code || source.service_id || null,
    sceneId: source.scene_id || null,
    shotId: source.shot_id || null,
    requirements,
    reviewRequired: source.review?.required === true,
    metadata,
  });
  const input = {
    ...object(source.input),
    requirements: {
      ...requirements,
      task_materialization_contract: taskMaterializationContract,
    },
    repair_specification: object(plan.structured_repair_specification),
    repair_context: {
      contract: RUNTIME_CONTRACT,
      source_task_id: source.id,
      review_task_id: review.id,
      repair_identity: repairIdentity,
      repair_attempt: attempt,
      provider_selection_authorized: false,
      dispatch_authorized: false,
    },
  };
  return preparePromptlessPersistence(
    {
      id,
      organization_id: source.organization_id,
      creative_project_id: source.creative_project_id,
      production_graph_id: source.production_graph_id,
      scene_id: source.scene_id || null,
      shot_id: source.shot_id || null,
      type: source.type,
      status: "WAITING",
      title,
      description,
      service_id: source.service_id || null,
      service_code: source.service_code || source.service_id || null,
      capability: source.capability || null,
      provider_id: null,
      priority: Math.max(0, Number(source.priority || 100) - 1),
      depends_on: list(source.depends_on),
      input,
      output: {},
      cost: {
        currency: source.cost?.currency || null,
        estimated: money(source.cost?.estimated),
        actual: 0,
        approved: false,
      },
      timing: {
        estimated_seconds: Number(source.timing?.estimated_seconds || 0),
        started_at: null,
        completed_at: null,
      },
      review: {
        required: source.review?.required === true,
        approved: false,
        approved_by: null,
        notes: "",
      },
      error: null,
      metadata,
      created_by: source.created_by || null,
    },
    "GENERATED_MEDIA_PERCEPTUAL_REPLACEMENT_SOURCE",
  );
}

function buildReviewPayload({ source, review, plan, replacementSource }) {
  const attempt = Number(plan.repair_attempt);
  const repairIdentity = text(plan.repair_identity);
  const executionNodeId = reviewExecutionNodeId(review, attempt);
  const id = deterministicUuid({
    contract: REVIEW_PAYLOAD_CONTRACT,
    organization_id: review.organization_id,
    production_graph_id: review.production_graph_id,
    source_task_id: source.id,
    review_task_id: review.id,
    replacement_source_task_id: replacementSource.id,
    repair_identity: repairIdentity,
    attempt,
  });
  const title = `Review repaired ${review.title || "generated media"}`;
  const description =
    "Re-run the original perceptual gate against the replacement source and the exact bounded repair contract.";
  const originalInput = cleanReviewInput(review);
  const sourceNodeId = text(replacementSource.metadata?.execution_node_id);
  const metadata = {
    ...cleanReviewMetadata(review),
    execution_node_id: executionNodeId,
    execution_step_id: executionNodeId,
    source_generation_task_id: replacementSource.id,
    source_generation_node_id: sourceNodeId,
    repair_attempt: attempt,
    repair_identity: repairIdentity,
    repair_review_of_task_id: review.id,
    repaired_source_task_id: replacementSource.id,
    pair_aware_repair: true,
    generated_media_perceptual_pair_repair: true,
    repair_payload_contract: REVIEW_PAYLOAD_CONTRACT,
    release_candidate: false,
    provider_selection_pending: true,
  };
  const taskMaterializationContract = materializationContract({
    id: executionNodeId,
    nodeType: review.input?.node_type || review.metadata?.node_type || review.type,
    title,
    description,
    serviceId: review.service_code || review.service_id || null,
    capability: review.capability || review.service_code || review.service_id || null,
    sceneId: review.scene_id || null,
    shotId: review.shot_id || null,
    requirements: originalInput.requirements,
    reviewRequired: true,
    metadata,
  });
  const input = {
    ...originalInput,
    requirements: {
      ...object(originalInput.requirements),
      source_generation_node_id: sourceNodeId,
      task_materialization_contract: taskMaterializationContract,
    },
    provider_parameters: {
      ...object(originalInput.provider_parameters),
      source_generation_task_id: replacementSource.id,
      source_generation_node_id: sourceNodeId,
      repair_identity: repairIdentity,
      repair_attempt: attempt,
    },
    repair_evaluation: {
      contract: RUNTIME_CONTRACT,
      original_source_task_id: source.id,
      original_review_task_id: review.id,
      repaired_source_task_id: replacementSource.id,
      failed_checks: list(plan.failed_checks),
      provider_failures: list(plan.provider_failures),
      required_repairs: list(plan.provider_repair_instructions),
      reject_regressions: true,
      preserve_unfailed_requirements: true,
    },
  };
  return preparePromptlessPersistence(
    {
      id,
      organization_id: review.organization_id,
      creative_project_id: review.creative_project_id,
      production_graph_id: review.production_graph_id,
      scene_id: review.scene_id || null,
      shot_id: review.shot_id || null,
      type: review.type,
      status: "WAITING",
      title,
      description,
      service_id: review.service_id || null,
      service_code: review.service_code || review.service_id || null,
      capability: review.capability || null,
      provider_id: null,
      priority: Math.max(0, Number(review.priority || 100) + 1),
      depends_on: [replacementSource.id],
      input,
      output: {},
      cost: {
        currency: review.cost?.currency || null,
        estimated: money(review.cost?.estimated),
        actual: 0,
        approved: false,
      },
      timing: {
        estimated_seconds: Number(review.timing?.estimated_seconds || 0),
        started_at: null,
        completed_at: null,
      },
      review: {
        required: true,
        approved: false,
        approved_by: null,
        notes: "",
      },
      error: null,
      metadata,
      created_by: review.created_by || null,
    },
    "GENERATED_MEDIA_PERCEPTUAL_REPLACEMENT_REVIEW",
  );
}

function previewPair({ source, review, plan }) {
  assertScope(source, review, plan);
  const replacementSource = buildSourcePayload({ source, review, plan });
  const replacementReview = buildReviewPayload({
    source,
    review,
    plan,
    replacementSource,
  });
  const promptPaths = [
    ...persistedPromptFieldPaths(
      replacementSource,
      "replacement_source",
    ),
    ...persistedPromptFieldPaths(
      replacementReview,
      "replacement_review",
    ),
  ];
  if (promptPaths.length) {
    throw new Error(
      `PAIR_REPAIR_PREVIEW_PERSISTED_PROMPT_FIELDS_FORBIDDEN:${promptPaths.join(",")}`,
    );
  }
  const sourceMaterialization =
    replacementSource.input?.requirements?.task_materialization_contract;
  const reviewMaterialization =
    replacementReview.input?.requirements?.task_materialization_contract;
  const materializationContractsVerified =
    CreativeProductionTaskMaterializationRuntime.verify(sourceMaterialization) &&
    CreativeProductionTaskMaterializationRuntime.verify(reviewMaterialization) &&
    text(sourceMaterialization?.node_id) ===
      text(replacementSource.metadata?.execution_node_id) &&
    text(reviewMaterialization?.node_id) ===
      text(replacementReview.metadata?.execution_node_id);
  if (!materializationContractsVerified) {
    throw new Error(
      "PAIR_REPAIR_PREVIEW_MATERIALIZATION_CONTRACT_INVALID",
    );
  }
  return {
    contract: RUNTIME_CONTRACT,
    repair_identity: text(plan.repair_identity),
    repair_attempt: Number(plan.repair_attempt),
    original_source_task_id: source.id,
    original_review_task_id: review.id,
    replacement_source_task: replacementSource,
    replacement_review_task: replacementReview,
    pair_payload_sha256: sha256({
      replacement_source_task: replacementSource,
      replacement_review_task: replacementReview,
    }),
    promptless_persistence: true,
    materialization_contracts_verified: materializationContractsVerified,
    provider_selection_authorized: false,
    cost_authorized: false,
    dispatch_authorized: false,
  };
}

export const CreativeGeneratedMediaPerceptualPairRepairRuntime = Object.freeze({
  contract: RUNTIME_CONTRACT,
  source_payload_contract: SOURCE_PAYLOAD_CONTRACT,
  review_payload_contract: REVIEW_PAYLOAD_CONTRACT,
  deterministicUuid,
  previewPair,
});
