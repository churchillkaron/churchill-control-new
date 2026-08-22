import "@/lib/creative/execution/runtime/CreativeProductionTaskMaterializationRuntime";
import "@/lib/creative/design/runtime/CreativeDesignProductionTaskRuntime";
import "@/lib/creative/design/runtime/CreativeDesignRepairProductionTaskRuntime";

import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.capability-only-production-task-gate.v1",
);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function stripProviderIdentity(value = {}) {
  const source = object(value);
  const {
    provider: ignoredProvider,
    provider_id: ignoredProviderId,
    preferred_provider: ignoredPreferredProvider,
    preferred_providers: ignoredPreferredProviders,
    ...rest
  } = source;
  return rest;
}

function capabilityOnlyTask(data = {}) {
  if (!data.creative_project_id) return data;

  const input = stripProviderIdentity(data.input);
  const generation = stripProviderIdentity(input.generation);
  const metadata = stripProviderIdentity(data.metadata);
  const providerPolicy = object(input.provider_policy);

  return {
    ...data,
    provider_id: null,
    input: {
      ...input,
      generation,
      provider_policy: {
        ...providerPolicy,
        preferred_provider: undefined,
        preferred_providers: undefined,
      },
    },
    metadata: {
      ...metadata,
      capability_only_execution: true,
      provider_selection_exposed: false,
      provider_pin_persisted: false,
      service_runtime_owned_first: true,
    },
  };
}

function install() {
  if (ProductionTaskRuntime[INSTALL_FLAG]) return;
  const createWithMaterialization = ProductionTaskRuntime.create.bind(
    ProductionTaskRuntime,
  );

  Object.defineProperty(ProductionTaskRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ProductionTaskRuntime.create = async function createCapabilityOnlyCreativeTask(data = {}) {
    return createWithMaterialization(capabilityOnlyTask(data));
  };
}

install();

export const CreativeCapabilityOnlyProductionTaskGate = Object.freeze({
  installed: true,
  contract: "CREATIVE_CAPABILITY_ONLY_PRODUCTION_TASK_GATE_V1",
  provider_pins_allowed: false,
  provider_selection_boundary: "SERVICE_RUNTIME_ONLY",
  local_design_worker_installed: true,
  local_design_repair_worker_installed: true,
  normalize: capabilityOnlyTask,
});

export default CreativeCapabilityOnlyProductionTaskGate;
