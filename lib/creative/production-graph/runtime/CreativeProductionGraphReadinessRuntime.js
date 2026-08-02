import {
  ProductionGraphRuntime,
} from "./ProductionGraphRuntime";
import {
  CreativeAssetsRuntime,
} from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";
import {
  CreativeShotAssetScopeRuntime,
} from "@/lib/creative/assets/isolation/runtime/CreativeShotAssetScopeRuntime";
import {
  CreativeProductionTaskMaterializationRuntime,
} from "@/lib/creative/execution/runtime/CreativeProductionTaskMaterializationRuntime";
import {
  OrganizationServiceRuntime,
} from "@/lib/platform/service-runtime/services/runtime/OrganizationServiceRuntime";
import {
  resolveProvider,
} from "@/lib/platform/service-runtime/providers/ProviderResolver";
import {
  PricingRuntime,
} from "@/lib/platform/service-runtime/pricing/PricingRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.production-graph-readiness.v1",
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

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function unique(values = []) {
  return [...new Set(values.flat(Infinity).map(text).filter(Boolean))];
}

function generationNodes(graph = {}) {
  return list(graph.nodes).filter((node) => node.generation?.required === true);
}

function validationCapability(value) {
  const capability = text(value).toLowerCase();
  return capability.endsWith(".validate") ||
    capability.endsWith(".review") ||
    capability.endsWith(".analyze") ||
    capability.includes("quality");
}

function deterministicInternalNode(node = {}) {
  const capability = text(
    node.generation?.capability || node.generation?.service,
  ).toLowerCase();
  const provider = text(node.generation?.provider).toLowerCase();
  return (
    provider === "internal" ||
    provider === "deterministic" ||
    capability.startsWith("creative.") ||
    capability.startsWith("ffmpeg.")
  );
}

function promptRequired(node = {}) {
  const capability = text(
    node.generation?.capability || node.generation?.service,
  ).toLowerCase();
  return capability.startsWith("ai.") || validationCapability(capability);
}

function dependencyFailures(graph = {}) {
  const nodes = list(graph.nodes);
  const edges = list(graph.edges);
  const ids = new Set(nodes.map((node) => text(node.id)).filter(Boolean));
  const failures = [];

  for (const edge of edges) {
    if (!text(edge.id)) failures.push("PRODUCTION_EDGE_ID_REQUIRED");
    if (!ids.has(text(edge.from))) {
      failures.push(`PRODUCTION_EDGE_SOURCE_MISSING:${text(edge.id)}:${text(edge.from)}`);
    }
    if (!ids.has(text(edge.to))) {
      failures.push(`PRODUCTION_EDGE_TARGET_MISSING:${text(edge.id)}:${text(edge.to)}`);
    }
    if (text(edge.from) === text(edge.to)) {
      failures.push(`PRODUCTION_EDGE_SELF_DEPENDENCY:${text(edge.id)}`);
    }
  }

  const dependencies = edges.filter((edge) => edge.type === "DEPENDS_ON");
  const adjacency = new Map([...ids].map((id) => [id, []]));
  for (const edge of dependencies) {
    if (ids.has(text(edge.from)) && ids.has(text(edge.to))) {
      adjacency.get(text(edge.from)).push(text(edge.to));
    }
  }
  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const next of adjacency.get(id) || []) {
      if (visit(next)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  }
  if ([...ids].some(visit)) failures.push("PRODUCTION_DEPENDENCY_CYCLE_DETECTED");

  return unique(failures);
}

function dossierInputFailures(graph = {}) {
  const plan = object(graph.metadata?.approval_plan_snapshot);
  const failures = [];
  if (!Object.keys(plan).length) failures.push("PRODUCTION_DOSSIER_PLAN_SNAPSHOT_REQUIRED");
  if (!text(plan.selected_concept_id)) failures.push("PRODUCTION_DOSSIER_SELECTED_CONCEPT_REQUIRED");
  if (!text(
    plan.concept_council?.council_hash ||
    plan.production?.concept_council_hash,
  )) {
    failures.push("PRODUCTION_DOSSIER_COUNCIL_HASH_REQUIRED");
  }
  if (!list(graph.nodes).length) failures.push("PRODUCTION_DOSSIER_GRAPH_NODES_REQUIRED");
  return failures;
}

