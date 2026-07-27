import { ProductionTaskRuntime } from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import { effectiveWorkflowKind } from "@/lib/creative/campaign/runtime/CampaignPackagingContractRuntime";

function text(value) { return String(value ?? "").trim(); }

export const AudioValidationTaskRuntime = {
  async ensure({ organization_id, creative_project_id }) {
    const tasks = await ProductionTaskRuntime.list({ organization_id, creative_project_id });
    const created = [];
    const qualities = tasks.filter((task) =>
      task.status === "COMPLETED" &&
      effectiveWorkflowKind(task) === "AUDIO" &&
      task.metadata?.quality_gate === true &&
      text(task.metadata?.production_step_id).toLowerCase() !== "release-validation",
    );
    for (const quality of qualities) {
      const finish = tasks.find((task) => task.id === quality.metadata?.audio_finish_task_id);
      if (!finish || finish.status !== "COMPLETED") continue;
      const existing = tasks.find((task) => task.metadata?.audio_validation_for_task_id === quality.id);
      if (existing) continue;
      created.push(await ProductionTaskRuntime.create({
        organization_id,
        creative_project_id,
        production_graph_id: quality.production_graph_id,
        type: "QUALITY_REVIEW",
        status: "WAITING",
        title: `Validate ${quality.title || "audio release"}`,
        description: "Verify the mastered audio, delivery evidence and semantic approval before release.",
        service_id: "creative.audio.validate",
        service_code: "creative.audio.validate",
        capability: "creative.audio.validate",
        priority: Number(quality.priority || 100) + 1,
        depends_on: [finish.id, quality.id],
        input: { output_spec: quality.input?.output_spec || quality.metadata?.output_spec || {} },
        cost: { estimated: 0, actual: 0, currency: quality.cost?.currency || null, approved: true },
        timing: { estimated_seconds: 0 },
        review: { required: true, approved: false },
        metadata: {
          ...(quality.metadata || {}),
          execution_node_id: `${quality.metadata?.execution_node_id || quality.id}:audio-validation`,
          execution_step_id: `${quality.metadata?.execution_step_id || quality.id}:audio-validation`,
          production_step_id: "release-validation",
          production_step_index: Number(quality.metadata?.production_step_index || 1) + 0.5,
          quality_gate: true,
          release_candidate: false,
          audio_validation_for_task_id: quality.id,
          audio_quality_task_id: quality.id,
          audio_finish_task_id: finish.id,
        },
      }));
    }
    return created;
  },
};
