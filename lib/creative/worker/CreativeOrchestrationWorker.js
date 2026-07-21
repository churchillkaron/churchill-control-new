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

function taskSnapshot(tasks = []) {
  return tasks
    .map(
      (task) =>
        `${task.id}:${task.status}:${task.metadata?.provider_status || ""}`,
    )
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
  const productionComplete = finalQueue.successful;
  const postProduction = productionComplete
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
  const aiApproved = Boolean(
    productionComplete &&
    finalFilmQa?.passed &&
    finalFilmQa.approved_variants?.length ===
      soundFinish?.variants?.length,
  );
  const control = await CreativeProductionControlRuntime.snapshot(input);
  const humanReleased = control.release.human_released === true;
  const deliveryApproved = aiApproved && humanReleased;

  return {
    success:
      finalQueue.failed.length === 0 &&
      finalQueue.blocked.length === 0 &&
      (!finalFilmQa || finalFilmQa.passed),
    complete: deliveryApproved,
    production_complete: productionComplete,
    ai_approved: aiApproved,
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
    post_production: postProduction,
    picture_assembly: pictureAssembly,
    picture_finish: pictureFinish,
    sound_finish: soundFinish,
    final_film_qa: finalFilmQa,
    production_control: {
      opening: openingControl,
      current: control,
    },
    final_approval: {
      approved: deliveryApproved,
      ai_approved: aiApproved,
      human_released: humanReleased,
      approved_variants:
        finalFilmQa?.approved_variants || [],
      rejected_variants:
        finalFilmQa?.rejected_variants || [],
      blockers: deliveryApproved
        ? []
        : [
            !productionComplete
              ? "ATOMIC_SHOT_PRODUCTION_INCOMPLETE"
              : null,
            !pictureFinish
              ? "PICTURE_FINISH_INCOMPLETE"
              : null,
            !soundFinish
              ? "AUDIO_MIX_INCOMPLETE"
              : null,
            finalFilmQa && !finalFilmQa.passed
              ? "FINAL_FILM_QA_REJECTED"
              : null,
            !finalFilmQa
              ? "FINAL_FILM_QA_REQUIRED"
              : null,
            aiApproved && !humanReleased
              ? "HUMAN_RELEASE_APPROVAL_REQUIRED"
              : null,
          ].filter(Boolean),
    },
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
