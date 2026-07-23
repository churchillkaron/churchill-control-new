import {
  CreativeProjectRuntime,
} from "@/lib/creative/projects/runtime/CreativeProjectRuntime";

import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

export const CREATIVE_PRODUCTION_STATUS = {
  PLANNING: "PLANNING",
  PLAN_READY: "PLAN_READY",
  APPROVAL_REQUIRED: "APPROVAL_REQUIRED",
  PRODUCTION_QUEUED: "PRODUCTION_QUEUED",
  PRODUCING_MASTER_STILLS: "PRODUCING_MASTER_STILLS",
  PRODUCING_MOTION: "PRODUCING_MOTION",
  EDITING_AND_AUDIO: "EDITING_AND_AUDIO",
  FINAL_QA: "FINAL_QA",
  RELEASE_READY: "RELEASE_READY",
  FAILED: "FAILED",
};

const COMPLETE = new Set(["COMPLETED", "APPROVED"]);
const ACTIVE = new Set(["PLANNED", "WAITING", "READY", "RUNNING", "REVIEW"]);
const FAILED = new Set(["FAILED", "SKIPPED", "REJECTED", "BLOCKED"]);

function list(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean).map(String))];
}

function taskGroup(tasks = [], deliverable) {
  return tasks.filter((task) =>
    String(task.metadata?.deliverable || "").toUpperCase() === deliverable,
  );
}

function taskCounts(tasks = []) {
  const counts = {
    total: tasks.length,
    completed: 0,
    active: 0,
    running: 0,
    review: 0,
    failed: 0,
    waiting: 0,
  };

  for (const task of tasks) {
    const status = String(task.status || "UNKNOWN").toUpperCase();

    if (COMPLETE.has(status)) counts.completed += 1;
    if (ACTIVE.has(status)) counts.active += 1;
    if (status === "RUNNING") counts.running += 1;
    if (status === "REVIEW") counts.review += 1;
    if (FAILED.has(status)) counts.failed += 1;
    if (["PLANNED", "WAITING", "READY"].includes(status)) {
      counts.waiting += 1;
    }
  }

  counts.progress_percent = counts.total
    ? Math.round((counts.completed / counts.total) * 10000) / 100
    : 0;

  return counts;
}

function finalQaEvidence(productionResult = {}, project = {}) {
  return (
    productionResult.final_film_qa ||
    project.metadata?.production_lifecycle?.evidence?.final_film_qa ||
    null
  );
}

function pictureEvidence(productionResult = {}, project = {}) {
  return (
    productionResult.picture_finish ||
    project.metadata?.production_lifecycle?.evidence?.picture_finish ||
    null
  );
}

function soundEvidence(productionResult = {}, project = {}) {
  return (
    productionResult.sound_finish ||
    project.metadata?.production_lifecycle?.evidence?.sound_finish ||
    null
  );
}

function releaseEvidence(productionResult = {}, project = {}, control = {}) {
  return Boolean(
    productionResult.human_released === true ||
    control.release?.human_released === true ||
    project.metadata?.human_release?.approved === true,
  );
}

