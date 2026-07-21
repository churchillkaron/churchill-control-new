import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

import {
  ProductionQueueRuntime,
} from "@/lib/creative/production/queue/runtime/ProductionQueueRuntime";

import {
  CreativePostProductionRuntime,
} from "@/lib/creative/post-production/runtime/CreativePostProductionRuntime";

import {
  CreativeFinalRenderRuntime,
} from "@/lib/creative/post-production/runtime/CreativeFinalRenderRuntime";

function taskSnapshot(tasks = []) {
  return tasks
    .map((task) => `${task.id}:${task.status}:${task.metadata?.provider_status || ""}`)
    .sort()
    .join("|");
}

async function pollRunningTasks(tasks = []) {
  const results = [];

  for (const task of tasks) {
    results.push(
      await ProductionTaskRuntime.poll(task.id),
    );
  }

  return results;
}

async function runProject({
  organization_id,
  creative_project_id,
  max_cycles = 20,
} = {}) {
  if (!organization_id) {
    throw new Error("organization_id required");
  }

  if (!creative_project_id) {
    throw new Error("creative_project_id required");
  }

  const input = {
    organization_id,
    creative_project_id,
  };

  let previousSnapshot = null;
  let cycles = 0;
  let submissions = 0;
  let polls = 0;

  while (cycles < Number(max_cycles || 20)) {
    cycles += 1;

    const before = await ProductionTaskRuntime.list(input);
    const beforeSnapshot = taskSnapshot(before);
    const running = before.filter(
      (task) => task.status === "RUNNING",
    );

    if (running.length) {
      await pollRunningTasks(running);
      polls += running.length;
    }

    const dispatchResult = await ProductionQueueRuntime.dispatchAll(
      input,
      {
        maxDispatches: 100,
      },
    );

    submissions += dispatchResult.total;

    const after = await ProductionTaskRuntime.list(input);
    const afterSnapshot = taskSnapshot(after);
    const queue = await ProductionQueueRuntime.build(input);

    if (queue.terminal || queue.successful) {
      break;
    }

    if (
      dispatchResult.total === 0 &&
      afterSnapshot === beforeSnapshot
    ) {
      break;
    }

    if (
      previousSnapshot !== null &&
      previousSnapshot === afterSnapshot
    ) {
      break;
    }

    previousSnapshot = afterSnapshot;
  }

  const finalQueue = await ProductionQueueRuntime.build(input);
  const complete = finalQueue.successful;
  const postProduction = complete
    ? await CreativePostProductionRuntime.build(input)
    : null;
  const finalRender =
    postProduction?.status === "READY_FOR_ASSEMBLY"
      ? await CreativeFinalRenderRuntime.render({
          ...input,
          package_document: postProduction,
        })
      : null;

  return {
    success:
      finalQueue.failed.length === 0 &&
      finalQueue.blocked.length === 0,
    complete,
    processing: finalQueue.running.length,
    waiting: finalQueue.waiting.length,
    ready: finalQueue.ready.length,
    review: finalQueue.review.length,
    completed: finalQueue.completed.length,
    failed: finalQueue.failed.length,
    blocked: finalQueue.blocked.length,
    total: finalQueue.total,
    cycles,
    submissions,
    polls,
    queue: finalQueue,
    post_production: postProduction,
    final_render: finalRender,
  };
}

export async function CreativeOrchestrationWorker(tasks = []) {
  const results = [];

  for (const task of tasks || []) {
    if (!task?.id) continue;
    results.push(
      await ProductionTaskRuntime.dispatch(task.id),
    );
  }

  return results;
}

CreativeOrchestrationWorker.runProject = runProject;
