import { spawnSync } from "node:child_process";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_INTELLIGENCE_FAST_REPLACEMENT_CANDIDATE_CREATE_V1";
const DEEP_NAME = "avantiqo-intelligence-v1";
const FAST_NAME = "avantiqo-intelligence-fast-v1";
const CANDIDATE_NAME = "avantiqo-intelligence-fast-replacement-candidate-v1";
const FAST_MODEL = "Qwen/Qwen3-30B-A3B-Instruct-2507";
const DEEP_MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507";
const EXPECTED_MAIN_ENV = "AVANTIQO_INTELLIGENCE_FAST_REPLACEMENT_CANDIDATE_EXPECTED_MAIN";
const APPROVAL_ENV = "AVANTIQO_INTELLIGENCE_FAST_REPLACEMENT_CANDIDATE_APPROVED";

const text = (value) => String(value ?? "").trim();
const list = (value) => (Array.isArray(value) ? value : []);
const object = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};
const approved = (name) => text(process.env[name]).toUpperCase() === "YES";

function redact(value) {
  return text(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(
      /((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi,
      "$1[REDACTED]",
    );
}

function shell(name, args, code) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`${code}:${redact(result.stderr || result.stdout).slice(0, 1000)}`);
  }
  return text(result.stdout);
}

function validateMain() {
  const expected = text(process.env[EXPECTED_MAIN_ENV]);
  if (expected && !/^[0-9a-f]{40}$/i.test(expected)) {
    throw new Error(`${CONTRACT}_EXPECTED_MAIN_INVALID`);
  }
  const branch = shell("git", ["branch", "--show-current"], `${CONTRACT}_GIT_BRANCH_FAILED`);
  if (branch !== "main") {
    throw new Error(`${CONTRACT}_MAIN_REQUIRED:actual=${branch || "DETACHED"}`);
  }
  const head = shell("git", ["rev-parse", "HEAD"], `${CONTRACT}_GIT_HEAD_FAILED`);
  if (expected) {
    if (head !== expected) {
      throw new Error(`${CONTRACT}_PINNED_MAIN_MISMATCH:head=${head}:expected=${expected}`);
    }
    return { head, pinned: true };
  }
  shell("git", ["fetch", "origin", "main"], `${CONTRACT}_GIT_FETCH_FAILED`);
  const remote = shell("git", ["rev-parse", "origin/main"], `${CONTRACT}_GIT_REMOTE_FAILED`);
  if (head !== remote) {
    throw new Error(`${CONTRACT}_LOCAL_MAIN_NOT_CURRENT:head=${head}:origin_main=${remote}`);
  }
  return { head, pinned: false };
}

function managementCredential() {
  const value = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
  if (!value) throw new Error("RUNPOD_MANAGEMENT_OR_API_KEY_REQUIRED");
  return value;
}

function runtimeCredential(managementKey) {
  return text(process.env.RUNPOD_API_KEY) || managementKey;
}

