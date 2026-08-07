import crypto from "node:crypto";

import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  PRODUCTION_TASK_TYPES,
} from "@/lib/operations/tasks/documents/ProductionTask";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.production-task-materialization.v2",
);
const CONTRACT = "CREATIVE_PRODUCTION_TASK_MATERIALIZATION_V2";
const LINEAGE_CONTRACT = "CREATIVE_STORY_LINEAGE_CONTRACT_V1";

const PROMPT_FIELDS = new Set([
  "prompt",
  "provider_prompt",
  "negative_prompt",
  "system_prompt",
  "developer_prompt",
  "user_prompt",
  "generation_prompt",
  "visual_prompt",
  "video_prompt",
  "image_prompt",
  "music_prompt",
  "transport_prompt",
  "prompt_template",
  "prompt_text",
  "prompt_override",
  "original_prompt",
  "additional_prompt",
]);

const FORBIDDEN_METADATA_KEYS = new Set([
  "requirements",
  "generation",
  "input",
  "provider_parameters",
  "asset_scope",
  "task_materialization_contract",
  "task_materialization_contract_hash",
]);

const ALLOWED_METADATA_KEYS = new Set([
  "contract",
  "workflow_kind",
  "creative_mission_id",
  "scene_id",
  "scene_number",
  "shot_id",
  "shot_number",
  "final_shot_node_id",
  "tags",
  "medium",
  "frame_plan",
  "reference_asset_ids",
  "available_asset_ids",
  "reuse_policy",
  "primary_source_asset_id",
  "source_binding_contract",
  "identity_profile_id",
  "identity_atlas_asset_node_id",
  "identity_atlas_url",
  "identity_atlas_hash",
  "identity_keyframe_for_shot_id",
  "identity_keyframe_node_id",
  "identity_keyframe_review_node_id",
  "identity_keyframe_review_for_shot_id",
  "identity_keyframe_consumed_by_motion_plate",
  "human_approval_required",
  "minimum_identity_score",
  "minimum_story_score",
  "minimum_total_score",
  "source_motion_node_id",
  "source_lipsync_node_id",
  "lip_sync_review_node_id",
  "lip_sync_required",
  "source_generation_node_id",
  "source_node_type",
  "media_kind",
  "identity_expected",
  "product_expected",
  "music_expected",
  "person_expected",
  "thresholds",
  "reject_before_editing",
  "automated_validation_required",
  "perceptual_review_node_id",
  "perceptual_review_required_before_editing",
  "asset_scope_contract",
  "asset_scope_hash",
  "scoped_creative_asset_ids",
  "scoped_asset_node_ids",
  "scoped_dependency_node_ids",
  "provider_input_mode",
  "story_lineage",
  "research_identity",
  "business_context_hash",
  "industry_context_hash",
  "selected_concept_hash",
  "concept_council_hash",
  "story_contract_hash",
  "master_plan_hash",
  "approval_plan_hash",
  "provider_prompt_persisted",
  "provider_prompts_persisted",
]);

const ALLOWED_TASK_METADATA_KEYS = new Set([
  ...ALLOWED_METADATA_KEYS,
  "execution_node_id",
  "execution_step_id",
  "master_plan_validation",
  "node_type",
  "task_type",
  "provider_id",
  "review_required",
  "task_materialization_contract",
  "task_materialization_contract_hash",
  "task_materialization_verified",
  "task_materialization_contract_version",
  "task_materialization_metadata_allowlisted",
  "task_materialization_idempotent",
  "task_materialization_lineage_verified",
  "pair_aware_repair",
  "generated_media_perceptual_pair_repair",
  "repair_payload_contract",
  "repair_of_task_id",
  "repair_quality_task_id",
  "repaired_source_task_id",
]);

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function normalizedKey(value) {
  return text(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replaceAll("-", "_")
    .toLowerCase();
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => key !== "contract_hash")
      .sort()
      .map((key) => [key, canonical(value[key])]),
  );
}

function digest(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

function stripPrompts(value, depth = 0) {
  if (depth > 20) return null;
  if (Array.isArray(value)) {
    return value.map((item) => stripPrompts(item, depth + 1));
  }
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !PROMPT_FIELDS.has(normalizedKey(key)))
      .map(([key, child]) => [key, stripPrompts(child, depth + 1)]),
  );
}

function stripMetadataValue(value, depth = 0) {
  if (depth > 20) return null;
  if (Array.isArray(value)) {
    return value.map((item) => stripMetadataValue(item, depth + 1));
  }
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => {
        const normalized = normalizedKey(key);
        return !PROMPT_FIELDS.has(normalized) &&
          !FORBIDDEN_METADATA_KEYS.has(normalized);
      })
      .map(([key, child]) => [key, stripMetadataValue(child, depth + 1)]),
  );
}

