import "@/lib/creative/assets/isolation/runtime/CreativeShotAssetIsolationExecutionGate";

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

function generationNode(node = {}) {
  return node.generation?.required === true;
}

export const CreativeShotAssetIsolationGraphRuntime = {
  apply({ graph, project_assets = [] } = {}) {
    if (!graph) throw new Error("production graph required");
    const nodes = [...list(graph.nodes)];
    const edges = [...list(graph.edges)];
    const projectAssetIds = list(project_assets)
      .map((asset) => String(asset.id || asset.asset_id || "").trim())
      .filter(Boolean);
    const scopes = [];

    for (const node of nodes.filter(generationNode)) {
      const scope = CreativeShotAssetScopeRuntime.build({
        node,
        graph_nodes: nodes,
        edges,
        project_asset_ids: projectAssetIds,
      });
      node.requirements = {
        ...object(node.requirements),
        asset_scope: scope,
      };
      node.generation = {
        ...object(node.generation),
        provider_parameters: {
          ...object(node.generation?.provider_parameters),
          asset_scope_hash: scope.scope_hash,
          asset_scope_contract: scope.contract,
        },
      };
      node.metadata = {
        ...object(node.metadata),
        asset_scope_contract: scope.contract,
        asset_scope_hash: scope.scope_hash,
        scoped_creative_asset_ids: scope.creative_asset_ids,
        scoped_asset_node_ids: scope.asset_node_ids,
        scoped_dependency_node_ids: scope.dependency_node_ids,
        provider_input_mode: "LEAST_PRIVILEGE",
      };
      scopes.push({
        node_id: node.id,
        scope_hash: scope.scope_hash,
        creative_asset_count: scope.creative_asset_ids.length,
        asset_node_count: scope.asset_node_ids.length,
        dependency_node_count: scope.dependency_node_ids.length,
      });
    }

    return {
      ...graph,
      nodes,
      edges,
      metadata: {
        ...object(graph.metadata),
        strict_shot_asset_isolation_contract: scopes.length
          ? "STRICT_SHOT_ASSET_ISOLATION_GRAPH_V1"
          : null,
        strict_shot_asset_scope_count: scopes.length,
        strict_shot_asset_scopes: scopes,
        project_asset_pool_exposed_to_providers: false,
        organization_asset_pool_exposed_to_providers: false,
        provider_input_mode: "LEAST_PRIVILEGE",
      },
    };
  },
};
