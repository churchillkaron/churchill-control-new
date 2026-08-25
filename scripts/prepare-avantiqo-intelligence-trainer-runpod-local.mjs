import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_INTELLIGENCE_TRAINER_RACE_SAFE_PREPARATION_V1";
const CODE_ENDPOINT_NAME = "avantiqo-code-v1";
const SHARED_VOLUME_NAME = "avantiqo-shared-intelligence-code-cache";
const REQUIRED_VOLUME_SIZE_GB = 160;
const EXPANSION_SCRIPT = "scripts/expand-avantiqo-intelligence-code-volume-local.mjs";
const PROVISION_SCRIPT = "scripts/run-avantiqo-intelligence-trainer-provision-local.mjs";
const DRAIN_TIMEOUT_MS = Math.max(
  30_000,
  Math.min(10 * 60 * 1000, Number(process.env.AVANTIQO_INTELLIGENCE_CODE_DRAIN_TIMEOUT_MS || 3 * 60 * 1000)),
);
const POLL_MS = 3_000;
const REQUIRED_STABLE_DRAIN_OBSERVATIONS = 2;
const EXITED_WORKER_STATES = new Set(["EXITED", "STOPPED", "TERMINATED", "DELETED"]);
const ENV_FILE_VARIABLES = [
  "AVANTIQO_INTELLIGENCE_RUNPOD_ENV_FILE",
  "AVANTIQO_INTELLIGENCE_READINESS_ENV_FILE",
];

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function finite(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function yes(value) {
  return ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value, 40).toUpperCase());
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function unique(values) {
  return [...new Set(values.map((value) => text(value)).filter(Boolean))];
}

function decodeAssignmentValue(rawValue) {
  let value = String(rawValue ?? "").trim();
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
  return value;
}

function explicitEnvPath() {
  for (const name of ENV_FILE_VARIABLES) {
    const value = text(process.env[name]);
    if (value) return value;
  }
  const fallback = path.resolve(process.cwd(), ".env.local");
  return fs.existsSync(fallback) ? fallback : "";
}

function relevantEnvName(name) {
  return (
    /^RUNPOD_[A-Z0-9_]*API_KEY$/.test(name) ||
    name === "AVANTIQO_INTELLIGENCE_TRAINER_RUNPOD_PROVISION_APPROVED" ||
    name === "AVANTIQO_INTELLIGENCE_CODE_VOLUME_EXPANSION_APPROVED" ||
    name === "AVANTIQO_INTELLIGENCE_RUNPOD_REGISTRY_AUTH_ID" ||
    name === "AVANTIQO_INTELLIGENCE_TRAINER_NETWORK_VOLUME_ID" ||
    name === "AVANTIQO_INTELLIGENCE_TRAINER_GPU_TYPE_IDS" ||
    name === "RUNPOD_AVANTIQO_INTELLIGENCE_TRAINER_ENDPOINT_ID"
  );
}

function loadRelevantLocalEnv() {
  const envPath = explicitEnvPath();
  if (!envPath) {
    return {
      path_available: false,
      parsed_without_execution: false,
      relevant_assignment_count: 0,
      secret_values_printed: false,
    };
  }
  const source = fs.readFileSync(envPath, "utf8");
  let relevantAssignmentCount = 0;
  for (const rawLine of source.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = rawLine.match(
      /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/,
    );
    if (!match) continue;
    const [, name, rawValue] = match;
    if (!relevantEnvName(name)) continue;
    relevantAssignmentCount += 1;
    const value = decodeAssignmentValue(rawValue);
    if (!text(process.env[name]) && value) process.env[name] = value;
  }
  return {
    path_available: true,
    parsed_without_execution: true,
    malformed_non_assignment_lines_ignored: true,
    relevant_assignment_count: relevantAssignmentCount,
    secret_values_printed: false,
  };
}

async function readJson(response, label) {
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw, 1000);
    const error = new Error(`${label}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
    error.httpStatus = response.status;
    throw error;
  }
  return body ?? {};
}

async function rest(pathname, credential, options = {}) {
  return readJson(
    await fetch(`${REST_BASE}${pathname}`, {
      method: options.method || "GET",
      headers: {
        Authorization: `Bearer ${credential}`,
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(options.timeoutMs || 30_000),
    }),
    "AVANTIQO_INTELLIGENCE_TRAINER_PREPARATION_REST",
  );
}

async function queueHealth(endpointId, credential) {
  return readJson(
    await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, {
      headers: {
        Authorization: `Bearer ${credential}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(30_000),
    }),
    "AVANTIQO_INTELLIGENCE_TRAINER_PREPARATION_QUEUE",
  );
}

