import {
  CreativeMasterPlanRuntime,
} from "./CreativeMasterPlanRuntime";
import {
  assertTemporalSemanticPlan,
} from "@/lib/creative/director/validation/CreativeTemporalSemanticPlanValidator";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.temporal-semantic-plan-gate.v1",
);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function install() {
  if (CreativeMasterPlanRuntime[INSTALL_FLAG]) return;

  const createWithoutSemanticGate =
    CreativeMasterPlanRuntime.create.bind(CreativeMasterPlanRuntime);

  Object.defineProperty(CreativeMasterPlanRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  CreativeMasterPlanRuntime.create =
    async function createWithTemporalSemanticGate(input = {}) {
      const result = await createWithoutSemanticGate(input);
      const plan = object(result?.plan);
      const workflow = String(plan.workflow_kind || "").trim().toUpperCase();

      if (workflow !== "TEMPORAL") return result;

      const semanticValidation = assertTemporalSemanticPlan(plan);

      return {
        ...result,
        plan: {
          ...plan,
          validation: {
            ...object(plan.validation),
            passed: true,
            temporal_semantic_validation: semanticValidation,
          },
        },
        validation: {
          ...object(result.validation),
          passed: true,
          temporal_semantic_validation: semanticValidation,
        },
      };
    };
}

install();

export const CreativeTemporalSemanticPlanGateRuntime = {
  installed: true,
};
