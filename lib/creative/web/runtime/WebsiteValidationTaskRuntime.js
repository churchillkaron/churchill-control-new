import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  effectiveWorkflowKind,
} from "@/lib/creative/campaign/runtime/CampaignPackagingContractRuntime";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function isInteractiveQuality(task = {}) {
  const workflow = effectiveWorkflowKind(task);
  const step = String(task.metadata?.production_step_id || "").toLowerCase();
  const capability = String(task.capability || task.service_code || "").toLowerCase();
  return workflow === "INTERACTIVE" &&
    step !== "release-validation" &&
    (step === "quality" || step === "semantic-review" || capability.includes("image.analyze"));
}

function isWebsiteBuild(task = {}) {
  const workflow = effectiveWorkflowKind(task);
  const step = String(task.metadata?.production_step_id || "").toLowerCase();
  const capability = String(task.capability || task.service_code || "");
  return workflow === "INTERACTIVE" &&
    (step === "build" || capability === "creative.website.build");
}

export const WebsiteValidationTaskRuntime = {
  async ensure({ organization_id, creative_project_id } = {}) {
    if (!organization_id || !creative_project_id) return [];
    const tasks = await ProductionTaskRuntime.list({
      organization_id,
      creative_project_id,
    });
    const created = [];

    for (const quality of tasks.filter(isInteractiveQuality)) {
      if (quality.status !== "COMPLETED") continue;
      const existing = tasks.find((task) =>
        task.metadata?.website_validation_for_task_id === quality.id,
      );
      if (existing) continue;

      const dependencyIds = new Set(list(quality.depends_on));
      const build = tasks.find((task) =>
        isWebsiteBuild(task) &&
        task.status === "COMPLETED" &&
        (dependencyIds.has(task.id) || task.metadata?.deliverable_id === quality.metadata?.deliverable_id),
      );
      if (!build) continue;

      await ProductionTaskRuntime.update(build.id, {
        metadata: {
          ...(build.metadata || {}),
          release_candidate: true,
        },
      });
      await ProductionTaskRuntime.update(quality.id, {
        metadata: {
          ...(quality.metadata || {}),
          quality_gate: false,
          release_candidate: false,
          website_semantic_review: true,
        },
      });

      created.push(await ProductionTaskRuntime.create({
        organization_id,
        creative_project_id,
        production_graph_id: quality.production_graph_id,
        type: "EXECUTE_CAPABILITY",
        status: "WAITING",
        title: `Validate ${quality.title || "website deliverable"}`,
        description: "Require browser, accessibility, file-package and semantic-review evidence before website release.",
        service_id: "creative.website.validate",
        service_code: "creative.website.validate",
        capability: "creative.website.validate",
        priority: Number(quality.priority || 100) + 1,
        depends_on: [build.id, quality.id],
        input: {
          output_spec:
            build.input?.output_spec ||
            build.metadata?.output_spec ||
            quality.metadata?.requirements?.output_spec ||
            {},
        },
        cost: {
          estimated: 0,
          actual: 0,
          currency: quality.cost?.currency || null,
          approved: true,
        },
        timing: { estimated_seconds: 0 },
        review: { required: false, approved: false },
        metadata: {
          ...(quality.metadata || {}),
          execution_node_id: `${quality.metadata?.execution_node_id || quality.id}:website-validation`,
          execution_step_id: `${quality.metadata?.execution_step_id || quality.id}:website-validation`,
          production_step_id: "release-validation",
          production_step_index: Number(quality.metadata?.production_step_index || 100) + 1,
          quality_gate: true,
          release_candidate: false,
          website_validation_for_task_id: quality.id,
          website_build_task_id: build.id,
        },
      }));
    }

    return created;
  },
};
