import crypto from "node:crypto";

import * as ProductionTaskRepository
from "@/lib/operations/tasks/repositories/ProductionTaskRepository";

import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

import {
  ProductionQueueRuntime,
} from "@/lib/creative/production/queue/runtime/ProductionQueueRuntime";

import {
  CreativeOrchestrationWorker,
} from "@/lib/creative/worker/CreativeOrchestrationWorker";

const RETRYABLE_PATTERNS = [
  /timeout/i,
  /timed out/i,
  /temporar/i,
  /rate limit/i,
  /too many requests/i,
  /429/,
  /502/,
  /503/,
  /504/,
  /network/i,
  /connection/i,
  /provider unavailable/i,
  /last_poll_error/i,
];

const PERMANENT_PATTERNS = [
  /unauthorized/i,
  /forbidden/i,
  /invalid api key/i,
  /insufficient balance/i,
  /wallet/i,
  /unsupported/i,
  /content policy/i,
  /maximum attempts/i,
];

function workerId(prefix = "creative") {
  return `${prefix}:${process.env.VERCEL_REGION || "local"}:${process.pid}:${crypto.randomUUID()}`;
}

function errorMessage(task) {
  return String(
    task?.error ||
    task?.metadata?.last_poll_error ||
    "Creative production task failed",
  );
}

function classifyFailure(task) {
  const message = errorMessage(task);

  if (PERMANENT_PATTERNS.some((pattern) => pattern.test(message))) {
    return {
      class: "PERMANENT",
      retryable: false,
      message,
    };
  }

  if (RETRYABLE_PATTERNS.some((pattern) => pattern.test(message))) {
    return {
      class: "TRANSIENT",
      retryable: true,
      message,
    };
  }

  return {
    class: "UNKNOWN",
    retryable: true,
    message,
  };
}

function retryDelaySeconds(attempt) {
  const exponent = Math.max(0, Number(attempt || 1) - 1);
  return Math.min(3600, 30 * (2 ** exponent));
}

async function recoverFailedTask(task) {
  const attempt = Number(task.metadata?.attempt || 0);
  const maximum = Number(task.metadata?.max_attempts || 3);
  const failure = classifyFailure(task);
  const exhausted = attempt >= maximum;

  if (!failure.retryable || exhausted) {
    return ProductionTaskRepository.update(
      task.id,
      {
        failure_class: failure.class,
        dead_lettered_at: new Date().toISOString(),
        worker_id: null,
        lease_expires_at: null,
        metadata: {
          ...(task.metadata || {}),
          retryable: false,
          retry_exhausted: exhausted,
          final_failure: failure.message,
        },
      },
      {
        organization_id: task.organization_id,
        creative_project_id: task.creative_project_id,
      },
    );
  }

  const delaySeconds = retryDelaySeconds(attempt);
  const nextAttemptAt = new Date(
    Date.now() + delaySeconds * 1000,
  ).toISOString();

  return ProductionTaskRepository.update(
    task.id,
    {
      status: "WAITING",
      failure_class: failure.class,
      next_attempt_at: nextAttemptAt,
      worker_id: null,
      lease_expires_at: null,
      error: null,
      metadata: {
        ...(task.metadata || {}),
        provider_status: "RETRY_SCHEDULED",
        retryable: true,
        retry_delay_seconds: delaySeconds,
        previous_failure: failure.message,
      },
    },
    {
      organization_id: task.organization_id,
      creative_project_id: task.creative_project_id,
    },
  );
}

async function recoverFailures(input) {
  const tasks = await ProductionTaskRuntime.list(input);
  const recovered = [];

  for (const task of tasks) {
    if (task.status !== "FAILED") continue;
    if (task.dead_lettered_at) continue;
    recovered.push(await recoverFailedTask(task));
  }

  return recovered;
}

