import { spawn } from "node:child_process";

const REST = "https://rest.runpod.io/v1";
const SERVERLESS = "https://api.runpod.ai/v2";
const CODE_ENDPOINT_NAME = "avantiqo-code-v1";
const MIGRATION_SCRIPT = "scripts/migrate-avantiqo-code-runpod-region-local.mjs";
const QUIESCENCE_TIMEOUT_MS = 12 * 60 * 1000;
const POLL_MS = 10_000;

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
  const configured = text(process.env.RUNPOD_AVANTIQO_CODE_ENDPOINT_ID);
  if (configured) return configured;

  const endpoints = await rest(managementKey, "/endpoints");
  const matches = (Array.isArray(endpoints) ? endpoints : []).filter(
    (endpoint) => text(endpoint?.name) === CODE_ENDPOINT_NAME,
  );
  if (matches.length !== 1) {
    throw new Error(`CODE_ENDPOINT_NAME_RESOLUTION_FAILED:${matches.length}`);
  }
  const endpointId = text(matches[0]?.id);
  if (!endpointId) throw new Error("CODE_ENDPOINT_RESOLVED_ID_REQUIRED");
  console.log(`AVANTIQO_CODE_ENDPOINT_ID_RESOLVED_BY_NAME=${endpointId}`);
  return endpointId;
}

async function waitForQuiescence(apiKey, endpointId) {
  const started = Date.now();
  let lastPrinted = 0;

  while (true) {
    const health = await serverless(apiKey, endpointId, "/health");
    const counters = healthCounters(health);

    if (counters.jobs.in_queue > 0 || counters.jobs.in_progress > 0) {
      throw new Error(
        `CODE_REGION_QUIESCENCE_LIVE_JOBS:in_queue=${counters.jobs.in_queue}:in_progress=${counters.jobs.in_progress}`,
      );
    }
    if (counters.workers.unhealthy > 0) {
      throw new Error(`CODE_REGION_QUIESCENCE_UNHEALTHY_WORKER:${counters.workers.unhealthy}`);
    }

    const activeWorkers = counters.workers.initializing + counters.workers.running;
    if (activeWorkers === 0) {
      console.log(JSON.stringify({
        event: "AVANTIQO_CODE_REGION_QUIESCENCE_READY",
        elapsed_seconds: Math.round((Date.now() - started) / 1000),
        health: counters,
      }));
      return counters;
    }

    const elapsed = Date.now() - started;
    if (elapsed >= QUIESCENCE_TIMEOUT_MS) {
      throw new Error(
        `CODE_REGION_QUIESCENCE_TIMEOUT:${Math.round(elapsed / 1000)}s:initializing=${counters.workers.initializing}:running=${counters.workers.running}`,
      );
    }

    if (Date.now() - lastPrinted >= 15_000) {
      console.log(JSON.stringify({
        event: "AVANTIQO_CODE_REGION_QUIESCENCE_WAIT",
        elapsed_seconds: Math.round(elapsed / 1000),
        health: counters,
      }));
      lastPrinted = Date.now();
    }
    await sleep(POLL_MS);
  }
}

async function runMigration(endpointId) {
  const child = spawn(process.execPath, ["--env-file=.env.local", MIGRATION_SCRIPT], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      RUNPOD_AVANTIQO_CODE_ENDPOINT_ID: endpointId,
    },
    stdio: "inherit",
  });

  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`CODE_REGION_MIGRATION_CHILD_SIGNAL:${signal}`));
        return;
      }
      resolve(code ?? 1);
    });
  });
  if (exitCode !== 0) {
    throw new Error(`CODE_REGION_MIGRATION_CHILD_EXIT:${exitCode}`);
  }
}

async function main() {
  const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY);
  const apiKey = text(process.env.RUNPOD_API_KEY);
  if (!managementKey) throw new Error("RUNPOD_MANAGEMENT_API_KEY_REQUIRED");
  if (!apiKey) throw new Error("RUNPOD_API_KEY_REQUIRED");

  console.log("AVANTIQO_CODE_REGION_QUIESCENCE_WRAPPER=READ_ONLY_UNTIL_MIGRATION");
  console.log("AVANTIQO_CODE_REGION_QUIESCENCE_PRODUCTION_DEPLOY_PERFORMED=false");

  const endpointId = await resolveEndpointId(managementKey);
  await waitForQuiescence(apiKey, endpointId);
  await runMigration(endpointId);
}

main().catch((error) => {
  console.error(JSON.stringify({
    success: false,
    contract: "AVANTIQO_CODE_REGION_QUIESCENCE_WRAPPER_V1",
    error: text(error?.message || error),
    production_deploy_performed: false,
  }, null, 2));
  process.exit(1);
});