async function requestJson(url, key, options = {}) {
  const response = await fetch(url, {
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
    const detail = redact(body?.message || body?.error || body?.detail || raw).slice(0, 900);
    throw new Error(`${CONTRACT}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  if (options.allowEmpty && !raw) return null;
  if (body === null) throw new Error(`${CONTRACT}_HTTP_${response.status}:INVALID_JSON`);
  return body;
}

async function rest(path, key, options = {}) {
  return requestJson(`${REST_BASE}${path}`, key, options);
}

async function queueHealth(endpointId, key) {
  return requestJson(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, key, {
    timeoutMs: 20_000,
  });
}

function normalizeRows(value, keys = []) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  for (const key of [...keys, "data", "items", "results"]) {
    if (Array.isArray(value[key])) return value[key];
  }
  return [];
}

function resolveOne(rows, name, code) {
  const matches = normalizeRows(rows).filter((row) => text(row?.name) === name);
  if (matches.length !== 1) {
    throw new Error(`${code}:name=${name}:matches=${matches.length}`);
  }
  return matches[0];
}

function healthSummary(raw = {}) {
  const jobs = object(raw?.jobs);
  const workers = object(raw?.workers);
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

function activeManagementWorkers(endpoint = {}) {
  const terminal = new Set(["EXITED", "STOPPED", "TERMINATED", "DELETED"]);
  return list(endpoint?.workers).filter((worker) => {
    const status = text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus).toUpperCase();
    const desired = text(worker?.desiredStatus ?? worker?.desired_status).toUpperCase();
    if (status) return !terminal.has(status);
    if (desired) return !terminal.has(desired);
    return false;
  });
}

function templateId(endpoint = {}) {
  return text(endpoint?.templateId || endpoint?.template?.id);
}

function assertFastTemplate(endpoint, code) {
  const template = object(endpoint?.template);
  const serialized = JSON.stringify(template);
  if (!templateId(endpoint)) throw new Error(`${code}_TEMPLATE_ID_REQUIRED`);
  if (!serialized.includes(FAST_MODEL)) throw new Error(`${code}_FAST_MODEL_BINDING_MISSING`);
  if (serialized.includes(DEEP_MODEL)) throw new Error(`${code}_DEEP_MODEL_BINDING_PRESENT`);
  if (/reasoning[_-]?parser|--reasoning-parser/i.test(serialized)) {
    throw new Error(`${code}_REASONING_PARSER_PRESENT`);
  }
}

function arraysEqual(left, right) {
  return JSON.stringify(list(left).map(text).filter(Boolean)) ===
    JSON.stringify(list(right).map(text).filter(Boolean));
}

function canonicalState(deep, fast, deepHealth, fastHealth) {
  return (
    finite(deep?.workersMin, -1) === 0 &&
    finite(deep?.workersMax, -1) === 1 &&
    finite(fast?.workersMin, -1) === 0 &&
    finite(fast?.workersMax, -1) === 0 &&
    deepHealth.jobs.in_queue === 0 &&
    deepHealth.jobs.in_progress === 0 &&
    fastHealth.jobs.in_queue === 0 &&
    fastHealth.jobs.in_progress === 0
  );
}

function candidateBodyFromFast(fast = {}) {
  const body = {
    templateId: templateId(fast),
    computeType: text(fast?.computeType) || "GPU",
    executionTimeoutMs: Math.max(30_000, finite(fast?.executionTimeoutMs, 90_000)),
    flashboot: fast?.flashboot !== false,
    gpuCount: Math.max(1, finite(fast?.gpuCount, 1)),
    gpuTypeIds: list(fast?.gpuTypeIds).map(text).filter(Boolean),
    idleTimeout: Math.max(1, finite(fast?.idleTimeout, 5)),
    name: CANDIDATE_NAME,
    scalerType: text(fast?.scalerType) || "QUEUE_DELAY",
    scalerValue: Math.max(1, finite(fast?.scalerValue, 4)),
    workersMin: 0,
    workersMax: 0,
  };
  const networkVolumeId = text(fast?.networkVolumeId);
  if (networkVolumeId) body.networkVolumeId = networkVolumeId;
  if (!body.templateId) throw new Error(`${CONTRACT}_FAST_TEMPLATE_ID_REQUIRED`);
  if (body.gpuTypeIds.length === 0) throw new Error(`${CONTRACT}_FAST_GPU_TYPES_REQUIRED`);
  return body;
}

function candidateParity(source, candidate) {
  const fields = {
    template_id: [templateId(source), templateId(candidate)],
    compute_type: [text(source?.computeType) || "GPU", text(candidate?.computeType) || "GPU"],
    execution_timeout_ms: [finite(source?.executionTimeoutMs), finite(candidate?.executionTimeoutMs)],
    flashboot: [source?.flashboot !== false, candidate?.flashboot !== false],
    gpu_count: [finite(source?.gpuCount), finite(candidate?.gpuCount)],
    gpu_type_ids: [
      list(source?.gpuTypeIds).map(text).filter(Boolean),
      list(candidate?.gpuTypeIds).map(text).filter(Boolean),
    ],
    idle_timeout: [finite(source?.idleTimeout), finite(candidate?.idleTimeout)],
    scaler_type: [text(source?.scalerType), text(candidate?.scalerType)],
    scaler_value: [finite(source?.scalerValue), finite(candidate?.scalerValue)],
    network_volume_id: [text(source?.networkVolumeId) || null, text(candidate?.networkVolumeId) || null],
  };
  const differences = [];
  for (const [field, pair] of Object.entries(fields)) {
    if (JSON.stringify(pair[0]) !== JSON.stringify(pair[1])) differences.push(field);
  }
  return { fields, differences };
}

function candidateSafe(candidate, health) {
  const workerTotal = Object.values(health.workers).reduce((sum, value) => sum + value, 0);
  return (
    finite(candidate?.workersMin, -1) === 0 &&
    finite(candidate?.workersMax, -1) === 0 &&
    activeManagementWorkers(candidate).length === 0 &&
    health.jobs.in_queue === 0 &&
    health.jobs.in_progress === 0 &&
    workerTotal === 0
  );
}

async function loadState(managementKey, runtimeKey) {
  const endpointsRaw = await rest(
    "/endpoints?includeTemplate=true&includeWorkers=true",
    managementKey,
  );
  const endpoints = normalizeRows(endpointsRaw, ["endpoints", "serverlessEndpoints"]);
  const deep = resolveOne(endpoints, DEEP_NAME, `${CONTRACT}_DEEP_RESOLUTION_FAILED`);
  const fast = resolveOne(endpoints, FAST_NAME, `${CONTRACT}_FAST_RESOLUTION_FAILED`);
  const candidateMatches = endpoints.filter((row) => text(row?.name) === CANDIDATE_NAME);
  if (candidateMatches.length > 1) {
    throw new Error(`${CONTRACT}_CANDIDATE_DUPLICATES:${candidateMatches.length}`);
  }
  const candidate = candidateMatches[0] || null;
  const [deepHealthRaw, fastHealthRaw, candidateHealthRaw] = await Promise.all([
    queueHealth(text(deep?.id), runtimeKey),
    queueHealth(text(fast?.id), runtimeKey),
    candidate ? queueHealth(text(candidate?.id), runtimeKey) : Promise.resolve(null),
  ]);
  return {
    endpoints,
    deep,
    fast,
    candidate,
    deepHealth: healthSummary(deepHealthRaw),
    fastHealth: healthSummary(fastHealthRaw),
    candidateHealth: candidateHealthRaw ? healthSummary(candidateHealthRaw) : null,
  };
}

async function deleteCandidate(endpointId, managementKey) {
  await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
    method: "DELETE",
    allowEmpty: true,
  });
}

const apply = process.argv.includes("--apply");
if (apply && !approved(APPROVAL_ENV)) {
  throw new Error(`${APPROVAL_ENV}=YES_REQUIRED`);
}

const main = validateMain();
const managementKey = managementCredential();
const runtimeKey = runtimeCredential(managementKey);
const before = await loadState(managementKey, runtimeKey);

assertFastTemplate(before.fast, `${CONTRACT}_SOURCE_FAST_TEMPLATE`);
if (!canonicalState(before.deep, before.fast, before.deepHealth, before.fastHealth)) {
  throw new Error(
    `${CONTRACT}_CANONICAL_DEEP_ACTIVE_FAST_PARKED_ZERO_QUEUE_REQUIRED:` +
      `deep=${finite(before.deep?.workersMin)}/${finite(before.deep?.workersMax)}:` +
      `fast=${finite(before.fast?.workersMin)}/${finite(before.fast?.workersMax)}:` +
      `deep_queue=${before.deepHealth.jobs.in_queue}/${before.deepHealth.jobs.in_progress}:` +
      `fast_queue=${before.fastHealth.jobs.in_queue}/${before.fastHealth.jobs.in_progress}`,
  );
}

const sourceGpuTypes = list(before.fast?.gpuTypeIds).map(text).filter(Boolean);
const sourceTemplateId = templateId(before.fast);
const expectedPriority = [
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
  "NVIDIA H200",
  "NVIDIA B200",
];
if (!arraysEqual(sourceGpuTypes, expectedPriority)) {
  throw new Error(`${CONTRACT}_FAST_GPU_PRIORITY_UNEXPECTED:${JSON.stringify(sourceGpuTypes)}`);
}

let existingCandidateSafe = false;
let existingParity = null;
if (before.candidate) {
  assertFastTemplate(before.candidate, `${CONTRACT}_EXISTING_CANDIDATE_TEMPLATE`);
  existingParity = candidateParity(before.fast, before.candidate);
  existingCandidateSafe =
    existingParity.differences.length === 0 &&
    candidateSafe(before.candidate, before.candidateHealth);
  if (!existingCandidateSafe) {
    throw new Error(
      `${CONTRACT}_EXISTING_CANDIDATE_UNSAFE_OR_MISMATCHED:` +
        `differences=${existingParity.differences.join(",") || "NONE"}`,
    );
  }
}

const plan = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  main_commit: main.head,
  pinned_main: main.pinned,
  canonical_deep_active_fast_parked_zero_queue: true,
  source_fast: {
    endpoint_id: text(before.fast?.id),
    template_id: sourceTemplateId,
    gpu_type_ids: sourceGpuTypes,
    workers_min: finite(before.fast?.workersMin),
    workers_max: finite(before.fast?.workersMax),
  },
  candidate_name: CANDIDATE_NAME,
  candidate_exists: Boolean(before.candidate),
  candidate_endpoint_id: text(before.candidate?.id) || null,
  candidate_safe_and_matching: existingCandidateSafe,
  proposed_action: before.candidate ? "NONE" : "CREATE_PARKED_CANDIDATE_FROM_CURRENT_FAST",
  generation_submitted: false,
  inference_performed: false,
  gpu_activation_performed: false,
  queue_mutation_performed: false,
  canonical_fast_mutation_performed: false,
  deep_endpoint_mutation_performed: false,
  template_mutation_performed: false,
  env_mutation_performed: false,
  production_deploy_performed: false,
  mutation_performed: false,
  secrets_in_output: false,
};

if (!apply || before.candidate) {
  console.log(JSON.stringify(plan, null, 2));
  console.log(`${CONTRACT}=${before.candidate ? "ALREADY_CREATED" : "PLAN_READY"}`);
  process.exit(0);
}

const createBody = candidateBodyFromFast(before.fast);
let created = null;
try {
  created = await rest("/endpoints", managementKey, {
    method: "POST",
    body: createBody,
  });
  const createdId = text(created?.id);
  if (!createdId) throw new Error(`${CONTRACT}_CREATE_RETURNED_NO_ENDPOINT_ID`);

  const after = await loadState(managementKey, runtimeKey);
  if (!after.candidate || text(after.candidate?.id) !== createdId) {
    throw new Error(`${CONTRACT}_CREATED_CANDIDATE_NOT_RESOLVED`);
  }
  assertFastTemplate(after.candidate, `${CONTRACT}_CREATED_CANDIDATE_TEMPLATE`);
  const parity = candidateParity(after.fast, after.candidate);
  if (parity.differences.length > 0) {
    throw new Error(`${CONTRACT}_CANDIDATE_PARITY_FAILED:${parity.differences.join(",")}`);
  }
  if (!candidateSafe(after.candidate, after.candidateHealth)) {
    throw new Error(`${CONTRACT}_CANDIDATE_NOT_PARKED_OR_IDLE`);
  }
  if (!canonicalState(after.deep, after.fast, after.deepHealth, after.fastHealth)) {
    throw new Error(`${CONTRACT}_CANONICAL_STATE_CHANGED_AFTER_CREATE`);
  }

  console.log(
    JSON.stringify(
      {
        ...plan,
        mode: "APPLY",
        candidate_exists: true,
        candidate_endpoint_id: createdId,
        candidate_safe_and_matching: true,
        candidate_template_id: templateId(after.candidate),
        candidate_gpu_type_ids: list(after.candidate?.gpuTypeIds).map(text).filter(Boolean),
        candidate_workers_min: finite(after.candidate?.workersMin),
        candidate_workers_max: finite(after.candidate?.workersMax),
        candidate_queue: after.candidateHealth.jobs,
        candidate_active_management_workers: activeManagementWorkers(after.candidate).length,
        canonical_deep_active_fast_parked_zero_queue_after: true,
        mutation_performed: true,
        endpoint_candidate_creation_performed: true,
        generation_submitted: false,
        inference_performed: false,
        gpu_activation_performed: false,
        queue_mutation_performed: false,
        canonical_fast_mutation_performed: false,
        deep_endpoint_mutation_performed: false,
        template_mutation_performed: false,
        env_mutation_performed: false,
        production_deploy_performed: false,
        next_action: "RUN_REPLACEMENT_CANDIDATE_SCHEDULER_CONTROL_PROBE",
      },
      null,
      2,
    ),
  );
  console.log(`${CONTRACT}=PASS`);
} catch (error) {
  const createdId = text(created?.id);
  let cleanup = createdId ? "NOT_ATTEMPTED" : "NOT_REQUIRED";
  if (createdId) {
    try {
      await deleteCandidate(createdId, managementKey);
      const finalState = await loadState(managementKey, runtimeKey);
      cleanup =
        !finalState.candidate &&
        canonicalState(
          finalState.deep,
          finalState.fast,
          finalState.deepHealth,
          finalState.fastHealth,
        )
          ? "PASS"
          : "FAIL_VERIFY";
    } catch (cleanupError) {
      cleanup = `FAIL:${redact(cleanupError instanceof Error ? cleanupError.message : cleanupError).slice(0, 700)}`;
    }
  }
  throw new Error(
    `${CONTRACT}_CREATE_VERIFY_FAILED:` +
      `${redact(error instanceof Error ? error.message : error)}:cleanup=${cleanup}`,
  );
}
