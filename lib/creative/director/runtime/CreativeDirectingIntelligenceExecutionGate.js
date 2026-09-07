import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  CreativeDirectingIntelligenceRuntime,
} from "@/lib/creative/director/runtime/CreativeDirectingIntelligenceRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.directing-intelligence-execution-gate.v1",
);

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function visualShotTask(task = {}) {
  const type = text(task.type).toUpperCase();
  const nodeType = text(task.input?.node_type || task.metadata?.node_type).toUpperCase();
  const capability = text(task.capability || task.service_code).toLowerCase();
  return type === "SHOT" ||
    nodeType === "SHOT" ||
    capability.includes("video") ||
    capability.includes("image");
}

function directingDecision(task = {}) {
  return object(
    task.input?.requirements?.directing_intelligence ||
    task.input?.directing_intelligence ||
    task.metadata?.directing_intelligence ||
    task.metadata?.requirements?.directing_intelligence,
  );
}

function install() {
  if (ProductionTaskRuntime[INSTALL_FLAG]) return;

  const dispatchWithoutDirectingGate = ProductionTaskRuntime.dispatch.bind(
    ProductionTaskRuntime,
  );

  Object.defineProperty(ProductionTaskRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ProductionTaskRuntime.dispatch = async function dispatchWithDirectingIntelligence(id) {
    const task = await ProductionTaskRuntime.get(id);
    if (!task || !visualShotTask(task)) {
      return dispatchWithoutDirectingGate(id);
    }

    const decision = directingDecision(task);
    if (!Object.keys(decision).length) {
      throw new Error("DIRECTING_INTELLIGENCE_PREAUTHORED_DECISION_REQUIRED");
    }
    const verified = CreativeDirectingIntelligenceRuntime.verifyShotDecision(decision);
    if (text(verified.shot_id) !== text(task.input?.shot_id || task.metadata?.shot_id || task.id)) {
      const explicitShotId = text(task.input?.shot_id || task.metadata?.shot_id);
      if (explicitShotId && text(verified.shot_id) !== explicitShotId) {
        throw new Error("DIRECTING_INTELLIGENCE_TASK_SHOT_ID_MISMATCH");
      }
    }

    await ProductionTaskRuntime.update(id, {
      metadata: {
        ...object(task.metadata),
        directing_intelligence_contract: verified.contract,
        directing_intelligence_decision_hash: verified.decision_hash,
        directing_intelligence_scene_id: verified.scene_id,
        directing_intelligence_verified_before_dispatch: true,
        renderer_is_execution_engine_not_director: true,
      },
    });

    return dispatchWithoutDirectingGate(id);
  };
}

install();

export const CreativeDirectingIntelligenceExecutionGate = Object.freeze({
  installed: true,
  contract: "AVANTIQO_DIRECTING_INTELLIGENCE_EXECUTION_GATE_V1",
  directing_contract: CreativeDirectingIntelligenceRuntime.contract,
  fail_closed: true,
  renderer_is_execution_engine_not_director: true,
});
