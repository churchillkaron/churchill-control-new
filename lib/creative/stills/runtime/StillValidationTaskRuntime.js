import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

function isCompletedStillReview(task = {}) {
  const workflow = String(task.metadata?.workflow_kind || "").toUpperCase();
  const capability = String(task.capability || task.service_code || "").toLowerCase();
  const step = String(task.metadata?.production_step_id || "").toLowerCase();
  return task.status === "COMPLETED" &&
    workflow === "STILL" &&
    Boolean(task.metadata?.still_finish_task_id) &&
    capability !== "creative.still.validate" &&
    (step === "quality" || step === "semantic-review" || capability.includes("image.analyze"));
}

export const StillValidationTaskRuntime = {
  async ensure({ organization_id, creative_project_id } = {}) {
    if (!organization_id || !creative_project_id) return [];
    const tasks = await ProductionTaskRuntime.list({
      organization_id,
      creative_project_id,
    });
    const created = [];

    for (const reviewTask of tasks.filter(isCompletedStillReview)) {
      const existing = tasks.find((task) =>
        task.metadata?.still_validation_for_task_id === reviewTask.id,
      );
      if (existing) continue;

      const validation = await ProductionTaskRuntime.create({
        organization_id,
        creative_project_id,
        production_graph_id: reviewTask.production_graph_id,
        type: "QUALITY_REVIEW",
        status: "WAITING",
        title: `Validate ${reviewTask.title || "finished still"}`,
        description: "Validate real still files, requested channel variants, checksums, exact brand assets and semantic review evidence.",
        service_id: "creative.still.validate",
        service_code: "creative.still.validate",
        capability: "creative.still.validate",
        priority: Number(reviewTask.priority || 100) + 1,
        depends_on: [
          reviewTask.metadata.still_finish_task_id,
          reviewTask.id,
        ],
        input: {
          ...(reviewTask.input || {}),
          output_spec:
            reviewTask.metadata?.requirements?.output_spec ||
            reviewTask.input?.requirements?.output_spec ||
            reviewTask.input?.output_spec ||
            {},
        },
        cost: {
          estimated: 0,
          actual: 0,
          currency: reviewTask.cost?.currency || null,
          approved: true,
        },
        timing: {
          estimated_seconds: 0,
        },
        review: {
          required: true,
          approved: false,
        },
        metadata: {
          ...(reviewTask.metadata || {}),
          execution_node_id: `${reviewTask.metadata?.execution_node_id || reviewTask.id}:still-validation`,
          execution_step_id: `${reviewTask.metadata?.execution_step_id || reviewTask.id}:still-validation`,
          production_step_id: "release-validation",
          production_step_index: Number(reviewTask.metadata?.production_step_index || 1) + 0.5,
          quality_gate: true,
          release_candidate: false,
          still_validation_for_task_id: reviewTask.id,
          still_finish_task_id: reviewTask.metadata.still_finish_task_id,
          semantic_review_task_id: reviewTask.id,
        },
      });
      created.push(validation);
    }

    return created;
  },
};
