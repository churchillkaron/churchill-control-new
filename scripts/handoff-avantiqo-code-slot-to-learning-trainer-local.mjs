import { spawnSync } from "node:child_process";

const CONTRACT = "AVANTIQO_CODE_TO_LEARNING_TRAINER_HANDOFF_V1";
const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CODE_NAME = "avantiqo-code-v1";
const TRAINER_NAME = "avantiqo-intelligence-trainer-v1";
const ALLOWED_SHARED_ENDPOINTS = new Set([
  "avantiqo-intelligence-v1",
  TRAINER_NAME,
  "avantiqo-intelligence-candidate-v1",
  CODE_NAME,
]);
const EXITED_WORKER_STATES = new Set([
  "EXITED",
  "STOPPED",
  "TERMINATED",
  "DELETED",
]);
const POLL_MS = 2000;
const DRAIN_TIMEOUT_MS = Math.max(
  30000,
  Math.min(5 * 60 * 1000, Number(process.env.AVANTIQO_LEARNING_CODE_DRAIN_TIMEOUT_MS || 2 * 60 * 1000)),
);
const REQUIRED_STABLE_DRAIN_OBSERVATIONS = 2;

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function yes(value) {
  return ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value, 40).toUpperCase());
}

function unique(values) {
  return [...new Set(values.map((value) => text(value)).filter(Boolean))];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shell(name, args, code) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`${code}:${text(result.stderr || result.stdout, 800)}`);
  }
  return text(result.stdout, 1000);
}

function validateCurrentMain() {
  shell("git", ["fetch", "origin", "main"], "AVANTIQO_LEARNING_HANDOFF_GIT_FETCH_FAILED");
  const branch = shell("git", ["branch", "--show-current"], "AVANTIQO_LEARNING_HANDOFF_GIT_BRANCH_FAILED");
  if (branch !== "main") {
    throw new Error(`AVANTIQO_LEARNING_HANDOFF_MAIN_REQUIRED:${branch || "DETACHED"}`);
  }
  const head = shell("git", ["rev-parse", "HEAD"], "AVANTIQO_LEARNING_HANDOFF_GIT_HEAD_FAILED");
  const remote = shell("git", ["rev-parse", "origin/main"], "AVANTIQO_LEARNING_HANDOFF_GIT_REMOTE_FAILED");
  if (head !== remote) {
    throw new Error(`AVANTIQO_LEARNING_HANDOFF_LOCAL_MAIN_NOT_CURRENT:head=${head}:origin_main=${remote}`);
  }
  return head;
}

function endpointVolumeIds(endpoint = {}) {
  return unique([
    endpoint?.networkVolumeId,
    ...list(endpoint?.networkVolumeIds),
  ]);
}

function liveManagementWorkerCount(endpoint = {}) {
  return list(endpoint?.workers).filter((worker) => {
    const desired = text(worker?.desiredStatus ?? worker?.desired_status).toUpperCase();
    const status = text(
      worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus,
    ).toUpperCase();
    if (desired && !EXITED_WORKER_STATES.has(desired)) return true;
    return Boolean(status && !EXITED_WORKER_STATES.has(status));
  }).length;
}

function stableIdentity(endpoint = {}) {
  return {
    id: text(endpoint?.id, 160) || null,
    name: text(endpoint?.name, 240) || null,
    template_id: text(endpoint?.templateId || endpoint?.template?.id, 160) || null,
    gpu_type_ids: unique(list(endpoint?.gpuTypeIds)).sort(),
    data_center_ids: unique(list(endpoint?.dataCenterIds)).sort(),
    network_volume_ids: endpointVolumeIds(endpoint).sort(),
    idle_timeout_seconds: finite(endpoint?.idleTimeout, null),
    execution_timeout_ms: finite(endpoint?.executionTimeoutMs ?? endpoint?.executionTimeout, null),
    scaler_type: text(endpoint?.scalerType, 80) || null,
    scaler_value: finite(endpoint?.scalerValue, null),
    flashboot: endpoint?.flashBoot ?? endpoint?.flashboot ?? null,
  };
}

