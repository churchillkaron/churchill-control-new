import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  CreativeCameraGrammarRuntime,
} from "@/lib/creative/director/runtime/CreativeCameraGrammarRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.camera-grammar-execution-gate.v1",
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

function cameraGrammarInput(task = {}) {
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

  const dispatchWithoutCameraGrammar = ProductionTaskRuntime.dispatch.bind(
    ProductionTaskRuntime,
  );

  Object.defineProperty(ProductionTaskRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ProductionTaskRuntime.dispatch = async function dispatchWithCameraGrammar(id) {
    const task = await ProductionTaskRuntime.get(id);
    if (!task || !visualCapability(task)) {
      return dispatchWithoutCameraGrammar(id);
    }

    const grammar = CreativeCameraGrammarRuntime.assertReady(
      cameraGrammarInput(task),
    );

    if (grammar.status === "READY") {
      await ProductionTaskRuntime.update(id, {
        metadata: {
          ...object(task.metadata),
          camera_grammar_contract: grammar.contract,
          camera_grammar_status: grammar.status,
          camera_grammar_named_movements: grammar.named_movements,
          camera_grammar_aerial_candidate: grammar.aerial_candidate === true,
          camera_grammar_warning_count: grammar.warnings.length,
          camera_grammar_verified_before_dispatch: true,
        },
      });
    }

    return dispatchWithoutCameraGrammar(id);
  };
}

install();

export const CreativeCameraGrammarExecutionGate = Object.freeze({
  installed: true,
  contract: "AVANTIQO_CAMERA_GRAMMAR_EXECUTION_GATE_V1",
  camera_contract: CreativeCameraGrammarRuntime.contract,
  fail_closed: true,
});
