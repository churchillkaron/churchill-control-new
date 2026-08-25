const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_INTELLIGENCE_FAST_WARM_PROBE_CONTROLLER_V1";
const DEEP_ENDPOINT_NAME = "avantiqo-intelligence-v1";
const FAST_ENDPOINT_NAME = "avantiqo-intelligence-fast-v1";
const WAIT_TIMEOUT_MS = 600_000;
const POLL_MS = 5_000;

function text(value) {
  return String(value ?? "").trim();
}
function list(value) {
  return Array.isArray(value) ? value : [];
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function approved(name) {
  if (text(process.env[name]).toUpperCase() !== "YES") {
    throw new Error(`${name}=YES_REQUIRED`);
  }
}
function managementKey() {
  const value = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
  if (!value) throw new Error("RUNPOD_MANAGEMENT_OR_API_KEY_REQUIRED");
  return value;
}
function runtimeKey() {
  const value = text(process.env.RUNPOD_API_KEY || process.env.RUNPOD_MANAGEMENT_API_KEY);
  if (!value) throw new Error("RUNPOD_API_OR_MANAGEMENT_KEY_REQUIRED");
  return value;
}
function activeManagementWorkers(endpoint = {}) {
  return list(endpoint.workers).filter((worker) => {
    const desired = text(worker?.desiredStatus || worker?.desired_status).toUpperCase();
    return desired !== "EXITED";
  }).length;
}
function healthSummary(value = {}) {
  const jobs = object(value.jobs);
  const workers = object(value.workers);
  return {
    jobs: {
      in_queue: finite(jobs.inQueue ?? jobs.in_queue),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress),
    },
    workers: {
      idle: finite(workers.idle),
      ready: finite(workers.ready),
      initializing: finite(workers.initializing),
      running: finite(workers.running),
      unhealthy: finite(workers.unhealthy),
    },
  };
}
function safeEndpoint(endpoint = {}) {
  return {
    present: Boolean(text(endpoint.id)),
    name: text(endpoint.name) || null,
    workers_min: finite(endpoint.workersMin, -1),
    workers_max: finite(endpoint.workersMax, -1),
    active_management_workers: activeManagementWorkers(endpoint),
  };
}

