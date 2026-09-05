import "@/lib/creative/release/runtime/CreativeTemporalChannelDeliveryBootstrap";

import { CreativeGovernedVideoMasteringRuntime } from "@/lib/creative/post-production/runtime/CreativeGovernedVideoMasteringRuntime";
import { CreativeUniversalFinalisationRuntime } from "./CreativeUniversalFinalisationRuntime";
import { CreativeWorkflowRegistry } from "@/lib/creative/director/registry/CreativeWorkflowRegistry";
import * as CreativeProjectRepository from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import { ProductionTaskRuntime } from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import { CreativeAutonomousRepairDirectorRuntime } from "@/lib/creative/quality/runtime/CreativeAutonomousRepairDirectorRuntime";
import { CreativeTemporalSemanticRepairRuntime } from "@/lib/creative/quality/runtime/CreativeTemporalSemanticRepairRuntime";
import { CreativePremiumTemporalQualityGateRuntime } from "@/lib/creative/quality/runtime/CreativePremiumTemporalQualityGateRuntime";
import { CreativeIntelligenceReleaseDirectorRuntime } from "@/lib/creative/quality/runtime/CreativeIntelligenceReleaseDirectorRuntime";
import { CreativeDirectorPlanFinalReleaseGateRuntime } from "@/lib/creative/director/runtime/CreativeDirectorPlanFinalReleaseGateRuntime";

function workflowFor(project = {}, tasks = []) {
  const workflow = CreativeWorkflowRegistry.resolveState({ project, tasks });
  if (!workflow) {
    throw new Error("CREATIVE_FINALISATION_WORKFLOW_REQUIRED");
  }
  return workflow;
}

function filmVerdict(result = {}) {
  const passed = result.status === "READY_FOR_APPROVAL";
  return {
    ...result,
    success: passed,
    passed,
    workflow_kind: "TEMPORAL",
  };
}

async function intelligenceReview({ organization_id, creative_project_id, project, result }) {
  return CreativeIntelligenceReleaseDirectorRuntime.review({
    organization_id,
    creative_project_id,
    project,
    result,
  });
}

async function directorPlanReview({ organization_id, creative_project_id, project, result }) {
  return CreativeDirectorPlanFinalReleaseGateRuntime.evaluate({
    organization_id,
    creative_project_id,
    project,
    result,
  });
}

export const CreativeFinalisationRouter = {
  async run({ organization_id, creative_project_id } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");

    const [project, tasks] = await Promise.all([
      CreativeProjectRepository.getById(creative_project_id),
      ProductionTaskRuntime.list({ organization_id, creative_project_id }),
    ]);
    if (!project || project.organization_id !== organization_id) {
      throw new Error("Creative project not found");
    }

    const workflow = workflowFor(project, tasks);
    const repair = await CreativeAutonomousRepairDirectorRuntime.ensure({
      organization_id,
      creative_project_id,
    });
    if (repair.created.length) {
      return {
        success: false,
        passed: false,
        status: "AUTONOMOUS_REPAIR_SCHEDULED",
        workflow_kind: workflow.workflow_kind,
        repair,
      };
    }

    if (workflow.finaliser === "TEMPORAL") {
      const postProduction = await CreativeGovernedVideoMasteringRuntime.run({
        organization_id,
        creative_project_id,
      });
      if (!["READY_FOR_APPROVAL", "REVIEW_REQUIRED"].includes(postProduction.status)) {
        return filmVerdict(postProduction);
      }

      const semanticResult = await CreativeTemporalSemanticRepairRuntime.evaluate({
        organization_id,
        creative_project_id,
        post_production: postProduction,
      });

      const premiumTemporal = CreativePremiumTemporalQualityGateRuntime.evaluate({
        project,
        post_production: postProduction,
        prior_result: semanticResult,
      });

      const specialistVerdict = !premiumTemporal.applicable
        ? filmVerdict(semanticResult)
        : filmVerdict({
            ...semanticResult,
            status: premiumTemporal.status,
            semantic_status: semanticResult.status || null,
            premium_temporal_quality: premiumTemporal,
            repair_instructions: [
              ...new Set([
                ...(semanticResult.repair_instructions || []),
                ...premiumTemporal.repair_instructions,
              ]),
            ],
          });

      const directorVerdict = await directorPlanReview({
        organization_id,
        creative_project_id,
        project,
        result: specialistVerdict,
      });

      return intelligenceReview({
        organization_id,
        creative_project_id,
        project,
        result: directorVerdict,
      });
    }

    if (workflow.finaliser === "UNIVERSAL") {
      const specialistVerdict = await CreativeUniversalFinalisationRuntime.run({
        organization_id,
        creative_project_id,
      });
      return intelligenceReview({
        organization_id,
        creative_project_id,
        project,
        result: specialistVerdict,
      });
    }

    throw new Error(
      `CREATIVE_FINALISATION_EXECUTOR_UNSUPPORTED:${workflow.finaliser || "UNKNOWN"}`,
    );
  },
};
