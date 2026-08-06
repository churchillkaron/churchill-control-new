import crypto from "node:crypto";

import {
  runAIService,
} from "@/lib/platform/service-runtime/ai";
import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  ProductionGraphRuntime,
} from "@/lib/creative/production-graph/runtime/ProductionGraphRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.approved-production-task-cost-guard.v1",
);
const PERSISTENCE_FLAG = Symbol.for(
  "avantiqo.creative.approved-production-uuid-persistence.v1",
);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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

function uuid(value) {
  const normalized = text(value).toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
    normalized,
  )
    ? normalized
    : null;
}

function normalizedGuard(value = {}) {
  const source = object(value);
  const maximumCustomerPrice = finite(
    source.maximum_customer_price ?? source.maximumCustomerPrice,
  );
  const currency = text(source.currency).toUpperCase();
  const reference = text(source.reference || source.budget_reference);
  const estimatedQuantity = finite(
    source.estimated_quantity ?? source.estimatedQuantity,
  );

  if (maximumCustomerPrice === null || maximumCustomerPrice <= 0) {
    throw new Error("APPROVED_PRODUCTION_TASK_MAXIMUM_PRICE_REQUIRED");
  }
  if (!currency) {
    throw new Error("APPROVED_PRODUCTION_TASK_CURRENCY_REQUIRED");
  }
  if (!reference) {
    throw new Error("APPROVED_PRODUCTION_TASK_COST_REFERENCE_REQUIRED");
  }
  if (estimatedQuantity !== null && estimatedQuantity <= 0) {
    throw new Error("APPROVED_PRODUCTION_TASK_QUANTITY_INVALID");
  }

  return {
    contract: "CREATIVE_APPROVED_PRODUCTION_TASK_COST_GUARD_V1",
    maximum_customer_price: maximumCustomerPrice,
    currency,
    reference,
    estimated_quantity: estimatedQuantity,
  };
}

function guardFromTask(task = {}) {
  return normalizedGuard(
    task.metadata?.approved_cost_guard ||
      task.input?.approved_cost_guard ||
      task.cost?.guard,
  );
}

function sanitizeMaterializationContract(requirements = {}) {
  const source = object(requirements);
  const contract = object(source.task_materialization_contract);
  if (
    contract.contract !== "CREATIVE_PRODUCTION_TASK_MATERIALIZATION_V1"
  ) {
    return source;
  }

  const sanitized = {
    ...contract,
    scene_id: uuid(contract.scene_id),
    shot_id: uuid(contract.shot_id),
    node_metadata: {
      ...object(contract.node_metadata),
      source_scene_reference:
        uuid(contract.scene_id) ? null : text(contract.scene_id) || null,
      source_shot_reference:
        uuid(contract.shot_id) ? null : text(contract.shot_id) || null,
      scene_id: uuid(contract.scene_id),
      shot_id: uuid(contract.shot_id),
    },
  };
  delete sanitized.contract_hash;
  sanitized.contract_hash = digest(sanitized);

  return {
    ...source,
    task_materialization_contract: sanitized,
  };
}

function sanitizeGraphForPersistence(graph = {}) {
  const storyboardId = uuid(graph.storyboard_id);
  const creativeBriefId = uuid(graph.creative_brief_id);
  const creativeStrategyId = uuid(graph.creative_strategy_id);

  return {
    ...graph,
    storyboard_id: storyboardId,
    creative_brief_id: creativeBriefId,
    creative_strategy_id: creativeStrategyId,
    metadata: {
      ...object(graph.metadata),
      source_storyboard_reference:
        storyboardId ? null : text(graph.storyboard_id) || null,
      source_creative_brief_reference:
        creativeBriefId ? null : text(graph.creative_brief_id) || null,
      source_creative_strategy_reference:
        creativeStrategyId ? null : text(graph.creative_strategy_id) || null,
      synthetic_preview_relational_ids_persisted: false,
      relational_uuid_sanitization_contract:
        "CREATIVE_PREVIEW_RELATIONAL_UUID_SANITIZATION_V1",
    },
  };
}