function allowlistedMetadata(value = {}, allowedKeys = ALLOWED_METADATA_KEYS) {
  return Object.fromEntries(
    Object.entries(object(value))
      .filter(([key]) => allowedKeys.has(key))
      .map(([key, child]) => [key, stripMetadataValue(child)]),
  );
}

function capabilityFor(node = {}) {
  return text(
    node.generation?.capability ||
    node.generation?.service ||
    node.capability ||
    node.service_id,
  ).toLowerCase();
}

function taskTypeFor(node = {}) {
  const capability = capabilityFor(node);
  const type = text(node.type).toUpperCase();

  if (
    capability.includes(".analyze") ||
    capability.includes(".validate") ||
    capability.includes(".review") ||
    capability.includes("quality") ||
    /REVIEW|VALIDATION|QUALITY/.test(type)
  ) return PRODUCTION_TASK_TYPES.QUALITY_REVIEW;
  if (capability.includes("video.lip_sync")) return PRODUCTION_TASK_TYPES.LIP_SYNC;
  if (
    capability.includes("image_to_video") ||
    capability.includes("image-to-video") ||
    type === "IMAGE_TO_VIDEO"
  ) return PRODUCTION_TASK_TYPES.IMAGE_TO_VIDEO;
  if (capability.includes("image.upscale")) return PRODUCTION_TASK_TYPES.UPSCALE;
  if (capability.includes("image")) return PRODUCTION_TASK_TYPES.GENERATE_IMAGE;
  if (capability.includes("video")) return PRODUCTION_TASK_TYPES.GENERATE_VIDEO;
  if (capability.includes("voice")) return PRODUCTION_TASK_TYPES.GENERATE_VOICE;
  if (capability.includes("music")) return PRODUCTION_TASK_TYPES.GENERATE_MUSIC;
  if (capability.includes("sfx")) return PRODUCTION_TASK_TYPES.GENERATE_SFX;
  if (capability.includes("audio")) return PRODUCTION_TASK_TYPES.GENERATE_AUDIO;
  if (
    capability.includes("speech.to.text") ||
    capability.includes("subtitle")
  ) return PRODUCTION_TASK_TYPES.SUBTITLE;
  if (capability.includes("render")) return PRODUCTION_TASK_TYPES.RENDER_PRODUCTION;
  return PRODUCTION_TASK_TYPES.EXECUTE_CAPABILITY;
}

function reviewFor(node = {}) {
  const required =
    node.review?.required === true ||
    node.requirements?.human_approval_required === true ||
    node.requirements?.review?.human_approval_required === true ||
    node.metadata?.human_approval_required === true ||
    node.metadata?.review_required === true;
  return {
    required,
    approved: false,
    approved_by: null,
    notes: required
      ? "Human approval required by the immutable production node contract."
      : "Automated production node; no human approval required at task creation.",
  };
}

function shotIdFor(node = {}) {
  return text(
    node.metadata?.shot_id ||
    node.metadata?.final_shot_node_id ||
    node.intent?.shot_id ||
    (text(node.type).toUpperCase() === "SHOT" ? node.id : null),
  ) || null;
}

function sceneIdFor(node = {}) {
  return text(
    node.metadata?.scene_id ||
    node.intent?.scene_id ||
    node.requirements?.scene_id,
  ) || null;
}

function providerFor(node = {}) {
  const provider = text(
    node.generation?.provider ||
    node.generation?.provider_id ||
    node.metadata?.provider_id,
  );
  return provider && provider.toUpperCase() !== "AUTO" ? provider : null;
}

function storyLineage(value = {}) {
  return object(
    value.story_lineage ||
    value.metadata?.story_lineage ||
    value.requirements?.story_lineage,
  );
}

function lineageSnapshot(value = {}) {
  const lineage = storyLineage(value);
  if (!Object.keys(lineage).length) return null;
  return {
    contract: lineage.contract || null,
    research_identity: lineage.research_identity || null,
    business_context_hash: lineage.business_context_hash || null,
    industry_context_hash: lineage.industry_context_hash || null,
    selected_concept_hash: lineage.selected_concept_hash || null,
    concept_council_hash: lineage.concept_council_hash || null,
    story_contract_hash: lineage.story_contract_hash || null,
    master_plan_hash: lineage.master_plan_hash || null,
    approval_plan_hash: lineage.approval_plan_hash || null,
    immutable: lineage.immutable === true,
  };
}

