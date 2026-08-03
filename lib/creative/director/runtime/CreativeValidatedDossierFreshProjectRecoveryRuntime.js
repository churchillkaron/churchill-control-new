import {
  CreativeMasterPlanRuntime,
} from "./CreativeMasterPlanRuntime";
import {
  CreativeValidatedDossierPlanRecoveryRuntime,
} from "./CreativeValidatedDossierPlanRecoveryRuntime";
import {
  CreativeProjectRuntime,
} from "@/lib/creative/projects/runtime/CreativeProjectRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.validated-dossier-fresh-project-recovery.v1",
);
const CONTRACT =
  "CREATIVE_VALIDATED_DOSSIER_FRESH_PROJECT_RECOVERY_V1";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

async function freshInput(input = {}) {
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
      "CREATIVE_VALIDATED_DOSSIER_RECOVERY_PROJECT_SCOPE_MISMATCH",
    );
  }

  return {
    ...input,
    project: {
      ...suppliedProject,
      ...current,
      metadata: {
        ...object(suppliedProject.metadata),
        ...object(current.metadata),
      },
    },
  };
}

function withFreshEvidence(result = {}) {
  const plan = object(result.plan);
  const recovery = object(result.validated_dossier_plan_recovery);
  if (!Object.keys(recovery).length) return result;

  const evidence = {
    contract: CONTRACT,
    fresh_project_state_loaded: true,
    source_production_graph_id:
      recovery.source_production_graph_id || null,
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
        validated_dossier_fresh_project_recovery: evidence,
      },
    },
    validation: {
      ...object(result.validation),
      validated_dossier_fresh_project_recovery: evidence,
    },
    validated_dossier_fresh_project_recovery: evidence,
  };
}

function install() {
  if (CreativeMasterPlanRuntime[INSTALL_FLAG]) return;

  const createWithoutFreshProjectRecovery =
    CreativeMasterPlanRuntime.create.bind(CreativeMasterPlanRuntime);

  Object.defineProperty(CreativeMasterPlanRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  CreativeMasterPlanRuntime.create =
    async function createWithFreshProjectValidatedDossierRecovery(
      input = {},
    ) {
      const currentInput = await freshInput(input);
      const recovered =
        await CreativeValidatedDossierPlanRecoveryRuntime.recover(
          currentInput,
        );

      if (recovered) return withFreshEvidence(recovered);
      return createWithoutFreshProjectRecovery(currentInput);
    };
}

install();

export const CreativeValidatedDossierFreshProjectRecoveryRuntime = {
  installed: true,
  freshInput,
};
