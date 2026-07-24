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
import {
  CreativePictureFinishingRuntime,
} from "@/lib/creative/post-production/runtime/CreativePictureFinishingRuntime";
import {
  CreativeAudioProductionRuntime,
} from "@/lib/creative/audio/runtime/CreativeAudioProductionRuntime";
import {
  CreativeFinalFilmQualityRuntime,
} from "@/lib/creative/quality/runtime/CreativeFinalFilmQualityRuntime";
import {
  CreativeProductionControlRuntime,
} from "@/lib/creative/production/control/CreativeProductionControlRuntime";
import {
  CreativeProductionLifecycleRuntime,
} from "@/lib/creative/production/runtime/CreativeProductionLifecycleRuntime";
import {
  CreativeProjectRuntime,
} from "@/lib/creative/projects/runtime/CreativeProjectRuntime";

function taskSnapshot(tasks = []) {
  return tasks
    .map(
      (task) =>
        `${task.id}:${task.status}:${task.metadata?.provider_status || ""}`,
    )
    .sort()
    .join("|");
}

function isFilmProject(project = {}, tasks = []) {
  const type = String(project.production_type || "").toUpperCase();
  const medium = String(project.metadata?.creative_medium || "").toUpperCase();
  return (
    ["VIDEO", "FILM"].includes(type) ||
    ["VIDEO", "FILM"].includes(medium) ||
    tasks.some((task) =>
      ["GENERATE_VIDEO", "IMAGE_TO_VIDEO"].includes(String(task.type || "").toUpperCase()),
    )
  );
}

function isQualityTask(task = {}) {
  return (
    String(task.type || "").toUpperCase() === "QUALITY_REVIEW" ||
    String(task.metadata?.deliverable || "").toUpperCase().endsWith("_QA")
  );
}


function qualityResult(task = {}) {
  return (
    task.output?.result?.json ||
    task.output?.result?.output?.json ||
    task.output?.provider_submission?.output?.json ||
    task.output?.provider_submission?.output?.output?.json ||
    null
  );
}

function genericQualityApproved(tasks = []) {
  const reviews = tasks.filter(isQualityTask);
  if (!reviews.length) return true;

  return reviews.every((task) => {
    const result = qualityResult(task);
    if (!result) return false;
    if (result.passed === false || result.release_readiness === false) return false;

    const score = Number(result.overall_score ?? result.score ?? 100);
    const minimum = Number(task.input?.minimum_score || 0);
    return Number.isFinite(score) && score >= minimum;
  });
}

function genericDeliverables(tasks = []) {
  return tasks
    .filter(
      (task) =>
        ["COMPLETED", "APPROVED"].includes(String(task.status || "").toUpperCase()) &&
        !isQualityTask(task),
    )
    .map((task) => ({
      task_id: task.id,
      title: task.title || "Creative Deliverable",
      type: task.type,
      medium: task.metadata?.medium || null,
      deliverable_id: task.metadata?.deliverable_id || null,
      asset_id: task.output?.asset_id || null,
      url:
        task.output?.url ||
        task.output?.image_url ||
        task.output?.video_url ||
        task.output?.asset?.url ||
        null,
      result: task.output?.result || null,
      provider: task.metadata?.provider || null,
      usage: task.output?.usage || null,
      billing: task.output?.billing || null,
    }));
}

async function pollRunningTasks(tasks = []) {
  const results = [];
  for (const task of tasks) {
    results.push(await ProductionTaskRuntime.poll(task.id));
  }
  return results;
}