function healthCounters(body = {}) {
  const jobs = body?.jobs || {};
  const workers = body?.workers || {};
  return {
    jobs: {
      in_queue: finite(jobs.inQueue ?? jobs.in_queue),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress),
    },
    workers: {
      idle: finite(workers.idle),
      initializing: finite(workers.initializing),
      ready: finite(workers.ready),
      running: finite(workers.running),
      throttled: finite(workers.throttled),
      unhealthy: finite(workers.unhealthy),
    },
  };
}

function activeQueueWorkerCount(health = {}) {
  return Object.values(health.workers || {}).reduce(
    (sum, value) => sum + Math.max(0, finite(value)),
    0,
  );
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
    signal: AbortSignal.timeout(options.timeoutMs || 30000),
  });
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = text(
      body?.detail ||
        body?.message?.detail ||
        body?.error?.detail ||
        body?.message ||
        body?.error?.message ||
        body?.error ||
        raw,
      1000,
    );
    throw new Error(`RUNPOD_HTTP_${response.status}:${detail || "UNKNOWN"}`);
  }
  return body ?? {};
}

async function managementEndpoints(key) {
  const body = await requestJson(
    `${REST_BASE}/endpoints?includeTemplate=true&includeWorkers=true`,
    key,
  );
  if (!Array.isArray(body)) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");
  return body;
}

async function queueHealth(endpointId, key) {
  return healthCounters(
    await requestJson(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, key),
  );
}

