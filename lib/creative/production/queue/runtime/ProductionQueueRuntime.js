import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  CreativeFinalisationRouter,
} from "@/lib/creative/finalisation/runtime/CreativeFinalisationRouter";
import {
  CreativeDocumentProductionRuntime,
} from "@/lib/creative/documents/runtime/CreativeDocumentProductionRuntime";

function dependencyComplete(taskMap, dependencyId) {
  const task = taskMap.get(dependencyId);
  return task?.status === "COMPLETED";
}

function dependencyFailed(taskMap, dependencyId) {
  const task = taskMap.get(dependencyId);
  return task?.status === "FAILED" || task?.status === "SKIPPED";
}

function hasPendingProviderJob(task = {}) {
  return Boolean(
    task.status === "RUNNING" &&
    (
      task.output?.provider_job_id ||
      task.output?.provider_submission?.provider_job_id ||
      task.output?.provider_submission?.output?.provider_job_id ||
      task.output?.provider_submission?.output?.output?.provider_job_id
    )
  );
}

function localDocumentOperation(task = {}) {
  const capability = String(task.capability || task.service_code || "").trim();
  if (capability === "creative.document.render") return "render";
  if (capability === "creative.document.validate") return "validate";
  const workflow = String(task.metadata?.workflow_kind || "").toUpperCase();
  const step = String(task.metadata?.production_step_id || "").toLowerCase();
  if (workflow === "DOCUMENT" && step === "assemble") return "render";
  if (workflow === "DOCUMENT" && step === "quality") return "validate";
  return null;
}

async function dispatchCreativeTask(task) {
  const operation = localDocumentOperation(task);
  if (operation) {
    try {
      const output = operation === "render"
        ? await CreativeDocumentProductionRuntime.render(task)
        : await CreativeDocumentProductionRuntime.validate(task);
      return ProductionTaskRuntime.complete(task.id, {
        provider: "avantiqo-local-document-worker",
        settlement: "LOCAL_EXECUTION",
        output,
      });
    } catch (error) {
      return ProductionTaskRuntime.fail(task.id, error);
    }
  }
  return ProductionTaskRuntime.dispatch(task.id);
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

  async pollRunning(input, { maxTasks = 100 } = {}) {
    const queue = await this.build(input);
    const pending = queue.running
      .filter(hasPendingProviderJob)
      .slice(0, maxTasks);
    const polled = [];

    for (const task of pending) {
      polled.push(await ProductionTaskRuntime.poll(task.id));
    }

    return {
      polled,
      total: polled.length,
    };
  },

  async dispatchAll(input, {
    maxTasks = 100,
    maxPasses = 100,
    runPostProduction = true,
    pollRunning = true,
  } = {}) {
    const dispatched = [];
    const polled = [];
    let passes = 0;

    while (passes < maxPasses && dispatched.length < maxTasks) {
      passes += 1;
      let progressed = false;

      if (pollRunning) {
        const pollResult = await this.pollRunning(input, {
          maxTasks: Math.max(0, maxTasks - polled.length),
        });
        if (pollResult.total) {
          polled.push(...pollResult.polled);
          progressed = true;
        }
      }

      const next = await this.dispatchNext(input);
      if (next) {
        dispatched.push(next);
        progressed = true;
      }

      if (!progressed) break;
    }

    const queue = await this.build(input);
    let finalisation = null;
    const settled =
      queue.total > 0 &&
      queue.ready.length === 0 &&
      queue.running.length === 0 &&
      queue.waiting.length === 0;

    if (runPostProduction && settled && !queue.failed.length && !queue.blocked.length) {
      finalisation = await CreativeFinalisationRouter.run(input);
    }

    return {
      dispatched,
      polled,
      total: dispatched.length,
      poll_total: polled.length,
      passes,
      queue,
      finalisation,
      post_production: finalisation,
    };
  },

  async dispatchNext(input) {
    const queue = await this.build(input);
    if (!queue.ready.length) return null;
    const next = [...queue.ready].sort(
      (a, b) => Number(a.priority || 100) - Number(b.priority || 100),
    )[0];
    await ProductionTaskRuntime.markReady(next.id);
    return dispatchCreativeTask(next);
  },
};
