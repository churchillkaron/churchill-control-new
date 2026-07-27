import { ProductionTaskRuntime } from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import { CreativeCampaignPackagingRuntime } from "./CreativeCampaignPackagingRuntime";
import {
  campaignStepIndex,
  isCampaignQualityTask,
  routeCampaignDeliverableTask,
  unwrapCampaignOutput,
} from "./CampaignPackagingContractRuntime";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function latestDeliverableQualityTasks(tasks = []) {
  const groups = new Map();
  for (const task of tasks) {
    const deliverableId = text(task.metadata?.deliverable_id);
    if (!deliverableId || !isCampaignQualityTask(task)) continue;
    if (!groups.has(deliverableId)) groups.set(deliverableId, []);
    groups.get(deliverableId).push(task);
  }
  return [...groups.values()].map((items) =>
    [...items].sort((left, right) => campaignStepIndex(right) - campaignStepIndex(left))[0],
  ).filter(Boolean);
}

export function localCampaignOperation(task = {}) {
  const capability = text(task.capability || task.service_code);
  if (capability === "creative.campaign.package") return "package";
  if (capability === "creative.campaign.validate") return "validate";
  return null;
}

export function isCampaignCoherenceTask(task = {}) {
  const workflow = text(task.metadata?.workflow_kind).toUpperCase();
  const step = text(task.metadata?.production_step_id).toLowerCase();
  return workflow === "CAMPAIGN_SYSTEM" &&
    !text(task.metadata?.deliverable_id) &&
    task.metadata?.quality_gate === true &&
    step !== "release-validation";
}

export async function dispatchCampaignTask(task) {
  const operation = localCampaignOperation(task);
  if (!operation) return null;
  try {
    const output = operation === "package"
      ? await CreativeCampaignPackagingRuntime.package(task)
      : await CreativeCampaignPackagingRuntime.validate(task);
    return ProductionTaskRuntime.complete(task.id, {
      provider: "avantiqo-local-campaign-worker",
      settlement: "LOCAL_EXECUTION",
      output,
    });
  } catch (error) {
    return ProductionTaskRuntime.fail(task.id, error);
  }
}

export async function ensureCampaignPackageTask(coherenceTask) {
  const tasks = await ProductionTaskRuntime.list({
    organization_id: coherenceTask.organization_id,
    creative_project_id: coherenceTask.creative_project_id,
  });
  const validatedDependencies = latestDeliverableQualityTasks(tasks);
  if (!validatedDependencies.length) {
    throw new Error("CREATIVE_CAMPAIGN_VALIDATED_DELIVERABLES_REQUIRED");
  }
  let packageTask = tasks.find((task) =>
    task.metadata?.campaign_package_for_task_id === coherenceTask.id,
  ) || null;
  if (!packageTask) {
    packageTask = await ProductionTaskRuntime.create({
      organization_id: coherenceTask.organization_id,
      creative_project_id: coherenceTask.creative_project_id,
      production_graph_id: coherenceTask.production_graph_id,
      type: "EXECUTE_CAPABILITY",
      status: "WAITING",
      title: "Build campaign release package",
      description: "Collect only quality-approved real deliverables into one deterministic private campaign package and manifest.",
      service_id: "creative.campaign.package",
      service_code: "creative.campaign.package",
      capability: "creative.campaign.package",
      priority: Math.max(0, Number(coherenceTask.priority || 100) - 1),
      depends_on: validatedDependencies.map((task) => task.id),
      input: {
        ...(coherenceTask.input || {}),
      },
      cost: {
        estimated: 0,
        actual: 0,
        currency: coherenceTask.cost?.currency || null,
        approved: true,
      },
      timing: { estimated_seconds: 0 },
      review: { required: false, approved: false },
      metadata: {
        ...(coherenceTask.metadata || {}),
        execution_node_id: `${coherenceTask.metadata?.execution_node_id || coherenceTask.id}:campaign-package`,
        execution_step_id: `${coherenceTask.metadata?.execution_step_id || coherenceTask.id}:campaign-package`,
        production_step_id: "package",
        production_step_index: Number(coherenceTask.metadata?.production_step_index || 100) - 0.5,
        quality_gate: false,
        release_candidate: true,
        campaign_package_for_task_id: coherenceTask.id,
        validated_deliverable_task_ids: validatedDependencies.map((task) => task.id),
      },
    });
  }
  await ProductionTaskRuntime.update(coherenceTask.id, {
    depends_on: [packageTask.id],
    metadata: {
      ...(coherenceTask.metadata || {}),
      campaign_package_task_id: packageTask.id,
      release_candidate: false,
    },
  });
  return packageTask;
}

export async function bindCampaignPackageForReview(task) {
  if (task.metadata?.campaign_package_review_bound) return task;
  const packageTaskId = task.metadata?.campaign_package_task_id;
  if (!packageTaskId) throw new Error("CREATIVE_CAMPAIGN_PACKAGE_TASK_REQUIRED");
  const packageTask = await ProductionTaskRuntime.get(packageTaskId);
  if (!packageTask || packageTask.status !== "COMPLETED") {
    throw new Error("CREATIVE_CAMPAIGN_PACKAGE_NOT_COMPLETED");
  }
  const output = unwrapCampaignOutput(packageTask.output);
  if (!output.package_url || !output.manifest_url || !output.manifest) {
    throw new Error("CREATIVE_CAMPAIGN_PACKAGE_EVIDENCE_REQUIRED");
  }
  const prompt = [
    task.input?.prompt || task.input?.provider_prompt || "Review this completed campaign package.",
    "Return only JSON with keys: passed, verdict, failed_checks, repair_instructions.",
    "Evaluate the campaign as one system: strategic coherence, brand consistency, factual truth, channel fitness, audience journey, duplication, naming, localisation, accessibility, legal requirements, handoff completeness and release readiness.",
    "Use the package manifest and per-deliverable quality evidence. Do not approve missing artifacts, contradictory messages, inconsistent identity, channel gaps, duplicate filler or deliverables that cannot operate together.",
  ].join("\n");
  return ProductionTaskRuntime.update(task.id, {
    input: {
      ...(task.input || {}),
      prompt,
      provider_prompt: prompt,
      campaign_package: {
        task_id: packageTask.id,
        package_url: output.package_url,
        manifest_url: output.manifest_url,
        checksum: output.checksum,
        manifest_checksum: output.manifest_checksum,
        deliverable_count: output.deliverable_count,
        manifest: output.manifest,
      },
    },
    metadata: {
      ...(task.metadata || {}),
      campaign_package_review_bound: true,
    },
  });
}

export function routeCampaignTask(task = {}) {
  return routeCampaignDeliverableTask(task);
}