async function priceNode({ node, organizationId, currency }) {
  const serviceId = text(node.generation?.service);
  const capability = text(node.generation?.capability || serviceId);
  if (!serviceId) throw new Error(`GENERATION_SERVICE_REQUIRED:${node.id}`);
  if (!capability) throw new Error(`GENERATION_CAPABILITY_REQUIRED:${node.id}`);

  if (deterministicInternalNode(node)) {
    return {
      node: {
        ...node,
        generation: {
          ...object(node.generation),
          estimated_cost: Math.max(0, finite(node.generation?.estimated_cost) || 0),
          pricing_resolution: {
            mode: "INTERNAL_DETERMINISTIC",
            customer_price: 0,
            currency: currency || null,
          },
        },
      },
      currency: currency || null,
      cost: Math.max(0, finite(node.generation?.estimated_cost) || 0),
    };
  }

  const organizationService = await OrganizationServiceRuntime.get({
    organization_id: organizationId,
    service_id: serviceId,
  });
  if (!organizationService) {
    throw new Error(`ORGANIZATION_SERVICE_NOT_ENABLED:${node.id}:${serviceId}`);
  }

  const selected = await resolveProvider({
    organization_id: organizationId,
    capability,
    preferredProvider: text(node.generation?.provider) || null,
    currency: currency || null,
    policy: organizationService.provider_policy || {},
  });
  if (!selected?.pricing_id) {
    throw new Error(`GENERATION_PRICING_ID_REQUIRED:${node.id}:${capability}`);
  }
  const pricing = await PricingRuntime.resolveById({
    pricing_id: selected.pricing_id,
    currency: selected.currency || currency || null,
    usage: { quantity: 1 },
  });
  if (!(Number(pricing.customer_price) > 0)) {
    throw new Error(`GENERATION_PRICE_NON_POSITIVE:${node.id}:${capability}`);
  }

  return {
    node: {
      ...node,
      generation: {
        ...object(node.generation),
        provider: selected.provider,
        model: selected.model || null,
        estimated_cost: pricing.customer_price,
        pricing_resolution: {
          mode: "ACTIVE_PROVIDER_PRICING",
          pricing_id: pricing.pricing_id,
          provider: selected.provider,
          model: selected.model || null,
          supplier_cost: pricing.supplier_cost,
          platform_markup: pricing.platform_markup,
          customer_price: pricing.customer_price,
          currency: pricing.currency,
          estimated: pricing.estimated === true,
        },
      },
      metadata: {
        ...object(node.metadata),
        provider_id: selected.provider,
        pricing_id: pricing.pricing_id,
        production_pricing_resolved: true,
      },
    },
    currency: pricing.currency,
    cost: pricing.customer_price,
  };
}

function applyScope({ node, graph, projectAssetIds }) {
  const scope = CreativeShotAssetScopeRuntime.build({
    node,
    graph_nodes: graph.nodes,
    edges: graph.edges,
    project_asset_ids: projectAssetIds,
  });
  if (!CreativeShotAssetScopeRuntime.verify(scope)) {
    throw new Error(`SHOT_ASSET_SCOPE_INVALID:${node.id}`);
  }
  return {
    ...node,
    requirements: {
      ...object(node.requirements),
      asset_scope: scope,
    },
    generation: {
      ...object(node.generation),
      provider_parameters: {
        ...object(node.generation?.provider_parameters),
        asset_scope_hash: scope.scope_hash,
        asset_scope_contract: scope.contract,
      },
    },
    metadata: {
      ...object(node.metadata),
      asset_scope_contract: scope.contract,
      asset_scope_hash: scope.scope_hash,
      scoped_creative_asset_ids: scope.creative_asset_ids,
      scoped_asset_node_ids: scope.asset_node_ids,
      scoped_dependency_node_ids: scope.dependency_node_ids,
      provider_input_mode: "LEAST_PRIVILEGE",
    },
  };
}

function attachTaskContract(node = {}) {
  const attached = CreativeProductionTaskMaterializationRuntime.attach({ ...node });
  const contract = attached.requirements?.task_materialization_contract;
  if (!CreativeProductionTaskMaterializationRuntime.verify(contract)) {
    throw new Error(`PRODUCTION_TASK_MATERIALIZATION_CONTRACT_INVALID:${node.id}`);
  }
  return attached;
}