async function runProject({
  organization_id,
  creative_project_id,
  max_cycles = 20,
} = {}) {
  if (!organization_id) throw new Error("organization_id required");
  if (!creative_project_id) throw new Error("creative_project_id required");

  const input = { organization_id, creative_project_id };
  const openingControl =
    await CreativeProductionControlRuntime.assertExecutionAllowed(input);

  let previousSnapshot = null;
  let cycles = 0;
  let submissions = 0;
  let polls = 0;

  while (cycles < Number(max_cycles || 20)) {
    cycles += 1;
    await CreativeProductionControlRuntime.assertExecutionAllowed(input);

    const before = await ProductionTaskRuntime.list(input);
    const beforeSnapshot = taskSnapshot(before);
    const running = before.filter((task) => task.status === "RUNNING");

    if (running.length) {
      await pollRunningTasks(running);
      polls += running.length;
    }

    const dispatchResult = await ProductionQueueRuntime.dispatchAll(input, {
      maxDispatches: 100,
    });
    submissions += dispatchResult.total;

    const after = await ProductionTaskRuntime.list(input);
    const afterSnapshot = taskSnapshot(after);
    const queue = await ProductionQueueRuntime.build(input);

    if (queue.terminal || queue.successful) break;
    if (dispatchResult.total === 0 && afterSnapshot === beforeSnapshot) break;
    if (previousSnapshot !== null && previousSnapshot === afterSnapshot) break;
    previousSnapshot = afterSnapshot;
  }

  const finalQueue = await ProductionQueueRuntime.build(input);
  const project = await CreativeProjectRuntime.get(creative_project_id);
  if (!project) throw new Error("CREATIVE_PROJECT_NOT_FOUND");
  if (project.organization_id !== organization_id) {
    throw new Error("CREATIVE_PROJECT_ORGANIZATION_MISMATCH");
  }

  const tasks = await ProductionTaskRuntime.list(input);
  const filmPipeline = isFilmProject(project, tasks);
  const productionComplete = finalQueue.successful;

  const postProduction = filmPipeline && productionComplete
    ? await CreativePostProductionRuntime.build(input)
    : null;
  const pictureAssembly =
    postProduction?.status === "READY_FOR_ASSEMBLY"
      ? await CreativeFinalRenderRuntime.render({
          ...input,
          package_document: postProduction,
        })
      : null;
  const pictureFinish = pictureAssembly?.public_url
    ? await CreativePictureFinishingRuntime.finish({
        ...input,
        package_document: postProduction,
        assembly: pictureAssembly,
      })
    : null;
  const soundFinish = pictureFinish?.variants?.length
    ? await CreativeAudioProductionRuntime.produce({
        ...input,
        package_document: postProduction,
        picture_finish: pictureFinish,
      })
    : null;
  const finalFilmQa = soundFinish?.variants?.length
    ? await CreativeFinalFilmQualityRuntime.inspect({
        ...input,
        package_document: postProduction,
        sound_finish: soundFinish,
      })
    : null;
  const deliverables = filmPipeline ? [] : genericDeliverables(tasks);
  const genericQualityPassed = genericQualityApproved(tasks);
  const aiApproved = filmPipeline
    ? Boolean(
        productionComplete &&
          finalFilmQa?.passed &&
          finalFilmQa.approved_variants?.length === soundFinish?.variants?.length,
      )
    : Boolean(
        productionComplete &&
          deliverables.length > 0 &&
          genericQualityPassed,
      );

  const control = await CreativeProductionControlRuntime.snapshot(input);
  const humanReleaseRequired = control.release.human_release_required !== false;
  const humanReleased = control.release.human_released === true;
  const deliveryApproved =
    aiApproved && (!humanReleaseRequired || humanReleased);
  const finalApproval = {
    approved: deliveryApproved,
    ai_approved: aiApproved,
    human_release_required: humanReleaseRequired,
    human_released: humanReleased,
    release_mode: control.release.mode,
    approved_variants: finalFilmQa?.approved_variants || [],
    rejected_variants: finalFilmQa?.rejected_variants || [],
    generic_deliverable_count: deliverables.length,
  };

  const lifecycle = await CreativeProductionLifecycleRuntime.persist({
    ...input,
    control,
    production_result: {
      production_complete: productionComplete,
      post_production: postProduction,
      picture_assembly: pictureAssembly,
      picture_finish: pictureFinish,
      sound_finish: soundFinish,
      final_film_qa: finalFilmQa,
      generic_deliverables: deliverables,
      ai_approved: aiApproved,
      human_released: humanReleased,
      final_approval: finalApproval,
      queue: finalQueue,
    },
  });

  const blockers = deliveryApproved
    ? []
    : [
        !productionComplete ? "PRODUCTION_TASKS_INCOMPLETE" : null,
        filmPipeline && !pictureFinish ? "PICTURE_FINISH_INCOMPLETE" : null,
        filmPipeline && !soundFinish ? "AUDIO_MIX_INCOMPLETE" : null,
        filmPipeline && finalFilmQa && !finalFilmQa.passed
          ? "FINAL_FILM_QA_REJECTED"
          : null,
        filmPipeline && !finalFilmQa ? "FINAL_FILM_QA_REQUIRED" : null,
        !filmPipeline && productionComplete && !deliverables.length
          ? "FINAL_DELIVERABLE_OUTPUT_REQUIRED"
          : null,
        !filmPipeline && productionComplete && !genericQualityPassed
          ? "DELIVERABLE_QUALITY_REVIEW_REJECTED"
          : null,
        aiApproved && humanReleaseRequired && !humanReleased
          ? "HUMAN_RELEASE_APPROVAL_REQUIRED"
          : null,
      ].filter(Boolean);

  return {
    success:
      finalQueue.failed.length === 0 &&
      finalQueue.blocked.length === 0 &&
      (!finalFilmQa || finalFilmQa.passed),
    complete: deliveryApproved,
    production_complete: productionComplete,
    film_pipeline: filmPipeline,
    ai_approved: aiApproved,
    human_release_required: humanReleaseRequired,
    human_released: humanReleased,
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
    lifecycle,
    post_production: postProduction,
    picture_assembly: pictureAssembly,
    picture_finish: pictureFinish,
    sound_finish: soundFinish,
    final_film_qa: finalFilmQa,
    generic_deliverables: deliverables,
    production_control: {
      opening: openingControl,
      current: control,
    },
    final_approval: {
      ...finalApproval,
      blockers,
    },
  };
}

export async function CreativeOrchestrationWorker(tasks = []) {
  const results = [];
  for (const task of tasks || []) {
    if (!task?.id) continue;
    results.push(await ProductionTaskRuntime.dispatch(task.id));
  }
  return results;
}

CreativeOrchestrationWorker.runProject = runProject;
