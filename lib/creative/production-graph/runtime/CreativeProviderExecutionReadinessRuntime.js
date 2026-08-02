import {
  ProductionGraphRuntime,
} from "./ProductionGraphRuntime";
import {
  assertProviderReady,
} from "@/lib/platform/service-runtime/providers/ProviderExecutor";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.provider-execution-readiness.v1",
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

function externalGenerationNodes(graph = {}) {
  return list(graph.nodes).filter((node) => {
    if (node.generation?.required !== true) return false;
    const resolution = object(node.generation?.pricing_resolution);
    return resolution.mode === "ACTIVE_PROVIDER_PRICING";
  });
}

async function validateNode(node = {}, input = {}) {
  const generation = object(node.generation);
  const resolution = object(generation.pricing_resolution);
  const provider = text(generation.provider || resolution.provider);
  const capability = text(generation.capability || generation.service);
  const model = text(generation.model || resolution.model) || null;
  if (!provider) throw new Error(`PROVIDER_SELECTION_REQUIRED:${node.id}`);
  if (!capability) throw new Error(`PROVIDER_CAPABILITY_REQUIRED:${node.id}`);
  if (!text(resolution.pricing_id)) {
    throw new Error(`PROVIDER_PRICING_REQUIRED:${node.id}:${provider}`);
  }

  const readiness = await assertProviderReady({
    provider,
    capability,
    model,
    input: {
      generation,
      provider_parameters: generation.provider_parameters || {},
      output_spec: generation.output_spec || node.requirements?.output_spec || {},
      pricing_resolution: resolution,
      provider_configuration: resolution.provider_configuration || {},
    },
    context: {
      organization_id: input.organization_id,
      credential_id:
        resolution.credential_id ||
        node.metadata?.credential_id ||
        null,
    },
  });
  if (readiness?.ready === false) {
    throw new Error(`PROVIDER_NOT_READY:${node.id}:${provider}`);
  }
  return {
    node_id: node.id,
    provider,
    capability,
    model,
    pricing_id: resolution.pricing_id,
    credential_resolved: readiness?.credential_resolved !== false,
  };
}

async function converge(input = {}, graph = {}) {
  const failures = [];
  const evidence = [];
  for (const node of externalGenerationNodes(graph)) {
    try {
      evidence.push(await validateNode(node, input));
    } catch (error) {
      failures.push(text(error?.message || error));
    }
  }
  if (failures.length) {
    throw new Error(
      `CREATIVE_PROVIDER_EXECUTION_READINESS_FAILED:${[...new Set(failures)].join("|")}`,
    );
  }
  return ProductionGraphRuntime.update(graph.id, {
    metadata: {
      ...object(graph.metadata),
      provider_execution_readiness_contract:
        "CREATIVE_PROVIDER_EXECUTION_READINESS_V1",
      provider_execution_readiness_passed: true,
      provider_execution_readiness_evidence: evidence,
      provider_execution_readiness_checked_without_execution: true,
      wallet_reservation_performed: false,
      paid_media_execution_authorized: false,
      publication_authorized: false,
    },
  });
}

function install() {
  if (ProductionGraphRuntime[INSTALL_FLAG]) return;
  const planWithoutProviderReadiness =
    ProductionGraphRuntime.plan.bind(ProductionGraphRuntime);
  Object.defineProperty(ProductionGraphRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ProductionGraphRuntime.plan = async function planWithProviderReadiness(input = {}) {
    const graph = await planWithoutProviderReadiness(input);
    if (!graph?.id) throw new Error("PROVIDER_READINESS_GRAPH_REQUIRED");
    return converge(input, graph);
  };
}

install();

export const CreativeProviderExecutionReadinessRuntime = {
  installed: true,
};