function assertTemporalLineage(value = {}) {
  const workflow = text(value.metadata?.workflow_kind || value.workflow_kind).toUpperCase();
  if (workflow !== "TEMPORAL") return null;
  const lineage = lineageSnapshot(value);
  if (
    lineage?.contract !== LINEAGE_CONTRACT ||
    lineage.immutable !== true ||
    !text(lineage.research_identity) ||
    !text(lineage.story_contract_hash) ||
    !text(lineage.master_plan_hash)
  ) {
    throw new Error("PRODUCTION_TASK_MATERIALIZATION_STORY_LINEAGE_REQUIRED");
  }
  return lineage;
}

function contractFor(node = {}) {
  if (!node.id) throw new Error("PRODUCTION_TASK_MATERIALIZATION_NODE_REQUIRED");
  if (node.generation?.required !== true) {
    throw new Error(`PRODUCTION_TASK_MATERIALIZATION_GENERATION_REQUIRED:${node.id}`);
  }

  const lineage = assertTemporalLineage(node) || lineageSnapshot(node);
  const contract = {
    contract: CONTRACT,
    node_id: node.id,
    node_type: node.type,
    scene_id: sceneIdFor(node),
    shot_id: shotIdFor(node),
    task_type: taskTypeFor(node),
    service_id: node.generation?.service || null,
    capability:
      node.generation?.capability ||
      node.generation?.service ||
      null,
    provider_id: providerFor(node),
    title: node.title || "",
    description: node.description || node.intent?.purpose || "",
    review: reviewFor(node),
    reference_assets: stripPrompts(list(node.requirements?.reference_assets)),
    reference_asset_ids: list(node.requirements?.reference_asset_ids),
    output_spec: stripPrompts(
      node.generation?.output_spec ||
      node.requirements?.output_spec ||
      {},
    ),
    story_lineage: lineage,
    node_metadata: allowlistedMetadata(node.metadata),
    persistence: {
      metadata_allowlisted: true,
      prompts_persisted: false,
      nested_materialization_contracts_allowed: false,
    },
  };

  return {
    ...contract,
    contract_hash: digest(contract),
  };
}

function verify(contract = {}) {
  return contract.contract === CONTRACT &&
    contract.persistence?.metadata_allowlisted === true &&
    contract.persistence?.prompts_persisted === false &&
    contract.persistence?.nested_materialization_contracts_allowed === false &&
    Boolean(text(contract.contract_hash)) &&
    text(contract.contract_hash) === digest(contract);
}

function verifyLineage(contract = {}, expectedLineage = {}) {
  const actual = object(contract.story_lineage);
  const expected = object(expectedLineage);
  if (!Object.keys(expected).length) return true;
  return actual.contract === expected.contract &&
    actual.immutable === true &&
    text(actual.research_identity) === text(expected.research_identity) &&
    text(actual.story_contract_hash) === text(expected.story_contract_hash) &&
    text(actual.master_plan_hash) === text(expected.master_plan_hash) &&
    text(actual.approval_plan_hash) === text(expected.approval_plan_hash);
}

function normalizeTaskInput(data = {}, contract = {}) {
  const input = stripPrompts(object(data.input));
  const rawRequirements = object(input.requirements);
  const {
    task_materialization_contract: ignoredMaterializationContract,
    task_materialization_contract_hash: ignoredMaterializationHash,
    ...requirementsWithoutMaterialization
  } = rawRequirements;
  const requirements = stripPrompts(requirementsWithoutMaterialization);
  return {
    ...input,
    node_id: contract.node_id,
    node_type: contract.node_type,
    requirements,
    source_assets: stripPrompts(list(input.source_assets)),
    reference_assets: list(input.reference_assets).length
      ? stripPrompts(list(input.reference_assets))
      : stripPrompts(list(contract.reference_assets)),
    reference_asset_ids: list(input.reference_asset_ids).length
      ? list(input.reference_asset_ids)
      : list(contract.reference_asset_ids),
    generation: stripPrompts(object(input.generation)),
    provider_parameters: stripPrompts({
      ...object(input.generation?.provider_parameters),
      ...object(input.provider_parameters),
    }),
    output_spec: stripPrompts(
      Object.keys(object(input.output_spec)).length
        ? object(input.output_spec)
        : object(contract.output_spec),
    ),
    asset_scope: requirements.asset_scope || null,
    story_lineage: contract.story_lineage || null,
    promptless_persistence: true,
  };
}

function assertNodeMatch(data = {}, contract = {}) {
  const executionNodeId = text(data.metadata?.execution_node_id);
  if (executionNodeId && executionNodeId !== text(contract.node_id)) {
    throw new Error(
      `PRODUCTION_TASK_MATERIALIZATION_NODE_MISMATCH:${executionNodeId}:${contract.node_id}`,
    );
  }
}