function describe({
  status,
  master,
  motion,
  totalShots,
  finalQa,
  humanReleased,
  blockers,
}) {
  switch (status) {
    case CREATIVE_PRODUCTION_STATUS.PLANNING:
      return "The production bible is still being planned and validated.";
    case CREATIVE_PRODUCTION_STATUS.PLAN_READY:
      return `${totalShots} independently directed shot${totalShots === 1 ? " is" : "s are"} ready for production.`;
    case CREATIVE_PRODUCTION_STATUS.APPROVAL_REQUIRED:
      return blockers[0] || "Production is waiting for a required approval.";
    case CREATIVE_PRODUCTION_STATUS.PRODUCTION_QUEUED:
      return `${master.total + motion.total} atomic production tasks are durably queued.`;
    case CREATIVE_PRODUCTION_STATUS.PRODUCING_MASTER_STILLS:
      return `${master.completed} of ${master.total} master stills approved.`;
    case CREATIVE_PRODUCTION_STATUS.PRODUCING_MOTION:
      return `${motion.completed} of ${motion.total} motion clips completed.`;
    case CREATIVE_PRODUCTION_STATUS.EDITING_AND_AUDIO:
      return "All shot media is complete. Picture finishing, edit assembly, music, Foley, voice, and mix are in progress.";
    case CREATIVE_PRODUCTION_STATUS.FINAL_QA:
      return finalQa?.passed === false
        ? "The assembled film is in final QA and has unresolved quality failures."
        : "The assembled film is undergoing full-duration final quality review.";
    case CREATIVE_PRODUCTION_STATUS.RELEASE_READY:
      return humanReleased
        ? "The final film passed QA and has been released for delivery."
        : "The final film passed QA and is ready for human release approval.";
    case CREATIVE_PRODUCTION_STATUS.FAILED:
      return blockers[0] || "Production is blocked by a failed task or rejected quality gate.";
    default:
      return "Production status is being resolved from durable execution evidence.";
  }
}

export function deriveCreativeProductionLifecycle({
  project = {},
  tasks = [],
  control = {},
  production_result = {},
  explicit_status = null,
} = {}) {
  const masterTasks = taskGroup(tasks, "MASTER_STILL");
  const motionTasks = taskGroup(tasks, "VIDEO_SHOT");
  const otherTasks = tasks.filter(
    (task) => !masterTasks.includes(task) && !motionTasks.includes(task),
  );
  const master = taskCounts(masterTasks);
  const motion = taskCounts(motionTasks);
  const other = taskCounts(otherTasks);
  const all = taskCounts(tasks);
  const shotIds = unique(
    [...masterTasks, ...motionTasks].map((task) => task.shot_id),
  );
  const totalShots = Math.max(shotIds.length, motion.total, master.total);
  const finalQa = finalQaEvidence(production_result, project);
  const pictureFinish = pictureEvidence(production_result, project);
  const soundFinish = soundEvidence(production_result, project);
  const humanReleased = releaseEvidence(production_result, project, control);
  const failedTasks = tasks.filter((task) =>
    FAILED.has(String(task.status || "").toUpperCase()),
  );
  const blockedTasks = list(production_result.queue?.blocked);
  const budgetBlocked = control.budget?.execution_allowed === false;
  const approvalRequired = control.budget?.approval_required === true;
  const productionComplete = Boolean(
    production_result.production_complete === true ||
    (tasks.length > 0 && all.completed === all.total),
  );
  const finalQaPassed = finalQa?.passed === true;
  const blockers = unique([
    budgetBlocked
      ? control.budget?.exceeds_maximum
        ? "Production cost exceeds the approved project maximum."
        : "Production budget approval is required."
      : null,
    ...failedTasks.map((task) =>
      `${task.title || task.id}: ${task.error || task.metadata?.structured_failure?.message || "task failed"}`,
    ),
    ...blockedTasks.map((task) =>
      `${task.title || task.id}: blocked by a failed dependency`,
    ),
    finalQa?.passed === false
      ? "Final film quality review rejected one or more delivery variants."
      : null,
  ]);

  let status = explicit_status;

  if (!status) {
    if (failedTasks.length || blockedTasks.length) {
      status = CREATIVE_PRODUCTION_STATUS.FAILED;
    } else if (approvalRequired || budgetBlocked) {
      status = CREATIVE_PRODUCTION_STATUS.APPROVAL_REQUIRED;
    } else if (!tasks.length) {
      status = project.metadata?.production_lifecycle?.status ||
        CREATIVE_PRODUCTION_STATUS.PLAN_READY;
    } else if (!productionComplete) {
      if (master.completed < master.total) {
        status = master.running || master.active
          ? CREATIVE_PRODUCTION_STATUS.PRODUCING_MASTER_STILLS
          : CREATIVE_PRODUCTION_STATUS.PRODUCTION_QUEUED;
      } else if (motion.completed < motion.total) {
        status = CREATIVE_PRODUCTION_STATUS.PRODUCING_MOTION;
      } else {
        status = CREATIVE_PRODUCTION_STATUS.PRODUCTION_QUEUED;
      }
    } else if (!pictureFinish || !soundFinish) {
      status = CREATIVE_PRODUCTION_STATUS.EDITING_AND_AUDIO;
    } else if (!finalQaPassed) {
      status = CREATIVE_PRODUCTION_STATUS.FINAL_QA;
    } else {
      status = CREATIVE_PRODUCTION_STATUS.RELEASE_READY;
    }
  }

  const progress = {
    total_shots: totalShots,
    total_tasks: all.total,
    completed_tasks: all.completed,
    failed_tasks: all.failed,
    active_tasks: all.active,
    progress_percent: all.total
      ? Math.round((all.completed / all.total) * 10000) / 100
      : status === CREATIVE_PRODUCTION_STATUS.PLAN_READY
        ? 0
        : 100,
    master_stills: master,
    motion_clips: motion,
    other_tasks: other,
    picture_finish_complete: Boolean(pictureFinish),
    audio_mix_complete: Boolean(soundFinish),
    final_qa_complete: Boolean(finalQa),
    final_qa_passed: finalQaPassed,
    human_released: humanReleased,
  };

  return {
    version: "CREATIVE_PRODUCTION_LIFECYCLE_V1",
    status,
    previous_status:
      project.metadata?.production_lifecycle?.status || project.status || null,
    description: describe({
      status,
      master,
      motion,
      totalShots,
      finalQa,
      humanReleased,
      blockers,
    }),
    progress,
    blockers,
    evidence: {
      picture_finish: pictureFinish,
      sound_finish: soundFinish,
      final_film_qa: finalQa,
      final_approval: production_result.final_approval ||
        project.metadata?.production_lifecycle?.evidence?.final_approval ||
        null,
    },
    control: {
      execution_allowed:
        control.budget?.execution_allowed !== false,
      approval_required: approvalRequired,
      budget_blocked: budgetBlocked,
      human_release_required:
        control.release?.human_release_required !== false,
      human_released: humanReleased,
    },
    observed_at: new Date().toISOString(),
  };
}

