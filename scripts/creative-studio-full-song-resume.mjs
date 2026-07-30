#!/usr/bin/env node

import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

function text(value) {
  return String(value ?? "").trim();
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0
    ? Math.floor(number)
    : fallback;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function finalisationPassed(value = {}) {
  return Boolean(
    value &&
    value.success !== false &&
    value.passed !== false &&
    [
      "READY_FOR_APPROVAL",
      "APPROVED",
      "RELEASE_READY",
      "PRODUCTION_SETTLED",
    ].includes(text(value.status).toUpperCase()),
  );
}

function queueSignature(queue = {}) {
  return [
    queue.waiting?.length || 0,
    queue.ready?.length || 0,
    queue.running?.length || 0,
    queue.completed?.length || 0,
    queue.failed?.length || 0,
    queue.blocked?.length || 0,
    queue.superseded?.length || 0,
  ].join(":");
}

const organizationId = text(
  process.env.CREATIVE_ORGANIZATION_ID ||
  process.env.ORGANIZATION_ID,
);
const projectId = text(
  process.env.CREATIVE_PROJECT_ID ||
  process.env.CREATIVE_FULL_SONG_PROJECT_ID,
);
const missionId = text(
  process.env.CREATIVE_MISSION_ID ||
  process.env.CREATIVE_FULL_SONG_MISSION_ID,
);

if (!organizationId) throw new Error("CREATIVE_ORGANIZATION_ID required");
if (!projectId) throw new Error("CREATIVE_PROJECT_ID required");
if (!missionId) throw new Error("CREATIVE_MISSION_ID required");

const maxCycles = positiveInteger(
  process.env.CREATIVE_PRODUCTION_RECOVERY_MAX_CYCLES,
  20,
);
const pollIntervalSeconds = positiveInteger(
  process.env.CREATIVE_PRODUCTION_RECOVERY_POLL_SECONDS,
  15,
);

const [
  { ProductionQueueRuntime },
  { ProductionTaskRuntime },
  { CreativeStateEngine, PIPELINE_STAGES },
  { CreativeFinalisationRouter },
  { repairPolicy },
  CreativeProjectRepository,
] = await Promise.all([
  import("@/lib/creative/production/queue/runtime/ProductionQueueRuntime"),
  import("@/lib/operations/tasks/runtime/ProductionTaskRuntime"),
  import("@/lib/creative/state/CreativeStateEngine"),
  import("@/lib/creative/finalisation/runtime/CreativeFinalisationRouter"),
  import("@/lib/creative/quality/runtime/CreativeRepairContractRuntime"),
  import("@/lib/creative/projects/repositories/CreativeProjectRepository"),
]);

const input = {
  organization_id: organizationId,
  creative_project_id: projectId,
};
const stateInput = {
  ...input,
  creative_mission_id: missionId,
};

const project = await CreativeProjectRepository.getById(projectId);
if (!project || text(project.organization_id) !== organizationId) {
  throw new Error("Creative project not found in organization scope");
}

const policy = repairPolicy(project);

function diagnostic(task, map) {
  const dependencies = Array.isArray(task.depends_on) ? task.depends_on : [];
  return {
    id: task.id,
    status: task.status,
    type: task.type,
    title: task.title,
    service_id: task.service_id || task.service_code || null,
    capability: task.capability || null,
    scene_id: task.scene_id || null,
    shot_id: task.shot_id || null,
    error: task.error || null,
    repair_attempt: Number(task.metadata?.repair_attempt || 0),
    repair_of_task_id: task.metadata?.repair_of_task_id || null,
    superseded_by:
      task.metadata?.superseded_by_repair_review_task_id ||
      task.metadata?.superseded_by_repair_task_id ||
      null,
    depends_on: dependencies.map((id) => {
      const dependency = map.get(id);
      return {
        id,
        status: dependency?.status || "MISSING",
        title: dependency?.title || null,
        error: dependency?.error || null,
        superseded_by:
          dependency?.metadata?.superseded_by_repair_review_task_id ||
          dependency?.metadata?.superseded_by_repair_task_id ||
          null,
      };
    }),
  };
}

async function inspectQueue(label) {
  const [queue, tasks] = await Promise.all([
    ProductionQueueRuntime.build(input),
    ProductionTaskRuntime.list(input),
  ]);
  const map = new Map(tasks.map((task) => [task.id, task]));

  console.log("============================================================");
  console.log(label);
  console.log("============================================================");
  console.log(`QUEUE_TOTAL=${queue.total}`);
  console.log(`QUEUE_WAITING=${queue.waiting.length}`);
  console.log(`QUEUE_READY=${queue.ready.length}`);
  console.log(`QUEUE_RUNNING=${queue.running.length}`);
  console.log(`QUEUE_COMPLETED=${queue.completed.length}`);
  console.log(`QUEUE_FAILED=${queue.failed.length}`);
  console.log(`QUEUE_BLOCKED=${queue.blocked.length}`);
  console.log(`QUEUE_SUPERSEDED=${queue.superseded.length}`);

  for (const task of queue.failed) {
    console.log(`FAILED_TASK=${JSON.stringify(diagnostic(task, map))}`);
  }
  for (const task of queue.blocked) {
    console.log(`BLOCKED_TASK=${JSON.stringify(diagnostic(task, map))}`);
  }
  for (const task of queue.running) {
    console.log(`RUNNING_TASK=${JSON.stringify(diagnostic(task, map))}`);
  }

  return { queue, tasks, map };
}

console.log("============================================================");
console.log("AVANTIQO EXISTING PRODUCTION RECOVERY");
console.log("============================================================");
console.log(`ORGANIZATION_ID=${organizationId}`);
console.log(`CREATIVE_PROJECT_ID=${projectId}`);
console.log(`CREATIVE_MISSION_ID=${missionId}`);
console.log(`AUTOMATIC_REPAIR_ENABLED=${policy.allow_automatic_repair ? "YES" : "NO"}`);
console.log(`MAX_REPAIR_ATTEMPTS=${policy.max_attempts}`);
console.log("DIRECTION_REEXECUTED=NO");
console.log("SHOT_PLAN_REBUILT=NO");
console.log("COMPLETED_TASKS_REEXECUTED=NO");
console.log("============================================================");

const locked = await CreativeStateEngine.acquireExecutionLock(stateInput);
if (!locked) {
  const state = await CreativeStateEngine.get(stateInput);
  throw new Error(
    `CREATIVE_PRODUCTION_RECOVERY_LOCKED:${state?.locked_at || "unknown"}`,
  );
}

let completed = false;
let finalisation = null;
let previousSignature = null;
let stagnantCycles = 0;

try {
  await CreativeStateEngine.set(stateInput, PIPELINE_STAGES.PRODUCING);
  await inspectQueue("EXISTING PRODUCTION QUEUE BEFORE RECOVERY");

  for (let cycle = 1; cycle <= maxCycles; cycle += 1) {
    console.log("============================================================");
    console.log(`RECOVERY_CYCLE=${cycle}`);
    console.log("============================================================");

    const dispatch = await ProductionQueueRuntime.dispatchAll(input, {
      maxTasks: 500,
      maxPasses: 40,
      runPostProduction: true,
      pollRunning: true,
    });

    finalisation = dispatch.finalisation || dispatch.post_production || null;

    console.log(`RECOVERY_DISPATCHED=${dispatch.total || 0}`);
    console.log(`RECOVERY_POLLED=${dispatch.poll_total || 0}`);
    console.log(`RECOVERY_REPAIRS_CREATED=${dispatch.repair_total || 0}`);
    console.log(`RECOVERY_REPAIR_BLOCKS=${dispatch.repair_blocks?.length || 0}`);

    for (const block of dispatch.repair_blocks || []) {
      console.log(`REPAIR_BLOCK=${JSON.stringify(block)}`);
    }

    if (finalisation) {
      console.log(`FINALISATION_STATUS=${text(finalisation.status || "UNKNOWN")}`);
      console.log(`FINALISATION_SUCCESS=${finalisation.success === false ? "NO" : "YES"}`);
      console.log(`FINALISATION_PASSED=${finalisation.passed === false ? "NO" : "YES"}`);
      if (Array.isArray(finalisation.failures)) {
        for (const failure of finalisation.failures) {
          console.log(`FINALISATION_FAILURE=${JSON.stringify(failure)}`);
        }
      }
      if (Array.isArray(finalisation.issues)) {
        for (const issue of finalisation.issues) {
          console.log(`FINALISATION_ISSUE=${JSON.stringify(issue)}`);
        }
      }
    }

    const snapshot = await inspectQueue(
      `EXISTING PRODUCTION QUEUE AFTER RECOVERY CYCLE ${cycle}`,
    );
    const queue = snapshot.queue;
    const settled =
      queue.waiting.length === 0 &&
      queue.ready.length === 0 &&
      queue.running.length === 0 &&
      queue.failed.length === 0 &&
      queue.blocked.length === 0;

    if (settled && !finalisation) {
      finalisation = await CreativeFinalisationRouter.run(input);
      console.log(`FINALISATION_STATUS=${text(finalisation.status || "UNKNOWN")}`);
      console.log(`FINALISATION_SUCCESS=${finalisation.success === false ? "NO" : "YES"}`);
      console.log(`FINALISATION_PASSED=${finalisation.passed === false ? "NO" : "YES"}`);
    }

    if (settled && finalisationPassed(finalisation)) {
      completed = true;
      await CreativeStateEngine.complete(stateInput, {
        production_recovery: true,
        finalisation_status: finalisation.status,
        completed_task_count: queue.completed.length,
        recovered_at: new Date().toISOString(),
      });
      console.log("============================================================");
      console.log("EXISTING PRODUCTION RECOVERY COMPLETE");
      console.log("============================================================");
      console.log(`COMPLETED_TASKS=${queue.completed.length}`);
      console.log(`FINALISATION_STATUS=${finalisation.status}`);
      console.log("PRODUCTION_COMPLETE=YES");
      console.log("============================================================");
      break;
    }

    const signature = queueSignature(queue);
    if (signature === previousSignature && !(dispatch.total || dispatch.poll_total || dispatch.repair_total)) {
      stagnantCycles += 1;
    } else {
      stagnantCycles = 0;
    }
    previousSignature = signature;

    if (stagnantCycles >= 2 && queue.running.length === 0) {
      console.log("RECOVERY_STOP_REASON=NO_PROGRESS_WITH_STORED_DIAGNOSTICS");
      break;
    }

    if (queue.running.length > 0) {
      console.log(`RECOVERY_WAIT_SECONDS=${pollIntervalSeconds}`);
      await sleep(pollIntervalSeconds * 1000);
    }
  }

  if (!completed) {
    const finalSnapshot = await inspectQueue("FINAL UNRESOLVED PRODUCTION QUEUE");
    console.log("============================================================");
    console.log("EXISTING PRODUCTION RECOVERY INCOMPLETE");
    console.log("============================================================");
    console.log(`FINAL_QUEUE_SIGNATURE=${queueSignature(finalSnapshot.queue)}`);
    console.log(`FINALISATION_STATUS=${text(finalisation?.status || "NOT_RUN")}`);
    console.log("PRODUCTION_COMPLETE=NO");
    console.log("============================================================");
    process.exitCode = 1;
  }
} finally {
  if (!completed) {
    await CreativeStateEngine.releaseExecutionLock(stateInput);
  }
}
