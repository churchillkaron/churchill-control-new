import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  ProductionGraphRuntime,
} from "@/lib/creative/production-graph/runtime/ProductionGraphRuntime";
import {
  ProductionQueueRuntime,
} from "@/lib/creative/production/queue/runtime/ProductionQueueRuntime";
import {
  CreativeAssetsRuntime,
} from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";
import {
  CreativeShotAssetScopeRuntime,
} from "@/lib/creative/assets/isolation/runtime/CreativeShotAssetScopeRuntime";
import {
  CreativeShotAssetIsolationExecutionGate,
} from "@/lib/creative/assets/isolation/runtime/CreativeShotAssetIsolationExecutionGate";
import {
  CreativeShotPrimarySourceDispatchGate,
} from "@/lib/creative/assets/isolation/runtime/CreativeShotPrimarySourceDispatchGate";
import {
  CreativeProductionDossierExecutionGate,
} from "@/lib/creative/production/dossier/runtime/CreativeProductionDossierExecutionGate";

const DISPATCH_FLAG = Symbol.for(
  "avantiqo.creative.sealed-production-dispatch-preparation.v1",
);
const QUEUE_FLAG = Symbol.for(
  "avantiqo.creative.sealed-production-graph-queue-scope.v1",
);

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

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function unique(values = []) {
  return [...new Set(list(values).map(text).filter(Boolean))].sort();
}

function sealedApproval(task = {}) {
  const approval = object(task.metadata?.production_approval_contract);
  return approval.contract ===
      "CREATIVE_SEALED_PRODUCTION_EXECUTION_APPROVAL_V1"
    ? approval
    : null;
}

function validateTaskApproval(task = {}) {
  const approval = sealedApproval(task);
  if (!approval) {
    throw new Error("SEALED_PRODUCTION_TASK_APPROVAL_CONTRACT_REQUIRED");
  }
  if (
    approval.production_authorized !== true ||
    approval.publication_authorized !== false
  ) {
    throw new Error("SEALED_PRODUCTION_TASK_AUTHORIZATION_STATE_INVALID");
  }
  if (!/^[a-f0-9]{64}$/i.test(text(approval.manifest_sha256))) {
    throw new Error("SEALED_PRODUCTION_TASK_MANIFEST_HASH_REQUIRED");
  }
  if (!/^[a-f0-9]{64}$/i.test(text(approval.preproduction_gate_sha256))) {
    throw new Error("SEALED_PRODUCTION_TASK_PREPRODUCTION_HASH_REQUIRED");
  }
  if (!/^[a-f0-9]{64}$/i.test(text(approval.graph_preview_sha256))) {
    throw new Error("SEALED_PRODUCTION_TASK_GRAPH_PREVIEW_HASH_REQUIRED");
  }
  return approval;
}

function validateTaskCostGuard(task = {}) {
  const guard = object(
    task.metadata?.approved_cost_guard || task.input?.approved_cost_guard,
  );
  const maximum = finite(guard.maximum_customer_price);
  if (maximum === null || maximum <= 0) {
    throw new Error("SEALED_PRODUCTION_TASK_COST_GUARD_REQUIRED");
  }
  if (text(guard.currency).toUpperCase() !== "THB") {
    throw new Error("SEALED_PRODUCTION_TASK_COST_GUARD_CURRENCY_INVALID");
  }
  if (!text(guard.reference)) {
    throw new Error("SEALED_PRODUCTION_TASK_COST_GUARD_REFERENCE_REQUIRED");
  }
  if (Math.abs(Number(task.cost?.estimated || 0) - maximum) > 0.000001) {
    throw new Error("SEALED_PRODUCTION_TASK_ESTIMATED_COST_MISMATCH");
  }
  return guard;
}

function normalizedScope(scope = {}, nodeId) {
  const clean = {
    ...object(scope),
    authorized_production_node_ids: unique([
      ...list(scope.authorized_production_node_ids),
      nodeId,
    ]),
  };
  delete clean.scope_hash;
  return {
    ...clean,
    scope_hash: CreativeShotAssetScopeRuntime.hash(clean),
  };
}

function projectAssetIds(assets = []) {
  return unique(
    list(assets).map((asset) => asset.id || asset.asset_id),
  );
}

function graphNode(graph = {}, task = {}) {
  const executionNodeId = text(task.metadata?.execution_node_id);
  if (!executionNodeId) {
    throw new Error(`SEALED_PRODUCTION_TASK_EXECUTION_NODE_REQUIRED:${task.id}`);
  }
  const node = list(graph.nodes).find((candidate) =>
    text(candidate.id) === executionNodeId,
  );
  if (!node) {
    throw new Error(
      `SEALED_PRODUCTION_TASK_GRAPH_NODE_NOT_FOUND:${task.id}:${executionNodeId}`,
    );
  }
  return node;
}

