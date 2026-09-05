import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  CreativeFinalisationRouter,
} from "@/lib/creative/finalisation/runtime/CreativeFinalisationRouter";
import {
  CreativeAutonomousRepairDirectorRuntime,
} from "@/lib/creative/quality/runtime/CreativeAutonomousRepairDirectorRuntime";
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
  WebsiteValidationTaskRuntime,
} from "@/lib/creative/web/runtime/WebsiteValidationTaskRuntime";
import {
  bindWebsiteScreenshotForReview,
  dispatchWebsiteTask,
  isWebsiteQualityTask,
  localWebsiteOperation,
} from "@/lib/creative/web/runtime/WebsiteQueueRuntime";
import {
  SoftwareValidationTaskRuntime,
} from "@/lib/creative/software/runtime/SoftwareValidationTaskRuntime";
import {
  bindSoftwareEvidenceForReview,
  dispatchSoftwareTask,
  isSoftwareQualityTask,
  localSoftwareOperation,
} from "@/lib/creative/software/runtime/SoftwareQueueRuntime";
import {
  AudioValidationTaskRuntime,
} from "@/lib/creative/audio/runtime/AudioValidationTaskRuntime";
import {
  bindAudioEvidenceForReview,
  dispatchAudioTask,
  ensureAudioFinishTask,
  isAudioQualityTask,
  localAudioOperation,
} from "@/lib/creative/audio/runtime/AudioQueueRuntime";
import {
  CampaignValidationTaskRuntime,
} from "@/lib/creative/campaign/runtime/CampaignValidationTaskRuntime";
import {
  bindCampaignPackageForReview,
  dispatchCampaignTask,
  ensureCampaignPackageTask,
  isCampaignCoherenceTask,
  localCampaignOperation,
  routeCampaignTask,
} from "@/lib/creative/campaign/runtime/CampaignQueueRuntime";
import {
  creativeStorageReference,
  signCreativeStorageReference,
} from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";
import {
  stillOutputUrl,
} from "@/lib/creative/stills/runtime/StillDesignContractRuntime";
import {
  CREATIVE_VIDEO_MASTERED_CAPABILITIES,
} from "@/lib/creative/video/runtime/CreativeVideoProductionReadinessRuntime";

function supersessionId(task = {}) {
  return (
    task.metadata?.superseded_by_repair_review_task_id ||
    task.metadata?.superseded_by_repair_task_id ||
    null
  );
}

function effectiveTask(taskMap, taskOrId, seen = new Set()) {
  const task = typeof taskOrId === "string" ? taskMap.get(taskOrId) : taskOrId;
  if (!task || seen.has(task.id)) return task || null;
  seen.add(task.id);
  const replacementId = supersessionId(task);
  return replacementId ? effectiveTask(taskMap, replacementId, seen) : task;
}

function dependencyComplete(taskMap, dependencyId) {
  return effectiveTask(taskMap, dependencyId)?.status === "COMPLETED";
}

