import { CreativePostProductionRuntime } from "@/lib/creative/post-production/runtime/CreativePostProductionRuntime";
import { CreativeUniversalFinalisationRuntime } from "./CreativeUniversalFinalisationRuntime";
import * as CreativeProjectRepository from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import { ProductionTaskRuntime } from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import { CreativeAutonomousRepairDirectorRuntime } from "@/lib/creative/quality/runtime/CreativeAutonomousRepairDirectorRuntime";

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

    const repair = await CreativeAutonomousRepairDirectorRuntime.ensure({
      organization_id,
      creative_project_id,
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

    const workflow = workflowKind(project, tasks);
    if (workflow === "TEMPORAL") {
      return filmVerdict(await CreativePostProductionRuntime.run({
        organization_id,
        creative_project_id,
      }));
    }
    if (UNIVERSAL_WORKFLOWS.has(workflow)) {
      return CreativeUniversalFinalisationRuntime.run({
        organization_id,
        creative_project_id,
      });
    }

    throw new Error(
      `CREATIVE_FINALISATION_WORKFLOW_UNSUPPORTED:${workflow || "UNKNOWN"}`,
    );
  },
};
