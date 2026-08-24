import { spawn } from "node:child_process";
import "./runpod-transient-fetch-retry-preload.mjs";

const REST = "https://rest.runpod.io/v1";
const SERVERLESS = "https://api.runpod.ai/v2";
const IMAGE_ENDPOINT_NAME = "avantiqo-image-v1";
const GUARDED_SCRIPT = "scripts/run-avantiqo-image-post-move-when-quiescent-local.mjs";
const POLL_MS = 10_000;
const WAIT_MS = Math.max(
  5 * 60 * 1000,
  Number(process.env.AVANTIQO_IMAGE_POST_MOVE_EXISTING_JOB_WAIT_MS || 25 * 60 * 1000),
);

function text(value) {
  return String(value ?? "").trim();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readBody(response) {
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = { message: raw };
  }
  return { raw, body };
}

async function rest(managementKey, path) {
  const response = await fetch(`${REST}${path}`, {
    headers: {
      Authorization: `Bearer ${managementKey}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });
  const { raw, body } = await readBody(response);
  if (!response.ok) {
    throw new Error(
      `RUNPOD_MANAGEMENT_HTTP_${response.status}:${text(body?.message || body?.error || raw).slice(0, 1000)}`,
    );
  }
  return body;
}

async function serverless(apiKey, endpointId, path) {
  const response = await fetch(`${SERVERLESS}/${encodeURIComponent(endpointId)}${path}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });
  const { raw, body } = await readBody(response);
  if (!response.ok) {
    throw new Error(
      `RUNPOD_SERVERLESS_HTTP_${response.status}:${text(body?.message || body?.error || raw).slice(0, 1000)}`,
    );
  }
  return body || {};
}

function healthCounters(health = {}) {
  const jobs = health.jobs || {};
  const workers = health.workers || {};
  return {
    jobs: {
      in_queue: number(jobs.inQueue ?? jobs.in_queue),
      in_progress: number(jobs.inProgress ?? jobs.in_progress),
      completed: number(jobs.completed),
      failed: number(jobs.failed),
      retried: number(jobs.retried),
    },
    workers: {
      idle: number(workers.idle),
      initializing: number(workers.initializing),
      ready: number(workers.ready),
      running: number(workers.running),
      throttled: number(workers.throttled),
      unhealthy: number(workers.unhealthy),
    },
  };
}

async function resolveEndpointId(managementKey) {
  const configured = text(process.env.RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID);
  if (configured) return configured;

  const endpoints = await rest(managementKey, "/endpoints?includeTemplate=true&includeWorkers=true");
  const rows = Array.isArray(endpoints) ? endpoints : [];
  const matches = rows.filter((endpoint) => text(endpoint?.name) === IMAGE_ENDPOINT_NAME);
  if (matches.length !== 1 || !text(matches[0]?.id)) {
    throw new Error(`AVANTIQO_IMAGE_EXISTING_JOB_ENDPOINT_RESOLUTION_FAILED:matches=${matches.length}`);
  }
  return text(matches[0].id);
}

async function waitForExistingWork(apiKey, endpointId) {
  const started = Date.now();
  let lastPrinted = 0;
  let sawQueued = false;
  let sawInProgress = false;
  let sawInitializing = false;
  let sawRunning = false;

  while (true) {
    const counters = healthCounters(await serverless(apiKey, endpointId, "/health"));

    if (counters.workers.unhealthy > 0) {
      throw new Error(
        `AVANTIQO_IMAGE_EXISTING_JOB_UNHEALTHY_WORKER:${counters.workers.unhealthy}`,
      );
    }

    if (counters.jobs.in_queue > 0) sawQueued = true;
    if (counters.jobs.in_progress > 0) sawInProgress = true;
    if (counters.workers.initializing > 0) sawInitializing = true;
    if (counters.workers.running > 0) sawRunning = true;

    // Queue transitions are provider work too. We wait without cancelling or purging.
    // Idle, ready and throttled alone are harmless capacity/scaler states.
    const live =
      counters.jobs.in_queue +
      counters.jobs.in_progress +
      counters.workers.initializing +
      counters.workers.running;

    if (live === 0) {
      console.log(JSON.stringify({
        event: "AVANTIQO_IMAGE_EXISTING_JOB_QUIESCENCE_READY",
        elapsed_seconds: Math.round((Date.now() - started) / 1000),
        observed_states: {
          queued: sawQueued,
          in_progress: sawInProgress,
          initializing: sawInitializing,
          running: sawRunning,
        },
        health: counters,
      }));
      return counters;
    }

    const elapsed = Date.now() - started;
    if (elapsed >= WAIT_MS) {
      throw new Error(
        `AVANTIQO_IMAGE_EXISTING_JOB_WAIT_TIMEOUT:${Math.round(elapsed / 1000)}s:${JSON.stringify(counters)}`,
      );
    }

    if (Date.now() - lastPrinted >= 15_000) {
      console.log(JSON.stringify({
        event: "AVANTIQO_IMAGE_EXISTING_JOB_WAIT",
        elapsed_seconds: Math.round(elapsed / 1000),
        timeout_seconds: Math.round(WAIT_MS / 1000),
        observed_states: {
          queued: sawQueued,
          in_progress: sawInProgress,
          initializing: sawInitializing,
          running: sawRunning,
        },
        health: counters,
      }));
      lastPrinted = Date.now();
    }

    await sleep(POLL_MS);
  }
}

async function runGuardedContinuation() {
  const child = spawn(process.execPath, [GUARDED_SCRIPT, ...process.argv.slice(2)], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });

  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`AVANTIQO_IMAGE_EXISTING_JOB_GUARDED_CHILD_SIGNAL:${signal}`));
        return;
      }
      resolve(code ?? 1);
    });
  });

  if (exitCode !== 0) {
    throw new Error(`AVANTIQO_IMAGE_EXISTING_JOB_GUARDED_CHILD_EXIT:${exitCode}`);
  }
}

