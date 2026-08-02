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
  ServiceExecutionPreflightRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionPreflightRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.production-graph-readiness.v2",
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

function preflightPayload(node = {}, currency = null) {
  const generation = object(node.generation);
  return {
    generation,
    prompt: generation.provider_prompt || null,
    provider_prompt: generation.provider_prompt || null,
    provider_parameters: object(generation.provider_parameters),
    output_spec: object(
      generation.output_spec || node.requirements?.output_spec,
    ),
    duration_seconds:
      finite(generation.estimated_seconds) ||
      finite(node.duration_seconds) ||
      undefined,
    quantity: 1,
    currency: currency || undefined,
  };
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

  const preflight = await ServiceExecutionPreflightRuntime.preflight({
    organization_id: organizationId,
    service_id: serviceId,
    provider_id: text(node.generation?.provider) || null,
    currency: currency || null,
    input: preflightPayload(node, currency),
    provider_policy: object(node.generation?.provider_policy),
  });
  if (preflight.contract !== "SERVICE_EXECUTION_PREFLIGHT_V1") {
    throw new Error(`SERVICE_PREFLIGHT_CONTRACT_INVALID:${node.id}:${serviceId}`);
  }
  if (!preflight.ready || !preflight.pricing?.pricing_id) {
    throw new Error(`SERVICE_PREFLIGHT_NOT_READY:${node.id}:${serviceId}`);
  }

  const pricing = preflight.pricing;
  return {
    node: {
      ...node,
      generation: {
        ...object(node.generation),
        provider: preflight.provider,
        model: preflight.model || null,
        estimated_cost: pricing.customer_price,
        service_execution_preflight: {
          contract: preflight.contract,
          ready: true,
          organization_service_id: preflight.organization_service_id,
          service_id: preflight.service_id,
          capability: preflight.capability,
          provider: preflight.provider,
          model: preflight.model || null,
          credential_id: preflight.credential_id || null,
          pricing_id: pricing.pricing_id,
          currency: pricing.currency,
          quantity: preflight.quantity,
          unit: preflight.unit,
          provider_execution_performed: false,
          wallet_reservation_performed: false,
          usage_started: false,
          billing_created: false,
        },
        pricing_resolution: {
          mode: "SERVICE_DOMAIN_PREFLIGHT",
          pricing_id: pricing.pricing_id,
          provider: preflight.provider,
          model: preflight.model || null,
          credential_id: preflight.credential_id || null,
          supplier_cost: pricing.supplier_cost,
          platform_markup: pricing.platform_markup,
          customer_price: pricing.customer_price,
          currency: pricing.currency,
          unit: pricing.unit || null,
          estimated: pricing.estimated === true,
        },
      },
      metadata: {
        ...object(node.metadata),
        provider_id: preflight.provider,
        credential_id: preflight.credential_id || null,
        pricing_id: pricing.pricing_id,
        service_execution_preflight_contract: preflight.contract,
        service_execution_preflight_passed: true,
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
        "CREATIVE_PRODUCTION_GRAPH_READINESS_V2",
      final_graph_readiness_passed: true,
      final_graph_generation_node_count: generationNodes(graph).length,
      final_graph_estimated_cost: Number(estimatedCost.toFixed(6)),
      final_graph_currency: resolvedCurrency,
      final_graph_service_domain_preflight_passed: true,
      final_graph_provider_pricing_resolved: true,
      final_graph_asset_scope_verified: true,
      final_graph_task_contracts_verified: true,
      final_graph_dependencies_verified: true,
      production_dossier_inputs_verified: true,
      provider_execution_performed: false,
      wallet_reservation_performed: false,
      usage_started: false,
      billing_created: false,
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
