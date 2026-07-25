import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

const TERMINAL = ["COMPLETED", "FAILED", "SKIPPED"];

function dependencyComplete(taskMap, dependencyId) {
  const task = taskMap.get(dependencyId);
  if (!task) return false;
  return TERMINAL.includes(task.status);
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

    for (const task of tasks) {
      const dependencies = task.depends_on || [];
      const canRun = dependencies.every((id) => dependencyComplete(map, id));

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
      total: tasks.length,
    };
  },

  async dispatchAll(input, { maxTasks = 100 } = {}) {
    const dispatched = [];

    while (dispatched.length < maxTasks) {
      const next = await this.dispatchNext(input);
      if (!next) break;
      dispatched.push(next);
    }

    return {
      dispatched,
      total: dispatched.length,
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
