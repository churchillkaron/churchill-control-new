import "./CreativeTemporalPromptlessPlanningRuntime";
import "./CreativeShortFormTemporalPlanningRuntime";
import "./CreativeUniversalTemporalCoverageBootstrap";
import "./CreativePostCouncilPromptlessDirectionRuntime";
import "./CreativeWorldClassConceptIntelligenceRuntime";
import "./CreativeAutonomousConceptRegenerationRuntime";
import "@/lib/creative/quality/runtime/CreativeWorldClassQualityBootstrap";
import "@/lib/creative/learning/runtime/CreativeOutcomeLearningDirectionBootstrap";

import {
  buildCreativePipeline,
} from "../orchestrator/CreativePipelineOrchestrator";

import {
  buildUniversalCreativePipeline,
} from "../orchestrator/UniversalCreativePipelineOrchestrator";

import {
  CreativeIntelligenceRuntime,
} from "@/lib/creative/intelligence/runtime/CreativeIntelligenceRuntime";

import {
  CreativeProjectRuntime,
} from "@/lib/creative/projects/runtime/CreativeProjectRuntime";

import {
  CreativeWorkflowRegistry,
} from "@/lib/creative/director/registry/CreativeWorkflowRegistry";

import {
  ProductionRuntime,
} from "@/lib/creative/production/runtime/ProductionRuntime";

import {
  CreativeStateEngine,
  PIPELINE_STAGES,
} from "@/lib/creative/state/CreativeStateEngine";

import "./CreativeDirectionCostApprovalRuntime";
import "./CreativeDirectionExactResumeRuntime";

function stateInput(input = {}) {
  return {
    organization_id: input.organization_id,
    creative_mission_id:
      input.creative_mission_id ||
      input.mission_id ||
      input.creative_project_id,
    creative_project_id:
      input.creative_project_id ||
      input.project_id ||
      input.creative_mission_id ||
      input.mission_id,
  };
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

async function projectFor(input = {}) {
  const id = input.creative_project_id || input.project_id;
  if (!id) throw new Error("creative_project_id required");
  const project = await CreativeProjectRuntime.get(id);
  if (!project || project.organization_id !== input.organization_id) {
    throw new Error("Creative project not found");
  }
  return project;
}

async function buildRoutedPipeline(input = {}) {
  const project = await projectFor(input);
  const declared = CreativeWorkflowRegistry.resolveDeclared({
    input,
    project,
  });

  if (declared?.executor === "UNIVERSAL") {
    return buildUniversalCreativePipeline({
      ...input,
      workflow_kind: declared.workflow_kind,
    });
  }

  if (declared?.executor === "TEMPORAL") {
    return buildCreativePipeline({
      ...input,
      workflow_kind: declared.workflow_kind,
    });
  }

  try {
    return await buildCreativePipeline(input);
  } catch (error) {
    if (!String(error?.message || error).includes(
      "CREATIVE_WORKFLOW_RUNTIME_NOT_CONNECTED",
    )) {
      throw error;
    }
    return buildUniversalCreativePipeline(input);
  }
}

function productionDossierBoundary(pipeline = {}) {
  const dossier = object(pipeline.execution?.production_dossier);
  if (!Object.keys(dossier).length) return null;
  if (dossier.approval_required !== true || dossier.approved === true) {
    return null;
  }
  return {
    status: "AWAITING_PRODUCTION_DOSSIER_APPROVAL",
    production_dossier: dossier,
  };
}

export const CreativeDirectorRuntime = {
  async build(input = {}) {
    const creativePlan =
      await CreativeIntelligenceRuntime.createCreativePlan({
        organization:
          input.organization || {},
        brand:
          input.brand || {},
        industry:
          input.industry || null,
        objective:
          input.objective ||
          input.business_goal ||
          "",
        assets:
          input.assets || [],
        requestedOutputs:
          input.requestedOutputs || [],
      });

    return buildRoutedPipeline({
      ...input,
      creativePlan,
    });
  },

  async execute(input = {}) {
    const stateRef = stateInput(input);
    const state =
      await CreativeStateEngine.get(stateRef);

    if (
      state?.stage ===
      PIPELINE_STAGES.COMPLETED
    ) {
      return {
        success: true,
        status: "COMPLETED",
        skipped: true,
        reason: "Mission pipeline already completed.",
      };
    }

    const locked =
      await CreativeStateEngine.acquireExecutionLock(stateRef);

    if (!locked) {
      return {
        success: false,
        status: "PIPELINE_ALREADY_RUNNING",
        stage: state?.stage || null,
        reason: "Mission pipeline already running.",
      };
    }

    try {
      const pipeline =
        await buildRoutedPipeline(input);

      const boundary = productionDossierBoundary(pipeline);
      if (boundary) {
        await CreativeStateEngine.set(
          stateRef,
          PIPELINE_STAGES.READY_FOR_EXECUTION,
        );
        return {
          success: true,
          status: boundary.status,
          workflow_kind:
            pipeline.workflow_kind ||
            pipeline.master_plan?.plan?.workflow_kind ||
            null,
          pipeline,
          production: null,
          approval: {
            required: true,
            scope: "PRODUCTION_DOSSIER",
            ...boundary.production_dossier,
          },
        };
      }

      await CreativeStateEngine.set(
        stateRef,
        PIPELINE_STAGES.PRODUCING,
      );

      const production =
        await ProductionRuntime.runProduction({
          organization_id: input.organization_id,
          creative_mission_id: stateRef.creative_mission_id,
          creative_project_id: stateRef.creative_project_id,
        });

      return {
        success: production.success !== false,
        status: production.status,
        workflow_kind:
          pipeline.workflow_kind ||
          pipeline.master_plan?.plan?.workflow_kind ||
          null,
        pipeline,
        production,
      };
    } finally {
      await CreativeStateEngine.releaseExecutionLock(stateRef);
    }
  },
};