function dependencyFailed(taskMap, dependencyId) {
  const status = effectiveTask(taskMap, dependencyId)?.status;
  return status === "FAILED" || status === "SKIPPED";
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

function productionCapability(task = {}) {
  return String(task.capability || task.service_code || "").trim().toLowerCase();
}

function isMasteredNativeVideoTask(task = {}) {
  return CREATIVE_VIDEO_MASTERED_CAPABILITIES.has(productionCapability(task));
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
  let finish = tasks.find((task) => task.metadata?.still_finish_for_task_id === qualityTask.id) || null;
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
      timing: { estimated_seconds: 0 },
      review: { required: false, approved: false },
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
  const routed = routeCampaignTask(task);
  const documentOperation = localDocumentOperation(routed);
  if (documentOperation) {
    try {
      const output = documentOperation === "render"
        ? await CreativeDocumentProductionRuntime.render(routed)
        : await CreativeDocumentProductionRuntime.validate(routed);
      return ProductionTaskRuntime.complete(routed.id, {
        provider: "avantiqo-local-document-worker",
        settlement: "LOCAL_EXECUTION",
        output,
      });
    } catch (error) {
      return ProductionTaskRuntime.fail(routed.id, error);
    }
  }

  const stillOperation = localStillOperation(routed);
  if (stillOperation) {
    try {
      const output = stillOperation === "finish"
        ? await CreativeStillFinishingRuntime.finish(routed)
        : await CreativeStillFinishingRuntime.validate(routed);
      return ProductionTaskRuntime.complete(routed.id, {
        provider: "avantiqo-local-still-worker",
        settlement: "LOCAL_EXECUTION",
        output,
      });
    } catch (error) {
      return ProductionTaskRuntime.fail(routed.id, error);
    }
  }

  if (localWebsiteOperation(routed)) return dispatchWebsiteTask(routed);
  if (localSoftwareOperation(routed)) return dispatchSoftwareTask(routed);
  if (localAudioOperation(routed)) return dispatchAudioTask(routed);
  if (localCampaignOperation(routed)) return dispatchCampaignTask(routed);
  return ProductionTaskRuntime.dispatch(routed.id);
}

export const ProductionQueueRuntime = {
  async build({ organization_id, creative_project_id }) {
    const tasks = await ProductionTaskRuntime.list({ organization_id, creative_project_id });
    const map = new Map(tasks.map((task) => [task.id, task]));
    const active = tasks.filter((task) => !supersessionId(task));
    const queue = {
      waiting: [],
      ready: [],
      running: [],
      review: [],
      completed: [],
      failed: [],
      blocked: [],
      superseded: tasks.filter((task) => supersessionId(task)),
      total: active.length,
      historical_total: tasks.length,
    };

    for (const task of active) {
      const dependencies = task.depends_on || [];
      const hasFailedDependency = dependencies.some((id) => dependencyFailed(map, id));
      const canRun = dependencies.every((id) => dependencyComplete(map, id));
      if (hasFailedDependency && !["COMPLETED", "FAILED"].includes(task.status)) {
        queue.blocked.push(task);
      } else if (["WAITING", "PLANNING", "PLANNED"].includes(task.status) && canRun) {
        queue.ready.push(task);
      } else {
        const group = {
          READY: "ready",
          RUNNING: "running",
          REVIEW: "review",
          COMPLETED: "completed",
          FAILED: "failed",
          SKIPPED: "failed",
        }[task.status] || "waiting";
        queue[group].push(task);
      }
    }
    return queue;
  },

  async pollRunning(input, { maxTasks = 100 } = {}) {
    const queue = await this.build(input);
    const pending = queue.running.filter(hasPendingProviderJob).slice(0, maxTasks);
    const polled = [];
    for (const task of pending) polled.push(await ProductionTaskRuntime.poll(task.id));
    return { polled, total: polled.length };
  },

  async dispatchAll(input, {
    maxTasks = 100,
    maxPasses = 100,
    runPostProduction = true,
    pollRunning = true,
  } = {}) {
    const dispatched = [];
    const polled = [];
    const repairs = [];
    const repairBlocks = [];
    const initialQueue = await this.build(input);
    const masteredVideoRunningAtStart = initialQueue.running.filter(isMasteredNativeVideoTask);
    let masteredVideoLaneClaimed = masteredVideoRunningAtStart.length > 0;
    let masteredVideoDispatchedTaskId = null;
    let passes = 0;

    while (passes < maxPasses && dispatched.length < maxTasks) {
      passes += 1;
      let progressed = false;

      const repair = await CreativeAutonomousRepairDirectorRuntime.ensure(input);
      if (repair.created.length) {
        repairs.push(...repair.created);
        progressed = true;
      }
      if (repair.blocked.length) repairBlocks.push(...repair.blocked);

      const validations = await Promise.all([
        StillValidationTaskRuntime.ensure(input),
        WebsiteValidationTaskRuntime.ensure(input),
        SoftwareValidationTaskRuntime.ensure(input),
        AudioValidationTaskRuntime.ensure(input),
        CampaignValidationTaskRuntime.ensure(input),
      ]);
      if (validations.some((items) => items.length)) progressed = true;

      if (pollRunning) {
        const pollResult = await this.pollRunning(input, {
          maxTasks: Math.max(0, maxTasks - polled.length),
        });
        if (pollResult.total) {
          polled.push(...pollResult.polled);
          progressed = true;
        }
      }

      const next = await this.dispatchNext(input, {
        skipMasteredVideo: masteredVideoLaneClaimed,
      });
      if (next) {
        dispatched.push(next);
        progressed = true;
        if (isMasteredNativeVideoTask(next)) {
          masteredVideoLaneClaimed = true;
          masteredVideoDispatchedTaskId = next.id || masteredVideoDispatchedTaskId;
        }
      }
      if (!progressed) break;
    }

    const queue = await this.build(input);
    let finalisation = null;
    const settled = queue.total > 0 &&
      queue.ready.length === 0 &&
      queue.running.length === 0 &&
      queue.waiting.length === 0;
    if (runPostProduction && settled && !queue.failed.length && !queue.blocked.length) {
      finalisation = await CreativeFinalisationRouter.run(input);
    }
    return {
      dispatched,
      polled,
      repairs,
      repair_blocks: repairBlocks,
      total: dispatched.length,
      poll_total: polled.length,
      repair_total: repairs.length,
      passes,
      queue,
      finalisation,
      post_production: finalisation,
      dispatch_policy: {
        mastered_native_video_serialized: true,
        mastered_native_video_running_at_start:
          masteredVideoRunningAtStart.map((task) => task.id),
        mastered_native_video_dispatched_task_id:
          masteredVideoDispatchedTaskId,
        mastered_native_video_dispatch_count:
          dispatched.filter(isMasteredNativeVideoTask).length,
      },
    };
  },

  async dispatchNext(input, { skipMasteredVideo = false } = {}) {
    const queue = await this.build(input);
    const eligible = skipMasteredVideo
      ? queue.ready.filter((task) => !isMasteredNativeVideoTask(task))
      : queue.ready;
    if (!eligible.length) return null;

    let next = [...eligible].sort(
      (left, right) => Number(left.priority || 100) - Number(right.priority || 100),
    )[0];
    next = routeCampaignTask(next);

    if (isStillQualityTask(next) && !next.metadata?.still_finish_task_id) {
      const finish = await ensureStillFinishTask(next);
      await ProductionTaskRuntime.markReady(finish.id);
      return dispatchCreativeTask(finish);
    }
    if (isStillQualityTask(next) && next.metadata?.still_finish_task_id) {
      next = await bindFinishedStillForReview(next);
    }
    if (isWebsiteQualityTask(next)) next = await bindWebsiteScreenshotForReview(next);
    if (isSoftwareQualityTask(next)) next = await bindSoftwareEvidenceForReview(next);
    if (isAudioQualityTask(next) && !next.metadata?.audio_finish_task_id) {
      const finish = await ensureAudioFinishTask(next);
      await ProductionTaskRuntime.markReady(finish.id);
      return dispatchCreativeTask(finish);
    }
    if (isAudioQualityTask(next) && next.metadata?.audio_finish_task_id) {
      next = await bindAudioEvidenceForReview(next);
    }
    if (isCampaignCoherenceTask(next) && !next.metadata?.campaign_package_task_id) {
      const packageTask = await ensureCampaignPackageTask(next);
      const dependencies = packageTask.depends_on || [];
      const current = await this.build(input);
      const completedIds = new Set(current.completed.map((task) => task.id));
      if (dependencies.every((id) => completedIds.has(id))) {
        await ProductionTaskRuntime.markReady(packageTask.id);
        return dispatchCreativeTask(packageTask);
      }
      return null;
    }
    if (isCampaignCoherenceTask(next) && next.metadata?.campaign_package_task_id) {
      next = await bindCampaignPackageForReview(next);
    }

    await ProductionTaskRuntime.markReady(next.id);
    return dispatchCreativeTask(next);
  },
};