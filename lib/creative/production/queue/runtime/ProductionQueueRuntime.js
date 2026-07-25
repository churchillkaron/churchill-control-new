import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

const SUCCESSFUL = ["COMPLETED", "APPROVED"];
const TERMINAL_FAILURE = ["FAILED", "SKIPPED"];

function dependencyState(taskMap, dependencyId) {
  const task = taskMap.get(dependencyId);
  if (!task) return "MISSING";
  if (SUCCESSFUL.includes(task.status)) return "SUCCESS";
  if (TERMINAL_FAILURE.includes(task.status)) return "FAILED";
  return "PENDING";
}

function dependencyDecision(task, taskMap) {
  const dependencies = task.depends_on || [];
  const states = dependencies.map((id) => dependencyState(taskMap, id));
  const allowFailed = task.metadata?.allow_failed_dependencies === true;

  return {
    ready: states.every((state) => state === "SUCCESS" || (allowFailed && state === "FAILED")),
    blockedByFailure: !allowFailed && states.some((state) => state === "FAILED"),
    blockedByMissing: states.some((state) => state === "MISSING"),
  };
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
      const dependency = dependencyDecision(task, map);
      const retryDue = !task.next_attempt_at || new Date(task.next_attempt_at) <= new Date();

      if (dependency.blockedByFailure || dependency.blockedByMissing) {
        blocked.push({
          ...task,
          blocked_reason: dependency.blockedByFailure
            ? "FAILED_DEPENDENCY"
            : "MISSING_DEPENDENCY",
        });
        continue;
      }

      if (
        (task.status === "WAITING" || task.status === "PLANNED" || task.status === "READY") &&
        dependency.ready && retryDue
      ) {
        ready.push(task);
        continue;
      }

      switch (task.status) {
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

  async dispatchAll(input, { maxTasks = 100, worker_id = null } = {}) {
    const dispatched = [];

    while (dispatched.length < maxTasks) {
      const next = await this.dispatchNext(input, { worker_id });
      if (!next) break;
      dispatched.push(next);
    }

    return { dispatched, total: dispatched.length };
  },

  async dispatchNext(input, { worker_id = null } = {}) {
    const queue = await this.build(input);
    if (!queue.ready.length) return null;

    for (const candidate of [...queue.ready].sort(
      (a, b) => Number(a.priority || 100) - Number(b.priority || 100),
    )) {
      const claimed = await ProductionTaskRuntime.dispatch(candidate.id, { worker_id });
      if (claimed) return claimed;
    }

    return null;
  },
};
