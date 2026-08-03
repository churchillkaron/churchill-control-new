import {
  CreativeMeasuredUniversalTemporalDirectionRuntime,
} from "./CreativeMeasuredUniversalTemporalDirectionRuntime";
import {
  CreativeValidatedDossierPlanRecoveryRuntime,
} from "./CreativeValidatedDossierPlanRecoveryRuntime";
import {
  CreativeValidatedDossierReplanConvergenceRuntime,
} from "./CreativeValidatedDossierReplanConvergenceRuntime";
import {
  CreativeProjectRuntime,
} from "@/lib/creative/projects/runtime/CreativeProjectRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.measured-validated-dossier-recovery-gate.v2",
);
const CONTRACT =
  "CREATIVE_MEASURED_VALIDATED_DOSSIER_RECOVERY_GATE_V2";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function recoveryOnly(project = {}) {
  const metadata = object(project.metadata);
  const approval = object(metadata.paid_direction_approval);
  const cumulative = object(metadata.direction_cumulative_authorization);
  return Boolean(
    approval.recovery_only === true &&
    text(approval.status).toUpperCase() === "COMPLETED" &&
    cumulative.recovery_only === true &&
    cumulative.sufficient === true &&
    cumulative.new_provider_execution_authorized === false
  );
}

function originalIntent(input = {}, project = {}) {
  const mission = object(input.mission);
  const brief = object(input.brief);
  return text(
    input.intent ||
    input.command ||
    input.objective ||
    input.business_goal ||
    mission.metadata?.original_intent ||
    mission.objective ||
    mission.business_goal ||
    project.metadata?.original_intent ||
    project.objective ||
    project.business_goal ||
    brief.metadata?.original_intent ||
    brief.creative_objective ||
    brief.objective,
  );
}

async function freshRecoveryInput(input = {}) {
  const suppliedProject = object(input.project);
  const projectId = text(
    suppliedProject.id ||
    input.creative_project_id ||
    input.project_id,
  );
  if (!projectId) return input;

  const current = await CreativeProjectRuntime.get(projectId);
  if (!current) return input;
  if (
    text(input.organization_id) &&
    text(current.organization_id) !== text(input.organization_id)
  ) {
    throw new Error(
      "CREATIVE_MEASURED_DOSSIER_RECOVERY_PROJECT_SCOPE_MISMATCH",
    );
  }

  const project = {
    ...suppliedProject,
    ...current,
    metadata: {
      ...object(suppliedProject.metadata),
      ...object(current.metadata),
    },
  };
  const intent = originalIntent(input, project);

  return {
    ...input,
    project,
    intent,
    command: intent,
    objective: intent,
    business_goal: intent,
  };
}

function attachGateEvidence(result = {}, project = {}) {
  const plan = object(result.plan);
  const evidence = {
    contract: CONTRACT,
    recovery_only_project_state_verified: true,
    convergence_applied_before_graph_planning: true,
    source_production_graph_id:
      result.validated_dossier_plan_recovery?.source_production_graph_id ||
      null,
    selected_assets_source:
      project.metadata?.selected_assets_source || null,
    provider_execution_required: false,
    customer_charge_required: false,
    media_generation_authorized: false,
    publication_authorized: false,
  };

  return {
    ...result,
    plan: {
      ...plan,
      validation: {
        ...object(plan.validation),
        measured_validated_dossier_recovery_gate: evidence,
      },
    },
    validation: {
      ...object(result.validation),
      measured_validated_dossier_recovery_gate: evidence,
    },
    measured_validated_dossier_recovery_gate: evidence,
  };
}

function install() {
  if (CreativeMeasuredUniversalTemporalDirectionRuntime[INSTALL_FLAG]) return;

  const createWithoutMeasuredRecoveryGate =
    CreativeMeasuredUniversalTemporalDirectionRuntime.create.bind(
      CreativeMeasuredUniversalTemporalDirectionRuntime,
    );

  Object.defineProperty(
    CreativeMeasuredUniversalTemporalDirectionRuntime,
    INSTALL_FLAG,
    {
      value: true,
      enumerable: false,
      configurable: false,
    },
  );

  CreativeMeasuredUniversalTemporalDirectionRuntime.create =
    async function createWithMeasuredValidatedDossierRecovery(
      input = {},
    ) {
      const currentInput = await freshRecoveryInput(input);
      const project = object(currentInput.project);

      if (!recoveryOnly(project)) {
        return createWithoutMeasuredRecoveryGate(currentInput);
      }

      const recovered =
        await CreativeValidatedDossierPlanRecoveryRuntime.recover(
          currentInput,
        );

      if (!recovered) {
        throw new Error(
          `CREATIVE_MEASURED_VALIDATED_DOSSIER_RECOVERY_NOT_ACTIVATED:` +
          `project=${text(project.id)};` +
          `selected_assets_source=${text(
            project.metadata?.selected_assets_source,
          ) || "UNKNOWN"};` +
          `asset_count=${Array.isArray(currentInput.assets)
            ? currentInput.assets.length
            : 0};` +
          `intent_present=${Boolean(text(currentInput.intent))}`,
        );
      }

      const converged =
        await CreativeValidatedDossierReplanConvergenceRuntime.converge(
          currentInput,
          recovered,
        );

      const convergence = object(
        converged.plan?.validation?.temporal_semantic_replan_convergence ||
        converged.validation?.temporal_semantic_replan_convergence,
      );
      if (convergence.applied !== true) {
        throw new Error(
          "CREATIVE_MEASURED_VALIDATED_DOSSIER_CONVERGENCE_REQUIRED",
        );
      }

      return attachGateEvidence(converged, project);
    };
}

install();

export const CreativeMeasuredValidatedDossierRecoveryGate = {
  installed: true,
  freshRecoveryInput,
};
