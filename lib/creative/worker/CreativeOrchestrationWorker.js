export async function CreativeOrchestrationWorker(tasks = []) {
  const results = [];

  for (const task of tasks) {
    if (!task) continue;

    results.push({
      task_id: task.id,
      status: "skipped"
    });
  }

  return results;
}
