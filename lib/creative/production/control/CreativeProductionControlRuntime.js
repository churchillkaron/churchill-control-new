import {
  CreativeProjectRuntime,
} from "@/lib/creative/projects/runtime/CreativeProjectRuntime";
import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  CreativeAssetGraphRuntime,
} from "@/lib/creative/assets/graph/runtime/CreativeAssetGraphRuntime";
import {
  resolveOrganizationCurrency,
} from "@/lib/platform/context/resolveOrganizationCurrency";
import {
  deriveCreativeProductionLifecycle,
} from "@/lib/creative/production/runtime/CreativeProductionLifecycleRuntime";

function asNumber(value, fallback = 0) {
  const resolved = Number(value);
  return Number.isFinite(resolved) ? resolved : fallback;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function isFilmProject(project = {}, tasks = []) {
  const productionType = String(project.production_type || "").toUpperCase();
  const medium = String(project.metadata?.creative_medium || "").toUpperCase();
  return (
    ["VIDEO", "FILM"].includes(productionType) ||
    ["VIDEO", "FILM"].includes(medium) ||
    tasks.some((task) =>
      ["GENERATE_VIDEO", "IMAGE_TO_VIDEO"].includes(String(task.type || "").toUpperCase()),
    )
  );
}

function releasePolicy(project = {}) {
  const configured = String(
    project.metadata?.release_policy?.mode ||
      project.metadata?.autonomous_execution?.release_mode ||
      "MANUAL",
  )
    .trim()
    .toUpperCase();
  const mode = ["AUTOMATIC", "AUTO_AFTER_AI_QA", "AUTO"].includes(configured)
    ? "AUTOMATIC"
    : "MANUAL";

  return {
    mode,
    human_release_required: mode !== "AUTOMATIC",
  };
}

function buildDescendantIds(tasks = [], rootTaskId) {
  const selected = new Set([rootTaskId]);
  let changed = true;

  while (changed) {
    changed = false;
    for (const task of tasks) {
      if (selected.has(task.id)) continue;
      const dependsOn = task.depends_on || [];
      if (dependsOn.some((dependencyId) => selected.has(dependencyId))) {
        selected.add(task.id);
        changed = true;
      }
    }
  }

  return selected;
}

function summarizeTasks(tasks = []) {
  const byStatus = {};
  const byType = {};
  let estimatedCost = 0;
  let actualCost = 0;

  for (const task of tasks) {
    byStatus[task.status] = (byStatus[task.status] || 0) + 1;
    byType[task.type] = (byType[task.type] || 0) + 1;
    estimatedCost += asNumber(task.cost?.estimated);
    actualCost += asNumber(task.cost?.actual);
  }

  return {
    total: tasks.length,
    by_status: byStatus,
    by_type: byType,
    estimated_cost: estimatedCost,
    actual_cost: actualCost,
  };
}

function resolveBudget(project = {}, organizationCurrency) {
  const metadata = project.metadata || {};
  const budget = metadata.production_budget || {};
  const configuredCurrency = String(organizationCurrency || "")
    .trim()
    .toUpperCase();

  if (!configuredCurrency) {
    throw new Error("ORGANIZATION_DEFAULT_CURRENCY_REQUIRED");
  }

  return {
    currency: configuredCurrency,
    maximum: asNumber(budget.maximum ?? metadata.maximum_production_cost, 0),
    approval_required_above: asNumber(budget.approval_required_above, 0),
    approved: budget.approved === true,
    approved_by: budget.approved_by || null,
  };
}

function taskHasDeliverableOutput(task = {}) {
  if (!["COMPLETED", "APPROVED"].includes(String(task.status || "").toUpperCase())) {
    return false;
  }
  return Boolean(
    task.output?.url ||
      task.output?.image_url ||
      task.output?.video_url ||
      task.output?.asset_id ||
      task.output?.result ||
      task.output?.provider_submission,
  );
}

function isQaTask(task = {}) {
  return (
    String(task.type || "").toUpperCase() === "QUALITY_REVIEW" ||
    String(task.metadata?.deliverable || "").toUpperCase().endsWith("_QA")
  );
}

function releasableAssetCount({ project, tasks, assets }) {
  if (isFilmProject(project, tasks)) {
    return assets.filter(
      (asset) =>
        asset.type === "FINAL_RENDER" &&
        asset.status === "APPROVED" &&
        asset.metadata?.delivery_status === "APPROVED_FOR_DELIVERY",
    ).length;
  }

  const generatedAssets = assets.filter(
    (asset) =>
      asset.production_task_id ||
      asset.lineage?.source === "production_task" ||
      ["GENERATED", "APPROVED"].includes(String(asset.status || "").toUpperCase()),
  ).length;
  const structuredOutputs = tasks.filter(
    (task) => !isQaTask(task) && taskHasDeliverableOutput(task),
  ).length;
  return generatedAssets + structuredOutputs;
}

export const CreativeProductionControlRuntime = {
  async snapshot({ organization_id, creative_project_id } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");

    const [project, tasks, assets, organizationCurrency] = await Promise.all([
      CreativeProjectRuntime.get(creative_project_id),
      ProductionTaskRuntime.list({ organization_id, creative_project_id }),
      CreativeAssetGraphRuntime.list({ organization_id, creative_project_id }),
      resolveOrganizationCurrency({ organization_id }),
    ]);

    if (!project) throw new Error("CREATIVE_PROJECT_NOT_FOUND");
    if (project.organization_id !== organization_id) {
      throw new Error("CREATIVE_PROJECT_ORGANIZATION_MISMATCH");
    }

    const taskSummary = summarizeTasks(tasks);
    const budget = resolveBudget(project, organizationCurrency);
    const projectedCost = Math.max(
      taskSummary.actual_cost,
      taskSummary.estimated_cost,
    );
    const exceedsMaximum = budget.maximum > 0 && projectedCost > budget.maximum;
    const requiresApproval =
      budget.approval_required_above > 0 &&
      projectedCost > budget.approval_required_above &&
      !budget.approved;
    const policy = releasePolicy(project);
    const humanReleased = project.metadata?.human_release?.approved === true;
    const releasableDeliverables = releasableAssetCount({ project, tasks, assets });

    const snapshot = {
      organization_id,
      creative_project_id,
      project_status: project.status,
      project_type: project.production_type,
      medium: project.metadata?.creative_medium || project.production_type,
      tasks: taskSummary,
      assets: {
        total: assets.length,
        releasable_deliverables: releasableDeliverables,
        approved_final_deliverables: releasableDeliverables,
      },
      budget: {
        ...budget,
        projected_cost: projectedCost,
        exceeds_maximum: exceedsMaximum,
        approval_required: requiresApproval,
        execution_allowed: !exceedsMaximum && !requiresApproval,
      },
      release: {
        mode: policy.mode,
        human_release_required: policy.human_release_required,
        human_released: policy.human_release_required ? humanReleased : false,
        automatic_release_enabled: policy.mode === "AUTOMATIC",
        released_by: project.metadata?.human_release?.approved_by || null,
        released_at: project.metadata?.human_release?.approved_at || null,
      },
      observed_at: new Date().toISOString(),
    };

    const lifecycle = deriveCreativeProductionLifecycle({
      project,
      tasks,
      control: snapshot,
    });

    return {
      ...snapshot,
      lifecycle,
      project_status: lifecycle.status,
    };
  },

  async assertExecutionAllowed(input = {}) {
    const snapshot = await this.snapshot(input);

    if (snapshot.budget.exceeds_maximum) {
      throw new Error("CREATIVE_PROJECT_BUDGET_EXCEEDED");
    }
    if (snapshot.budget.approval_required) {
      throw new Error("CREATIVE_PROJECT_BUDGET_APPROVAL_REQUIRED");
    }

    return snapshot;
  },

  async regenerateTaskSubtree({
    organization_id,
    creative_project_id,
    task_id,
    reason,
    requested_by = null,
  } = {}) {
    if (!task_id) throw new Error("task_id required");
    if (!reason?.trim()) throw new Error("regeneration reason required");

    const tasks = await ProductionTaskRuntime.list({
      organization_id,
      creative_project_id,
    });
    const root = tasks.find((task) => task.id === task_id);
    if (!root) throw new Error("PRODUCTION_TASK_NOT_FOUND");

    const selectedIds = buildDescendantIds(tasks, task_id);
    const selectedTasks = tasks.filter((task) => selectedIds.has(task.id));
    const resetAt = new Date().toISOString();

    for (const task of selectedTasks) {
      await ProductionTaskRuntime.update(
        task.id,
        {
          status: task.depends_on?.length ? "WAITING" : "PLANNED",
          output: {},
          error: null,
          review: {
            ...(task.review || {}),
            approved: false,
            approved_by: null,
            notes: "",
          },
          timing: {
            ...(task.timing || {}),
            started_at: null,
            completed_at: null,
          },
          metadata: {
            ...(task.metadata || {}),
            attempt: 0,
            provider_job_id: null,
            provider_status: null,
            regeneration: {
              root_task_id: task_id,
              reason,
              requested_by,
              requested_at: resetAt,
            },
          },
        },
        { organization_id, creative_project_id },
      );
    }

    return {
      success: true,
      root_task_id: task_id,
      reset_task_ids: selectedTasks.map((task) => task.id),
      reset_count: selectedTasks.length,
      reason,
      requested_by,
      requested_at: resetAt,
    };
  },

  async approveBudget({
    organization_id,
    creative_project_id,
    approved_by,
    maximum,
  } = {}) {
    if (!approved_by) throw new Error("approved_by required");

    const [project, organizationCurrency] = await Promise.all([
      CreativeProjectRuntime.get(creative_project_id),
      resolveOrganizationCurrency({ organization_id }),
    ]);
    if (!project) throw new Error("CREATIVE_PROJECT_NOT_FOUND");
    if (project.organization_id !== organization_id) {
      throw new Error("CREATIVE_PROJECT_ORGANIZATION_MISMATCH");
    }

    return CreativeProjectRuntime.update(creative_project_id, {
      metadata: {
        ...object(project.metadata),
        production_budget: {
          ...object(project.metadata?.production_budget),
          maximum: asNumber(maximum),
          currency: organizationCurrency,
          approved: true,
          approved_by,
          approved_at: new Date().toISOString(),
        },
      },
    });
  },

  async releaseDeliverables({
    organization_id,
    creative_project_id,
    approved_by,
    notes = "",
  } = {}) {
    if (!approved_by) throw new Error("approved_by required");

    const snapshot = await this.snapshot({
      organization_id,
      creative_project_id,
    });
    if (snapshot.assets.releasable_deliverables < 1) {
      throw new Error("NO_AI_APPROVED_FINAL_DELIVERABLES");
    }
    if (!snapshot.budget.execution_allowed) {
      throw new Error("CREATIVE_PROJECT_BUDGET_BLOCKED");
    }

    const project = await CreativeProjectRuntime.get(creative_project_id);
    const approvedAt = new Date().toISOString();
    const updated = await CreativeProjectRuntime.update(creative_project_id, {
      status: "QUALITY",
      metadata: {
        ...object(project.metadata),
        release_policy: {
          ...object(project.metadata?.release_policy),
          mode: "MANUAL",
          human_release_required: true,
        },
        human_release: {
          approved: true,
          approved_by,
          approved_at: approvedAt,
          notes,
        },
      },
    });

    return {
      success: true,
      creative_project_id,
      approved_by,
      approved_at: approvedAt,
      project: updated,
      publish_allowed: true,
    };
  },
};
