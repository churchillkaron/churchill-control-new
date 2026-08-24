import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import "./runpod-transient-fetch-retry-preload.mjs";

const REST = "https://rest.runpod.io/v1";
const SERVERLESS = "https://api.runpod.ai/v2";
const IMAGE_ENDPOINT_NAME = "avantiqo-image-v1";
const CONTINUATION_SCRIPT = "scripts/continue-avantiqo-image-shared-relocation-after-move-local.mjs";
const RETRY_PRELOAD_PATH = "scripts/runpod-transient-fetch-retry-preload.mjs";
const QUIESCENCE_TIMEOUT_MS = 12 * 60 * 1000;
const ABNORMAL_EXIT_CLEANUP_TIMEOUT_MS = 3 * 60 * 1000;
const POLL_MS = 10_000;
const CLEANUP_POLL_MS = 3000;
const TERMINAL_JOB_STATUSES = new Set([
  "COMPLETED",
  "FAILED",
  "TIMED_OUT",
  "CANCELLED",
  "CANCELED",
]);

function text(value) {
  return String(value ?? "").trim();
}

function yes(value) {
  return ["1", "true", "yes", "on", "approved"].includes(text(value).toLowerCase());
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
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

async function serverless(apiKey, endpointId, path, options = {}) {
  const response = await fetch(`${SERVERLESS}/${encodeURIComponent(endpointId)}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
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

function liveWork(counters) {
  return (
    counters.jobs.in_queue +
    counters.jobs.in_progress +
    counters.workers.initializing +
    counters.workers.running
  );
}

async function resolveEndpointId(managementKey) {
  const configured = text(process.env.RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID);
  if (configured) return configured;

  const endpoints = await rest(managementKey, "/endpoints");
  const matches = (Array.isArray(endpoints) ? endpoints : []).filter(
    (endpoint) => text(endpoint?.name) === IMAGE_ENDPOINT_NAME,
  );
  if (matches.length !== 1) {
    throw new Error(`IMAGE_POST_MOVE_ENDPOINT_NAME_RESOLUTION_FAILED:${matches.length}`);
  }
  const endpointId = text(matches[0]?.id);
  if (!endpointId) throw new Error("IMAGE_POST_MOVE_ENDPOINT_RESOLVED_ID_REQUIRED");
  console.log(`AVANTIQO_IMAGE_POST_MOVE_ENDPOINT_ID_RESOLVED_BY_NAME=${endpointId}`);
  return endpointId;
}

async function waitForQuiescence(apiKey, endpointId, phase) {
  const started = Date.now();
  let lastPrinted = 0;

  while (true) {
    const health = await serverless(apiKey, endpointId, "/health");
    const counters = healthCounters(health);

    if (counters.jobs.in_queue > 0 || counters.jobs.in_progress > 0) {
      throw new Error(
        `IMAGE_POST_MOVE_QUIESCENCE_LIVE_JOBS:${phase}:in_queue=${counters.jobs.in_queue}:in_progress=${counters.jobs.in_progress}`,
      );
    }
    if (counters.workers.unhealthy > 0) {
      throw new Error(
        `IMAGE_POST_MOVE_QUIESCENCE_UNHEALTHY_WORKER:${phase}:${counters.workers.unhealthy}`,
      );
    }

    const activeWorkers = counters.workers.initializing + counters.workers.running;
    if (activeWorkers === 0) {
      console.log(JSON.stringify({
        event: "AVANTIQO_IMAGE_POST_MOVE_QUIESCENCE_READY",
        phase,
        elapsed_seconds: Math.round((Date.now() - started) / 1000),
        health: counters,
      }));
      return counters;
    }

    const elapsed = Date.now() - started;
    if (elapsed >= QUIESCENCE_TIMEOUT_MS) {
      throw new Error(
        `IMAGE_POST_MOVE_QUIESCENCE_TIMEOUT:${phase}:${Math.round(elapsed / 1000)}s:initializing=${counters.workers.initializing}:running=${counters.workers.running}`,
      );
    }

    if (Date.now() - lastPrinted >= 15_000) {
      console.log(JSON.stringify({
        event: "AVANTIQO_IMAGE_POST_MOVE_QUIESCENCE_WAIT",
        phase,
        elapsed_seconds: Math.round(elapsed / 1000),
        health: counters,
      }));
      lastPrinted = Date.now();
    }
    await sleep(POLL_MS);
  }
}

function captureJobIds(chunk, buffer, knownJobIds) {
  const combined = buffer + chunk.toString("utf8");
  const lines = combined.split(/\r?\n/);
  const remainder = lines.pop() || "";
  for (const line of lines) {
    const match = line.match(
      /(?:AVANTIQO_IMAGE_POST_MOVE_CACHE_JOB_SUBMITTED|AVANTIQO_IMAGE_RUNTIME_PROBE_JOB)=([A-Za-z0-9-]+)/,
    );
    if (match?.[1]) knownJobIds.add(match[1]);
  }
  return remainder;
}

async function waitForJobTerminal(apiKey, endpointId, jobId) {
  const deadline = Date.now() + ABNORMAL_EXIT_CLEANUP_TIMEOUT_MS;
  while (true) {
    const body = await serverless(apiKey, endpointId, `/status/${encodeURIComponent(jobId)}`);
    const status = text(body.status).toUpperCase();
    if (TERMINAL_JOB_STATUSES.has(status)) return status;
    if (Date.now() >= deadline) {
      throw new Error(`IMAGE_POST_MOVE_ABNORMAL_EXIT_JOB_STILL_LIVE:${jobId}:${status || "UNKNOWN"}`);
    }
    await sleep(CLEANUP_POLL_MS);
  }
}

async function cleanupKnownJobs(apiKey, endpointId, knownJobIds) {
  const outcomes = [];
  for (const jobId of knownJobIds) {
    let before = null;
    try {
      before = await serverless(apiKey, endpointId, `/status/${encodeURIComponent(jobId)}`);
      const beforeStatus = text(before.status).toUpperCase();
      if (!TERMINAL_JOB_STATUSES.has(beforeStatus)) {
        await serverless(apiKey, endpointId, `/cancel/${encodeURIComponent(jobId)}`, {
          method: "POST",
        });
      }
      const terminalStatus = TERMINAL_JOB_STATUSES.has(beforeStatus)
        ? beforeStatus
        : await waitForJobTerminal(apiKey, endpointId, jobId);
      outcomes.push({ job_id: jobId, terminal_status: terminalStatus, verified: true });
    } catch (error) {
      outcomes.push({
        job_id: jobId,
        terminal_status: text(before?.status).toUpperCase() || null,
        verified: false,
        error: text(error?.message || error),
      });
    }
  }

  console.error(JSON.stringify({
    event: "AVANTIQO_IMAGE_POST_MOVE_ABNORMAL_EXIT_JOB_CLEANUP",
    jobs: outcomes,
  }));

  if (outcomes.some((item) => item.verified !== true)) {
    throw new Error("IMAGE_POST_MOVE_ABNORMAL_EXIT_JOB_CLEANUP_UNVERIFIED");
  }
}

async function verifyNoLiveWorkAfterAbnormalExit(apiKey, endpointId) {
  const deadline = Date.now() + ABNORMAL_EXIT_CLEANUP_TIMEOUT_MS;
  let last = null;
  while (true) {
    const health = await serverless(apiKey, endpointId, "/health");
    last = healthCounters(health);
    if (last.workers.unhealthy > 0) {
      throw new Error(
        `IMAGE_POST_MOVE_ABNORMAL_EXIT_UNHEALTHY_WORKER:${last.workers.unhealthy}`,
      );
    }
    if (liveWork(last) === 0) {
      console.error(JSON.stringify({
        event: "AVANTIQO_IMAGE_POST_MOVE_ABNORMAL_EXIT_QUIESCENCE_VERIFIED",
        health: last,
      }));
      return;
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `IMAGE_POST_MOVE_ABNORMAL_EXIT_QUIESCENCE_TIMEOUT:${JSON.stringify(last)}`,
      );
    }
    await sleep(CLEANUP_POLL_MS);
  }
}

async function recoverExactStaleJob(apiKey, endpointId, jobId) {
  if (!/^[A-Za-z0-9-]+$/.test(jobId)) {
    throw new Error("IMAGE_POST_MOVE_RECOVER_JOB_ID_INVALID");
  }
  console.error(JSON.stringify({
    event: "AVANTIQO_IMAGE_POST_MOVE_EXACT_STALE_JOB_RECOVERY_START",
    job_id: jobId,
  }));
  await cleanupKnownJobs(apiKey, endpointId, new Set([jobId]));
  console.error(JSON.stringify({
    event: "AVANTIQO_IMAGE_POST_MOVE_EXACT_STALE_JOB_RECOVERY_SETTLED",
    job_id: jobId,
  }));
}

async function recoverQueuedJobs(apiKey, endpointId) {
  const before = healthCounters(await serverless(apiKey, endpointId, "/health"));
  if (before.workers.unhealthy > 0) {
    throw new Error(
      `IMAGE_POST_MOVE_QUEUE_RECOVERY_UNHEALTHY_WORKER:${before.workers.unhealthy}`,
    );
  }
  if (before.jobs.in_progress > 0) {
    throw new Error(
      `IMAGE_POST_MOVE_QUEUE_RECOVERY_IN_PROGRESS_JOB_BLOCKS_PURGE:${before.jobs.in_progress}`,
    );
  }
  if (before.jobs.in_queue === 0) {
    console.error(JSON.stringify({
      event: "AVANTIQO_IMAGE_POST_MOVE_QUEUE_ALREADY_EMPTY",
      health: before,
    }));
    return;
  }

  const purged = await serverless(apiKey, endpointId, "/purge-queue", { method: "POST" });
  console.error(JSON.stringify({
    event: "AVANTIQO_IMAGE_POST_MOVE_STALE_QUEUE_PURGED",
    queued_before: before.jobs.in_queue,
    removed: number(purged?.removed),
    status: text(purged?.status) || null,
  }));
  await verifyNoLiveWorkAfterAbnormalExit(apiKey, endpointId);
}

function childNodeOptions() {
  const preloadUrl = pathToFileURL(resolve(process.cwd(), RETRY_PRELOAD_PATH)).href;
  return [text(process.env.NODE_OPTIONS), `--import=${preloadUrl}`]
    .filter(Boolean)
    .join(" ");
}

async function runContinuation(apiKey, endpointId, apply) {
  const knownJobIds = new Set();
  let stdoutBuffer = "";
  let stderrBuffer = "";

  const child = spawn(
    process.execPath,
    [CONTINUATION_SCRIPT, ...(apply ? ["--apply"] : [])],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        RUNPOD_API_KEY: apiKey,
        RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID: endpointId,
        NODE_OPTIONS: childNodeOptions(),
      },
      stdio: ["inherit", "pipe", "pipe"],
    },
  );

  child.stdout.on("data", (chunk) => {
    process.stdout.write(chunk);
    stdoutBuffer = captureJobIds(chunk, stdoutBuffer, knownJobIds);
  });
  child.stderr.on("data", (chunk) => {
    process.stderr.write(chunk);
    stderrBuffer = captureJobIds(chunk, stderrBuffer, knownJobIds);
  });

  const exitCode = await new Promise((resolvePromise, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`IMAGE_POST_MOVE_CONTINUATION_CHILD_SIGNAL:${signal}`));
        return;
      }
      resolvePromise(code ?? 1);
    });
  });

  if (exitCode !== 0) {
    console.error(JSON.stringify({
      event: "AVANTIQO_IMAGE_POST_MOVE_CONTINUATION_CHILD_FAILED",
      exit_code: exitCode,
      known_provider_job_ids: [...knownJobIds],
    }));
    if (knownJobIds.size) {
      await cleanupKnownJobs(apiKey, endpointId, knownJobIds);
    }
    await verifyNoLiveWorkAfterAbnormalExit(apiKey, endpointId);
    throw new Error(`IMAGE_POST_MOVE_CONTINUATION_CHILD_EXIT:${exitCode}`);
  }

  await waitForQuiescence(apiKey, endpointId, "POST_CONTINUATION");
}

async function main() {
  const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY);
  const apiKey =
    text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY) || text(process.env.RUNPOD_API_KEY);
  const apply = process.argv.includes("--apply");
  const recoverJobId = text(process.env.AVANTIQO_IMAGE_POST_MOVE_RECOVER_JOB_ID);
  const recoverApproved = yes(process.env.AVANTIQO_IMAGE_POST_MOVE_RECOVER_JOB_APPROVED);
  const recoverQueueApproved = yes(
    process.env.AVANTIQO_IMAGE_POST_MOVE_RECOVER_QUEUE_APPROVED,
  );

  if (!managementKey) throw new Error("RUNPOD_MANAGEMENT_API_KEY_REQUIRED");
  if (!apiKey) throw new Error("RUNPOD_IMAGE_API_KEY_REQUIRED");
  if (apply && !yes(process.env.AVANTIQO_IMAGE_SHARED_RELOCATION_APPROVED)) {
    throw new Error("AVANTIQO_IMAGE_SHARED_RELOCATION_APPROVED=YES_REQUIRED");
  }
  if (recoverJobId && !recoverApproved) {
    throw new Error("AVANTIQO_IMAGE_POST_MOVE_RECOVER_JOB_APPROVED=YES_REQUIRED");
  }

  console.log("AVANTIQO_IMAGE_POST_MOVE_CODE_STYLE_GUARD=ACTIVE");
  console.log("AVANTIQO_IMAGE_POST_MOVE_TRANSIENT_FETCH_RETRY=ACTIVE");
  console.log("AVANTIQO_IMAGE_POST_MOVE_ROLLBACK_GUARD=ACTIVE");
  console.log("AVANTIQO_IMAGE_POST_MOVE_ABNORMAL_EXIT_CLEANUP=ACTIVE");
  console.log("AVANTIQO_IMAGE_POST_MOVE_IDLE_READY_THROTTLED_ARE_LIVE_WORK=false");
  console.log(`AVANTIQO_IMAGE_POST_MOVE_EXACT_STALE_JOB_RECOVERY=${recoverJobId ? "REQUESTED" : "NOT_REQUESTED"}`);
  console.log(`AVANTIQO_IMAGE_POST_MOVE_STALE_QUEUE_RECOVERY=${recoverQueueApproved ? "APPROVED" : "NOT_APPROVED"}`);
  console.log("AVANTIQO_IMAGE_POST_MOVE_IMAGE_GENERATION=false");
  console.log("AVANTIQO_IMAGE_POST_MOVE_PRODUCTION_DEPLOY=false");
  console.log("AVANTIQO_IMAGE_POST_MOVE_SECRETS_PRINTED=false");

  const endpointId = await resolveEndpointId(managementKey);
  if (recoverJobId) {
    await recoverExactStaleJob(apiKey, endpointId, recoverJobId);
  }

  const beforeQuiescence = healthCounters(
    await serverless(apiKey, endpointId, "/health"),
  );
  if (beforeQuiescence.jobs.in_queue > 0 && !recoverQueueApproved) {
    throw new Error(
      `IMAGE_POST_MOVE_STALE_QUEUE_RECOVERY_APPROVAL_REQUIRED:in_queue=${beforeQuiescence.jobs.in_queue}:set_AVANTIQO_IMAGE_POST_MOVE_RECOVER_QUEUE_APPROVED=YES`,
    );
  }
  if (recoverQueueApproved) {
    await recoverQueuedJobs(apiKey, endpointId);
  }

  await waitForQuiescence(apiKey, endpointId, "PRE_CONTINUATION");
  await runContinuation(apiKey, endpointId, apply);

  console.log(JSON.stringify({
    success: true,
    contract: "AVANTIQO_IMAGE_POST_MOVE_CODE_STYLE_GUARD_V1",
    endpoint_id: endpointId,
    continuation_exit: "PASS",
    quiescence_verified_after_continuation: true,
    transient_fetch_retry: true,
    rollback_guard: true,
    abnormal_exit_cleanup: true,
    image_generation: false,
    production_deploy: false,
  }));
}

main().catch((error) => {
  console.error(JSON.stringify({
    success: false,
    contract: "AVANTIQO_IMAGE_POST_MOVE_CODE_STYLE_GUARD_V1",
    error: text(error?.message || error),
    image_generation: false,
    production_deploy: false,
  }));
  process.exitCode = 1;
});
