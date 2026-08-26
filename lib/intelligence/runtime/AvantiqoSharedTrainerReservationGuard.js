const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const TRAINER_ENDPOINT_NAME = "avantiqo-intelligence-trainer-v1";
const ALLOWED_SHARED_ENDPOINT_NAMES = new Set([
  "avantiqo-intelligence-v1",
  TRAINER_ENDPOINT_NAME,
  "avantiqo-intelligence-candidate-v1",
  "avantiqo-code-v1",
]);
const EXITED_WORKER_STATES = new Set([
  "EXITED",
  "STOPPED",
  "TERMINATED",
  "DELETED",
]);
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_STABILITY_DELAY_MS = 750;

export const AVANTIQO_SHARED_TRAINER_RESERVATION_GUARD_CONTRACT =
  "AVANTIQO_SHARED_TRAINER_RESERVATION_GUARD_V1";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function unique(values) {
  return [...new Set(values.map((value) => text(value, 240)).filter(Boolean))];
}

function endpointVolumeIds(endpoint = {}) {
  return unique([
    endpoint?.networkVolumeId,
    ...list(endpoint?.networkVolumeIds),
  ]);
}

function managementLiveWorkerCount(endpoint = {}) {
  return list(endpoint?.workers).filter((worker) => {
    const desired = text(
      worker?.desiredStatus ?? worker?.desired_status,
      80,
    ).toUpperCase();
    const status = text(
      worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus,
      80,
    ).toUpperCase();
    if (desired && !EXITED_WORKER_STATES.has(desired)) return true;
    return Boolean(status && !EXITED_WORKER_STATES.has(status));
  }).length;
}

function healthCounters(body = {}) {
  const jobs = object(body?.jobs);
  const workers = object(body?.workers);
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
  return Object.values(object(health.workers)).reduce(
    (sum, value) => sum + Math.max(0, finite(value)),
    0,
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestJson(url, credential, timeoutMs) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${credential}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(timeoutMs),
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
      body?.detail || body?.message || body?.error?.message || body?.error || raw,
      800,
    );
    throw new Error(
      `AVANTIQO_SHARED_TRAINER_RESERVATION_HTTP_${response.status}:${detail || "EMPTY_BODY"}`,
    );
  }
  return body ?? {};
}

async function managementEndpoints(managementApiKey, timeoutMs) {
  const body = await requestJson(
    `${REST_BASE}/endpoints?includeTemplate=false&includeWorkers=true`,
    managementApiKey,
    timeoutMs,
  );
  if (!Array.isArray(body)) {
    throw new Error("AVANTIQO_SHARED_TRAINER_RESERVATION_ENDPOINT_LIST_INVALID");
  }
  return body;
}

async function queueHealth(endpointId, queueApiKey, timeoutMs) {
  return healthCounters(
    await requestJson(
      `${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`,
      queueApiKey,
      timeoutMs,
    ),
  );
}

function safePeerSnapshot(endpoint, health) {
  return {
    id: text(endpoint?.id, 240) || null,
    name: text(endpoint?.name, 240) || null,
    workers_min: finite(endpoint?.workersMin, null),
    workers_max: finite(endpoint?.workersMax, null),
    live_management_workers: managementLiveWorkerCount(endpoint),
    health,
  };
}

function peerBlockingReasons(peer, trainerEndpointId) {
  const reasons = [];
  const isTrainer = peer.id === trainerEndpointId;
  if (peer.workers_min !== 0) {
    reasons.push("WORKERS_MIN_NONZERO");
  }

  if (isTrainer) {
    if (peer.workers_max !== 1) {
      reasons.push("TRAINER_SLOT_NOT_RESERVED");
    }
    if (peer.health.jobs.in_queue > 0 || peer.health.jobs.in_progress > 0) {
      reasons.push("TRAINER_JOB_ALREADY_ACTIVE");
    }
    if (
      peer.health.workers.initializing > 0 ||
      peer.health.workers.running > 0 ||
      peer.health.workers.throttled > 0 ||
      peer.health.workers.unhealthy > 0
    ) {
      reasons.push("TRAINER_RUNTIME_BUSY");
    }
    return reasons;
  }

  if (peer.workers_max !== 0) {
    reasons.push("PEER_SLOT_RESERVED");
  }
  if (peer.live_management_workers > 0) {
    reasons.push("PEER_MANAGEMENT_WORKER_ACTIVE");
  }
  if (peer.health.jobs.in_queue > 0) {
    reasons.push("PEER_JOB_QUEUED");
  }
  if (peer.health.jobs.in_progress > 0) {
    reasons.push("PEER_JOB_IN_PROGRESS");
  }
  if (activeQueueWorkerCount(peer.health) > 0) {
    reasons.push("PEER_RUNTIME_WORKER_ACTIVE");
  }
  return reasons;
}

function slotFingerprint(snapshot) {
  return JSON.stringify({
    shared_volume_ids: snapshot.shared_volume_ids,
    peers: snapshot.peers.map((peer) => ({
      id: peer.id,
      name: peer.name,
      workers_min: peer.workers_min,
      workers_max: peer.workers_max,
      live_management_workers: peer.live_management_workers,
      health: peer.health,
      blocking_reasons: peer.blocking_reasons,
    })),
  });
}

