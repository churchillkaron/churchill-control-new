import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  CreativeAerialCinematographyRuntime,
} from "@/lib/creative/director/runtime/CreativeAerialCinematographyRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.aerial-cinematography-execution-gate.v1",
);

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function visualCapability(task = {}) {
  const capability = text(task.capability || task.service_code).toLowerCase();
  const type = text(task.type).toUpperCase();
  return capability.includes("video") ||
    capability.includes("image") ||
    /SHOT|KEYFRAME|MOTION_PLATE/.test(type);
}

function aerialInput(task = {}) {
  const input = object(task.input);
  return {
    ...input,
    capability: task.capability || task.service_code || input.capability || null,
    service_id: task.service_id || input.service_id || null,
    service_code: task.service_code || input.service_code || null,
    node_type:
      input.node_type ||
      task.metadata?.node_type ||
      task.type ||
      null,
    type: task.type || input.type || null,
    medium:
      input.medium ||
      input.requirements?.medium ||
      task.metadata?.medium ||
      null,
    metadata: {
      ...object(input.metadata),
      ...object(task.metadata),
    },
  };
}

function install() {
  if (ProductionTaskRuntime[INSTALL_FLAG]) return;

  const dispatchWithoutAerialGate = ProductionTaskRuntime.dispatch.bind(
    ProductionTaskRuntime,
  );

  Object.defineProperty(ProductionTaskRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ProductionTaskRuntime.dispatch = async function dispatchWithAerialCinematography(id) {
    const task = await ProductionTaskRuntime.get(id);
    if (!task || !visualCapability(task)) {
      return dispatchWithoutAerialGate(id);
    }

    const aerial = CreativeAerialCinematographyRuntime.assertReady(
      aerialInput(task),
    );

    if (aerial.status === "READY") {
      await ProductionTaskRuntime.update(id, {
        input: {
          ...object(task.input),
          aerial_cinematography: aerial.execution_contract,
        },
        metadata: {
          ...object(task.metadata),
          aerial_cinematography_contract: aerial.contract,
          aerial_cinematography_status: aerial.status,
          aerial_cinematography_mode: aerial.mode,
          aerial_cinematography_named_flight_operations:
            aerial.named_flight_operations,
          aerial_cinematography_warning_count: aerial.warnings.length,
          aerial_cinematography_verified_before_dispatch: true,
          aerial_cinematography_provider_neutral: true,
        },
      });
    }

    return dispatchWithoutAerialGate(id);
  };
}

install();

export const CreativeAerialCinematographyExecutionGate = Object.freeze({
  installed: true,
  contract: "AVANTIQO_AERIAL_CINEMATOGRAPHY_EXECUTION_GATE_V1",
  aerial_contract: CreativeAerialCinematographyRuntime.contract,
  fail_closed: true,
  provider_neutral: true,
});
