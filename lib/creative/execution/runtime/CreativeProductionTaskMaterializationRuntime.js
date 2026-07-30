import crypto from "node:crypto";

import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  PRODUCTION_TASK_TYPES,
} from "@/lib/operations/tasks/documents/ProductionTask";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.production-task-materialization.v1",
);

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

  if (capability.includes("video.lip_sync")) {
    return PRODUCTION_TASK_TYPES.LIP_SYNC;
  }
  if (
    capability.includes("image_to_video") ||
    capability.includes("image-to-video") ||
    type === "IMAGE_TO_VIDEO"
  ) return PRODUCTION_TASK_TYPES.IMAGE_TO_VIDEO;
  if (capability.includes("image.upscale")) {
    return PRODUCTION_TASK_TYPES.UPSCALE;
  }
  if (capability.includes("image")) {
    return PRODUCTION_TASK_TYPES.GENERATE_IMAGE;
  }
  if (capability.includes("video")) {
    return PRODUCTION_TASK_TYPES.GENERATE_VIDEO;
  }
  if (capability.includes("voice")) {
    return PRODUCTION_TASK_TYPES.GENERATE_VOICE;
  }
  if (capability.includes("music")) {
    return PRODUCTION_TASK_TYPES.GENERATE_MUSIC;
  }
  if (capability.includes("sfx")) {
    return PRODUCTION_TASK_TYPES.GENERATE_SFX;
  }
  if (capability.includes("audio")) {
    return PRODUCTION_TASK_TYPES.GENERATE_AUDIO;
  }
  if (
    capability.includes("speech.to.text") ||
    capability.includes("subtitle")
  ) return PRODUCTION_TASK_TYPES.SUBTITLE;
  if (capability.includes("render")) {
    return PRODUCTION_TASK_TYPES.RENDER_PRODUCTION;
  }
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

function contractFor(node = {}) {
  if (!node.id) throw new Error("PRODUCTION_TASK_MATERIALIZATION_NODE_REQUIRED");
  if (node.generation?.required !== true) {
    throw new Error(`PRODUCTION_TASK_MATERIALIZATION_GENERATION_REQUIRED:${node.id}`);
  }

  const contract = {
    contract: "CREATIVE_PRODUCTION_TASK_MATERIALIZATION_V1",
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
    description:
      node.description ||
      node.intent?.purpose ||
      "",
    review: reviewFor(node),
    reference_assets: list(node.requirements?.reference_assets),
    reference_asset_ids: list(node.requirements?.reference_asset_ids),
    output_spec:
      node.generation?.output_spec ||
      node.requirements?.output_spec ||
      {},
    node_metadata: object(node.metadata),
  };

  return {
    ...contract,
    contract_hash: digest(contract),
  };
}

function verify(contract = {}) {
  return contract.contract === "CREATIVE_PRODUCTION_TASK_MATERIALIZATION_V1" &&
    Boolean(text(contract.contract_hash)) &&
    text(contract.contract_hash) === digest(contract);
}

function normalizeTaskInput(data = {}, contract = {}) {
  const input = object(data.input);
  const requirements = object(input.requirements);
  return {
    ...input,
    node_id: contract.node_id,
    node_type: contract.node_type,
    requirements,
    source_assets: list(input.source_assets),
    reference_assets: list(input.reference_assets).length
      ? list(input.reference_assets)
      : list(contract.reference_assets),
    reference_asset_ids: list(input.reference_asset_ids).length
      ? list(input.reference_asset_ids)
      : list(contract.reference_asset_ids),
    generation: object(input.generation),
    prompt:
      input.prompt ||
      input.provider_prompt ||
      input.generation?.provider_prompt ||
      null,
    provider_prompt:
      input.provider_prompt ||
      input.prompt ||
      input.generation?.provider_prompt ||
      null,
    provider_parameters: {
      ...object(input.generation?.provider_parameters),
      ...object(input.provider_parameters),
    },
    output_spec:
      Object.keys(object(input.output_spec)).length
        ? object(input.output_spec)
        : object(contract.output_spec),
    asset_scope: requirements.asset_scope || null,
  };
}

function normalizeTaskData(data = {}, contract = {}) {
  const executionNodeId = text(data.metadata?.execution_node_id);
  if (executionNodeId && executionNodeId !== text(contract.node_id)) {
    throw new Error(
      `PRODUCTION_TASK_MATERIALIZATION_NODE_MISMATCH:${executionNodeId}:${contract.node_id}`,
    );
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
    metadata: {
      ...object(contract.node_metadata),
      ...object(data.metadata),
      task_materialization_contract: contract.contract,
      task_materialization_contract_hash: contract.contract_hash,
      task_materialization_verified: true,
      provider_id: data.provider_id || contract.provider_id || null,
      node_type: contract.node_type,
      scene_id: data.scene_id || contract.scene_id || null,
      shot_id: data.shot_id || contract.shot_id || null,
    },
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

export const CreativeProductionTaskMaterializationRuntime = {
  attach(node = {}) {
    const contract = contractFor(node);
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
    };
    return node;
  },
  contractFor,
  verify,
  taskTypeFor,
  installed: true,
};
