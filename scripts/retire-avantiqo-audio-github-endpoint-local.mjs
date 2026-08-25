import { readFileSync } from "node:fs";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_AUDIO_GITHUB_RETIRED_ENDPOINT_SHUTDOWN_V2";
const LIVE_ENDPOINT_NAME = "avantiqo-audio-v1";
const RETIRED_ENDPOINT_NAME = "avantiqo-audio-v1-github-retired";
const ENV_PATH = ".env.local";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function parseLocalEnv() {
  let source = "";
  try {
    source = readFileSync(ENV_PATH, "utf8");
  } catch {
    return {};
  }

  const parsed = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = rawLine.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, name, rawValue] = match;
    let value = rawValue.trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      const quote = value[0];
      value = value.slice(1, -1);
      if (quote === '"') {
        value = value
          .replace(/\\n/g, "\n")
          .replace(/\\r/g, "\r")
          .replace(/\\t/g, "\t")
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, "\\");
      }
    }
    parsed[name] = value;
  }
  return parsed;
}

const LOCAL_ENV = parseLocalEnv();

function runtimeEnv(name) {
  const inherited = text(process.env[name]);
  if (inherited) return inherited;
  return text(LOCAL_ENV[name]);
}

function required(name, fallback = "") {
  const value = runtimeEnv(name) || text(fallback);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function approved(name) {
  if (text(process.env[name]).toUpperCase() !== "YES") {
    throw new Error(`${name}=YES_REQUIRED`);
  }
}

async function readJson(response, prefix) {
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 800);
    throw new Error(`${prefix}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body ?? {};
}

async function rest(pathname, credential, options = {}) {
  const response = await fetch(`${REST_BASE}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${credential}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  return readJson(response, "AVANTIQO_AUDIO_RETIRED_ENDPOINT_REST");
}

async function queueHealth(endpointId, credential) {
  const response = await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, {
    headers: {
      Authorization: `Bearer ${credential}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });
  return readJson(response, "AVANTIQO_AUDIO_RETIRED_ENDPOINT_QUEUE");
}

function healthSummary(value = {}) {
  const jobs = object(value.jobs);
  const workers = object(value.workers);
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

function managementSummary(endpoint = {}) {
  const workers = list(endpoint.workers).map((worker) => ({
    id_present: Boolean(text(worker?.id)),
    desired_status: text(worker?.desiredStatus || worker?.desired_status).toUpperCase() || null,
    status: text(worker?.status || worker?.workerStatus || worker?.runtimeStatus).toUpperCase() || null,
  }));
  return {
    count: workers.length,
    non_exited: workers.filter((worker) => worker.desired_status !== "EXITED").length,
    all_desired_exited: workers.every((worker) => worker.desired_status === "EXITED"),
    workers,
  };
}

function safeEndpoint(endpoint = {}) {
  const template = object(endpoint.template);
  return {
    id: text(endpoint.id) || null,
    name: text(endpoint.name) || null,
    version: finite(endpoint.version),
    template_id: text(endpoint.templateId || template.id) || null,
    template_name: text(template.name) || null,
    image_name: text(template.imageName) || null,
    workers_min: finite(endpoint.workersMin),
    workers_max: finite(endpoint.workersMax),
    idle_timeout_seconds: finite(endpoint.idleTimeout),
    gpu_type_ids: list(endpoint.gpuTypeIds).map(text).filter(Boolean),
    network_volume_id: text(endpoint.networkVolumeId) || null,
  };
}

function assertNoLiveJobs(health) {
  if (health.jobs.in_queue !== 0 || health.jobs.in_progress !== 0) {
    throw new Error(
      `AVANTIQO_AUDIO_RETIRED_ENDPOINT_LIVE_JOBS_BLOCK:in_queue=${health.jobs.in_queue}:in_progress=${health.jobs.in_progress}`,
    );
  }
}

function assertRetirementSafe(health, management) {
  assertNoLiveJobs(health);
  if (management.non_exited !== 0) {
    throw new Error(
      `AVANTIQO_AUDIO_RETIRED_ENDPOINT_ACTIVE_MANAGEMENT_WORKERS_BLOCK:non_exited=${management.non_exited}`,
    );
  }
}

const apply = process.argv.includes("--apply");
if (apply) approved("AVANTIQO_AUDIO_GITHUB_RETIRED_ENDPOINT_SHUTDOWN_APPROVED");

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", runtimeEnv("RUNPOD_API_KEY"));
const queueKey = runtimeEnv("RUNPOD_AVANTIQO_AUDIO_API_KEY") || required("RUNPOD_API_KEY", managementKey);
const liveEndpointId = required("RUNPOD_AVANTIQO_AUDIO_ENDPOINT_ID");
const configuredRetiredId = runtimeEnv("RUNPOD_AVANTIQO_AUDIO_GITHUB_RETIRED_ENDPOINT_ID");

console.log(`AVANTIQO_AUDIO_GITHUB_RETIRED_ENDPOINT_SHUTDOWN_MODE=${apply ? "APPLY" : "PLAN"}`);
console.log("AVANTIQO_AUDIO_GITHUB_RETIRED_ENDPOINT_SHUTDOWN_ENV_EXECUTED=false");
console.log("AVANTIQO_AUDIO_GITHUB_RETIRED_ENDPOINT_SHUTDOWN_GENERATION_SUBMITTED=false");
console.log("AVANTIQO_AUDIO_GITHUB_RETIRED_ENDPOINT_SHUTDOWN_ENDPOINT_DELETED=false");
console.log("AVANTIQO_AUDIO_GITHUB_RETIRED_ENDPOINT_SHUTDOWN_TEMPLATE_DELETED=false");
console.log("AVANTIQO_AUDIO_GITHUB_RETIRED_ENDPOINT_SHUTDOWN_PRODUCTION_DEPLOY=false");
console.log("AVANTIQO_AUDIO_GITHUB_RETIRED_ENDPOINT_SHUTDOWN_SECRETS_PRINTED=false");

const endpoints = await rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey);
if (!Array.isArray(endpoints)) throw new Error("AVANTIQO_AUDIO_RETIRED_ENDPOINT_LIST_INVALID");

const liveMatches = endpoints.filter((endpoint) => text(endpoint?.id) === liveEndpointId);
if (liveMatches.length !== 1 || text(liveMatches[0]?.name) !== LIVE_ENDPOINT_NAME) {
  throw new Error(`AVANTIQO_AUDIO_LIVE_ENDPOINT_VERIFY_FAILED:matches=${liveMatches.length}`);
}
const liveEndpoint = liveMatches[0];

let retiredEndpoint = null;
let retiredResolution = null;
if (configuredRetiredId) {
  const matches = endpoints.filter((endpoint) => text(endpoint?.id) === configuredRetiredId);
  if (matches.length !== 1 || text(matches[0]?.name) !== RETIRED_ENDPOINT_NAME) {
    throw new Error(`AVANTIQO_AUDIO_RETIRED_ENDPOINT_ENV_VERIFY_FAILED:matches=${matches.length}`);
  }
  retiredEndpoint = matches[0];
  retiredResolution = "CONFIGURED_ID";
} else {
  const matches = endpoints.filter((endpoint) => text(endpoint?.name) === RETIRED_ENDPOINT_NAME);
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_AUDIO_RETIRED_ENDPOINT_NAME_RESOLUTION_FAILED:matches=${matches.length}`);
  }
  retiredEndpoint = matches[0];
  retiredResolution = "EXACT_NAME";
}

const retiredEndpointId = text(retiredEndpoint.id);
if (!retiredEndpointId || retiredEndpointId === liveEndpointId) {
  throw new Error("AVANTIQO_AUDIO_RETIRED_ENDPOINT_ID_INVALID");
}

const health = healthSummary(await queueHealth(retiredEndpointId, queueKey));
const management = managementSummary(retiredEndpoint);
assertRetirementSafe(health, management);

const alreadyShutDown = finite(retiredEndpoint.workersMin, 0) === 0 && finite(retiredEndpoint.workersMax, 0) === 0;
const staleInitializingCounterTolerated =
  health.workers.initializing > 0 && management.non_exited === 0 && management.all_desired_exited;
const plan = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  local_env: {
    path: ENV_PATH,
    parsed_without_execution: true,
    malformed_non_assignment_lines_ignored: true,
    secret_values_printed: false,
  },
  live_endpoint: safeEndpoint(liveEndpoint),
  retired_endpoint_resolution: retiredResolution,
  retired_endpoint: safeEndpoint(retiredEndpoint),
  retired_health: health,
  retired_management_workers: management,
  shutdown_preconditions: {
    no_live_jobs: true,
    management_non_exited_workers: management.non_exited,
    all_management_workers_desired_exited: management.all_desired_exited,
    stale_initializing_counter_tolerated: staleInitializingCounterTolerated,
  },
  shutdown_required: !alreadyShutDown,
  shutdown_performed: false,
  rollback_endpoint_retained: true,
  endpoint_deleted: false,
  template_deleted: false,
  generation_submitted: false,
  production_web_deploy: false,
  secrets_in_output: false,
  next_action: alreadyShutDown
    ? "REPAIR_CURRENT_AUDIO_IMMUTABLE_TEMPLATE_IMAGE"
    : "APPLY_RETIRED_ENDPOINT_ZERO_SCALING_THEN_REPAIR_CURRENT_AUDIO_IMMUTABLE_TEMPLATE_IMAGE",
};

