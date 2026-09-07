import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  CreativeHumanPerformanceRuntime,
} from "@/lib/creative/performance/runtime/CreativeHumanPerformanceRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.human-performance-execution-gate.v1",
);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function temporalVisualTask(task = {}) {
  const capability = text(task.capability || task.service_code).toLowerCase();
  const type = text(task.type).toUpperCase();
  const input = object(task.input);
  const duration = Number(
    input.output_spec?.duration_seconds ||
    input.requirements?.output_spec?.duration_seconds ||
    task.metadata?.duration_seconds ||
    0,
  );
  return capability.includes("video") ||
    /SHOT|MOTION_PLATE|VIDEO|TEMPORAL|KEYFRAME/.test(type) ||
    duration > 0;
}

function verificationInput(task = {}) {
  const input = object(task.input);
  const requirements = object(input.requirements);
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
    human_performance:
      input.human_performance ||
      requirements.human_performance ||
      task.metadata?.human_performance ||
      null,
    metadata: {
      ...object(input.metadata),
      ...object(task.metadata),
    },
  };
}

function install() {
  if (ProductionTaskRuntime[INSTALL_FLAG]) return;

  const dispatchWithoutHumanPerformance = ProductionTaskRuntime.dispatch.bind(
    ProductionTaskRuntime,
  );

  Object.defineProperty(ProductionTaskRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ProductionTaskRuntime.dispatch = async function dispatchWithHumanPerformance(id) {
    const task = await ProductionTaskRuntime.get(id);
    if (!task || !temporalVisualTask(task)) {
      return dispatchWithoutHumanPerformance(id);
    }

    const verified = CreativeHumanPerformanceRuntime.assertReady(
      verificationInput(task),
    );

    if (verified.status === "READY") {
      await ProductionTaskRuntime.update(id, {
        metadata: {
          ...object(task.metadata),
          human_performance_contract: verified.contract,
          human_performance_status: verified.status,
          human_performance_action_class:
            verified.human_performance?.action_class || null,
          human_performance_warning_count: verified.warnings.length,
          human_performance_verified_before_dispatch: true,
          human_performance_execution_authored: false,
        },
      });
    }

    return dispatchWithoutHumanPerformance(id);
  };
}

install();

export const CreativeHumanPerformanceExecutionGate = Object.freeze({
  installed: true,
  contract: "AVANTIQO_HUMAN_PERFORMANCE_EXECUTION_GATE_V1",
  performance_contract: CreativeHumanPerformanceRuntime.contract,
  execution_authorship_forbidden: true,
  fail_closed: true,
});
