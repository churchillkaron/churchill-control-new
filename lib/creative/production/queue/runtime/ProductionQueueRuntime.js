import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  CreativePostProductionRuntime,
} from "@/lib/creative/post-production/runtime/CreativePostProductionRuntime";

function dependencyComplete(taskMap, dependencyId) {
  const task = taskMap.get(dependencyId);
  return task?.status === "COMPLETED";
}

function dependencyFailed(taskMap, dependencyId) {
  const task = taskMap.get(dependencyId);
  return task?.status === "FAILED" || task?.status === "SKIPPED";
}

export const ProductionQueueRuntime = {
  async build({ organization_id, creative_project_id }) {
    const tasks = await ProductionTaskRuntime.list({
      organization_id,
      creative_project_id,
    });
    const map = new Map(tasks.map((task) => [task.id, task]));
    const waiting = [];
    const ready = [];
    const running = [];
    const review = [];
    const completed = [];
    const failed = [];
    const blocked = [];

    for (const task of tasks) {
      const dependencies = task.depends_on || [];
      const hasFailedDependency = dependencies.some((id) => dependencyFailed(map, id));
      const canRun = dependencies.every((id) => dependencyComplete(map, id));

      if (hasFailedDependency && !["COMPLETED", "FAILED"].includes(task.status)) {
        blocked.push(task);
        continue;
      }

      if ((task.status === "WAITING" || task.status === "PLANNED") && canRun) {
        ready.push(task);
        continue;
      }

      switch (task.status) {
        case "READY":
          ready.push(task);
          break;
        case "RUNNING":
          running.push(task);
          break;
        case "REVIEW":
          review.push(task);
          break;
        case "COMPLETED":
          completed.push(task);
          break;
        case "FAILED":
          failed.push(task);
          break;
        default:
          waiting.push(task);
      }
    }

    return {
      waiting,
      ready,
      running,
      review,
      completed,
      failed,
      blocked,
      total: tasks.length,
    };
  },

  async dispatchAll(input, { maxTasks = 100, runPostProduction = true } = {}) {
    const dispatched = [];
    while (dispatched.length < maxTasks) {
      const next = await this.dispatchNext(input);
      if (!next) break;
      dispatched.push(next);
    }

    const queue = await this.build(input);
    let postProduction = null;
    const settled =
      queue.total > 0 &&
      queue.ready.length === 0 &&
      queue.running.length === 0 &&
      queue.waiting.length === 0;

    if (runPostProduction && settled && !queue.failed.length && !queue.blocked.length) {
      postProduction = await CreativePostProductionRuntime.run(input);
    }

    return {
      dispatched,
      total: dispatched.length,
      queue,
      post_production: postProduction,
    };
  },

  async dispatchNext(input) {
    const queue = await this.build(input);
    if (!queue.ready.length) return null;
    const next = [...queue.ready].sort(
      (a, b) => Number(a.priority || 100) - Number(b.priority || 100),
    )[0];
    await ProductionTaskRuntime.markReady(next.id);
    return ProductionTaskRuntime.dispatch(next.id);
  },
};