if (!apply || alreadyShutDown) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

const freshEndpoints = await rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey);
if (!Array.isArray(freshEndpoints)) throw new Error("AVANTIQO_AUDIO_RETIRED_ENDPOINT_FRESH_LIST_INVALID");
const freshLive = freshEndpoints.filter((endpoint) => text(endpoint?.id) === liveEndpointId);
const freshRetired = freshEndpoints.filter((endpoint) => text(endpoint?.id) === retiredEndpointId);
if (freshLive.length !== 1 || text(freshLive[0]?.name) !== LIVE_ENDPOINT_NAME) {
  throw new Error("AVANTIQO_AUDIO_LIVE_ENDPOINT_CHANGED_REPLAN_REQUIRED");
}
if (freshRetired.length !== 1 || text(freshRetired[0]?.name) !== RETIRED_ENDPOINT_NAME) {
  throw new Error("AVANTIQO_AUDIO_RETIRED_ENDPOINT_CHANGED_REPLAN_REQUIRED");
}
const freshHealth = healthSummary(await queueHealth(retiredEndpointId, queueKey));
const freshManagement = managementSummary(freshRetired[0]);
assertRetirementSafe(freshHealth, freshManagement);

await rest(`/endpoints/${encodeURIComponent(retiredEndpointId)}`, managementKey, {
  method: "PATCH",
  body: { workersMin: 0, workersMax: 0 },
});

const verified = await rest(
  `/endpoints/${encodeURIComponent(retiredEndpointId)}?includeTemplate=true&includeWorkers=true`,
  managementKey,
);
if (text(verified?.id) !== retiredEndpointId || text(verified?.name) !== RETIRED_ENDPOINT_NAME) {
  throw new Error("AVANTIQO_AUDIO_RETIRED_ENDPOINT_VERIFY_ID_NAME_FAILED");
}
if (finite(verified?.workersMin, -1) !== 0 || finite(verified?.workersMax, -1) !== 0) {
  throw new Error("AVANTIQO_AUDIO_RETIRED_ENDPOINT_VERIFY_ZERO_SCALING_FAILED");
}

console.log(JSON.stringify({
  ...plan,
  mode: "APPLY",
  retired_endpoint: safeEndpoint(verified),
  shutdown_required: true,
  shutdown_performed: true,
  rollback_endpoint_retained: true,
  endpoint_deleted: false,
  template_deleted: false,
  generation_submitted: false,
  production_web_deploy: false,
  secrets_in_output: false,
  next_action: "REPAIR_CURRENT_AUDIO_IMMUTABLE_TEMPLATE_IMAGE",
}, null, 2));