async function preparationContext(task = {}) {
  if (!task.production_graph_id) {
    throw new Error("SEALED_PRODUCTION_TASK_GRAPH_ID_REQUIRED");
  }
  const [graph, assets] = await Promise.all([
    ProductionGraphRuntime.get(task.production_graph_id),
    CreativeAssetsRuntime.list({
      organization_id: task.organization_id,
      creative_project_id: task.creative_project_id,
      limit: 1000,
    }),
  ]);
  if (!graph || String(graph.organization_id) !== String(task.organization_id)) {
    throw new Error("SEALED_PRODUCTION_GRAPH_NOT_FOUND");
  }
  if (String(graph.creative_project_id) !== String(task.creative_project_id)) {
    throw new Error("SEALED_PRODUCTION_GRAPH_PROJECT_MISMATCH");
  }
  return { graph, assets };
}

async function prepareTask(taskOrId, supplied = {}) {
  const task = typeof taskOrId === "string"
    ? await ProductionTaskRuntime.get(taskOrId)
    : taskOrId;
  if (!task) throw new Error("Production task not found");

  if (!sealedApproval(task)) return task;
  validateTaskApproval(task);
  validateTaskCostGuard(task);

  const context = supplied.graph && supplied.assets
    ? supplied
    : await preparationContext(task);
  const node = graphNode(context.graph, task);
  const scope = normalizedScope(
    CreativeShotAssetScopeRuntime.build({
      node,
      graph_nodes: list(context.graph.nodes),
      edges: list(context.graph.edges),
      project_asset_ids: projectAssetIds(context.assets),
    }),
    node.id,
  );
  if (!CreativeShotAssetScopeRuntime.verify(scope)) {
    throw new Error(`SEALED_PRODUCTION_TASK_SCOPE_INVALID:${task.id}`);
  }

  const input = object(task.input);
  const generation = object(input.generation);
  const prepared = await ProductionTaskRuntime.update(task.id, {
    input: {
      ...input,
      requirements: {
        ...object(input.requirements),
        asset_scope: scope,
      },
      generation: {
        ...generation,
        provider_parameters: {
          ...object(generation.provider_parameters),
          asset_scope_contract: scope.contract,
          asset_scope_hash: scope.scope_hash,
        },
      },
      provider_parameters: {
        ...object(input.provider_parameters),
        asset_scope_contract: scope.contract,
        asset_scope_hash: scope.scope_hash,
      },
      provider_policy: {
        ...object(input.provider_policy),
        asset_access_mode: "LEAST_PRIVILEGE",
        allow_project_asset_pool: false,
        allow_organization_asset_pool: false,
        allow_implicit_media_discovery: false,
        reject_ambiguous_primary_source: true,
        asset_scope_hash: scope.scope_hash,
      },
    },
    metadata: {
      ...object(task.metadata),
      asset_scope_contract: scope.contract,
      asset_scope_hash: scope.scope_hash,
      scoped_creative_asset_ids: scope.creative_asset_ids,
      scoped_asset_node_ids: scope.asset_node_ids,
      scoped_dependency_node_ids: scope.dependency_node_ids,
      scoped_authorized_production_node_ids:
        scope.authorized_production_node_ids,
      provider_input_mode: "LEAST_PRIVILEGE",
      project_asset_pool_exposed: false,
      organization_asset_pool_exposed: false,
      sealed_dispatch_preparation_contract:
        "CREATIVE_SEALED_PRODUCTION_DISPATCH_PREPARATION_V1",
    },
  });

  await CreativeProductionDossierExecutionGate.approvedDossier(prepared);
  const primaryBound = await CreativeShotPrimarySourceDispatchGate.enforce(
    prepared,
  );
  const isolated = await CreativeShotAssetIsolationExecutionGate.enforce(
    primaryBound,
  );
  const isolatedScope = object(isolated.input?.requirements?.asset_scope);
  if (!CreativeShotAssetScopeRuntime.verify(isolatedScope)) {
    throw new Error(`SEALED_PRODUCTION_TASK_SCOPE_VERIFICATION_FAILED:${task.id}`);
  }
  if (text(isolated.metadata?.verified_asset_scope_hash) !== text(scope.scope_hash)) {
    throw new Error(`SEALED_PRODUCTION_TASK_SCOPE_HASH_DRIFT:${task.id}`);
  }
  return isolated;
}

