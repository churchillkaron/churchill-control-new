import "@/lib/creative/quality/runtime/CreativeWorldClassQualityBootstrap";

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
  CreativeWorkflowResolutionRuntime,
} from "@/lib/creative/director/runtime/CreativeWorkflowResolutionRuntime";

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

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function videoGenerationTask(task = {}) {
  const type = text(task.type).toUpperCase();
  const capability = text(task.capability || task.service_code).toLowerCase();
  return type === "GENERATE_VIDEO" || capability.includes("video.generate");
}

async function buildRoutedPipeline(input = {}) {
  const resolution = await CreativeWorkflowResolutionRuntime.resolve(input);
  const routedInput = {
    ...input,
    creative_mission_id: resolution.creative_mission_id,
    creative_project_id: resolution.creative_project_id,
    brief: resolution.brief,
    master: resolution.master,
    workflow_kind: resolution.workflow.workflow_kind,
  };

  if (resolution.workflow.executor === "TEMPORAL") {
    return buildCreativePipeline(routedInput);
  }

  if (resolution.workflow.executor === "UNIVERSAL") {
    return buildUniversalCreativePipeline(routedInput);
  }

  throw new Error(
    `CREATIVE_WORKFLOW_EXECUTOR_NOT_CONNECTED:${resolution.workflow.executor || "UNKNOWN"}`,
  );
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

function manualVideoGenerationBoundary(pipeline = {}) {
  const videoTasks = list(pipeline.tasks?.all).filter(videoGenerationTask);
  if (!videoTasks.length) return null;
  return {
    status: "AWAITING_EXPLICIT_VIDEO_GENERATION",
    task_ids: videoTasks.map((task) => task.id).filter(Boolean),
    task_count: videoTasks.length,
    approval_required: true,
    explicit_start_required: true,
    automatic_dispatch_allowed: false,
    media_generation_authorized: false,
    publication_authorized: false,
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

      const dossierBoundary = productionDossierBoundary(pipeline);
      if (dossierBoundary) {
        await CreativeStateEngine.set(
          stateRef,
          PIPELINE_STAGES.READY_FOR_EXECUTION,
        );
        return {
          success: true,
          status: dossierBoundary.status,
          workflow_kind:
            pipeline.workflow_kind ||
            pipeline.master_plan?.plan?.workflow_kind ||
            null,
          pipeline,
          production: null,
          approval: {
            required: true,
            scope: "PRODUCTION_DOSSIER",
            ...dossierBoundary.production_dossier,
          },
        };
      }

      const videoBoundary = manualVideoGenerationBoundary(pipeline);
      if (videoBoundary) {
        await CreativeStateEngine.set(
          stateRef,
          PIPELINE_STAGES.READY_FOR_EXECUTION,
        );
        return {
          success: true,
          status: videoBoundary.status,
          workflow_kind:
            pipeline.workflow_kind ||
            pipeline.master_plan?.plan?.workflow_kind ||
            null,
          pipeline,
          production: null,
          generation: videoBoundary,
          publication_authorized: false,
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
