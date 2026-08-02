import {
  ProductionGraphRuntime,
} from "./ProductionGraphRuntime";
import {
  assertProviderReady,
} from "@/lib/platform/service-runtime/providers/ProviderExecutor";
import {
  getProviderPricingById,
} from "@/lib/platform/service-runtime/pricing/repositories/ProviderPricingRepository";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.provider-execution-readiness.v2",
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

async function pricingRecord(resolution = {}) {
  const pricingId = text(resolution.pricing_id);
  if (!pricingId) return null;
  return getProviderPricingById(pricingId);
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

  const pricing = await pricingRecord(resolution);
  if (!pricing) {
    throw new Error(
      `PROVIDER_PRICING_RECORD_REQUIRED:${node.id}:${resolution.pricing_id}`,
    );
  }
  if (text(pricing.provider) && text(pricing.provider) !== provider) {
    throw new Error(
      `PROVIDER_PRICING_PROVIDER_MISMATCH:${node.id}:${provider}:${pricing.provider}`,
    );
  }

  const credentialId = text(
    resolution.credential_id ||
    pricing.credential_id ||
    pricing.metadata?.credential_id ||
    node.metadata?.credential_id,
  ) || null;
  const providerConfiguration = {
    ...object(pricing.metadata),
    ...object(resolution.provider_configuration),
  };

  const readiness = await assertProviderReady({
    provider,
    capability,
    model: model || text(pricing.model) || null,
    input: {
      generation,
      provider_parameters: generation.provider_parameters || {},
      output_spec: generation.output_spec || node.requirements?.output_spec || {},
      pricing_resolution: {
        ...resolution,
        credential_id: credentialId,
        provider_configuration: providerConfiguration,
      },
      provider_configuration: providerConfiguration,
    },
    context: {
      organization_id: input.organization_id,
      credential_id: credentialId,
    },
  });
  if (readiness?.ready === false) {
    throw new Error(`PROVIDER_NOT_READY:${node.id}:${provider}`);
  }
  return {
    node_id: node.id,
    provider,
    capability,
    model: model || text(pricing.model) || null,
    pricing_id: resolution.pricing_id,
    credential_id: credentialId,
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
        "CREATIVE_PROVIDER_EXECUTION_READINESS_V2",
      provider_execution_readiness_passed: true,
      provider_execution_readiness_evidence: evidence,
      provider_execution_readiness_checked_without_execution: true,
      provider_credentials_resolved_from_managed_configuration: true,
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
