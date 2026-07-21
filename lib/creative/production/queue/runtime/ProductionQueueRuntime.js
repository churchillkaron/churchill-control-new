import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

const SUCCESSFUL_TERMINAL = [
  "COMPLETED",
  "APPROVED",
];

const FAILED_TERMINAL = [
  "FAILED",
  "SKIPPED",
];

function dependencyState(taskMap, dependencyId) {
  const task = taskMap.get(dependencyId);

  if (!task) {
    return {
      complete: false,
      failed: true,
      reason: "MISSING_DEPENDENCY",
    };
  }

  return {
    complete: SUCCESSFUL_TERMINAL.includes(task.status),
    failed: FAILED_TERMINAL.includes(task.status),
    reason: task.status,
  };
}

export const ProductionQueueRuntime = {
  async build({
    organization_id,
    creative_project_id,
  }) {
    const tasks = await ProductionTaskRuntime.list({
      organization_id,
      creative_project_id,
    });

    const taskMap = new Map(
      tasks.map((task) => [task.id, task]),
    );

    const waiting = [];
    const ready = [];
    const running = [];
    const review = [];
    const completed = [];
    const failed = [];
    const blocked = [];

    for (const task of tasks) {
      const dependencyStates = (task.depends_on || []).map(
        (dependencyId) => ({
          dependencyId,
          ...dependencyState(taskMap, dependencyId),
        }),
      );

      if (dependencyStates.some((state) => state.failed)) {
        blocked.push({
          ...task,
          blocked_by: dependencyStates.filter(
            (state) => state.failed,
          ),
        });
        continue;
      }

      const dependenciesComplete = dependencyStates.every(
        (state) => state.complete,
      );

      if (
        ["PLANNED", "WAITING"].includes(task.status) &&
        dependenciesComplete
      ) {
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
        case "APPROVED":
          completed.push(task);
          break;
        case "FAILED":
        case "SKIPPED":
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
      terminal:
        completed.length + failed.length === tasks.length,
      successful:
        tasks.length > 0 && completed.length === tasks.length,
    };
  },

  async dispatchAll(input, options = {}) {
    const dispatched = [];
    const maxDispatches = Number(options.maxDispatches || 100);

    while (dispatched.length < maxDispatches) {
      const next = await this.dispatchNext(input);
      if (!next) break;
      dispatched.push(next);
    }

    return {
      dispatched,
      total: dispatched.length,
      bounded: dispatched.length >= maxDispatches,
    };
  },

  async dispatchNext(input) {
    const queue = await this.build(input);

    if (!queue.ready.length) {
      return null;
    }

    const next = [...queue.ready].sort(
      (a, b) =>
        Number(a.priority || 100) -
        Number(b.priority || 100),
    )[0];

    await ProductionTaskRuntime.markReady(next.id);
    return ProductionTaskRuntime.dispatch(next.id);
  },
};