function managementCredentialCandidates() {
  const preferred = ["RUNPOD_MANAGEMENT_API_KEY", "RUNPOD_API_KEY"];
  const discovered = Object.keys(process.env)
    .filter((name) => /^RUNPOD_[A-Z0-9_]*API_KEY$/.test(name))
    .sort();
  const seenNames = new Set();
  const seenValues = new Set();
  const candidates = [];
  for (const name of [...preferred, ...discovered]) {
    if (seenNames.has(name)) continue;
    seenNames.add(name);
    const value = text(process.env[name]);
    if (!value || seenValues.has(value)) continue;
    seenValues.add(value);
    candidates.push({ name, value });
  }
  return candidates;
}

async function resolveManagementCredential() {
  const candidates = managementCredentialCandidates();
  if (!candidates.length) {
    throw new Error("RUNPOD_MANAGEMENT_CREDENTIAL_REQUIRED_FOR_INTELLIGENCE_TRAINER_PREPARATION");
  }
  const rejectedStatuses = [];
  for (const candidate of candidates) {
    const response = await fetch(
      `${REST_BASE}/endpoints?includeTemplate=false&includeWorkers=true`,
      {
        headers: {
          Authorization: `Bearer ${candidate.value}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (response.ok) {
      const endpoints = await readJson(
        response,
        "AVANTIQO_INTELLIGENCE_TRAINER_PREPARATION_MANAGEMENT_PROBE",
      );
      if (!Array.isArray(endpoints)) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");
      return {
        credential: candidate.value,
        source: candidate.name,
        candidate_count: candidates.length,
        endpoints,
      };
    }
    if ([401, 403].includes(response.status)) {
      rejectedStatuses.push(response.status);
      await response.text().catch(() => "");
      continue;
    }
    const detail = text(await response.text(), 500);
    throw new Error(
      `AVANTIQO_INTELLIGENCE_TRAINER_PREPARATION_MANAGEMENT_PROBE_HTTP_${response.status}:${detail || "EMPTY_BODY"}`,
    );
  }
  throw new Error(
    `RUNPOD_MANAGEMENT_SCOPE_CREDENTIAL_NOT_FOUND:candidates=${candidates.length}:rejected_statuses=${rejectedStatuses.join(",") || "NONE"}`,
  );
}

function endpointVolumeIds(endpoint = {}) {
  return unique([
    text(endpoint?.networkVolumeId),
    ...list(endpoint?.networkVolumeIds).map((value) => text(value)),
  ]);
}

function endpointSummary(endpoint = {}) {
  const workers = list(endpoint?.workers).map((worker) => ({
    desired_status: text(worker?.desiredStatus ?? worker?.desired_status).toUpperCase() || null,
    status: text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus).toUpperCase() || null,
  }));
  const live = workers.filter((worker) => {
    const desired = worker.desired_status;
    const status = worker.status;
    if (desired && !EXITED_WORKER_STATES.has(desired)) return true;
    return Boolean(status && !EXITED_WORKER_STATES.has(status));
  });
  return {
    id: text(endpoint?.id) || null,
    name: text(endpoint?.name) || null,
    workers_min: finite(endpoint?.workersMin, 0),
    workers_max: finite(endpoint?.workersMax, 0),
    management_worker_count: workers.length,
    live_management_worker_count: live.length,
  };
}

function healthCounters(body = {}) {
  const jobs = object(body?.jobs);
  const workers = object(body?.workers);
  return {
    jobs: {
      in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
      completed: finite(jobs.completed, 0),
      failed: finite(jobs.failed, 0),
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

function activeQueueWorkerCount(health) {
  return Object.values(health.workers).reduce((sum, value) => sum + Math.max(0, finite(value, 0)), 0);
}

function assertNoBusyCodeWork(health) {
  if (health.jobs.in_queue || health.jobs.in_progress) {
    throw new Error(
      `AVANTIQO_INTELLIGENCE_CODE_VOLUME_BUSY_JOB_BLOCKED:in_queue=${health.jobs.in_queue}:in_progress=${health.jobs.in_progress}`,
    );
  }
  if (health.workers.running || health.workers.throttled) {
    throw new Error(
      `AVANTIQO_INTELLIGENCE_CODE_VOLUME_BUSY_EXECUTION_BLOCKED:running=${health.workers.running}:throttled=${health.workers.throttled}`,
    );
  }
}

function assertAttachedEndpointIdentities(attached) {
  const allowed = new Set([
    "avantiqo-intelligence-v1",
    "avantiqo-intelligence-trainer-v1",
    "avantiqo-intelligence-candidate-v1",
    CODE_ENDPOINT_NAME,
  ]);
  for (const endpoint of attached) {
    if (!allowed.has(endpoint.name)) {
      throw new Error(
        `AVANTIQO_INTELLIGENCE_CODE_VOLUME_UNEXPECTED_ENDPOINT_USER:${endpoint.name || "MISSING"}`,
      );
    }
    if (endpoint.workers_min !== 0) {
      throw new Error(
        `AVANTIQO_INTELLIGENCE_CODE_VOLUME_WORKERS_MIN_BLOCKED:${endpoint.name}:min=${endpoint.workers_min}`,
      );
    }
    if (endpoint.name !== CODE_ENDPOINT_NAME && endpoint.live_management_worker_count > 0) {
      throw new Error(
        `AVANTIQO_INTELLIGENCE_CODE_VOLUME_NON_CODE_LIVE_WORKER_BLOCKED:${endpoint.name}:count=${endpoint.live_management_worker_count}`,
      );
    }
  }
}

async function readEndpoint(endpointId, managementKey) {
  return rest(
    `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=false&includeWorkers=true`,
    managementKey,
  );
}

async function waitForCodeDrain(endpointId, managementKey) {
  const deadline = Date.now() + DRAIN_TIMEOUT_MS;
  let stable = 0;
  let latest = null;

  while (Date.now() < deadline) {
    const [endpoint, rawHealth] = await Promise.all([
      readEndpoint(endpointId, managementKey),
      queueHealth(endpointId, managementKey),
    ]);
    const summary = endpointSummary(endpoint);
    const health = healthCounters(rawHealth);
    latest = { endpoint: summary, health };
    const drained =
      summary.workers_min === 0 &&
      summary.workers_max === 0 &&
      summary.live_management_worker_count === 0 &&
      health.jobs.in_progress === 0 &&
      activeQueueWorkerCount(health) === 0;

    if (drained) {
      stable += 1;
      if (stable >= REQUIRED_STABLE_DRAIN_OBSERVATIONS) {
        return { stable_observations: stable, snapshot: latest };
      }
    } else {
      stable = 0;
    }
    await sleep(POLL_MS);
  }

  throw new Error(
    `AVANTIQO_INTELLIGENCE_CODE_VOLUME_IDLE_DRAIN_TIMEOUT:${JSON.stringify(latest)}`,
  );
}

function runNodeScript(script, args, env, label) {
  const child = spawnSync(process.execPath, [script, ...args], {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
    stdio: ["inherit", "pipe", "pipe"],
  });
  if (child.stdout) process.stdout.write(child.stdout);
  if (child.stderr) process.stderr.write(child.stderr);
  if (child.error) throw child.error;
  if (child.status !== 0) {
    throw new Error(`${label}_FAILED:exit=${child.status}`);
  }
}

const localEnv = loadRelevantLocalEnv();
const apply = process.argv.includes("--apply");
if (apply && !yes(process.env.AVANTIQO_INTELLIGENCE_TRAINER_RUNPOD_PROVISION_APPROVED)) {
  throw new Error("AVANTIQO_INTELLIGENCE_TRAINER_RUNPOD_PROVISION_APPROVED=YES_REQUIRED");
}

const management = await resolveManagementCredential();
const managementKey = management.credential;
const volumes = await rest("/networkvolumes", managementKey);
if (!Array.isArray(volumes)) throw new Error("RUNPOD_NETWORK_VOLUME_LIST_INVALID");
const exactVolumes = volumes.filter((volume) => text(volume?.name) === SHARED_VOLUME_NAME);
if (exactVolumes.length !== 1) {
  throw new Error(
    `AVANTIQO_INTELLIGENCE_TRAINER_SHARED_VOLUME_REQUIRED:matches=${exactVolumes.length}`,
  );
}
const volume = exactVolumes[0];
const volumeId = text(volume?.id);
const volumeSizeGb = finite(volume?.size ?? volume?.sizeGb, 0);
if (!volumeId) throw new Error("AVANTIQO_INTELLIGENCE_TRAINER_SHARED_VOLUME_ID_REQUIRED");

const attachedRaw = management.endpoints.filter((endpoint) => endpointVolumeIds(endpoint).includes(volumeId));
const attached = attachedRaw.map(endpointSummary);
assertAttachedEndpointIdentities(attached);
const codeMatches = attachedRaw.filter((endpoint) => text(endpoint?.name) === CODE_ENDPOINT_NAME);
if (codeMatches.length > 1) {
  throw new Error(`AVANTIQO_INTELLIGENCE_CODE_ENDPOINT_AMBIGUOUS:matches=${codeMatches.length}`);
}
const codeEndpoint = codeMatches[0] || null;
const codeSummary = codeEndpoint ? endpointSummary(codeEndpoint) : null;
let codeHealth = null;
let idleDrainRequired = false;
if (volumeSizeGb < REQUIRED_VOLUME_SIZE_GB && codeEndpoint) {
  if (codeSummary.workers_max !== 0 && codeSummary.workers_max !== 1) {
    throw new Error(
      `AVANTIQO_INTELLIGENCE_CODE_VOLUME_SCALING_BASELINE_BLOCKED:max=${codeSummary.workers_max}`,
    );
  }
  codeHealth = healthCounters(await queueHealth(codeSummary.id, managementKey));
  assertNoBusyCodeWork(codeHealth);
  idleDrainRequired =
    codeSummary.live_management_worker_count > 0 || activeQueueWorkerCount(codeHealth) > 0;
  if (idleDrainRequired && codeSummary.workers_max !== 1) {
    throw new Error(
      `AVANTIQO_INTELLIGENCE_CODE_VOLUME_IDLE_DRAIN_SCALING_REQUIRED:max=${codeSummary.workers_max}`,
    );
  }
}

const initial = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  local_env: localEnv,
  management_credential: {
    source_variable: management.source,
    candidate_count: management.candidate_count,
    scope_verified_by_read_only_endpoint_list: true,
    value_exposed: false,
  },
  volume: {
    id: volumeId,
    name: SHARED_VOLUME_NAME,
    current_size_gb: volumeSizeGb,
    required_size_gb: REQUIRED_VOLUME_SIZE_GB,
    expansion_required: volumeSizeGb < REQUIRED_VOLUME_SIZE_GB,
  },
  code_endpoint: codeSummary,
  code_health: codeHealth,
  idle_code_drain_required: idleDrainRequired,
  next_action:
    volumeSizeGb >= REQUIRED_VOLUME_SIZE_GB
      ? apply
        ? "PROVISION_ZERO_SCALE_INTELLIGENCE_TRAINER"
        : "TRAINER_PROVISION_READY"
      : idleDrainRequired
        ? apply
          ? "DRAIN_IDLE_CODE_RESIZE_RESTORE_THEN_PROVISION_TRAINER"
          : "APPLY_RACE_SAFE_IDLE_CODE_DRAIN_AND_VOLUME_EXPANSION"
        : apply
          ? "EXPAND_SHARED_VOLUME_THEN_PROVISION_TRAINER"
          : "APPLY_SHARED_VOLUME_EXPANSION_AND_TRAINER_PROVISION",
  governance: {
    code_endpoint_temporarily_paused: false,
    code_endpoint_restored: false,
    volume_mutated: false,
    trainer_endpoint_provision_requested: false,
    provider_job_submitted: false,
    training_started: false,
    production_model_promoted: false,
    production_web_deploy: false,
    secret_values_printed: false,
  },
};

if (!apply) {
  console.log(JSON.stringify(initial, null, 2));
  process.exit(0);
}

let codePaused = false;
let codeRestored = false;
let drainEvidence = null;
let finalVolumeSizeGb = volumeSizeGb;
const childEnv = {
  ...process.env,
  AVANTIQO_INTELLIGENCE_CODE_VOLUME_EXPANSION_APPROVED: "YES",
};

try {
  if (volumeSizeGb < REQUIRED_VOLUME_SIZE_GB) {
    const freshVolume = await rest(`/networkvolumes/${encodeURIComponent(volumeId)}`, managementKey);
    const freshSizeGb = finite(freshVolume?.size ?? freshVolume?.sizeGb, 0);
    if (text(freshVolume?.id) !== volumeId || text(freshVolume?.name) !== SHARED_VOLUME_NAME) {
      throw new Error("AVANTIQO_INTELLIGENCE_TRAINER_SHARED_VOLUME_IDENTITY_CHANGED");
    }

    if (freshSizeGb < REQUIRED_VOLUME_SIZE_GB && codeEndpoint) {
      const freshCode = await readEndpoint(codeSummary.id, managementKey);
      const freshSummary = endpointSummary(freshCode);
      if (
        freshSummary.id !== codeSummary.id ||
        freshSummary.name !== CODE_ENDPOINT_NAME ||
        freshSummary.workers_min !== 0
      ) {
        throw new Error("AVANTIQO_INTELLIGENCE_CODE_VOLUME_ENDPOINT_STATE_CHANGED");
      }
      const freshHealth = healthCounters(await queueHealth(codeSummary.id, managementKey));
      assertNoBusyCodeWork(freshHealth);
      const freshDrainRequired =
        freshSummary.live_management_worker_count > 0 || activeQueueWorkerCount(freshHealth) > 0;
      if (freshDrainRequired) {
        if (freshSummary.workers_max !== 1) {
          throw new Error(
            `AVANTIQO_INTELLIGENCE_CODE_VOLUME_IDLE_DRAIN_SCALING_CHANGED:max=${freshSummary.workers_max}`,
          );
        }
        await rest(`/endpoints/${encodeURIComponent(codeSummary.id)}`, managementKey, {
          method: "PATCH",
          body: { workersMin: 0, workersMax: 0 },
        });
        codePaused = true;
        drainEvidence = await waitForCodeDrain(codeSummary.id, managementKey);
      }
    }

    if (freshSizeGb < REQUIRED_VOLUME_SIZE_GB) {
      runNodeScript(
        EXPANSION_SCRIPT,
        ["--apply"],
        childEnv,
        "AVANTIQO_INTELLIGENCE_CODE_VOLUME_EXPANSION",
      );
    }

    const verifiedVolume = await rest(`/networkvolumes/${encodeURIComponent(volumeId)}`, managementKey);
    finalVolumeSizeGb = finite(verifiedVolume?.size ?? verifiedVolume?.sizeGb, 0);
    if (
      text(verifiedVolume?.id) !== volumeId ||
      text(verifiedVolume?.name) !== SHARED_VOLUME_NAME ||
      finalVolumeSizeGb < REQUIRED_VOLUME_SIZE_GB
    ) {
      throw new Error("AVANTIQO_INTELLIGENCE_TRAINER_SHARED_VOLUME_EXPANSION_VERIFY_FAILED");
    }
  }
} finally {
  if (codePaused) {
    try {
      await rest(`/endpoints/${encodeURIComponent(codeSummary.id)}`, managementKey, {
        method: "PATCH",
        body: { workersMin: 0, workersMax: 1 },
      });
      const restored = await readEndpoint(codeSummary.id, managementKey);
      const restoredSummary = endpointSummary(restored);
      if (restoredSummary.workers_min !== 0 || restoredSummary.workers_max !== 1) {
        throw new Error("AVANTIQO_INTELLIGENCE_CODE_VOLUME_RESTORE_VERIFY_FAILED");
      }
      codeRestored = true;
    } catch (restoreError) {
      const message = text(restoreError?.message || restoreError, 1000);
      throw new Error(`AVANTIQO_INTELLIGENCE_CODE_VOLUME_RESTORE_FAILED:${message}`);
    }
  }
}

runNodeScript(
  PROVISION_SCRIPT,
  ["--apply"],
  childEnv,
  "AVANTIQO_INTELLIGENCE_TRAINER_ZERO_SCALE_PROVISION",
);

console.log(
  JSON.stringify(
    {
      ...initial,
      mode: "APPLY",
      success: true,
      volume: {
        ...initial.volume,
        final_size_gb: finalVolumeSizeGb,
        capacity_gate_passed: finalVolumeSizeGb >= REQUIRED_VOLUME_SIZE_GB,
      },
      idle_code_drain: drainEvidence,
      next_action: "VERIFY_CERTIFIED_ZERO_SCALE_TRAINER_BINDING_BEFORE_ANY_TRAINING_JOB",
      governance: {
        ...initial.governance,
        code_endpoint_temporarily_paused: codePaused,
        code_endpoint_restored: codePaused ? codeRestored : false,
        volume_mutated: finalVolumeSizeGb > volumeSizeGb,
        trainer_endpoint_provision_requested: true,
        provider_job_submitted: false,
        training_started: false,
        production_model_promoted: false,
        production_web_deploy: false,
        secret_values_printed: false,
      },
    },
    null,
    2,
  ),
);