async function main() {
  const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY);
  const apiKey =
    text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY) || text(process.env.RUNPOD_API_KEY);

  if (!managementKey) throw new Error("RUNPOD_MANAGEMENT_API_KEY_REQUIRED");
  if (!apiKey) throw new Error("RUNPOD_IMAGE_API_KEY_REQUIRED");

  console.log("AVANTIQO_IMAGE_EXISTING_JOB_WAIT_GUARD=ACTIVE");
  console.log(`AVANTIQO_IMAGE_EXISTING_JOB_WAIT_TIMEOUT_MS=${WAIT_MS}`);
  console.log("AVANTIQO_IMAGE_EXISTING_JOB_QUEUED_WORK_POLICY=WAIT_WITHOUT_MUTATION");
  console.log("AVANTIQO_IMAGE_EXISTING_JOB_AUTO_CANCEL=false");
  console.log("AVANTIQO_IMAGE_EXISTING_JOB_QUEUE_PURGE=false");
  console.log("AVANTIQO_IMAGE_EXISTING_JOB_IDLE_READY_THROTTLED_ARE_LIVE_WORK=false");
  console.log("AVANTIQO_IMAGE_EXISTING_JOB_IMAGE_GENERATION=false");
  console.log("AVANTIQO_IMAGE_EXISTING_JOB_PRODUCTION_DEPLOY=false");

  const endpointId = await resolveEndpointId(managementKey);
  await waitForExistingWork(apiKey, endpointId);
  await runGuardedContinuation();

  console.log(JSON.stringify({
    success: true,
    contract: "AVANTIQO_IMAGE_EXISTING_JOB_WAIT_GUARD_V2",
    endpoint_id: endpointId,
    existing_work_waited_out: true,
    queued_work_waited_without_mutation: true,
    automatic_cancel_performed: false,
    queue_purge_performed: false,
    guarded_continuation_passed: true,
    image_generation: false,
    production_deploy: false,
  }));
}

main().catch((error) => {
  console.error(JSON.stringify({
    success: false,
    contract: "AVANTIQO_IMAGE_EXISTING_JOB_WAIT_GUARD_V2",
    error: text(error?.message || error),
    automatic_cancel_performed: false,
    queue_purge_performed: false,
    image_generation: false,
    production_deploy: false,
  }));
  process.exitCode = 1;
});
