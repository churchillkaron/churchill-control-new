import { ProductionTaskRuntime } from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  campaignQualityPass,
  isCampaignQualityTask,
  latestCampaignTask,
} from "./CampaignPackagingContractRuntime";

function text(value) {
  return String(value ?? "").trim();
}

export const CampaignValidationTaskRuntime = {
  async ensure({ organization_id, creative_project_id } = {}) {
    const tasks = await ProductionTaskRuntime.list({ organization_id, creative_project_id });
    const coherence = latestCampaignTask(tasks, (task) =>
      task.status === "COMPLETED" &&
      text(task.metadata?.workflow_kind).toUpperCase() === "CAMPAIGN_SYSTEM" &&
      !text(task.metadata?.deliverable_id) &&
      isCampaignQualityTask(task) &&
      task.metadata?.production_step_id !== "release-validation",
    );
    if (!coherence || !campaignQualityPass(coherence.output)) return [];
    const existing = tasks.find((task) =>
      task.metadata?.campaign_validation_for_task_id === coherence.id,
    );
    if (existing) return [];
    const validation = await ProductionTaskRuntime.create({
      organization_id,
      creative_project_id,
      production_graph_id: coherence.production_graph_id,
      type: "QUALITY_REVIEW",
      status: "WAITING",
      title: "Validate campaign release package",
      description: "Verify package checksums, manifest completeness, quality approvals and campaign coherence before authenticated release.",
      service_id: "creative.campaign.validate",
      service_code: "creative.campaign.validate",
      capability: "creative.campaign.validate",
      priority: Number(coherence.priority || 100) + 1,
      depends_on: [coherence.id],
      input: {},
      cost: {
        estimated: 0,
        actual: 0,
        currency: coherence.cost?.currency || null,
        approved: true,
      },
      timing: { estimated_seconds: 0 },
      review: { required: false, approved: false },
      metadata: {
        ...(coherence.metadata || {}),
        execution_node_id: `${coherence.metadata?.execution_node_id || coherence.id}:campaign-validation`,
        execution_step_id: `${coherence.metadata?.execution_step_id || coherence.id}:campaign-validation`,
        production_step_id: "release-validation",
        production_step_index: Number(coherence.metadata?.production_step_index || 100) + 1,
        quality_gate: true,
        release_candidate: false,
        campaign_validation_for_task_id: coherence.id,
        campaign_package_task_id: coherence.metadata?.campaign_package_task_id || null,
      },
    });
    return [validation];
  },
};
