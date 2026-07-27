import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  CreativeFinalisationRouter,
} from "@/lib/creative/finalisation/runtime/CreativeFinalisationRouter";
import {
  CreativeDocumentProductionRuntime,
} from "@/lib/creative/documents/runtime/CreativeDocumentProductionRuntime";
import {
  CreativeStillFinishingRuntime,
} from "@/lib/creative/stills/runtime/CreativeStillFinishingRuntime";
import {
  StillValidationTaskRuntime,
} from "@/lib/creative/stills/runtime/StillValidationTaskRuntime";
import {
  creativeStorageReference,
  signCreativeStorageReference,
} from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";
import {
  stillOutputUrl,
} from "@/lib/creative/stills/runtime/StillDesignContractRuntime";

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

function localStillOperation(task = {}) {
  const capability = String(task.capability || task.service_code || "").trim();
  if (capability === "creative.still.finish") return "finish";
  if (capability === "creative.still.validate") return "validate";
  const workflow = String(task.metadata?.workflow_kind || "").toUpperCase();
  const step = String(task.metadata?.production_step_id || "").toLowerCase();
  if (workflow === "STILL" && step === "finish") return "finish";
  if (workflow === "STILL" && step === "release-validation") return "validate";
  return null;
}

function isStillQualityTask(task = {}) {
  const workflow = String(task.metadata?.workflow_kind || "").toUpperCase();
  const step = String(task.metadata?.production_step_id || "").toLowerCase();
  const capability = String(task.capability || task.service_code || "").toLowerCase();
  return workflow === "STILL" &&
    (step === "quality" || step === "semantic-review" || capability.includes("image.analyze"));
}

async function ensureStillFinishTask(qualityTask) {
  const tasks = await ProductionTaskRuntime.list({
    organization_id: qualityTask.organization_id,
    creative_project_id: qualityTask.creative_project_id,
  });
  let finish = tasks.find((task) =>
    task.metadata?.still_finish_for_task_id === qualityTask.id,
  ) || null;

  if (!finish) {
    finish = await ProductionTaskRuntime.create({
      organization_id: qualityTask.organization_id,
      creative_project_id: qualityTask.creative_project_id,
      production_graph_id: qualityTask.production_graph_id,
      type: "EXECUTE_CAPABILITY",
      status: "WAITING",
      title: `Finish ${qualityTask.title || "still deliverable"}`,
      description: "Apply exact brand assets, deterministic typography, legal copy and requested channel variants before semantic review.",
      service_id: "creative.still.finish",
      service_code: "creative.still.finish",
      capability: "creative.still.finish",
      priority: Math.max(0, Number(qualityTask.priority || 100) - 1),
      depends_on: Array.isArray(qualityTask.depends_on) ? qualityTask.depends_on : [],
      input: {
        ...(qualityTask.input || {}),
        output_spec:
          qualityTask.metadata?.requirements?.output_spec ||
          qualityTask.input?.requirements?.output_spec ||
          qualityTask.input?.output_spec ||
          qualityTask.metadata?.output_spec ||
          {},
      },
      cost: {
        estimated: 0,
        actual: 0,
        currency: qualityTask.cost?.currency || null,
        approved: true,
      },
      timing: {
        estimated_seconds: 0,
      },
      review: {
        required: false,
        approved: false,
      },
      metadata: {
        ...(qualityTask.metadata || {}),
        output_spec:
          qualityTask.metadata?.requirements?.output_spec ||
          qualityTask.metadata?.output_spec ||
          {},
        execution_node_id: `${qualityTask.metadata?.execution_node_id || qualityTask.id}:still-finish`,
        execution_step_id: `${qualityTask.metadata?.execution_step_id || qualityTask.id}:still-finish`,
        production_step_id: "finish",
        production_step_index: Number(qualityTask.metadata?.production_step_index || 1) - 0.5,
        quality_gate: false,
        release_candidate: true,
        still_finish_for_task_id: qualityTask.id,
      },
    });
  }

  await ProductionTaskRuntime.update(qualityTask.id, {
    depends_on: [finish.id],
    metadata: {
      ...(qualityTask.metadata || {}),
      still_finish_task_id: finish.id,
      release_candidate: false,
    },
  });
  return finish;
}

async function bindFinishedStillForReview(task) {
  const finishId = task.metadata?.still_finish_task_id;
  if (!finishId) return task;
  const finish = await ProductionTaskRuntime.get(finishId);
  if (!finish || finish.status !== "COMPLETED") {
    throw new Error("CREATIVE_STILL_FINISH_NOT_COMPLETED");
  }
  const privateUrl = stillOutputUrl(finish.output);
  if (!privateUrl) throw new Error("CREATIVE_STILL_FINISHED_URL_REQUIRED");
  const reviewUrl = creativeStorageReference(privateUrl)
    ? await signCreativeStorageReference({
        organization_id: task.organization_id,
        reference: privateUrl,
      })
    : privateUrl;
  return ProductionTaskRuntime.update(task.id, {
    input: {
      ...(task.input || {}),
      image: reviewUrl,
      media: reviewUrl,
      source: reviewUrl,
      assets: [{ url: reviewUrl, role: "finished_still" }],
      finished_still: {
        task_id: finish.id,
        private_url: privateUrl,
        review_url: reviewUrl,
        variants: finish.output?.output?.variants || finish.output?.variants || [],
      },
    },
    metadata: {
      ...(task.metadata || {}),
      still_finish_review_bound: true,
    },
  });
}

async function dispatchCreativeTask(task) {
  const documentOperation = localDocumentOperation(task);
  if (documentOperation) {
    try {
      const output = documentOperation === "render"
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

  const stillOperation = localStillOperation(task);
  if (stillOperation) {
    try {
      const output = stillOperation === "finish"
        ? await CreativeStillFinishingRuntime.finish(task)
        : await CreativeStillFinishingRuntime.validate(task);
      return ProductionTaskRuntime.complete(task.id, {
        provider: "avantiqo-local-still-worker",
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

      const validations = await StillValidationTaskRuntime.ensure(input);
      if (validations.length) progressed = true;

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
    let next = [...queue.ready].sort(
      (a, b) => Number(a.priority || 100) - Number(b.priority || 100),
    )[0];

    if (isStillQualityTask(next) && !next.metadata?.still_finish_task_id) {
      const finish = await ensureStillFinishTask(next);
      await ProductionTaskRuntime.markReady(finish.id);
      return dispatchCreativeTask(finish);
    }
    if (isStillQualityTask(next) && next.metadata?.still_finish_task_id) {
      next = await bindFinishedStillForReview(next);
    }

    await ProductionTaskRuntime.markReady(next.id);
    return dispatchCreativeTask(next);
  },
};