async function pollLeasedRunningTasks({
  input,
  worker_id,
  lease_seconds,
}) {
  const queue = await ProductionQueueRuntime.build(input);
  const results = [];

  for (const task of queue.running) {
    const leased = await ProductionTaskRepository.leaseRunning({
      task_id: task.id,
      worker_id,
      lease_seconds,
    });

    if (!leased) continue;

    const result = await ProductionTaskRuntime.poll(task.id);
    results.push(result);

    const current = await ProductionTaskRepository.getById(
      task.id,
      input,
    );

    if (current?.status === "RUNNING") {
      await ProductionTaskRepository.releaseLease({
        task_id: task.id,
        worker_id,
      });
    }
  }

  return results;
}

async function dispatchLeasedReadyTasks({
  input,
  worker_id,
  lease_seconds,
  maximum,
}) {
  const results = [];

  while (results.length < maximum) {
    const queue = await ProductionQueueRuntime.build(input);
    const next = [...queue.ready]
      .filter((task) => {
        if (!task.next_attempt_at) return true;
        return new Date(task.next_attempt_at).getTime() <= Date.now();
      })
      .sort((left, right) => (
        Number(left.priority || 100) - Number(right.priority || 100)
      ))[0];

    if (!next) break;

    if (next.status !== "READY") {
      await ProductionTaskRuntime.markReady(next.id);
    }

    const claimed = await ProductionTaskRepository.claimReady({
      task_id: next.id,
      worker_id,
      lease_seconds,
    });

    if (!claimed) continue;

    const result = await ProductionTaskRuntime.dispatch(claimed.id);
    results.push(result);

    const current = await ProductionTaskRepository.getById(
      claimed.id,
      input,
    );

    if (current?.status === "RUNNING") {
      await ProductionTaskRepository.releaseLease({
        task_id: claimed.id,
        worker_id,
      });
    }
  }

  return results;
}

export async function runAutonomousCreativeProject({
  organization_id,
  creative_project_id,
  worker_id = workerId("creative-project"),
  lease_seconds = 180,
  max_dispatches = 20,
} = {}) {
  if (!organization_id) throw new Error("organization_id required");
  if (!creative_project_id) throw new Error("creative_project_id required");

  const input = {
    organization_id,
    creative_project_id,
  };

  const recoveredBefore = await recoverFailures(input);
  const polled = await pollLeasedRunningTasks({
    input,
    worker_id,
    lease_seconds,
  });
  const dispatched = await dispatchLeasedReadyTasks({
    input,
    worker_id,
    lease_seconds,
    maximum: Math.max(1, Math.min(Number(max_dispatches || 20), 100)),
  });
  const recoveredAfter = await recoverFailures(input);
  const queue = await ProductionQueueRuntime.build(input);

  let finalization = null;
  if (queue.successful) {
    finalization = await CreativeOrchestrationWorker.runProject({
      ...input,
      max_cycles: 1,
    });
  }

  return {
    organization_id,
    creative_project_id,
    worker_id,
    recovered: recoveredBefore.length + recoveredAfter.length,
    polled: polled.length,
    dispatched: dispatched.length,
    queue,
    finalization,
  };
}

export async function runAutonomousCreativeFleet({
  project_limit = 20,
  max_dispatches_per_project = 20,
  lease_seconds = 180,
} = {}) {
  const fleetWorkerId = workerId("creative-fleet");
  const projects = await ProductionTaskRepository.listRunnableProjects({
    limit: project_limit,
  });
  const results = [];

  for (const project of projects) {
    try {
      results.push({
        success: true,
        ...(await runAutonomousCreativeProject({
          ...project,
          worker_id: fleetWorkerId,
          lease_seconds,
          max_dispatches: max_dispatches_per_project,
        })),
      });
    } catch (error) {
      results.push({
        success: false,
        ...project,
        error: error?.message || String(error),
      });
    }
  }

  return {
    success: results.every((result) => result.success),
    worker_id: fleetWorkerId,
    projects_discovered: projects.length,
    projects_processed: results.length,
    results,
  };
}

export const CreativeAutonomousExecutionRuntime = {
  runProject: runAutonomousCreativeProject,
  runFleet: runAutonomousCreativeFleet,
};
