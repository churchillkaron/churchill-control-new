import {
  CreativeDirectorRuntime,
} from "@/lib/creative/director/runtime/CreativeDirectorRuntime";
import {
  CreativeProjectRuntime,
} from "@/lib/creative/projects/runtime/CreativeProjectRuntime";

async function runProject(input = {}) {
  if (!input.organization_id) throw new Error("organization_id required");
  if (!input.creative_project_id) throw new Error("creative_project_id required");

  const project = await CreativeProjectRuntime.get(input.creative_project_id);
  if (!project || project.organization_id !== input.organization_id) {
    throw new Error("Creative project not found");
  }

  const creative_mission_id =
    input.creative_mission_id ||
    input.mission_id ||
    project.creative_mission_id ||
    null;
  if (!creative_mission_id) throw new Error("creative_mission_id required");

  return CreativeDirectorRuntime.execute({
    ...input,
    creative_mission_id,
  });
}

async function runTasks(tasks = []) {
  const results = [];
  for (const task of tasks) {
    if (!task) continue;
    try {
      const result = task.creative_project_id
        ? await runProject(task)
        : null;
      results.push({
        task_id: task.id || null,
        status: result?.success === false ? "failed" : "completed",
        result,
      });
    } catch (error) {
      results.push({
        task_id: task.id || null,
        status: "failed",
        error: error?.message || String(error),
      });
    }
  }
  return results;
}

export async function CreativeOrchestrationWorker(tasks = []) {
  return runTasks(tasks);
}

CreativeOrchestrationWorker.runProject = runProject;
CreativeOrchestrationWorker.runTasks = runTasks;