async function prepareGraphTasks({
  organization_id,
  creative_project_id,
  production_graph_id,
  expected_task_count = null,
} = {}) {
  if (!organization_id || !creative_project_id || !production_graph_id) {
    throw new Error("SEALED_PRODUCTION_PREPARATION_SCOPE_REQUIRED");
  }
  const [graph, assets, tasks] = await Promise.all([
    ProductionGraphRuntime.get(production_graph_id),
    CreativeAssetsRuntime.list({
      organization_id,
      creative_project_id,
      limit: 1000,
    }),
    ProductionTaskRuntime.list({
      organization_id,
      creative_project_id,
      production_graph_id,
    }),
  ]);
  if (!graph) throw new Error("SEALED_PRODUCTION_GRAPH_NOT_FOUND");
  if (
    expected_task_count !== null &&
    tasks.length !== Number(expected_task_count)
  ) {
    throw new Error(
      `SEALED_PRODUCTION_TASK_COUNT_INVALID:${tasks.length}:${expected_task_count}`,
    );
  }

  const executionNodeIds = tasks.map((task) =>
    text(task.metadata?.execution_node_id),
  );
  if (executionNodeIds.some((id) => !id)) {
    throw new Error("SEALED_PRODUCTION_TASK_EXECUTION_NODE_MISSING");
  }
  if (new Set(executionNodeIds).size !== executionNodeIds.length) {
    throw new Error("SEALED_PRODUCTION_TASK_EXECUTION_NODE_DUPLICATE");
  }

  const prepared = [];
  for (const task of tasks) {
    prepared.push(await prepareTask(task, { graph, assets }));
  }
  const totalEstimated = prepared.reduce(
    (sum, task) => sum + Number(task.cost?.estimated || 0),
    0,
  );
  const ceiling = finite(
    graph.metadata?.production_approval_contract?.maximum_customer_price ||
      graph.cost_plan?.maximum_customer_price,
  );
  if (ceiling === null || totalEstimated > ceiling + 0.000001) {
    throw new Error(
      `SEALED_PRODUCTION_PREPARED_TASK_COST_CEILING_EXCEEDED:${totalEstimated}:${ceiling}`,
    );
  }

  return {
    contract: "CREATIVE_SEALED_PRODUCTION_GRAPH_TASK_PREPARATION_V1",
    production_graph_id,
    task_count: tasks.length,
    prepared_task_count: prepared.length,
    verified_scope_count: prepared.filter((task) =>
      task.metadata?.strict_shot_asset_scope_verified === true,
    ).length,
    verified_dossier_count: prepared.filter((task) =>
      task.metadata?.production_dossier_gate_passed === true,
    ).length,
    primary_source_bound_count: prepared.filter((task) =>
      task.metadata?.verified_primary_source_asset_id,
    ).length,
    total_estimated_cost: Number(totalEstimated.toFixed(6)),
    approved_ceiling: ceiling,
    provider_calls_executed: false,
    usage_created: false,
    wallet_changed: false,
    readiness: "PASS",
  };
}

function installQueueScope() {
  if (ProductionQueueRuntime[QUEUE_FLAG]) return;
  const buildUnscopedQueue = ProductionQueueRuntime.build.bind(
    ProductionQueueRuntime,
  );
  Object.defineProperty(ProductionQueueRuntime, QUEUE_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ProductionQueueRuntime.build = async function buildGraphScopedQueue(input = {}) {
    const queue = await buildUnscopedQueue(input);
    const graphId = text(input.production_graph_id);
    if (!graphId) return queue;

    const names = [
      "waiting",
      "ready",
      "running",
      "review",
      "completed",
      "failed",
      "blocked",
      "superseded",
    ];
    const scoped = { ...queue };
    for (const name of names) {
      scoped[name] = list(queue[name]).filter((task) =>
        text(task.production_graph_id) === graphId,
      );
    }
    const activeIds = new Set(
      [
        ...scoped.waiting,
        ...scoped.ready,
        ...scoped.running,
        ...scoped.review,
        ...scoped.completed,
        ...scoped.failed,
        ...scoped.blocked,
      ].map((task) => task.id),
    );
    scoped.total = activeIds.size;
    scoped.historical_total = activeIds.size + scoped.superseded.length;
    scoped.production_graph_id = graphId;
    scoped.graph_scoped = true;
    return scoped;
  };
}

function installDispatchPreparation() {
  if (ProductionTaskRuntime[DISPATCH_FLAG]) return;
  const dispatchWithoutPreparation = ProductionTaskRuntime.dispatch.bind(
    ProductionTaskRuntime,
  );
  Object.defineProperty(ProductionTaskRuntime, DISPATCH_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ProductionTaskRuntime.dispatch = async function dispatchPreparedSealedTask(id) {
    const task = await ProductionTaskRuntime.get(id);
    if (!task) throw new Error("Production task not found");
    const prepared = sealedApproval(task)
      ? await prepareTask(task)
      : task;
    return dispatchWithoutPreparation(prepared.id);
  };
}

installQueueScope();
installDispatchPreparation();

export const CreativeSealedProductionDispatchPreparationRuntime = Object.freeze({
  installed: true,
  contract: "CREATIVE_SEALED_PRODUCTION_DISPATCH_PREPARATION_V1",
  queue_scope_contract: "CREATIVE_SEALED_PRODUCTION_GRAPH_QUEUE_SCOPE_V1",
  prepareTask,
  prepareGraphTasks,
  normalizedScope,
  validateTaskApproval,
  validateTaskCostGuard,
});