async function rest(path, key, options = {}) {
  const response = await fetch(`${REST_BASE}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 800);
    throw new Error(`RUNPOD_REST_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body;
}

async function queueRequest(endpointId, key, path, options = {}) {
  const response = await fetch(
    `${QUEUE_BASE}/${encodeURIComponent(endpointId)}${path}`,
    {
      method: options.method || "GET",
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(options.timeoutMs || 30_000),
    },
  );
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || raw).slice(0, 800);
    throw new Error(`RUNPOD_QUEUE_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body;
}

async function queueHealth(endpointId, key) {
  return object(await queueRequest(endpointId, key, "/health"));
}

async function loadState(key) {
  const endpoints = await rest(
    "/endpoints?includeTemplate=false&includeWorkers=true",
    key,
  );
  if (!Array.isArray(endpoints)) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");
  const deepMatches = endpoints.filter((endpoint) => text(endpoint?.name) === DEEP_ENDPOINT_NAME);
  const fastMatches = endpoints.filter((endpoint) => text(endpoint?.name) === FAST_ENDPOINT_NAME);
  if (deepMatches.length !== 1) {
    throw new Error(`AVANTIQO_INTELLIGENCE_DEEP_ENDPOINT_RESOLUTION_FAILED:matches=${deepMatches.length}`);
  }
  if (fastMatches.length !== 1) {
    throw new Error(`AVANTIQO_INTELLIGENCE_FAST_ENDPOINT_RESOLUTION_FAILED:matches=${fastMatches.length}`);
  }
  return { deep: deepMatches[0], fast: fastMatches[0] };
}

async function patchCapacity(endpoint, workersMin, workersMax, key) {
  const endpointId = text(endpoint?.id);
  if (!endpointId) throw new Error("AVANTIQO_INTELLIGENCE_ENDPOINT_ID_REQUIRED");
  await rest(`/endpoints/${encodeURIComponent(endpointId)}`, key, {
    method: "PATCH",
    body: { workersMin, workersMax },
  });
  const verified = await rest(
    `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=false&includeWorkers=true`,
    key,
  );
  if (
    finite(verified.workersMin, -1) !== workersMin ||
    finite(verified.workersMax, -1) !== workersMax
  ) {
    throw new Error(
      `AVANTIQO_INTELLIGENCE_CAPACITY_VERIFY_FAILED:name=${text(verified.name)}:min=${finite(verified.workersMin, -1)}:max=${finite(verified.workersMax, -1)}:expected_min=${workersMin}:expected_max=${workersMax}`,
    );
  }
  return verified;
}

async function waitForDeepIdle(endpoint, management, runtime) {
  const endpointId = text(endpoint?.id);
  const startedAt = Date.now();
  while (Date.now() - startedAt <= WAIT_TIMEOUT_MS) {
    const [fresh, health] = await Promise.all([
      rest(
        `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=false&includeWorkers=true`,
        management,
      ),
      queueHealth(endpointId, runtime),
    ]);
    const summary = healthSummary(health);
    const idle =
      finite(fresh.workersMin, -1) === 0 &&
      summary.jobs.in_queue === 0 &&
      summary.jobs.in_progress === 0 &&
      summary.workers.initializing === 0 &&
      summary.workers.running === 0 &&
      activeManagementWorkers(fresh) === 0;
    if (idle) return { endpoint: fresh, health };
    console.log(
      JSON.stringify({
        event: "AVANTIQO_INTELLIGENCE_WARM_PROBE_WAITING_FOR_DEEP_IDLE",
        elapsed_seconds: Math.floor((Date.now() - startedAt) / 1000),
        health: summary,
        active_management_workers: activeManagementWorkers(fresh),
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  throw new Error("AVANTIQO_INTELLIGENCE_DEEP_IDLE_WAIT_TIMEOUT");
}

async function purgeFastPendingQueue(fast, runtime) {
  const endpointId = text(fast?.id);
  const before = healthSummary(await queueHealth(endpointId, runtime));
  if (before.jobs.in_progress > 0) {
    throw new Error(
      `AVANTIQO_INTELLIGENCE_FAST_QUEUE_PURGE_BLOCKED_IN_PROGRESS:${before.jobs.in_progress}`,
    );
  }
  if (before.jobs.in_queue === 0) {
    return { purged: 0, before, after: before };
  }
  approved("AVANTIQO_INTELLIGENCE_FAST_QUEUE_PURGE_APPROVED");
  await queueRequest(endpointId, runtime, "/purge-queue", { method: "POST" });
  const startedAt = Date.now();
  let after = before;
  while (Date.now() - startedAt <= 60_000) {
    after = healthSummary(await queueHealth(endpointId, runtime));
    if (after.jobs.in_queue === 0 && after.jobs.in_progress === 0) {
      return { purged: before.jobs.in_queue, before, after };
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(
    `AVANTIQO_INTELLIGENCE_FAST_QUEUE_PURGE_VERIFY_TIMEOUT:in_queue=${after.jobs.in_queue}:in_progress=${after.jobs.in_progress}`,
  );
}

async function waitForFastWarm(fast, runtime) {
  const endpointId = text(fast?.id);
  const startedAt = Date.now();
  let last = {};
  while (Date.now() - startedAt <= WAIT_TIMEOUT_MS) {
    last = healthSummary(await queueHealth(endpointId, runtime));
    const warmWorkers =
      last.workers.idle + last.workers.ready + last.workers.running;
    if (
      warmWorkers >= 1 &&
      last.workers.initializing === 0 &&
      last.workers.unhealthy === 0 &&
      last.jobs.in_queue === 0 &&
      last.jobs.in_progress === 0
    ) {
      return last;
    }
    console.log(
      JSON.stringify({
        event: "AVANTIQO_INTELLIGENCE_FAST_WARMING",
        elapsed_seconds: Math.floor((Date.now() - startedAt) / 1000),
        health: last,
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  throw new Error(
    `AVANTIQO_INTELLIGENCE_FAST_WARM_WAIT_TIMEOUT:in_queue=${last?.jobs?.in_queue ?? -1}:in_progress=${last?.jobs?.in_progress ?? -1}:idle=${last?.workers?.idle ?? -1}:ready=${last?.workers?.ready ?? -1}:initializing=${last?.workers?.initializing ?? -1}:running=${last?.workers?.running ?? -1}:unhealthy=${last?.workers?.unhealthy ?? -1}`,
  );
}

async function prepareFast(management, runtime) {
  approved("AVANTIQO_INTELLIGENCE_FAST_WARM_PROBE_APPROVED");
  let state = await loadState(management);
  if (
    finite(state.deep.workersMin, -1) !== 0 ||
    finite(state.deep.workersMax, -1) !== 1 ||
    finite(state.fast.workersMin, -1) !== 0 ||
    finite(state.fast.workersMax, -1) !== 0
  ) {
    throw new Error(
      `AVANTIQO_INTELLIGENCE_WARM_PROBE_PARKED_BASELINE_REQUIRED:deep_min=${finite(state.deep.workersMin, -1)}:deep_max=${finite(state.deep.workersMax, -1)}:fast_min=${finite(state.fast.workersMin, -1)}:fast_max=${finite(state.fast.workersMax, -1)}`,
    );
  }

  const purge = await purgeFastPendingQueue(state.fast, runtime);
  const deepIdle = await waitForDeepIdle(state.deep, management, runtime);
  state.deep = deepIdle.endpoint;

  await patchCapacity(state.deep, 0, 0, management);
  try {
    await patchCapacity(state.fast, 1, 1, management);
    const warmHealth = await waitForFastWarm(state.fast, runtime);
    state = await loadState(management);
    return { state, purge, warmHealth };
  } catch (error) {
    let fastParked = false;
    let deepRestored = false;
    try {
      await patchCapacity(state.fast, 0, 0, management);
      fastParked = true;
    } catch {
      fastParked = false;
    }
    if (fastParked) {
      try {
        await patchCapacity(state.deep, 0, 1, management);
        deepRestored = true;
      } catch {
        deepRestored = false;
      }
    }
    throw new Error(
      `AVANTIQO_INTELLIGENCE_FAST_WARM_PREPARE_FAILED:fast_parked=${fastParked ? "YES" : "NO"}:deep_restored=${deepRestored ? "YES" : "NO"}:${text(error?.message).slice(0, 700)}`,
    );
  }
}

async function restoreDeep(management, runtime) {
  approved("AVANTIQO_INTELLIGENCE_FAST_WARM_PROBE_RESTORE_APPROVED");
  let state = await loadState(management);
  if (
    finite(state.deep.workersMin, -1) === 0 &&
    finite(state.deep.workersMax, -1) === 1 &&
    finite(state.fast.workersMin, -1) === 0 &&
    finite(state.fast.workersMax, -1) === 0
  ) {
    return { state, purge: null };
  }
  if (
    finite(state.deep.workersMax, -1) !== 0 ||
    finite(state.fast.workersMax, -1) !== 1
  ) {
    throw new Error(
      `AVANTIQO_INTELLIGENCE_WARM_PROBE_RESTORE_STATE_INVALID:deep_min=${finite(state.deep.workersMin, -1)}:deep_max=${finite(state.deep.workersMax, -1)}:fast_min=${finite(state.fast.workersMin, -1)}:fast_max=${finite(state.fast.workersMax, -1)}`,
    );
  }

  const fastHealth = healthSummary(await queueHealth(text(state.fast.id), runtime));
  if (fastHealth.jobs.in_progress > 0) {
    const startedAt = Date.now();
    let last = fastHealth;
    while (Date.now() - startedAt <= WAIT_TIMEOUT_MS && last.jobs.in_progress > 0) {
      console.log(
        JSON.stringify({
          event: "AVANTIQO_INTELLIGENCE_WARM_PROBE_WAITING_FOR_FAST_JOB",
          elapsed_seconds: Math.floor((Date.now() - startedAt) / 1000),
          health: last,
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      last = healthSummary(await queueHealth(text(state.fast.id), runtime));
    }
    if (last.jobs.in_progress > 0) {
      throw new Error("AVANTIQO_INTELLIGENCE_FAST_JOB_WAIT_TIMEOUT_BEFORE_RESTORE");
    }
  }

  const purge = await purgeFastPendingQueue(state.fast, runtime);
  await patchCapacity(state.fast, 0, 0, management);
  try {
    await patchCapacity(state.deep, 0, 1, management);
  } catch (error) {
    let fastRecovered = false;
    try {
      await patchCapacity(state.fast, 1, 1, management);
      fastRecovered = true;
    } catch {
      fastRecovered = false;
    }
    throw new Error(
      `AVANTIQO_INTELLIGENCE_DEEP_RESTORE_FAILED:fast_recovered=${fastRecovered ? "YES" : "NO"}:${text(error?.message).slice(0, 700)}`,
    );
  }
  state = await loadState(management);
  return { state, purge };
}

const prepare = process.argv.includes("--prepare-fast");
const restore = process.argv.includes("--restore-deep");
if ([prepare, restore].filter(Boolean).length !== 1) {
  throw new Error("AVANTIQO_INTELLIGENCE_FAST_WARM_PROBE_SINGLE_ACTION_REQUIRED");
}

const management = managementKey();
const runtime = runtimeKey();
const result = prepare
  ? await prepareFast(management, runtime)
  : await restoreDeep(management, runtime);
const state = result.state;
const prepared =
  finite(state.deep.workersMin, -1) === 0 &&
  finite(state.deep.workersMax, -1) === 0 &&
  finite(state.fast.workersMin, -1) === 1 &&
  finite(state.fast.workersMax, -1) === 1;
const parked =
  finite(state.deep.workersMin, -1) === 0 &&
  finite(state.deep.workersMax, -1) === 1 &&
  finite(state.fast.workersMin, -1) === 0 &&
  finite(state.fast.workersMax, -1) === 0;

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: prepare ? "PREPARE_FAST_WARM" : "RESTORE_DEEP",
  deep_endpoint: safeEndpoint(state.deep),
  fast_endpoint: safeEndpoint(state.fast),
  fast_warm_prepared_state: prepared,
  parked_state: parked,
  total_intelligence_workers_max:
    finite(state.deep.workersMax) + finite(state.fast.workersMax),
  total_intelligence_workers_min:
    finite(state.deep.workersMin) + finite(state.fast.workersMin),
  purged_pending_jobs: finite(result.purge?.purged),
  warm_health: result.warmHealth || null,
  generation_submitted: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
