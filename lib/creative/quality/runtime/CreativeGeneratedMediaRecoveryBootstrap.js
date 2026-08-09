import "@/lib/creative/quality/runtime/CreativeGeneratedMediaPerceptualExecutionGate";

import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

const FLAG = Symbol.for(
  "avantiqo.creative.generated-media-recovery-bootstrap.v1",
);
const REVIEW_CONTRACT = "GENERATED_MEDIA_PERCEPTUAL_REVIEW_V1";

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

function sourceNodeId(task = {}) {
  return text(
    task.metadata?.source_generation_node_id ||
    task.input?.requirements?.source_generation_node_id ||
    task.input?.provider_parameters?.source_generation_node_id,
  ) || null;
}

function expectedContract(task = {}) {
  return object(
    task.input?.requirements?.expected_contract ||
    task.metadata?.requirements?.expected_contract,
  );
}

function historicalPerceptualReview(task = {}) {
  if (text(task.metadata?.contract) === REVIEW_CONTRACT) return true;
  const capability = text(task.capability || task.service_id || task.service_code)
    .toLowerCase();
  const nodeId = text(task.metadata?.execution_node_id).toLowerCase();
  const requirements = object(task.input?.requirements);
  return capability === "ai.image.analyze" &&
    Boolean(sourceNodeId(task)) &&
    (
      requirements.generated_output_required === true ||
      requirements.source_asset_node_required === true ||
      nodeId.endsWith(":perceptual-review")
    );
}

async function resolveSourceTask(task = {}) {
  const dependencies = [];
  for (const id of list(task.depends_on)) {
    const dependency = await ProductionTaskRuntime.get(id);
    if (dependency) dependencies.push(dependency);
  }
  const expectedNodeId = sourceNodeId(task);
  return dependencies.find((dependency) =>
    text(dependency.metadata?.execution_node_id) === expectedNodeId,
  ) || dependencies.find((dependency) => dependency.status === "COMPLETED") || null;
}

async function reconcile(task = {}) {
  const source = await resolveSourceTask(task);
  if (!source || source.status !== "COMPLETED") {
    throw new Error("GENERATED_MEDIA_RECOVERY_SOURCE_TASK_NOT_COMPLETED");
  }

  const recoveredSource = await ProductionTaskRuntime.ensureAssetNode(source.id);
  const expected = expectedContract(task);
  const expectedNodeId = sourceNodeId(task);
  const recovered = await ProductionTaskRuntime.update(task.id, {
    type: "QUALITY_REVIEW",
    metadata: {
      ...object(task.metadata),
      contract: REVIEW_CONTRACT,
      source_generation_node_id: expectedNodeId,
      source_generation_task_id: recoveredSource.id,
      source_asset_node_id: recoveredSource.output?.asset_node_id || null,
      media_kind: expected.media_kind || task.metadata?.media_kind || null,
      thresholds:
        expected.thresholds ||
        task.input?.requirements?.thresholds ||
        task.metadata?.thresholds ||
        {},
      historical_perceptual_review_reconciled: true,
      historical_perceptual_review_reconciled_at: new Date().toISOString(),
      provider_regeneration_executed: false,
    },
    input: {
      ...object(task.input),
      provider_parameters: {
        ...object(task.input?.provider_parameters),
        source_generation_node_id: expectedNodeId,
        source_generation_task_id: recoveredSource.id,
        source_asset_node_id: recoveredSource.output?.asset_node_id || null,
      },
    },
  });

  if (!recovered.output && task.output) {
    recovered.output = task.output;
  }
  return recovered;
}

if (!ProductionTaskRuntime[FLAG]) {
  const dispatch = ProductionTaskRuntime.dispatch.bind(ProductionTaskRuntime);
  Object.defineProperty(ProductionTaskRuntime, FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ProductionTaskRuntime.dispatch = async function dispatchWithGeneratedMediaRecovery(id) {
    let task = await ProductionTaskRuntime.get(id);
    if (!task) throw new Error("Production task not found");
    if (historicalPerceptualReview(task)) {
      task = await reconcile(task);
    }
    return dispatch(task.id);
  };
}

export const CreativeGeneratedMediaRecoveryBootstrap = Object.freeze({
  installed: true,
  contract: "CREATIVE_GENERATED_MEDIA_RECOVERY_BOOTSTRAP_V1",
  review_contract: REVIEW_CONTRACT,
});
