const CONTRACT = "AVANTIQO_LEARNING_TRAINER_CLAIM_IF_FREE_V1";
const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const TRAINER_NAME = "avantiqo-intelligence-trainer-v1";
const ALLOWED_SHARED_ENDPOINTS = new Set([
  "avantiqo-intelligence-v1",
  TRAINER_NAME,
  "avantiqo-intelligence-candidate-v1",
  "avantiqo-code-v1",
]);
const EXITED_WORKER_STATES = new Set([
  "EXITED",
  "STOPPED",
  "TERMINATED",
  "DELETED",
]);
const OBSERVATION_DELAY_MS = Math.max(
  750,
  Math.min(5000, Number(process.env.AVANTIQO_LEARNING_TRAINER_CLAIM_OBSERVATION_DELAY_MS || 1500)),
);

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

function activeQueueWorkers(health) {
  return Object.values(health?.workers || {}).reduce(
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

function resolveTrainer(endpoints) {
  const configuredId = text(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_TRAINER_ENDPOINT_ID, 160);
  const matches = configuredId
    ? endpoints.filter(
        (endpoint) =>
          text(endpoint?.id, 160) === configuredId &&
          text(endpoint?.name, 240) === TRAINER_NAME,
      )
    : endpoints.filter((endpoint) => text(endpoint?.name, 240) === TRAINER_NAME);
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_LEARNING_TRAINER_RESOLUTION_FAILED:matches=${matches.length}`);
  }
  return matches[0];
}

async function observe(managementKey, queueKey) {
  const endpoints = await managementEndpoints(managementKey);
  const trainer = resolveTrainer(endpoints);
  const trainerVolumes = endpointVolumeIds(trainer);
  if (trainerVolumes.length !== 1) {
    throw new Error(
      `AVANTIQO_LEARNING_TRAINER_SHARED_VOLUME_REQUIRED:matches=${trainerVolumes.length}`,
    );
  }

  const peers = endpoints.filter((endpoint) =>
    endpointVolumeIds(endpoint).includes(trainerVolumes[0]),
  );
  if (!peers.length) throw new Error("AVANTIQO_LEARNING_TRAINER_SHARED_PEERS_REQUIRED");

  const summaries = [];
  for (const peer of peers) {
    const name = text(peer?.name, 240);
    const id = text(peer?.id, 160);
    if (!ALLOWED_SHARED_ENDPOINTS.has(name)) {
      throw new Error(
        `AVANTIQO_LEARNING_TRAINER_UNEXPECTED_SHARED_ENDPOINT:${name || "UNKNOWN"}`,
      );
    }
    if (!id) throw new Error(`AVANTIQO_LEARNING_TRAINER_PEER_ID_REQUIRED:${name}`);
    const health = await queueHealth(id, queueKey);
    summaries.push({
      id,
      name,
      workers_min: finite(peer?.workersMin, null),
      workers_max: finite(peer?.workersMax, null),
      live_management_workers: liveManagementWorkerCount(peer),
      jobs_in_queue: health.jobs.in_queue,
      jobs_in_progress: health.jobs.in_progress,
      active_queue_workers: activeQueueWorkers(health),
    });
  }
  summaries.sort((a, b) => a.name.localeCompare(b.name));
  return {
    shared_volume_id: trainerVolumes[0],
    trainer_id: text(trainer?.id, 160),
    peers: summaries,
  };
}

function blockersFor(snapshot) {
  const blockers = [];
  for (const peer of snapshot.peers) {
    if (peer.workers_min !== 0) {
      blockers.push(`${peer.name}:WORKERS_MIN_${peer.workers_min}`);
    }
    if (peer.name === TRAINER_NAME) {
      if (![0, 1].includes(peer.workers_max)) {
        blockers.push(`${peer.name}:TRAINER_WORKERS_MAX_${peer.workers_max}`);
      }
    } else if (peer.workers_max !== 0) {
      blockers.push(`${peer.name}:PEER_SLOT_RESERVED`);
    }
    if (peer.live_management_workers > 0) {
      blockers.push(`${peer.name}:LIVE_MANAGEMENT_WORKER`);
    }
    if (peer.jobs_in_queue > 0) blockers.push(`${peer.name}:JOB_IN_QUEUE`);
    if (peer.jobs_in_progress > 0) blockers.push(`${peer.name}:JOB_IN_PROGRESS`);
    if (peer.active_queue_workers > 0) blockers.push(`${peer.name}:QUEUE_WORKER_ACTIVE`);
  }
  return unique(blockers);
}

function stableState(snapshot) {
  return JSON.stringify({
    shared_volume_id: snapshot.shared_volume_id,
    trainer_id: snapshot.trainer_id,
    peers: snapshot.peers,
  });
}

function sanitized(snapshot) {
  return {
    shared_volume_present: Boolean(snapshot?.shared_volume_id),
    peer_count: list(snapshot?.peers).length,
    peers: list(snapshot?.peers).map((peer) => ({
      name: peer.name,
      workers_min: peer.workers_min,
      workers_max: peer.workers_max,
      live_management_workers: peer.live_management_workers,
      jobs_in_queue: peer.jobs_in_queue,
      jobs_in_progress: peer.jobs_in_progress,
      active_queue_workers: peer.active_queue_workers,
    })),
  };
}

function report(payload) {
  console.log(JSON.stringify({
    contract: CONTRACT,
    provider_job_submitted: false,
    queue_mutation_performed: false,
    non_trainer_endpoint_mutation_performed: false,
    production_deploy_performed: false,
    secrets_printed: false,
    ...payload,
  }, null, 2));
}

const approved = yes(process.env.AVANTIQO_LEARNING_TRAINER_CLAIM_APPROVED);
const managementKey = text(
  process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY,
  4000,
);
const queueKey = text(
  process.env.RUNPOD_API_KEY || process.env.RUNPOD_MANAGEMENT_API_KEY,
  4000,
);

if (!approved) {
  throw new Error("AVANTIQO_LEARNING_TRAINER_CLAIM_APPROVED=YES_REQUIRED");
}
if (!managementKey || !queueKey) {
  report({
    success: false,
    status: "BLOCKED_EXTERNAL_CREDENTIAL_SOURCE",
    trainer_claim_mutation_performed: false,
    blocker_count: 1,
    blockers: ["RUNPOD_CREDENTIAL_NOT_AVAILABLE"],
  });
  process.exit(0);
}

const first = await observe(managementKey, queueKey);
const firstBlockers = blockersFor(first);
await sleep(OBSERVATION_DELAY_MS);
const second = await observe(managementKey, queueKey);
const secondBlockers = blockersFor(second);

if (stableState(first) !== stableState(second)) {
  report({
    success: false,
    status: "BLOCKED_STATE_CHANGED_BETWEEN_OBSERVATIONS",
    trainer_claim_mutation_performed: false,
    stable_observations: 1,
    observation_delay_ms: OBSERVATION_DELAY_MS,
    blocker_count: 1,
    blockers: ["SHARED_RESOURCE_STATE_CHANGED"],
    observation: sanitized(second),
  });
  process.exit(0);
}

const blockers = unique([...firstBlockers, ...secondBlockers]);
if (blockers.length) {
  report({
    success: false,
    status: "BLOCKED_SHARED_RESOURCE_NOT_FREE",
    trainer_claim_mutation_performed: false,
    stable_observations: 2,
    observation_delay_ms: OBSERVATION_DELAY_MS,
    blocker_count: blockers.length,
    blockers,
    observation: sanitized(second),
  });
  process.exit(0);
}

const trainerSecond = second.peers.find((peer) => peer.name === TRAINER_NAME);
if (!trainerSecond) throw new Error("AVANTIQO_LEARNING_TRAINER_MISSING_FROM_SHARED_PEERS");
if (trainerSecond.workers_max === 1) {
  report({
    success: true,
    status: "TRAINER_ALREADY_EXCLUSIVELY_CLAIMED",
    trainer_claim_mutation_performed: false,
    exclusive_trainer_reservation: true,
    stable_observations: 2,
    observation_delay_ms: OBSERVATION_DELAY_MS,
    observation: sanitized(second),
  });
  process.exit(0);
}

const prewrite = await observe(managementKey, queueKey);
const prewriteBlockers = blockersFor(prewrite);
if (stableState(second) !== stableState(prewrite) || prewriteBlockers.length) {
  report({
    success: false,
    status: "BLOCKED_STATE_CHANGED_BEFORE_WRITE",
    trainer_claim_mutation_performed: false,
    stable_observations: 2,
    blocker_count: unique(prewriteBlockers).length || 1,
    blockers: unique(prewriteBlockers).length
      ? unique(prewriteBlockers)
      : ["SHARED_RESOURCE_STATE_CHANGED_BEFORE_WRITE"],
    observation: sanitized(prewrite),
  });
  process.exit(0);
}

await requestJson(
  `${REST_BASE}/endpoints/${encodeURIComponent(prewrite.trainer_id)}`,
  managementKey,
  {
    method: "PATCH",
    body: { workersMin: 0, workersMax: 1 },
  },
);

const verified = await observe(managementKey, queueKey);
const verifiedTrainer = verified.peers.find((peer) => peer.name === TRAINER_NAME);
const verifiedPeerBlockers = verified.peers
  .filter((peer) => peer.name !== TRAINER_NAME)
  .flatMap((peer) => {
    const reasons = [];
    if (peer.workers_min !== 0) reasons.push(`${peer.name}:WORKERS_MIN_CHANGED`);
    if (peer.workers_max !== 0) reasons.push(`${peer.name}:PEER_SLOT_RESERVED_AFTER_CLAIM`);
    if (peer.live_management_workers > 0) reasons.push(`${peer.name}:LIVE_WORKER_AFTER_CLAIM`);
    if (peer.jobs_in_queue > 0 || peer.jobs_in_progress > 0) reasons.push(`${peer.name}:JOB_AFTER_CLAIM`);
    if (peer.active_queue_workers > 0) reasons.push(`${peer.name}:QUEUE_WORKER_AFTER_CLAIM`);
    return reasons;
  });

if (
  !verifiedTrainer ||
  verifiedTrainer.workers_min !== 0 ||
  verifiedTrainer.workers_max !== 1 ||
  verifiedPeerBlockers.length
) {
  throw new Error(
    `AVANTIQO_LEARNING_TRAINER_CLAIM_VERIFY_FAILED:${verifiedPeerBlockers.join(",") || "TRAINER_SCALING"}`,
  );
}

report({
  success: true,
  status: "TRAINER_EXCLUSIVELY_CLAIMED",
  trainer_claim_mutation_performed: true,
  exclusive_trainer_reservation: true,
  stable_observations: 2,
  observation_delay_ms: OBSERVATION_DELAY_MS,
  observation: sanitized(verified),
});
