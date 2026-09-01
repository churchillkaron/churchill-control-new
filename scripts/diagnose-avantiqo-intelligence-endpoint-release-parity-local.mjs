import { spawnSync } from "node:child_process";

const REST_BASE = "https://rest.runpod.io/v1";
const CONTROL_BASE = "https://api.runpod.io/v2";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_INTELLIGENCE_ENDPOINT_RELEASE_PARITY_DIAGNOSTIC_V1";
const DEEP_NAME = "avantiqo-intelligence-v1";
const FAST_NAME = "avantiqo-intelligence-fast-v1";

const text = (value) => String(value ?? "").trim();
const list = (value) => (Array.isArray(value) ? value : []);
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function redact(value) {
  return String(value ?? "")
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/([?&](?:token|key|api_key|apikey|sig|signature)=)[^&\s]+/gi, "$1[REDACTED]");
}

function shell(name, args, code) {
  const result = spawnSync(name, args, { cwd: process.cwd(), encoding: "utf8", env: process.env });
  if (result.status !== 0) throw new Error(`${code}:${text(result.stderr || result.stdout).slice(0, 500)}`);
  return text(result.stdout);
}

function validateCurrentMain() {
  const expected = text(process.env.AVANTIQO_INTELLIGENCE_RELEASE_EXPECTED_MAIN);
  const branch = shell("git", ["branch", "--show-current"], "AVANTIQO_INTELLIGENCE_RELEASE_GIT_BRANCH_FAILED");
  if (branch !== "main") throw new Error(`AVANTIQO_INTELLIGENCE_RELEASE_MAIN_REQUIRED:actual=${branch || "DETACHED"}`);
  const head = shell("git", ["rev-parse", "HEAD"], "AVANTIQO_INTELLIGENCE_RELEASE_GIT_HEAD_FAILED");
  if (expected) {
    if (head !== expected) {
      throw new Error(`AVANTIQO_INTELLIGENCE_RELEASE_PINNED_MAIN_MISMATCH:head=${head}:expected=${expected}`);
    }
    return head;
  }
  shell("git", ["fetch", "origin", "main"], "AVANTIQO_INTELLIGENCE_RELEASE_GIT_FETCH_FAILED");
  const remote = shell("git", ["rev-parse", "origin/main"], "AVANTIQO_INTELLIGENCE_RELEASE_GIT_REMOTE_FAILED");
  if (head !== remote) throw new Error(`AVANTIQO_INTELLIGENCE_RELEASE_LOCAL_MAIN_NOT_CURRENT:head=${head}:origin_main=${remote}`);
  return head;
}

