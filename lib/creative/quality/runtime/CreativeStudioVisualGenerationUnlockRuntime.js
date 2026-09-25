import * as CreativeProjectRepository from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import { ProductionTaskRuntime } from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  unlockStudioVisualGenerationCertification,
} from "./CreativeStudioVisualReadinessCertificationRuntime";

function text(value) {
  return String(value ?? "").trim();
}

function visualGenerationTask(task = {}) {
  const capability = text(task.capability || task.service_code).toLowerCase();
  return capability.startsWith("ai.video.") || [
    "ai.image.generate",
    "ai.image.edit",
    "ai.image.inpaint",
    "ai.image.outpaint",
    "ai.image.upscale",
  ].includes(capability);
}

async function updateInBatches(tasks, certification, batchSize = 12) {
  const updated = [];
  for (let index = 0; index < tasks.length; index += batchSize) {
    const batch = tasks.slice(index, index + batchSize);
    const results = await Promise.all(batch.map((task) =>
      ProductionTaskRuntime.update(task.id, {
        metadata: {
          ...(task.metadata || {}),
          studio_visual_generation_certification: certification,
        },
      })
    ));
    updated.push(...results);
  }
  return updated;
}
export async function unlockStudioVisualGenerationForGraph({
  organization_id,
  creative_project_id,
  production_graph_id,
  certification,
  source = "USER_EXPLICIT_APPROVAL",
} = {}) {
  if (!organization_id) throw new Error("organization_id required");
  if (!creative_project_id) throw new Error("creative_project_id required");
  if (!production_graph_id) throw new Error("production_graph_id required");

  const project = await CreativeProjectRepository.getById(creative_project_id);
  if (!project || text(project.organization_id) !== text(organization_id)) {
    throw new Error("Creative project not found");
  }

  const unlocked = unlockStudioVisualGenerationCertification(certification, {
    source,
    scoped_project_id: creative_project_id,
  });

  await CreativeProjectRepository.update(creative_project_id, {
    metadata: {
      ...(project.metadata || {}),
      studio_visual_generation_certification: unlocked,
      studio_visual_generation_unlocked_at: unlocked.unlocked_at,
    },
  });

  const tasks = await ProductionTaskRuntime.list({
    organization_id,
    creative_project_id,
    production_graph_id,
  });
  const visualTasks = tasks.filter(visualGenerationTask);
  const updated = await updateInBatches(visualTasks, unlocked);
  return {
    contract: "AVANTIQO_STUDIO_VISUAL_GENERATION_GRAPH_UNLOCK_V1",
    creative_project_id,
    production_graph_id,
    unlocked_certification: unlocked,
    visual_task_count: visualTasks.length,
    updated_task_count: updated.length,
    provider_calls_executed: false,
    generation_spawned: false,
  };
}

export const CreativeStudioVisualGenerationUnlockRuntime = Object.freeze({
  unlockGraph: unlockStudioVisualGenerationForGraph,
});