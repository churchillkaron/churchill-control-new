import "./CreativeTemporalPromptlessPlanningRuntime";
import "./CreativeShortFormTemporalPlanningRuntime";
import "./CreativeUniversalTemporalCoverageBootstrap";
import "./CreativePostCouncilPromptlessDirectionRuntime";

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
  ProductionRuntime,
} from "@/lib/creative/production/runtime/ProductionRuntime";

import {
  CreativeStateEngine,
  PIPELINE_STAGES,
} from "@/lib/creative/state/CreativeStateEngine";

import "./CreativeDirectionCostApprovalRuntime";
import "./CreativeDirectionExactResumeRuntime";

const UNIVERSAL_WORKFLOWS = new Set([
  "STILL",
  "DOCUMENT",
  "INTERACTIVE",
  "SOFTWARE",
  "AUDIO",
  "CAMPAIGN_SYSTEM",
]);

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

function text(value) {
  return String(value ?? "").trim().toUpperCase();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function declaredWorkflow(project = {}, input = {}) {
  const explicit = text(
    input.workflow_kind ||
    input.creative_medium ||
    project.metadata?.workflow_kind ||
    project.metadata?.creative_medium ||
    project.production_type,
  );

  const map = {
    FILM: "TEMPORAL",
    VIDEO: "TEMPORAL",
    ANIMATION: "TEMPORAL",
    TEMPORAL: "TEMPORAL",
    IMAGE: "STILL",
    POSTER: "STILL",
    BANNER: "STILL",
    BANNER_SET: "STILL",
    STILL: "STILL",
    MENU: "DOCUMENT",
    DOCUMENT: "DOCUMENT",
    PRESENTATION: "DOCUMENT",
    REPORT: "DOCUMENT",
    BROCHURE: "DOCUMENT",
    WEBSITE: "INTERACTIVE",
    WEBPAGE: "INTERACTIVE",
    LANDING_PAGE: "INTERACTIVE",
    INTERACTIVE: "INTERACTIVE",
    APPLICATION: "SOFTWARE",
    APP: "SOFTWARE",
    SOFTWARE: "SOFTWARE",
    AUDIO: "AUDIO",
    VOICE: "AUDIO",
    MUSIC: "AUDIO",
    PODCAST: "AUDIO",
    MULTIMEDIA: "CAMPAIGN_SYSTEM",
    CAMPAIGN: "CAMPAIGN_SYSTEM",
    CAMPAIGN_SYSTEM: "CAMPAIGN_SYSTEM",
  };

  return map[explicit] || null;
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
  const workflow = declaredWorkflow(project, input);

  if (workflow && UNIVERSAL_WORKFLOWS.has(workflow)) {
    return buildUniversalCreativePipeline({
      ...input,
      workflow_kind: workflow,
    });
  }

  if (workflow === "TEMPORAL") {
    return buildCreativePipeline(input);
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