function normalizeTaskMetadata(data = {}, contract = {}) {
  const merged = {
    ...allowlistedMetadata(contract.node_metadata, ALLOWED_TASK_METADATA_KEYS),
    ...allowlistedMetadata(data.metadata, ALLOWED_TASK_METADATA_KEYS),
  };
  const lineage = object(contract.story_lineage);
  return {
    ...merged,
    story_lineage: lineage,
    research_identity: lineage.research_identity || null,
    business_context_hash: lineage.business_context_hash || null,
    industry_context_hash: lineage.industry_context_hash || null,
    selected_concept_hash: lineage.selected_concept_hash || null,
    concept_council_hash: lineage.concept_council_hash || null,
    story_contract_hash: lineage.story_contract_hash || null,
    master_plan_hash: lineage.master_plan_hash || null,
    approval_plan_hash: lineage.approval_plan_hash || null,
    task_materialization_contract: contract.contract,
    task_materialization_contract_hash: contract.contract_hash,
    task_materialization_verified: true,
    task_materialization_contract_version: 2,
    task_materialization_metadata_allowlisted: true,
    task_materialization_idempotent: true,
    task_materialization_lineage_verified: Object.keys(lineage).length > 0,
    provider_prompt_persisted: false,
    provider_prompts_persisted: false,
    provider_id: data.provider_id || contract.provider_id || null,
    node_type: contract.node_type,
    scene_id: data.scene_id || contract.scene_id || null,
    shot_id: data.shot_id || contract.shot_id || null,
  };
}

function normalizeTaskData(data = {}, contract = {}) {
  assertNodeMatch(data, contract);
  if (!verify(contract)) {
    throw new Error("PRODUCTION_TASK_MATERIALIZATION_CONTRACT_INVALID");
  }

  const expectedLineage = storyLineage(data.metadata || data.input || {});
  if (Object.keys(expectedLineage).length && !verifyLineage(contract, expectedLineage)) {
    throw new Error("PRODUCTION_TASK_MATERIALIZATION_LINEAGE_MISMATCH");
  }

  return {
    ...data,
    scene_id: data.scene_id || contract.scene_id || null,
    shot_id: data.shot_id || contract.shot_id || null,
    type: contract.task_type,
    title: data.title || contract.title || "",
    description: data.description || contract.description || "",
    service_id: data.service_id || contract.service_id || null,
    service_code:
      data.service_code ||
      data.service_id ||
      contract.service_id ||
      null,
    capability: data.capability || contract.capability || null,
    provider_id: data.provider_id || contract.provider_id || null,
    input: normalizeTaskInput(data, contract),
    review: {
      ...object(contract.review),
      ...object(data.review),
      required: contract.review?.required === true,
      approved: false,
    },
    metadata: normalizeTaskMetadata(data, contract),
  };
}

function install() {
  if (ProductionTaskRuntime[INSTALL_FLAG]) return;
  const createWithoutMaterialization = ProductionTaskRuntime.create.bind(
    ProductionTaskRuntime,
  );
  Object.defineProperty(ProductionTaskRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ProductionTaskRuntime.create = async function createWithNodeContract(data = {}) {
    const contract = object(
      data.input?.requirements?.task_materialization_contract,
    );
    if (!Object.keys(contract).length) {
      return createWithoutMaterialization(data);
    }
    if (!verify(contract)) {
      throw new Error("PRODUCTION_TASK_MATERIALIZATION_CONTRACT_INVALID");
    }
    return createWithoutMaterialization(normalizeTaskData(data, contract));
  };
}

install();

export const CreativeProductionTaskMaterializationRuntime = Object.freeze({
  attach(node = {}) {
    const expected = contractFor(node);
    const existing = object(node.requirements?.task_materialization_contract);
    const reusable = verify(existing) &&
      text(existing.node_id) === text(node.id) &&
      text(existing.contract_hash) === text(expected.contract_hash);
    const contract = reusable ? existing : expected;

    node.requirements = {
      ...object(node.requirements),
      task_materialization_contract: contract,
    };
    node.metadata = {
      ...object(node.metadata),
      task_materialization_contract: contract.contract,
      task_materialization_contract_hash: contract.contract_hash,
      task_type: contract.task_type,
      provider_id: contract.provider_id,
      review_required: contract.review.required,
      task_materialization_contract_version: 2,
      task_materialization_metadata_allowlisted: true,
      task_materialization_idempotent: true,
      task_materialization_lineage_verified:
        Object.keys(object(contract.story_lineage)).length > 0,
      provider_prompt_persisted: false,
      provider_prompts_persisted: false,
    };
    return node;
  },
  contractFor,
  normalize: normalizeTaskData,
  verify,
  verifyLineage,
  taskTypeFor,
  metadataFor: allowlistedMetadata,
  stripPrompts,
  stripMetadataValue,
  contract: CONTRACT,
  installed: true,
});