function resolveExactEndpoint(endpoints, name, configuredId = "") {
  const matches = configuredId
    ? endpoints.filter(
        (endpoint) =>
          text(endpoint?.id, 160) === configuredId &&
          text(endpoint?.name, 240) === name,
      )
    : endpoints.filter((endpoint) => text(endpoint?.name, 240) === name);
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_LEARNING_HANDOFF_ENDPOINT_RESOLUTION_FAILED:${name}:matches=${matches.length}`);
  }
  return matches[0];
}

async function snapshot(managementKey, queueKey) {
  const endpoints = await managementEndpoints(managementKey);
  const code = resolveExactEndpoint(
    endpoints,
    CODE_NAME,
    text(process.env.RUNPOD_AVANTIQO_CODE_ENDPOINT_ID, 160),
  );
  const trainer = resolveExactEndpoint(
    endpoints,
    TRAINER_NAME,
    text(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_TRAINER_ENDPOINT_ID, 160),
  );
  const codeIdentity = stableIdentity(code);
  const trainerIdentity = stableIdentity(trainer);
  const sharedVolumeIds = codeIdentity.network_volume_ids.filter((id) =>
    trainerIdentity.network_volume_ids.includes(id),
  );
  if (sharedVolumeIds.length !== 1) {
    throw new Error(`AVANTIQO_LEARNING_HANDOFF_SHARED_VOLUME_REQUIRED:matches=${sharedVolumeIds.length}`);
  }

  const peers = endpoints.filter((endpoint) =>
    endpointVolumeIds(endpoint).includes(sharedVolumeIds[0]),
  );
  for (const peer of peers) {
    if (!ALLOWED_SHARED_ENDPOINTS.has(text(peer?.name, 240))) {
      throw new Error(
        `AVANTIQO_LEARNING_HANDOFF_UNEXPECTED_SHARED_ENDPOINT:${text(peer?.name, 240) || "UNKNOWN"}`,
      );
    }
  }

  const peerStates = [];
  for (const peer of peers) {
    const health = await queueHealth(text(peer?.id, 160), queueKey);
    peerStates.push({
      id: text(peer?.id, 160),
      name: text(peer?.name, 240),
      workers_min: finite(peer?.workersMin, null),
      workers_max: finite(peer?.workersMax, null),
      live_management_workers: liveManagementWorkerCount(peer),
      health,
      active_queue_workers: activeQueueWorkerCount(health),
      identity: stableIdentity(peer),
    });
  }
  peerStates.sort((a, b) => a.name.localeCompare(b.name));

  return {
    code_id: codeIdentity.id,
    trainer_id: trainerIdentity.id,
    shared_volume_id: sharedVolumeIds[0],
    peers: peerStates,
  };
}

function byName(state, name) {
  return state.peers.find((peer) => peer.name === name) || null;
}

function assertNoRealJobs(state) {
  for (const peer of state.peers) {
    if (peer.health.jobs.in_queue > 0 || peer.health.jobs.in_progress > 0) {
      throw new Error(
        `AVANTIQO_LEARNING_HANDOFF_REAL_JOB_ACTIVE:${peer.name}:in_queue=${peer.health.jobs.in_queue}:in_progress=${peer.health.jobs.in_progress}`,
      );
    }
  }
}

function assertOtherPeersParked(state) {
  for (const peer of state.peers) {
    if ([CODE_NAME, TRAINER_NAME].includes(peer.name)) continue;
    if (
      peer.workers_min !== 0 ||
      peer.workers_max !== 0 ||
      peer.live_management_workers > 0 ||
      peer.active_queue_workers > 0
    ) {
      throw new Error(`AVANTIQO_LEARNING_HANDOFF_OTHER_PEER_ACTIVE:${peer.name}`);
    }
  }
}

function assertExpectedPreHandoff(state) {
  const code = byName(state, CODE_NAME);
  const trainer = byName(state, TRAINER_NAME);
  if (!code || !trainer) throw new Error("AVANTIQO_LEARNING_HANDOFF_CODE_AND_TRAINER_REQUIRED");
  if (code.workers_min !== 0 || ![0, 1].includes(code.workers_max)) {
    throw new Error(
      `AVANTIQO_LEARNING_HANDOFF_CODE_SCALING_UNSUPPORTED:min=${code.workers_min}:max=${code.workers_max}`,
    );
  }
  if (trainer.workers_min !== 0 || ![0, 1].includes(trainer.workers_max)) {
    throw new Error(
      `AVANTIQO_LEARNING_HANDOFF_TRAINER_SCALING_UNSUPPORTED:min=${trainer.workers_min}:max=${trainer.workers_max}`,
    );
  }
  if (code.workers_max === 1 && trainer.workers_max === 1) {
    throw new Error("AVANTIQO_LEARNING_HANDOFF_DOUBLE_RESERVATION_DETECTED");
  }
  assertNoRealJobs(state);
  assertOtherPeersParked(state);
}

function drainReady(state) {
  const code = byName(state, CODE_NAME);
  const trainer = byName(state, TRAINER_NAME);
  if (!code || !trainer) return false;
  return Boolean(
    code.workers_min === 0 &&
    code.workers_max === 0 &&
    code.live_management_workers === 0 &&
    code.health.jobs.in_queue === 0 &&
    code.health.jobs.in_progress === 0 &&
    code.active_queue_workers === 0 &&
    trainer.workers_min === 0 &&
    trainer.workers_max === 0 &&
    trainer.live_management_workers === 0 &&
    trainer.health.jobs.in_queue === 0 &&
    trainer.health.jobs.in_progress === 0 &&
    trainer.active_queue_workers === 0
  );
}

async function waitForDrain(managementKey, queueKey) {
  const deadline = Date.now() + DRAIN_TIMEOUT_MS;
  let stable = 0;
  let latest = null;
  while (Date.now() < deadline) {
    latest = await snapshot(managementKey, queueKey);
    assertNoRealJobs(latest);
    assertOtherPeersParked(latest);
    if (drainReady(latest)) {
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
    `AVANTIQO_LEARNING_HANDOFF_CODE_DRAIN_TIMEOUT:${JSON.stringify(sanitize(latest))}`,
  );
}

function sanitize(state) {
  if (!state) return null;
  return {
    shared_volume_present: Boolean(state.shared_volume_id),
    peers: state.peers.map((peer) => ({
      name: peer.name,
      workers_min: peer.workers_min,
      workers_max: peer.workers_max,
      live_management_workers: peer.live_management_workers,
      jobs_in_queue: peer.health.jobs.in_queue,
      jobs_in_progress: peer.health.jobs.in_progress,
      active_queue_workers: peer.active_queue_workers,
    })),
  };
}

function report(payload) {
  console.log(JSON.stringify({
    contract: CONTRACT,
    provider_job_submitted: false,
    queue_job_cancelled: false,
    production_deploy_performed: false,
    secrets_printed: false,
    ...payload,
  }, null, 2));
}

if (!yes(process.env.AVANTIQO_LEARNING_CODE_SLOT_TAKEOVER_APPROVED)) {
  throw new Error("AVANTIQO_LEARNING_CODE_SLOT_TAKEOVER_APPROVED=YES_REQUIRED");
}

const mainCommit = validateCurrentMain();
const managementKey = text(
  process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY,
  4000,
);
const queueKey = text(
  process.env.RUNPOD_AVANTIQO_CODE_API_KEY ||
    process.env.RUNPOD_API_KEY ||
    process.env.RUNPOD_MANAGEMENT_API_KEY,
  4000,
);
if (!managementKey || !queueKey) {
  throw new Error("AVANTIQO_LEARNING_HANDOFF_RUNPOD_KEYS_REQUIRED");
}

let initial = await snapshot(managementKey, queueKey);
assertExpectedPreHandoff(initial);
const initialCode = byName(initial, CODE_NAME);
const initialTrainer = byName(initial, TRAINER_NAME);

report({
  event: "AVANTIQO_CODE_TO_LEARNING_TRAINER_HANDOFF_PREFLIGHT",
  success: true,
  main_commit: mainCommit,
  code_hold_authorized: true,
  code_has_real_job: false,
  code_residual_worker_count: initialCode.active_queue_workers,
  code_workers_max: initialCode.workers_max,
  trainer_workers_max: initialTrainer.workers_max,
  observation: sanitize(initial),
});

if (initialCode.workers_max === 1) {
  const fresh = await snapshot(managementKey, queueKey);
  assertExpectedPreHandoff(fresh);
  const freshCode = byName(fresh, CODE_NAME);
  const freshTrainer = byName(fresh, TRAINER_NAME);
  if (
    freshCode.workers_max !== 1 ||
    freshTrainer.workers_max !== 0 ||
    JSON.stringify(freshCode.identity) !== JSON.stringify(initialCode.identity) ||
    JSON.stringify(freshTrainer.identity) !== JSON.stringify(initialTrainer.identity)
  ) {
    throw new Error("AVANTIQO_LEARNING_HANDOFF_STATE_CHANGED_BEFORE_CODE_PARK");
  }
  await requestJson(
    `${REST_BASE}/endpoints/${encodeURIComponent(initial.code_id)}`,
    managementKey,
    {
      method: "PATCH",
      body: { workersMin: 0, workersMax: 0 },
    },
  );
}

const drain = await waitForDrain(managementKey, queueKey);
const beforeTrainerClaim = await snapshot(managementKey, queueKey);
assertNoRealJobs(beforeTrainerClaim);
assertOtherPeersParked(beforeTrainerClaim);
if (!drainReady(beforeTrainerClaim)) {
  throw new Error("AVANTIQO_LEARNING_HANDOFF_DRAIN_CHANGED_BEFORE_TRAINER_CLAIM");
}

await requestJson(
  `${REST_BASE}/endpoints/${encodeURIComponent(beforeTrainerClaim.trainer_id)}`,
  managementKey,
  {
    method: "PATCH",
    body: { workersMin: 0, workersMax: 1 },
  },
);

const verified = await snapshot(managementKey, queueKey);
const verifiedCode = byName(verified, CODE_NAME);
const verifiedTrainer = byName(verified, TRAINER_NAME);
assertNoRealJobs(verified);
assertOtherPeersParked(verified);
if (
  !verifiedCode ||
  !verifiedTrainer ||
  verifiedCode.workers_min !== 0 ||
  verifiedCode.workers_max !== 0 ||
  verifiedCode.live_management_workers !== 0 ||
  verifiedCode.active_queue_workers !== 0 ||
  verifiedTrainer.workers_min !== 0 ||
  verifiedTrainer.workers_max !== 1
) {
  throw new Error(
    `AVANTIQO_LEARNING_HANDOFF_VERIFY_FAILED:${JSON.stringify(sanitize(verified))}`,
  );
}

report({
  event: "AVANTIQO_CODE_TO_LEARNING_TRAINER_HANDOFF_APPLIED",
  success: true,
  status: "TRAINER_EXCLUSIVELY_CLAIMED_CODE_PARKED",
  main_commit: mainCommit,
  code_hold_authorized: true,
  code_endpoint_mutation_performed: initialCode.workers_max === 1,
  code_workers_max_transition: [initialCode.workers_max, 0],
  code_residual_workers_drained: true,
  stable_drain_observations: drain.stable_observations,
  trainer_endpoint_mutation_performed: initialTrainer.workers_max === 0,
  trainer_workers_max_transition: [initialTrainer.workers_max, 1],
  exclusive_trainer_reservation: true,
  code_restored_after_handoff: false,
  observation: sanitize(verified),
});
