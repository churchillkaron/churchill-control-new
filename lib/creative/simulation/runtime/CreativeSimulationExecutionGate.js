import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  CreativeSimulationRuntime,
} from "@/lib/creative/simulation/runtime/CreativeSimulationRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.simulation-execution-gate.v1",
);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function simulationRequested(task = {}) {
  const input = object(task.input);
  const requirements = object(input.requirements);
  const contract =
    input.simulation_contract ||
    requirements.simulation_contract ||
    task.metadata?.simulation_contract_data;
  const requested =
    input.simulation ||
    requirements.simulation ||
    task.metadata?.simulation;
  const vfx = input.vfx || requirements.vfx || task.metadata?.vfx;
  const vfxText = (() => {
    try {
      return JSON.stringify(vfx || {});
    } catch {
      return "";
    }
  })();
  const vfxHeavy = /\b(?:fluid|liquid|water simulation|ocean simulation|cloth simulation|fabric simulation|destruction|fracture|rigid[- ]body|soft[- ]body|deformable|fire simulation|smoke simulation|pyro|explosion simulation|particle simulation|granular simulation|sand simulation|hair simulation|fur simulation)\b/i.test(vfxText);
  const populated = (value) => Boolean(
    value &&
    (typeof value !== "object" || Array.isArray(value) || Object.keys(value).length),
  );
  return populated(contract) || populated(requested) || vfxHeavy;
}

function visualTask(task = {}) {
  const capability = text(task.capability || task.service_code || task.service_id).toLowerCase();
  const type = text(task.type).toUpperCase();
  return capability.includes("video") || capability.includes("image") || /SHOT|VIDEO|IMAGE|TEMPORAL/.test(type);
}

function verificationInput(task = {}) {
  const input = object(task.input);
  const requirements = object(input.requirements);
  const contract =
    input.simulation_contract ||
    requirements.simulation_contract ||
    task.metadata?.simulation_contract_data ||
    null;
  return {
    ...input,
    simulation: input.simulation || requirements.simulation || task.metadata?.simulation || null,
    simulation_contract: contract,
    vfx: input.vfx || requirements.vfx || task.metadata?.vfx || null,
    capability: task.capability || task.service_code || task.service_id || null,
    metadata: {
      ...object(input.metadata),
      ...object(task.metadata),
    },
    execution_phase: "PROVIDER_DISPATCH_VERIFICATION",
  };
}

function install() {
  if (ProductionTaskRuntime[INSTALL_FLAG]) return;

  const dispatchWithoutSimulationGate = ProductionTaskRuntime.dispatch.bind(
    ProductionTaskRuntime,
  );

  Object.defineProperty(ProductionTaskRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ProductionTaskRuntime.dispatch = async function dispatchWithSimulationGate(id) {
    const task = await ProductionTaskRuntime.get(id);
    if (!task || !visualTask(task) || !simulationRequested(task)) {
      return dispatchWithoutSimulationGate(id);
    }

    const verified = CreativeSimulationRuntime.assertReady(verificationInput(task));
    if (verified.status === "READY") {
      await ProductionTaskRuntime.update(id, {
        metadata: {
          ...object(task.metadata),
          simulation_contract: verified.contract,
          simulation_contract_data: verified.simulation_contract,
          simulation_status: verified.status,
          simulation_count: verified.simulation_contract?.simulations?.length || 0,
          simulation_warning_count: verified.warnings.length,
          simulation_verified_before_dispatch: true,
          simulation_execution_authored: false,
          simulation_provider_neutral: true,
        },
      });
    }

    return dispatchWithoutSimulationGate(id);
  };
}

install();

export const CreativeSimulationExecutionGate = Object.freeze({
  installed: true,
  contract: "AVANTIQO_SIMULATION_EXECUTION_GATE_V1",
  simulation_contract: CreativeSimulationRuntime.contract,
  execution_authorship_forbidden: true,
  provider_neutral: true,
  fail_closed: true,
});
