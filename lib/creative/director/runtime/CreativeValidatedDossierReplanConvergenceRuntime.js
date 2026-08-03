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
  "avantiqo.creative.validated-dossier-replan-convergence.v2",
);
const CONTRACT =
  "CREATIVE_VALIDATED_DOSSIER_REPLAN_CONVERGENCE_V2";
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

function convergenceEvidence(result = {}) {
  const plan = object(result.plan);
  return object(
    result.validated_dossier_replan_convergence ||
    result.validation?.validated_dossier_replan_convergence ||
    plan.validation?.validated_dossier_replan_convergence,
  );
}

function alreadyConverged(result = {}) {
  const evidence = convergenceEvidence(result);
  return Boolean(
    text(evidence.contract) === CONTRACT &&
    evidence.applied === true &&
    text(evidence.phase) === "SUPERSESSION_COMPLETE" &&
    evidence.current_recovery_pass === true
  );
}

function recoveryReplanMarker(plan = {}) {
  return {
    ...object(plan.validation?.temporal_semantic_repair),
    contract: CONTRACT,
    applied: true,
    reason: "VALIDATED_DOSSIER_SOURCE_ONLY_REBIND",
    validated_dossier_recovery_contract: RECOVERY_CONTRACT,
    current_recovery_pass: true,
    provider_execution_required: false,
    customer_charge_required: false,
    media_generation_authorized: false,
    publication_authorized: false,
  };
}

function convergenceMarker(phase, convergence = {}) {
  return {
    contract: CONTRACT,
    applied: true,
    phase,
    current_recovery_pass: true,
    source_recovery_contract: RECOVERY_CONTRACT,
    superseded_task_count:
      Number(convergence.superseded_task_count || 0),
    superseded_graph_count:
      Number(convergence.superseded_graph_count || 0),
    archived_dossier_count:
      Number(convergence.archived_dossier_count || 0),
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
      validated_dossier_replan_convergence:
        convergenceMarker("PRE_GRAPH_SUPERSESSION"),
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
        validated_dossier_replan_convergence:
          convergenceMarker("PRE_GRAPH_SUPERSESSION"),
      },
    },
    validation: {
      ...object(result.validation),
      passed: true,
      temporal_semantic_validation: polished.validation,
      temporal_semantic_repair: recoveryReplanMarker(polished.plan),
      validated_dossier_replan_convergence:
        convergenceMarker("PRE_GRAPH_SUPERSESSION"),
    },
  };

  const converged =
    await CreativeTemporalSemanticReplanConvergenceRuntimeV2.converge(
      input,
      prepared,
    );
  const semanticConvergence = object(
    converged.plan?.validation?.temporal_semantic_replan_convergence ||
    converged.validation?.temporal_semantic_replan_convergence,
  );
  const completed = convergenceMarker(
    "SUPERSESSION_COMPLETE",
    semanticConvergence,
  );

  if (semanticConvergence.applied !== true) {
    throw new Error(
      "CREATIVE_VALIDATED_DOSSIER_REPLAN_SUPERSESSION_NOT_APPLIED",
    );
  }

  return {
    ...converged,
    plan: {
      ...object(converged.plan),
      validation: {
        ...object(converged.plan?.validation),
        validated_dossier_replan_convergence: completed,
      },
    },
    validation: {
      ...object(converged.validation),
      validated_dossier_replan_convergence: completed,
    },
    validated_dossier_replan_convergence: completed,
  };
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
