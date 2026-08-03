import {
  CreativeMasterPlanRuntime,
} from "./CreativeMasterPlanRuntime";
import {
  CreativeTemporalRoleLanguagePolishRuntime,
} from "./CreativeTemporalRoleLanguagePolishRuntime";
import {
  CreativeTemporalSemanticReplanConvergenceRuntimeV2,
} from "./CreativeTemporalSemanticReplanConvergenceRuntimeV2";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.validated-dossier-replan-convergence.v1",
);
const CONTRACT =
  "CREATIVE_VALIDATED_DOSSIER_REPLAN_CONVERGENCE_V1";
const RECOVERY_CONTRACT =
  "CREATIVE_VALIDATED_DOSSIER_PLAN_RECOVERY_V3";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function recoveryEvidence(result = {}) {
  const plan = object(result.plan);
  return object(
    result.validated_dossier_plan_recovery ||
    result.validation?.validated_dossier_plan_recovery ||
    plan.validation?.validated_dossier_plan_recovery,
  );
}

function recoveredPlan(result = {}) {
  const plan = object(result.plan);
  const recovery = recoveryEvidence(result);
  return Boolean(
    text(recovery.contract) === RECOVERY_CONTRACT ||
    text(plan.production?.validated_dossier_plan_recovery_contract) ===
      RECOVERY_CONTRACT
  );
}

function alreadyConverged(result = {}) {
  const plan = object(result.plan);
  return Boolean(
    plan.validation?.temporal_semantic_replan_convergence?.applied === true ||
    result.validation?.temporal_semantic_replan_convergence?.applied === true ||
    plan.validation?.validated_dossier_replan_convergence?.applied === true
  );
}

function recoveryReplanMarker(plan = {}) {
  return {
    ...object(plan.validation?.temporal_semantic_repair),
    contract: CONTRACT,
    applied: true,
    reason: "VALIDATED_DOSSIER_SOURCE_ONLY_REBIND",
    validated_dossier_recovery_contract: RECOVERY_CONTRACT,
    provider_execution_required: false,
    customer_charge_required: false,
    media_generation_authorized: false,
    publication_authorized: false,
  };
}

async function convergeRecoveredPlan(input = {}, result = {}) {
  if (!recoveredPlan(result) || alreadyConverged(result)) return result;

  const plan = object(result.plan);
  const preparedPlan = {
    ...plan,
    validation: {
      ...object(plan.validation),
      passed: true,
      temporal_semantic_repair: recoveryReplanMarker(plan),
    },
  };

  const polished =
    CreativeTemporalRoleLanguagePolishRuntime.polishPlan(preparedPlan);
  const prepared = {
    ...result,
    plan: {
      ...polished.plan,
      validation: {
        ...object(polished.plan.validation),
        temporal_semantic_repair: recoveryReplanMarker(polished.plan),
        validated_dossier_replan_convergence: {
          contract: CONTRACT,
          applied: true,
          phase: "PRE_GRAPH_SUPERSESSION",
          provider_execution_required: false,
          customer_charge_required: false,
          media_generation_authorized: false,
          publication_authorized: false,
        },
      },
    },
    validation: {
      ...object(result.validation),
      passed: true,
      temporal_semantic_validation: polished.validation,
      temporal_semantic_repair: recoveryReplanMarker(polished.plan),
      validated_dossier_replan_convergence: {
        contract: CONTRACT,
        applied: true,
        phase: "PRE_GRAPH_SUPERSESSION",
        provider_execution_required: false,
        customer_charge_required: false,
        media_generation_authorized: false,
        publication_authorized: false,
      },
    },
  };

  return CreativeTemporalSemanticReplanConvergenceRuntimeV2.converge(
    input,
    prepared,
  );
}

function install() {
  if (CreativeMasterPlanRuntime[INSTALL_FLAG]) return;

  const createWithoutValidatedDossierReplanConvergence =
    CreativeMasterPlanRuntime.create.bind(CreativeMasterPlanRuntime);

  Object.defineProperty(CreativeMasterPlanRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  CreativeMasterPlanRuntime.create =
    async function createWithValidatedDossierReplanConvergence(
      input = {},
    ) {
      const result =
        await createWithoutValidatedDossierReplanConvergence(input);
      return convergeRecoveredPlan(input, result);
    };
}

install();

export const CreativeValidatedDossierReplanConvergenceRuntime = {
  installed: true,
  converge: convergeRecoveredPlan,
};
