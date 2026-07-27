import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  unwrapSoftwareOutput,
} from "./SoftwareContractRuntime";

function localBuild(task = {}) {
  const workflow = String(task.metadata?.workflow_kind || "").toUpperCase();
  const step = String(task.metadata?.production_step_id || "").toLowerCase();
  const capability = String(task.capability || task.service_code || "");
  return capability === "creative.software.build" || (workflow === "SOFTWARE" && step === "build");
}

function semanticReview(task = {}) {
  const workflow = String(task.metadata?.workflow_kind || "").toUpperCase();
  const step = String(task.metadata?.production_step_id || "").toLowerCase();
  return workflow === "SOFTWARE" &&
    step !== "release-validation" &&
    (task.metadata?.quality_gate === true || step === "quality" || step === "semantic-review");
}

export const SoftwareValidationTaskRuntime = {
  async ensure({ organization_id, creative_project_id } = {}) {
    if (!organization_id || !creative_project_id) return [];
    const tasks = await ProductionTaskRuntime.list({
      organization_id,
      creative_project_id,
    });
    const created = [];
    const reviews = tasks.filter((task) => semanticReview(task) && task.status === "COMPLETED");
    for (const review of reviews) {
      const deliverableId = review.metadata?.deliverable_id;
      const build = tasks.find((task) =>
        localBuild(task) &&
        task.status === "COMPLETED" &&
        task.metadata?.deliverable_id === deliverableId &&
        Boolean(unwrapSoftwareOutput(task.output)?.build_artifact_url),
      );
      if (!build) continue;
      const existing = tasks.find((task) =>
        task.metadata?.software_validation_for_task_id === review.id,
      );
      if (existing) continue;
      const validation = await ProductionTaskRuntime.create({
        organization_id,
        creative_project_id,
        production_graph_id: review.production_graph_id,
        type: "QUALITY_REVIEW",
        status: "WAITING",
        title: `Validate ${build.title || "software deliverable"}`,
        description: "Require isolated build, passing tests, security evidence, semantic review and deployment-ready packages.",
        service_id: "creative.software.validate",
        service_code: "creative.software.validate",
        capability: "creative.software.validate",
        priority: Number(review.priority || 100) + 1,
        depends_on: [build.id, review.id],
        input: {
          output_spec: review.metadata?.requirements?.output_spec || review.metadata?.output_spec || {},
        },
        cost: {
          estimated: 0,
          actual: 0,
          currency: review.cost?.currency || null,
          approved: true,
        },
        timing: { estimated_seconds: 0 },
        review: { required: false, approved: false },
        metadata: {
          ...(review.metadata || {}),
          execution_node_id: `${review.metadata?.execution_node_id || review.id}:software-validation`,
          execution_step_id: `${review.metadata?.execution_step_id || review.id}:software-validation`,
          production_step_id: "release-validation",
          production_step_index: Number(review.metadata?.production_step_index || 2) + 1,
          quality_gate: true,
          release_candidate: false,
          software_validation_for_task_id: review.id,
          software_build_task_id: build.id,
        },
      });
      await ProductionTaskRuntime.update(review.id, {
        metadata: {
          ...(review.metadata || {}),
          quality_gate: false,
          release_candidate: false,
        },
      });
      created.push(validation);
    }
    return created;
  },
};