export const CreativeProductionLifecycleRuntime = {
  async snapshot({
    organization_id,
    creative_project_id,
    control = {},
    production_result = {},
    explicit_status = null,
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) {
      throw new Error("creative_project_id required");
    }

    const [project, tasks] = await Promise.all([
      CreativeProjectRuntime.get(creative_project_id),
      ProductionTaskRuntime.list({
        organization_id,
        creative_project_id,
      }),
    ]);

    if (project.organization_id !== organization_id) {
      throw new Error("CREATIVE_PROJECT_ORGANIZATION_MISMATCH");
    }

    return deriveCreativeProductionLifecycle({
      project,
      tasks,
      control,
      production_result,
      explicit_status,
    });
  },

  async persist(input = {}) {
    const lifecycle = await this.snapshot(input);
    const project = await CreativeProjectRuntime.get(
      input.creative_project_id,
    );

    await CreativeProjectRuntime.update(
      input.creative_project_id,
      {
        status: lifecycle.status,
        metadata: {
          ...object(project.metadata),
          production_lifecycle: lifecycle,
        },
      },
    );

    return lifecycle;
  },

  async markPlanReady(input = {}) {
    return this.persist({
      ...input,
      explicit_status: CREATIVE_PRODUCTION_STATUS.PLAN_READY,
    });
  },

  async markQueued(input = {}) {
    return this.persist({
      ...input,
      explicit_status: CREATIVE_PRODUCTION_STATUS.PRODUCTION_QUEUED,
    });
  },
};