function structuralNodeFailures(node = {}) {
  const failures = [];
  const capability = text(
    node.generation?.capability || node.generation?.service,
  );
  if (!text(node.id)) failures.push("PRODUCTION_NODE_ID_REQUIRED");
  if (!text(node.generation?.service)) {
    failures.push(`GENERATION_SERVICE_REQUIRED:${node.id}`);
  }
  if (!capability) failures.push(`GENERATION_CAPABILITY_REQUIRED:${node.id}`);
  if (promptRequired(node) && !text(node.generation?.provider_prompt)) {
    failures.push(`GENERATION_PROVIDER_PROMPT_REQUIRED:${node.id}:${capability}`);
  }
  const seconds = finite(node.generation?.estimated_seconds);
  if (seconds === null || seconds < 0) {
    failures.push(`GENERATION_ESTIMATED_SECONDS_INVALID:${node.id}`);
  }
  return failures;
}

async function convergeGraph(input = {}, graph = {}) {
  const failures = [
    ...dependencyFailures(graph),
    ...dossierInputFailures(graph),
  ];
  const assets = await CreativeAssetsRuntime.list({
    organization_id: input.organization_id,
    creative_project_id: input.creative_project_id,
  });
  const projectAssetIds = list(assets)
    .map((asset) => text(asset.id || asset.asset_id))
    .filter(Boolean);
  const initialCurrency = text(
    graph.cost_plan?.currency ||
    input.creative_plan?.production?.currency,
  ).toUpperCase() || null;
  let resolvedCurrency = initialCurrency;
  let estimatedCost = 0;
  const replacements = new Map();

  for (const node of generationNodes(graph)) {
    failures.push(...structuralNodeFailures(node));
    try {
      const priced = await priceNode({
        node,
        organizationId: input.organization_id,
        currency: resolvedCurrency,
      });
      if (resolvedCurrency && priced.currency && resolvedCurrency !== priced.currency) {
        failures.push(
          `PRODUCTION_CURRENCY_MISMATCH:${node.id}:${resolvedCurrency}:${priced.currency}`,
        );
      } else if (!resolvedCurrency && priced.currency) {
        resolvedCurrency = priced.currency;
      }
      estimatedCost += Math.max(0, Number(priced.cost || 0));
      const scoped = applyScope({
        node: priced.node,
        graph,
        projectAssetIds,
      });
      replacements.set(text(node.id), attachTaskContract(scoped));
    } catch (error) {
      failures.push(text(error?.message || error));
    }
  }

  if (!generationNodes(graph).length) {
    failures.push("PRODUCTION_GENERATION_NODES_REQUIRED");
  }
  if (estimatedCost > 0 && !resolvedCurrency) {
    failures.push("CURRENCY_REQUIRED_FOR_PAID_PRODUCTION");
  }

  const normalizedFailures = unique(failures);
  if (normalizedFailures.length) {
    throw new Error(
      `CREATIVE_PRODUCTION_GRAPH_READINESS_FAILED:${normalizedFailures.join("|")}`,
    );
  }

  const nodes = list(graph.nodes).map((node) =>
    replacements.get(text(node.id)) || node,
  );
  return ProductionGraphRuntime.update(graph.id, {
    nodes,
    cost_plan: {
      ...object(graph.cost_plan),
      currency: resolvedCurrency,
      estimated_cost: Number(estimatedCost.toFixed(6)),
      approval_required: true,
      approved: false,
    },
    metadata: {
      ...object(graph.metadata),
      final_graph_readiness_contract:
        "CREATIVE_PRODUCTION_GRAPH_READINESS_V1",
      final_graph_readiness_passed: true,
      final_graph_generation_node_count: generationNodes(graph).length,
      final_graph_estimated_cost: Number(estimatedCost.toFixed(6)),
      final_graph_currency: resolvedCurrency,
      final_graph_provider_pricing_resolved: true,
      final_graph_asset_scope_verified: true,
      final_graph_task_contracts_verified: true,
      final_graph_dependencies_verified: true,
      production_dossier_inputs_verified: true,
      paid_media_execution_authorized: false,
      publication_authorized: false,
    },
  });
}

function install() {
  if (ProductionGraphRuntime[INSTALL_FLAG]) return;
  const planWithoutFinalReadiness =
    ProductionGraphRuntime.plan.bind(ProductionGraphRuntime);

  Object.defineProperty(ProductionGraphRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ProductionGraphRuntime.plan = async function planWithFinalReadiness(input = {}) {
    const graph = await planWithoutFinalReadiness(input);
    if (!graph?.id) throw new Error("FINAL_PRODUCTION_GRAPH_REQUIRED");
    return convergeGraph(input, graph);
  };
}

install();

export const CreativeProductionGraphReadinessRuntime = {
  installed: true,
  dependencyFailures,
  dossierInputFailures,
};
