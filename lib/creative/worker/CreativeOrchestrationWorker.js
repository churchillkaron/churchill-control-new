import {
  CreativeDirectorRuntime,
} from "@/lib/creative/director/runtime/CreativeDirectorRuntime";

async function runProject(input = {}) {
  if (!input.organization_id) throw new Error("organization_id required");
  if (!input.creative_project_id) throw new Error("creative_project_id required");
  return CreativeDirectorRuntime.execute(input);
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
        error: error.message,
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