async function requestJson(url, key) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    const detail = redact(text(body?.message || body?.error || body?.detail || raw)).slice(0, 700);
    throw new Error(`RUNPOD_INTELLIGENCE_RELEASE_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body ?? {};
}

async function optionalJson(url, key) {
  try {
    return { ok: true, body: await requestJson(url, key), error: null };
  } catch (error) {
    return { ok: false, body: null, error: redact(text(error?.message || error)).slice(0, 700) };
  }
}

function safeEndpoint(endpoint) {
  return {
    name: text(endpoint?.name) || null,
    version: finite(endpoint?.version),
    template_id_present: Boolean(text(endpoint?.templateId || endpoint?.template?.id)),
    workers_min: finite(endpoint?.workersMin),
    workers_max: finite(endpoint?.workersMax),
    gpu_count: finite(endpoint?.gpuCount),
    gpu_type_ids: list(endpoint?.gpuTypeIds).map(text).filter(Boolean),
    data_center_ids: list(endpoint?.dataCenterIds).map(text).filter(Boolean),
    allowed_cuda_versions: list(endpoint?.allowedCudaVersions).map(text).filter(Boolean),
    min_cuda_version: text(endpoint?.minCudaVersion) || null,
    flashboot: endpoint?.flashboot === true,
  };
}

function safeWorkers(body) {
  return list(body?.workers).map((worker) => ({
    id_present: Boolean(text(worker?.id)),
    status: text(worker?.status).toUpperCase() || null,
    version: finite(worker?.version),
    image: text(worker?.image) || null,
    gpu_count: finite(worker?.gpuCount),
    gpu_type_id: text(worker?.gpuTypeId) || null,
    data_center_id: text(worker?.dataCenterId) || null,
    started_at: text(worker?.startedAt) || null,
    is_stale: worker?.isStale === true,
  }));
}

function safeHealth(body) {
  const jobs = object(body?.jobs);
  const workers = object(body?.workers);
  return {
    jobs: {
      completed: finite(jobs.completed, 0),
      failed: finite(jobs.failed, 0),
      in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
      retried: finite(jobs.retried, 0),
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

function safeReleaseBody(body) {
  const rollout = object(body?.rollout);
  const releases = list(body?.releases).slice(0, 20).map((release) => ({
    id_present: Boolean(text(release?.id)),
    version: finite(release?.version),
    source: text(release?.source) || null,
    build_id_present: Boolean(text(release?.buildId)),
    worker_count: finite(release?.workerCount),
    created_at: text(release?.createdAt) || null,
    changed_fields: list(release?.diff).map((entry) => text(entry?.field)).filter(Boolean),
  }));
  return {
    endpoint_version: finite(body?.endpointVersion),
    rollout: {
      in_progress: rollout?.inProgress === true,
      workers_on_latest: finite(rollout?.workersOnLatest),
      workers_total: finite(rollout?.workersTotal),
      percent_on_latest: finite(rollout?.percentOnLatest),
    },
    releases,
  };
}

function releaseSignals(endpoint, releaseBody, workers) {
  const releaseVersions = releaseBody?.releases.map((release) => release.version).filter((value) => value !== null) || [];
  const highestReleaseVersion = releaseVersions.length ? Math.max(...releaseVersions) : null;
  return {
    release_metadata_available: Boolean(releaseBody),
    endpoint_version_matches_control_plane: endpoint.version !== null && releaseBody?.endpoint_version !== null
      ? endpoint.version === releaseBody.endpoint_version
      : null,
    highest_release_version: highestReleaseVersion,
    endpoint_version_matches_highest_release: endpoint.version !== null && highestReleaseVersion !== null
      ? endpoint.version === highestReleaseVersion
      : null,
    rollout_in_progress: releaseBody?.rollout?.in_progress === true,
    rollout_has_zero_workers: releaseBody?.rollout?.workers_total === 0,
    retained_worker_count: workers.length,
    stale_worker_present: workers.some((worker) => worker.is_stale),
    worker_versions: [...new Set(workers.map((worker) => worker.version).filter((value) => value !== null))],
  };
}

async function lane(endpoint, managementKey, runtimeKey) {
  const id = text(endpoint?.id);
  const [workersResult, releaseResult, healthResult] = await Promise.all([
    optionalJson(`${CONTROL_BASE}/serverless/${encodeURIComponent(id)}/workers`, managementKey),
    optionalJson(`${CONTROL_BASE}/serverless/${encodeURIComponent(id)}/releases`, managementKey),
    optionalJson(`${QUEUE_BASE}/${encodeURIComponent(id)}/health`, runtimeKey),
  ]);
  const endpointSafe = safeEndpoint(endpoint);
  const workers = workersResult.ok ? safeWorkers(workersResult.body) : [];
  const releases = releaseResult.ok ? safeReleaseBody(releaseResult.body) : null;
  return {
    endpoint: endpointSafe,
    workers,
    workers_error: workersResult.error,
    releases,
    releases_error: releaseResult.error,
    health: healthResult.ok ? safeHealth(healthResult.body) : null,
    health_error: healthResult.error,
    signals: releaseSignals(endpointSafe, releases, workers),
  };
}

const mainCommit = validateCurrentMain();
const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
const runtimeKey = text(process.env.RUNPOD_API_KEY || managementKey);
if (!managementKey || !runtimeKey) throw new Error("RUNPOD_MANAGEMENT_OR_API_KEY_REQUIRED");

const endpoints = await requestJson(`${REST_BASE}/endpoints?includeTemplate=true&includeWorkers=true`, managementKey);
const resolveOne = (name) => {
  const matches = list(endpoints).filter((entry) => text(entry?.name) === name);
  if (matches.length !== 1) throw new Error(`AVANTIQO_INTELLIGENCE_RELEASE_ENDPOINT_RESOLUTION_FAILED:name=${name}:matches=${matches.length}`);
  return matches[0];
};

const deep = await lane(resolveOne(DEEP_NAME), managementKey, runtimeKey);
const fast = await lane(resolveOne(FAST_NAME), managementKey, runtimeKey);

let diagnosis = "RELEASE_AND_SCHEDULER_METADATA_COLLECTED";
let nextAction = "COMPARE_DEEP_FAST_RELEASE_METADATA";
if (fast.releases_error) {
  diagnosis = "FAST_RELEASE_METADATA_UNAVAILABLE";
  nextAction = "INSPECT_FAST_ENDPOINT_IN_RUNPOD_CONTROL_PLANE";
} else if (fast.signals.rollout_in_progress && fast.signals.rollout_has_zero_workers) {
  diagnosis = "FAST_RELEASE_ROLLOUT_STALLED_WITH_ZERO_WORKERS";
  nextAction = "REPAIR_OR_RECREATE_FAST_ENDPOINT_RELEASE_BINDING";
} else if (fast.signals.endpoint_version_matches_control_plane === false || fast.signals.endpoint_version_matches_highest_release === false) {
  diagnosis = "FAST_ENDPOINT_RELEASE_VERSION_MISMATCH";
  nextAction = "REPAIR_FAST_ENDPOINT_RELEASE_BINDING";
} else if (fast.signals.stale_worker_present) {
  diagnosis = "FAST_STALE_WORKER_RELEASE_PRESENT";
  nextAction = "RECYCLE_FAST_STALE_RELEASE_WORKER";
} else if (fast.signals.release_metadata_available && fast.signals.retained_worker_count === 0) {
  diagnosis = "FAST_RELEASE_METADATA_HEALTHY_NO_RETAINED_WORKER";
  nextAction = "IF_WARM_MIN_ONE_STILL_PROVISIONS_ZERO_WORKERS_ESCALATE_SCHEDULER_OR_GPU_CAPACITY";
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: "READ_ONLY",
  main_commit: mainCommit,
  pinned_main: Boolean(text(process.env.AVANTIQO_INTELLIGENCE_RELEASE_EXPECTED_MAIN)),
  deep,
  fast,
  diagnosis,
  next_action: nextAction,
  generation_submitted: false,
  inference_performed: false,
  gpu_activation_performed: false,
  endpoint_mutation_performed: false,
  production_deploy_performed: false,
  secrets_in_output: false,
}, null, 2));
