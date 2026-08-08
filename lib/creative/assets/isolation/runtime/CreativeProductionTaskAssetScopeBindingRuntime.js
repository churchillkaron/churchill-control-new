import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  ProductionGraphRuntime,
} from "@/lib/creative/production-graph/runtime/ProductionGraphRuntime";
import {
  CreativeShotAssetScopeRuntime,
} from "@/lib/creative/assets/isolation/runtime/CreativeShotAssetScopeRuntime";

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

function assertMatchingHash(value, expected, label) {
  const actual = text(value);
  if (actual && actual !== expected) {
    throw new Error(`${label}:${actual}:${expected}`);
  }
}

async function bind(taskOrId) {
  const task = typeof taskOrId === "string"
    ? await ProductionTaskRuntime.get(taskOrId)
    : taskOrId;
  if (!task) throw new Error("PRODUCTION_TASK_ASSET_SCOPE_TASK_REQUIRED");
  if (!task.production_graph_id) {
    throw new Error("PRODUCTION_TASK_ASSET_SCOPE_GRAPH_REQUIRED");
  }

  const graph = await ProductionGraphRuntime.get(task.production_graph_id);
  if (!graph) throw new Error("PRODUCTION_TASK_ASSET_SCOPE_GRAPH_NOT_FOUND");
  if (String(graph.organization_id) !== String(task.organization_id)) {
    throw new Error("PRODUCTION_TASK_ASSET_SCOPE_ORGANIZATION_MISMATCH");
  }
  if (String(graph.creative_project_id) !== String(task.creative_project_id)) {
    throw new Error("PRODUCTION_TASK_ASSET_SCOPE_PROJECT_MISMATCH");
  }

  const executionNodeId = text(task.metadata?.execution_node_id);
  if (!executionNodeId) {
    throw new Error("PRODUCTION_TASK_ASSET_SCOPE_EXECUTION_NODE_REQUIRED");
  }
  const node = list(graph.nodes).find((candidate) =>
    text(candidate?.id) === executionNodeId,
  );
  if (!node) {
    throw new Error(
      `PRODUCTION_TASK_ASSET_SCOPE_GRAPH_NODE_NOT_FOUND:${executionNodeId}`,
    );
  }

  const canonicalScope = object(node.requirements?.asset_scope);
  const taskScope = object(task.input?.requirements?.asset_scope);
  if (!CreativeShotAssetScopeRuntime.verify(canonicalScope)) {
    throw new Error("PRODUCTION_TASK_CANONICAL_ASSET_SCOPE_INVALID");
  }
  if (!CreativeShotAssetScopeRuntime.verify(taskScope)) {
    throw new Error("PRODUCTION_TASK_PERSISTED_ASSET_SCOPE_INVALID");
  }

  const canonicalHash = text(canonicalScope.scope_hash);
  if (text(taskScope.scope_hash) !== canonicalHash) {
    throw new Error(
      `PRODUCTION_TASK_ASSET_SCOPE_CANONICAL_MISMATCH:${text(taskScope.scope_hash)}:${canonicalHash}`,
    );
  }
  if (text(canonicalScope.node_id) !== executionNodeId) {
    throw new Error("PRODUCTION_TASK_CANONICAL_ASSET_SCOPE_NODE_MISMATCH");
  }

  if (text(node.metadata?.asset_scope_hash) !== canonicalHash) {
    throw new Error("PRODUCTION_GRAPH_ASSET_SCOPE_METADATA_MISMATCH");
  }
  if (
    text(node.generation?.provider_parameters?.asset_scope_hash) !==
    canonicalHash
  ) {
    throw new Error("PRODUCTION_GRAPH_ASSET_SCOPE_PROVIDER_MISMATCH");
  }

  assertMatchingHash(
    task.metadata?.asset_scope_hash,
    canonicalHash,
    "PRODUCTION_TASK_ASSET_SCOPE_METADATA_MISMATCH",
  );
  assertMatchingHash(
    task.input?.provider_parameters?.asset_scope_hash,
    canonicalHash,
    "PRODUCTION_TASK_ASSET_SCOPE_PROVIDER_MISMATCH",
  );
  assertMatchingHash(
    task.input?.generation?.provider_parameters?.asset_scope_hash,
    canonicalHash,
    "PRODUCTION_TASK_ASSET_SCOPE_GENERATION_PROVIDER_MISMATCH",
  );

  if (
    text(task.metadata?.asset_scope_hash) === canonicalHash &&
    text(task.metadata?.asset_scope_contract) === text(canonicalScope.contract)
  ) {
    return task;
  }

  return ProductionTaskRuntime.update(task.id, {
    metadata: {
      ...object(task.metadata),
      asset_scope_contract: canonicalScope.contract,
      asset_scope_hash: canonicalHash,
      scoped_creative_asset_ids: list(canonicalScope.creative_asset_ids),
      scoped_asset_node_ids: list(canonicalScope.asset_node_ids),
      scoped_dependency_node_ids: list(canonicalScope.dependency_node_ids),
      scoped_authorized_production_node_ids:
        list(canonicalScope.authorized_production_node_ids),
      canonical_asset_scope_binding_verified: true,
      canonical_asset_scope_binding_contract:
        "CREATIVE_PRODUCTION_TASK_CANONICAL_ASSET_SCOPE_BINDING_V1",
      canonical_asset_scope_binding_verified_at: new Date().toISOString(),
    },
  });
}

export const CreativeProductionTaskAssetScopeBindingRuntime = Object.freeze({
  contract: "CREATIVE_PRODUCTION_TASK_CANONICAL_ASSET_SCOPE_BINDING_V1",
  bind,
});