async function inspectReservation({
  trainerEndpointId,
  queueApiKey,
  managementApiKey,
  timeoutMs,
}) {
  const endpoints = await managementEndpoints(managementApiKey, timeoutMs);
  const trainerMatches = endpoints.filter(
    (endpoint) => text(endpoint?.id, 240) === trainerEndpointId,
  );
  if (trainerMatches.length !== 1) {
    throw new Error(
      `AVANTIQO_SHARED_TRAINER_RESERVATION_TRAINER_RESOLUTION_FAILED:matches=${trainerMatches.length}`,
    );
  }
  const trainer = trainerMatches[0];
  if (text(trainer?.name, 240) !== TRAINER_ENDPOINT_NAME) {
    throw new Error("AVANTIQO_SHARED_TRAINER_RESERVATION_TRAINER_NAME_MISMATCH");
  }

  const sharedVolumeIds = endpointVolumeIds(trainer);
  if (!sharedVolumeIds.length) {
    throw new Error("AVANTIQO_SHARED_TRAINER_RESERVATION_SHARED_VOLUME_REQUIRED");
  }

  const sharedPeers = endpoints.filter((endpoint) =>
    endpointVolumeIds(endpoint).some((id) => sharedVolumeIds.includes(id)),
  );
  if (sharedPeers.length < 2) {
    throw new Error(
      `AVANTIQO_SHARED_TRAINER_RESERVATION_SHARED_PEERS_REQUIRED:count=${sharedPeers.length}`,
    );
  }
  for (const peer of sharedPeers) {
    const name = text(peer?.name, 240);
    if (!ALLOWED_SHARED_ENDPOINT_NAMES.has(name)) {
      throw new Error(
        `AVANTIQO_SHARED_TRAINER_RESERVATION_UNEXPECTED_SHARED_PEER:${name || "UNKNOWN"}`,
      );
    }
  }

  const peers = [];
  for (const endpoint of sharedPeers) {
    const id = text(endpoint?.id, 240);
    if (!id) {
      throw new Error("AVANTIQO_SHARED_TRAINER_RESERVATION_SHARED_PEER_ID_REQUIRED");
    }
    const health = await queueHealth(id, queueApiKey, timeoutMs);
    const peer = safePeerSnapshot(endpoint, health);
    peer.blocking_reasons = peerBlockingReasons(peer, trainerEndpointId);
    peers.push(peer);
  }

  peers.sort((left, right) => String(left.name).localeCompare(String(right.name)));
  const blockers = peers
    .filter((peer) => peer.blocking_reasons.length > 0)
    .map((peer) => ({
      name: peer.name,
      reasons: [...peer.blocking_reasons],
    }));

  return {
    contract: AVANTIQO_SHARED_TRAINER_RESERVATION_GUARD_CONTRACT,
    trainer_endpoint_id: trainerEndpointId,
    shared_volume_ids: [...sharedVolumeIds].sort(),
    peers,
    blockers,
    exclusive_trainer_reservation: blockers.length === 0,
    endpoint_mutation_performed: false,
    queue_mutation_performed: false,
    provider_job_submitted: false,
  };
}

export async function assertAvantiqoSharedTrainerReservation({
  trainerEndpointId,
  queueApiKey,
  managementApiKey,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  stabilityDelayMs = DEFAULT_STABILITY_DELAY_MS,
} = {}) {
  const trainerId = text(trainerEndpointId, 240);
  const queueKey = text(queueApiKey, 4000);
  const managementKey = text(managementApiKey, 4000);
  if (!trainerId) {
    throw new Error("AVANTIQO_SHARED_TRAINER_RESERVATION_TRAINER_ENDPOINT_ID_REQUIRED");
  }
  if (!queueKey) {
    throw new Error("AVANTIQO_SHARED_TRAINER_RESERVATION_QUEUE_API_KEY_REQUIRED");
  }
  if (!managementKey) {
    throw new Error("AVANTIQO_SHARED_TRAINER_RESERVATION_MANAGEMENT_API_KEY_REQUIRED");
  }

  const boundedTimeoutMs = Math.max(1000, Number(timeoutMs) || DEFAULT_TIMEOUT_MS);
  const boundedDelayMs = Math.max(
    250,
    Math.min(5000, Number(stabilityDelayMs) || DEFAULT_STABILITY_DELAY_MS),
  );

  const first = await inspectReservation({
    trainerEndpointId: trainerId,
    queueApiKey: queueKey,
    managementApiKey: managementKey,
    timeoutMs: boundedTimeoutMs,
  });
  if (!first.exclusive_trainer_reservation) {
    throw new Error(
      `AVANTIQO_SHARED_TRAINER_RESERVATION_BLOCKED:${first.blockers
        .map((blocker) => `${blocker.name}:${blocker.reasons.join(",")}`)
        .join("|")}`,
    );
  }

  await sleep(boundedDelayMs);

  const second = await inspectReservation({
    trainerEndpointId: trainerId,
    queueApiKey: queueKey,
    managementApiKey: managementKey,
    timeoutMs: boundedTimeoutMs,
  });
  if (!second.exclusive_trainer_reservation) {
    throw new Error(
      `AVANTIQO_SHARED_TRAINER_RESERVATION_CHANGED:${second.blockers
        .map((blocker) => `${blocker.name}:${blocker.reasons.join(",")}`)
        .join("|")}`,
    );
  }
  if (slotFingerprint(first) !== slotFingerprint(second)) {
    throw new Error("AVANTIQO_SHARED_TRAINER_RESERVATION_NOT_STABLE");
  }

  return {
    ...second,
    stable_observations: 2,
    stability_delay_ms: boundedDelayMs,
    exclusive_trainer_reservation: true,
    code_or_intelligence_reservation_present: false,
  };
}

export const AvantiqoSharedTrainerReservationGuard = Object.freeze({
  contract: AVANTIQO_SHARED_TRAINER_RESERVATION_GUARD_CONTRACT,
  assertExclusiveTrainerReservation: assertAvantiqoSharedTrainerReservation,
});