function sanitizeTaskForPersistence(task = {}) {
  const sceneId = uuid(task.scene_id);
  const shotId = uuid(task.shot_id);
  const input = object(task.input);
  const requirements = sanitizeMaterializationContract(input.requirements);

  return {
    ...task,
    scene_id: sceneId,
    shot_id: shotId,
    input: {
      ...input,
      requirements,
    },
    metadata: {
      ...object(task.metadata),
      source_scene_reference:
        sceneId ? null : text(task.scene_id) || text(task.metadata?.scene_id) || null,
      source_shot_reference:
        shotId ? null : text(task.shot_id) || text(task.metadata?.shot_id) || null,
      scene_id: sceneId,
      shot_id: shotId,
      synthetic_preview_relational_ids_persisted: false,
      relational_uuid_sanitization_contract:
        "CREATIVE_PREVIEW_RELATIONAL_UUID_SANITIZATION_V1",
    },
  };
}

function installPersistenceSanitizer() {
  if (ProductionGraphRuntime[PERSISTENCE_FLAG]) return;

  const createGraphWithoutSanitizer = ProductionGraphRuntime.create.bind(
    ProductionGraphRuntime,
  );
  const createTaskWithoutSanitizer = ProductionTaskRuntime.create.bind(
    ProductionTaskRuntime,
  );

  Object.defineProperty(ProductionGraphRuntime, PERSISTENCE_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });
  Object.defineProperty(ProductionTaskRuntime, PERSISTENCE_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ProductionGraphRuntime.create = async function createSanitizedProductionGraph(
    graph = {},
  ) {
    return createGraphWithoutSanitizer(sanitizeGraphForPersistence(graph));
  };

  ProductionTaskRuntime.create = async function createSanitizedProductionTask(
    task = {},
  ) {
    return createTaskWithoutSanitizer(sanitizeTaskForPersistence(task));
  };
}

function installCostGuard() {
  if (runAIService[INSTALL_FLAG]) return;
  const executeWithoutApprovedTaskGuard = runAIService.execute.bind(runAIService);

  Object.defineProperty(runAIService, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  runAIService.execute = async function executeWithApprovedProductionCostGuard(
    input = {},
  ) {
    const taskId = text(input.metadata?.task_id);
    if (!taskId) return executeWithoutApprovedTaskGuard(input);

    const task = await ProductionTaskRuntime.get(taskId);
    if (!task) throw new Error("APPROVED_PRODUCTION_TASK_NOT_FOUND");

    const approvalContract = object(task.metadata?.production_approval_contract);
    if (
      approvalContract.contract !==
        "CREATIVE_SEALED_PRODUCTION_EXECUTION_APPROVAL_V1" ||
      approvalContract.production_authorized !== true ||
      approvalContract.publication_authorized !== false
    ) {
      throw new Error("SEALED_PRODUCTION_TASK_APPROVAL_CONTRACT_REQUIRED");
    }

    const guard = guardFromTask(task);
    return executeWithoutApprovedTaskGuard({
      ...input,
      cost_guard: guard,
      metadata: {
        ...object(input.metadata),
        approved_production_task_cost_guard_contract: guard.contract,
        approved_production_task_cost_guard_reference: guard.reference,
        approved_production_task_maximum_customer_price:
          guard.maximum_customer_price,
        approved_production_task_currency: guard.currency,
        sealed_approval_manifest_sha256:
          approvalContract.manifest_sha256 || null,
        sealed_preproduction_gate_sha256:
          approvalContract.preproduction_gate_sha256 || null,
      },
    });
  };
}

installPersistenceSanitizer();
installCostGuard();

export const CreativeApprovedProductionTaskCostGuardRuntime = Object.freeze({
  installed: true,
  contract: "CREATIVE_APPROVED_PRODUCTION_TASK_COST_GUARD_V1",
  persistence_contract: "CREATIVE_PREVIEW_RELATIONAL_UUID_SANITIZATION_V1",
  normalizedGuard,
  guardFromTask,
  sanitizeGraphForPersistence,
  sanitizeTaskForPersistence,
  sanitizeMaterializationContract,
});
