import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const IMAGE_ENDPOINT_NAME = "avantiqo-image-v1";
const DRAIN_WAIT_MS = Math.max(
  30_000,
  Number(process.env.AVANTIQO_IMAGE_ORPHAN_DRAIN_WAIT_MS || 10 * 60 * 1000),
);
const POLL_MS = Math.max(
  1_000,
  Number(process.env.AVANTIQO_IMAGE_ORPHAN_DRAIN_POLL_MS || 5_000),
);

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function sameSet(left, right) {
  const a = unique(left).sort();
  const b = unique(right).sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function endpointVolumeIds(endpoint = {}) {
  return unique([endpoint.networkVolumeId, ...list(endpoint.networkVolumeIds)]);
}

function endpointGpuTypes(endpoint = {}) {
  return unique(list(endpoint.gpuTypeIds));
}

function endpointInvariant(endpoint = {}) {
  return {
    name: text(endpoint.name),
    template_id: text(endpoint.templateId || endpoint.template?.id),
    network_volume_ids: endpointVolumeIds(endpoint),
    gpu_type_ids: endpointGpuTypes(endpoint),
    workers_min: finite(endpoint.workersMin),
  };
}

function sameInvariant(left, right) {
  return (
    left.name === right.name &&
    left.template_id === right.template_id &&
    sameSet(left.network_volume_ids, right.network_volume_ids) &&
    sameSet(left.gpu_type_ids, right.gpu_type_ids) &&
    left.workers_min === right.workers_min
  );
}

function healthCounters(body = {}) {
  const jobs = body?.jobs || {};
  const workers = body?.workers || {};
  return {
    jobs: {
      in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
    },
    workers: {
      idle: finite(workers.idle, 0),
      initializing: finite(workers.initializing, 0),
      ready: finite(workers.ready, 0),
      running: finite(workers.running, 0),
      throttled: finite(workers.throttled, 0),
      unhealthy: finite(workers.unhealthy, 0),
    },
  };
}

function totalJobs(counters) {
  return counters.jobs.in_queue + counters.jobs.in_progress;
}

function totalWorkers(counters) {
  return Object.values(counters.workers).reduce((sum, value) => sum + finite(value, 0), 0);
}

function lifecycleWorkers(counters) {
  return (
    counters.workers.initializing +
    counters.workers.running +
    counters.workers.throttled +
    counters.workers.unhealthy
  );
}

async function parse(response, prefix) {
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 1200);
    throw new Error(`${prefix}_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body;
}

async function rest(path, credential, options = {}) {
  const response = await fetch(`${REST_BASE}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${credential}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  return parse(response, "RUNPOD_REST_HTTP");
}

async function health(endpointId, inferenceKey) {
  const response = await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, {
    headers: {
      Authorization: `Bearer ${inferenceKey}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });
  return parse(response, "RUNPOD_HEALTH_HTTP");
}

function runStabilizedCache() {
  const script = fileURLToPath(
    new URL("./cache-avantiqo-image-2512-stabilized-local.mjs", import.meta.url),
  );
  const result = spawnSync(process.execPath, [script, "--apply"], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`AVANTIQO_IMAGE_ORPHAN_DRAIN_CHILD_SIGNAL:${result.signal}`);
  if (result.status !== 0) {
    throw new Error(`AVANTIQO_IMAGE_ORPHAN_DRAIN_CACHE_CHILD_FAILED:exit=${result.status}`);
  }
}

const apply = process.argv.includes("--apply");
const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const inferenceKey = text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY) || required("RUNPOD_API_KEY");
const configuredEndpointId = text(process.env.RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID);

console.log(`AVANTIQO_IMAGE_ORPHAN_DRAIN_MODE=${apply ? "APPLY" : "PLAN"}`);
console.log("AVANTIQO_IMAGE_ORPHAN_DRAIN_REQUIRES_ZERO_JOBS=true");
console.log("AVANTIQO_IMAGE_ORPHAN_DRAIN_WORKERS_MAX_TEMPORARY=0");
console.log("AVANTIQO_IMAGE_ORPHAN_DRAIN_REBUILD=false");
console.log("AVANTIQO_IMAGE_ORPHAN_DRAIN_GENERATION=false");
console.log("AVANTIQO_IMAGE_ORPHAN_DRAIN_PRODUCTION_DEPLOY=false");
console.log("AVANTIQO_IMAGE_ORPHAN_DRAIN_SECRETS_PRINTED=false");

const endpoints = await rest(
  "/endpoints?includeTemplate=false&includeWorkers=false",
  managementKey,
);
if (!Array.isArray(endpoints)) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");

const matches = configuredEndpointId
  ? endpoints.filter(
      (endpoint) =>
        text(endpoint?.id) === configuredEndpointId && text(endpoint?.name) === IMAGE_ENDPOINT_NAME,
    )
  : endpoints.filter((endpoint) => text(endpoint?.name) === IMAGE_ENDPOINT_NAME);
if (matches.length !== 1) {
  throw new Error(`AVANTIQO_IMAGE_ORPHAN_DRAIN_ENDPOINT_RESOLUTION_FAILED:matches=${matches.length}`);
}
const endpointId = text(matches[0]?.id);
if (!endpointId) throw new Error("AVANTIQO_IMAGE_ORPHAN_DRAIN_ENDPOINT_ID_MISSING");

let endpoint = await rest(
  `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
  managementKey,
);
let counters = healthCounters(await health(endpointId, inferenceKey));

if (text(endpoint?.name) !== IMAGE_ENDPOINT_NAME) {
  throw new Error("AVANTIQO_IMAGE_ORPHAN_DRAIN_ENDPOINT_NAME_MISMATCH");
}
if (finite(endpoint?.workersMin) !== 0 || finite(endpoint?.workersMax) !== 1) {
  throw new Error(
    `AVANTIQO_IMAGE_ORPHAN_DRAIN_SCALING_UNEXPECTED:min=${finite(endpoint?.workersMin)}:max=${finite(endpoint?.workersMax)}`,
  );
}
if (totalJobs(counters) !== 0) {
  throw new Error(
    `AVANTIQO_IMAGE_ORPHAN_DRAIN_REFUSED_JOBS_PRESENT:queued=${counters.jobs.in_queue}:inProgress=${counters.jobs.in_progress}`,
  );
}

const originalInvariant = endpointInvariant(endpoint);
const drainRequired = lifecycleWorkers(counters) > 0;
const plan = {
  success: true,
  contract: "AVANTIQO_IMAGE_ORPHAN_WORKER_DRAIN_V1",
  mode: apply ? "APPLY" : "PLAN",
  endpoint_name: IMAGE_ENDPOINT_NAME,
  endpoint_id_present: true,
  initial_health: counters,
  drain_required: drainRequired,
  original_workers_min: finite(endpoint?.workersMin),
  original_workers_max: finite(endpoint?.workersMax),
  safety: {
    jobs_must_remain_zero: true,
    template_mutation: false,
    network_volume_mutation: false,
    gpu_pool_mutation: false,
    generation: false,
    production_deploy: false,
  },
};

if (!apply) {
  console.log("AVANTIQO_IMAGE_ORPHAN_DRAIN_PLAN=READY");
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

if (drainRequired) {
  // Refetch immediately before the write. Only workersMax may change.
  endpoint = await rest(
    `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
    managementKey,
  );
  counters = healthCounters(await health(endpointId, inferenceKey));
  if (!sameInvariant(endpointInvariant(endpoint), originalInvariant)) {
    throw new Error("AVANTIQO_IMAGE_ORPHAN_DRAIN_ENDPOINT_CHANGED_BEFORE_WRITE");
  }
  if (finite(endpoint?.workersMax) !== 1) {
    throw new Error("AVANTIQO_IMAGE_ORPHAN_DRAIN_WORKERS_MAX_CHANGED_BEFORE_WRITE");
  }
  if (totalJobs(counters) !== 0) {
    throw new Error("AVANTIQO_IMAGE_ORPHAN_DRAIN_JOBS_CHANGED_BEFORE_WRITE");
  }

  let frozen = false;
  try {
    await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
      method: "PATCH",
      body: { workersMax: 0 },
    });
    frozen = true;
    console.log("AVANTIQO_IMAGE_ORPHAN_DRAIN_WORKERS_MAX_ZERO=true");

    const deadline = Date.now() + DRAIN_WAIT_MS;
    let lastPrinted = 0;
    let drained = false;
    while (Date.now() <= deadline) {
      const currentEndpoint = await rest(
        `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
        managementKey,
      );
      if (!sameInvariant(endpointInvariant(currentEndpoint), originalInvariant)) {
        throw new Error("AVANTIQO_IMAGE_ORPHAN_DRAIN_ENDPOINT_CHANGED_DURING_DRAIN");
      }
      if (finite(currentEndpoint?.workersMax) !== 0) {
        throw new Error("AVANTIQO_IMAGE_ORPHAN_DRAIN_WORKERS_MAX_CHANGED_DURING_DRAIN");
      }

      counters = healthCounters(await health(endpointId, inferenceKey));
      if (totalJobs(counters) !== 0) {
        throw new Error(
          `AVANTIQO_IMAGE_ORPHAN_DRAIN_NEW_JOB_DETECTED:queued=${counters.jobs.in_queue}:inProgress=${counters.jobs.in_progress}`,
        );
      }
      if (totalWorkers(counters) === 0) {
        drained = true;
        break;
      }
      if (Date.now() - lastPrinted >= 15_000) {
        console.log(
          `AVANTIQO_IMAGE_ORPHAN_DRAIN_WAIT initializing=${counters.workers.initializing} throttled=${counters.workers.throttled} running=${counters.workers.running} unhealthy=${counters.workers.unhealthy} idle=${counters.workers.idle} ready=${counters.workers.ready}`,
        );
        lastPrinted = Date.now();
      }
      await sleep(POLL_MS);
    }
    if (!drained) {
      throw new Error("AVANTIQO_IMAGE_ORPHAN_DRAIN_TIMEOUT");
    }
    console.log("AVANTIQO_IMAGE_ORPHAN_DRAIN_ALL_WORKERS_ZERO=true");

    const preRestore = await rest(
      `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
      managementKey,
    );
    if (!sameInvariant(endpointInvariant(preRestore), originalInvariant)) {
      throw new Error("AVANTIQO_IMAGE_ORPHAN_DRAIN_ENDPOINT_CHANGED_BEFORE_RESTORE");
    }
    if (finite(preRestore?.workersMax) !== 0) {
      throw new Error("AVANTIQO_IMAGE_ORPHAN_DRAIN_FREEZE_LOST_BEFORE_RESTORE");
    }

    await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
      method: "PATCH",
      body: { workersMax: 1 },
    });
    frozen = false;

    const restored = await rest(
      `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
      managementKey,
    );
    if (!sameInvariant(endpointInvariant(restored), originalInvariant)) {
      throw new Error("AVANTIQO_IMAGE_ORPHAN_DRAIN_ENDPOINT_CHANGED_AFTER_RESTORE");
    }
    if (finite(restored?.workersMin) !== 0 || finite(restored?.workersMax) !== 1) {
      throw new Error("AVANTIQO_IMAGE_ORPHAN_DRAIN_SCALING_RESTORE_VERIFY_FAILED");
    }

    counters = healthCounters(await health(endpointId, inferenceKey));
    if (totalJobs(counters) !== 0 || lifecycleWorkers(counters) !== 0) {
      throw new Error(
        `AVANTIQO_IMAGE_ORPHAN_DRAIN_POST_RESTORE_NOT_QUIESCENT:jobs=${totalJobs(counters)}:lifecycleWorkers=${lifecycleWorkers(counters)}`,
      );
    }
    console.log("AVANTIQO_IMAGE_ORPHAN_DRAIN_SCALING_RESTORED=true");
  } finally {
    if (frozen) {
      try {
        const current = await rest(
          `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
          managementKey,
        );
        if (
          sameInvariant(endpointInvariant(current), originalInvariant) &&
          finite(current?.workersMax) === 0
        ) {
          await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
            method: "PATCH",
            body: { workersMax: 1 },
          });
          console.log("AVANTIQO_IMAGE_ORPHAN_DRAIN_EMERGENCY_RESTORE=COMPLETE");
        } else {
          console.error("AVANTIQO_IMAGE_ORPHAN_DRAIN_EMERGENCY_RESTORE=SKIPPED_CONCURRENT_CHANGE");
          process.exitCode = 2;
        }
      } catch (error) {
        console.error(
          `AVANTIQO_IMAGE_ORPHAN_DRAIN_EMERGENCY_RESTORE_FAILED:${text(error?.message || error)}`,
        );
        process.exitCode = 2;
      }
    }
  }
} else {
  console.log("AVANTIQO_IMAGE_ORPHAN_DRAIN_NOT_REQUIRED=true");
}

console.log("AVANTIQO_IMAGE_ORPHAN_DRAIN_HANDOFF=STABILIZED_CACHE");
runStabilizedCache();
