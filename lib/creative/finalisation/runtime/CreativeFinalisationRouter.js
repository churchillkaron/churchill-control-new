import { CreativePostProductionRuntime } from "@/lib/creative/post-production/runtime/CreativePostProductionRuntime";
import { CreativeUniversalFinalisationRuntime } from "./CreativeUniversalFinalisationRuntime";
import * as CreativeProjectRepository from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import { ProductionTaskRuntime } from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import { CreativeAutonomousRepairDirectorRuntime } from "@/lib/creative/quality/runtime/CreativeAutonomousRepairDirectorRuntime";
import { CreativeTemporalSemanticRepairRuntime } from "@/lib/creative/quality/runtime/CreativeTemporalSemanticRepairRuntime";

const UNIVERSAL_WORKFLOWS = new Set([
  "STILL",
  "DOCUMENT",
  "INTERACTIVE",
  "SOFTWARE",
  "AUDIO",
  "CAMPAIGN_SYSTEM",
]);

function text(value) {
  return String(value ?? "").trim().toUpperCase();
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function workflowKind(project = {}, tasks = []) {
  const declared = text(
    project.metadata?.workflow_kind ||
    project.metadata?.creative_medium ||
    tasks.find((task) => task.metadata?.workflow_kind)?.metadata?.workflow_kind ||
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
    STILL: "STILL",
    DOCUMENT: "DOCUMENT",
    MENU: "DOCUMENT",
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
  return map[declared] || declared;
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

function qualityRejected(tasks = []) {
  return tasks.filter((task) =>
    task.metadata?.release_hold === true ||
    task.metadata?.perceptual_quality_state === "QUALITY_REJECTED" ||
    task.metadata?.quality_repair_required === true ||
    task.output?.perceptual_validation?.passed === false ||
    task.output?.passed === false,
  );
}

export const CreativeFinalisationRouter = {
  async run({ organization_id, creative_project_id, production_graph_id = null } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");

    const [project, tasks] = await Promise.all([
      CreativeProjectRepository.getById(creative_project_id),
      ProductionTaskRuntime.list({
        organization_id,
        creative_project_id,
        production_graph_id,
      }),
    ]);
    if (!project || project.organization_id !== organization_id) {
      throw new Error("Creative project not found");
    }

    const repair = await CreativeAutonomousRepairDirectorRuntime.ensure({
      organization_id,
      creative_project_id,
      production_graph_id,
    });
    if (repair.created.length) {
      return {
        success: false,
        passed: false,
        status: "AUTONOMOUS_REPAIR_SCHEDULED",
        workflow_kind: workflowKind(project, tasks),
        repair,
      };
    }

    const rejected = qualityRejected(tasks);
    if (rejected.length) {
      return {
        success: false,
        passed: false,
        status: "QUALITY_REPAIR_REQUIRED",
        workflow_kind: workflowKind(project, tasks),
        rejected_task_count: rejected.length,
        rejected_tasks: rejected.map((task) => ({
          id: task.id,
          title: task.title || null,
          type: task.type || null,
          source_task_id:
            task.metadata?.source_generation_task_id ||
            task.metadata?.perceptual_review_source_task_id ||
            null,
          estimated_repair_cost:
            task.metadata?.quality_repair_estimated_cost ||
            task.cost?.estimated ||
            0,
          reason:
            task.metadata?.quality_repair_blocked_reason ||
            "GENERATED_MEDIA_PERCEPTUAL_VALIDATION_FAILED",
        })),
        repair,
        publication_authorized: false,
      };
    }

    const workflow = workflowKind(project, tasks);
    if (workflow === "TEMPORAL") {
      const postProduction = await CreativePostProductionRuntime.run({
        organization_id,
        creative_project_id,
        production_graph_id,
      });
      if (!["READY_FOR_APPROVAL", "REVIEW_REQUIRED"].includes(postProduction.status)) {
        return filmVerdict(postProduction);
      }
      return filmVerdict(await CreativeTemporalSemanticRepairRuntime.evaluate({
        organization_id,
        creative_project_id,
        production_graph_id,
        post_production: postProduction,
      }));
    }
    if (UNIVERSAL_WORKFLOWS.has(workflow)) {
      return CreativeUniversalFinalisationRuntime.run({
        organization_id,
        creative_project_id,
        production_graph_id,
      });
    }

    throw new Error(
      `CREATIVE_FINALISATION_WORKFLOW_UNSUPPORTED:${workflow || "UNKNOWN"}`,
    );
  },
};
