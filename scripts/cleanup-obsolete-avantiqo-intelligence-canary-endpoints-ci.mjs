const REST = "https://rest.runpod.io/v1";
const QUEUE = "https://api.runpod.ai/v2";

const KEEP = Object.freeze([
  Object.freeze({ id: "wis31stihqk0yo", name: "avantiqo-intelligence-v1" }),
  Object.freeze({ id: "pnfgcl98sceh51", name: "avantiqo-intelligence-fast-v1" }),
]);

const DELETE = Object.freeze([
  Object.freeze({ id: "g3c7u09w14p6hx", name: "avantiqo-intelligence-fast-awq-canary-v5" }),
  Object.freeze({ id: "3irr85btloc3pr", name: "avantiqo-intelligence-fast-awq-broad-v6" }),
]);

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const terminal = new Set(["EXITED", "STOPPED", "TERMINATED", "DELETED", "FAILED"]);

function managementKey() {
  const key = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
  if (!key) throw new Error("RUNPOD_MANAGEMENT_API_KEY_REQUIRED");
  return key;
}

function queueKey() {
  const key = text(process.env.RUNPOD_API_KEY || process.env.RUNPOD_MANAGEMENT_API_KEY);
  if (!key) throw new Error("RUNPOD_API_KEY_REQUIRED");
  return key;
}

async function request(url, key, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = null; }
  if (!response.ok) {
    const error = new Error(`RUNPOD_INTELLIGENCE_CLEANUP_HTTP_${response.status}:${text(body?.message || body?.error || body?.detail || raw).slice(0, 600)}`);
    error.httpStatus = response.status;
    throw error;
  }
  return body;
}

const rest = (path, options = {}) => request(`${REST}${path}`, managementKey(), options);
const queue = (endpointId, path, options = {}) => request(`${QUEUE}/${encodeURIComponent(endpointId)}${path}`, queueKey(), options);

function rows(value, key) {
  if (Array.isArray(value)) return value;
  return list(value?.[key] || value?.data || value?.items || value?.results);
}

function activeWorkers(endpoint = {}) {
  return list(endpoint?.workers).filter((worker) => {
    const status = text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus ?? worker?.desiredStatus).toUpperCase();
    return status ? !terminal.has(status) : true;
  });
}

function volumeIds(endpoint = {}) {
  return [...new Set([
    text(endpoint?.networkVolumeId ?? endpoint?.network_volume_id),
    ...list(endpoint?.networkVolumeIds ?? endpoint?.network_volume_ids).map((entry) =>
      text(typeof entry === "string" ? entry : entry?.networkVolumeId ?? entry?.network_volume_id ?? entry?.id),
    ),
  ].filter(Boolean))];
}

function queueCounts(health = {}) {
  return {
    queued: finite(health?.jobs?.inQueue ?? health?.jobs?.in_queue, 0),
    in_progress: finite(health?.jobs?.inProgress ?? health?.jobs?.in_progress, 0),
  };
}

function storageSignature(volumes) {
  return rows(volumes, "networkVolumes")
    .map((volume) => ({
      id: text(volume?.id),
      name: text(volume?.name),
      size: finite(volume?.size, 0),
      data_center_id: text(volume?.dataCenterId ?? volume?.data_center_id),
    }))
    .filter((volume) => volume.id)
    .sort((a, b) => a.id.localeCompare(b.id));
}

function assertKeepEndpoint(endpoint, expected) {
  if (!endpoint || text(endpoint?.id) !== expected.id || text(endpoint?.name) !== expected.name) {
    throw new Error(`INTELLIGENCE_KEEP_ENDPOINT_IDENTITY_MISMATCH:${expected.name}`);
  }
  if (finite(endpoint?.workersMin, -1) !== 0 || finite(endpoint?.workersMax, -1) !== 0) {
    throw new Error(`INTELLIGENCE_KEEP_ENDPOINT_NOT_PARKED:${expected.name}`);
  }
  if (activeWorkers(endpoint).length) {
    throw new Error(`INTELLIGENCE_KEEP_ENDPOINT_ACTIVE_WORKER:${expected.name}`);
  }
}

console.log("AVANTIQO_INTELLIGENCE_CANARY_CLEANUP_GENERATION_SUBMITTED=false");
console.log("AVANTIQO_INTELLIGENCE_CANARY_CLEANUP_PRODUCTION_DEPLOY=false");
console.log("AVANTIQO_INTELLIGENCE_CANARY_CLEANUP_NEW_VOLUME_CREATED=false");

const [beforeEndpointsRaw, beforeVolumesRaw] = await Promise.all([
  rest("/endpoints?includeTemplate=false&includeWorkers=true"),
  rest("/networkvolumes"),
]);
const beforeEndpoints = rows(beforeEndpointsRaw, "endpoints");
const beforeStorage = storageSignature(beforeVolumesRaw);

for (const expected of KEEP) {
  assertKeepEndpoint(beforeEndpoints.find((endpoint) => text(endpoint?.id) === expected.id), expected);
}

for (const target of DELETE) {
  const endpoint = beforeEndpoints.find((candidate) => text(candidate?.id) === target.id);
  if (!endpoint) {
    console.log(`AVANTIQO_INTELLIGENCE_CANARY_ALREADY_ABSENT=${target.name}`);
    continue;
  }
  if (text(endpoint?.name) !== target.name) {
    throw new Error(`INTELLIGENCE_DELETE_ENDPOINT_IDENTITY_MISMATCH:${target.id}:${text(endpoint?.name)}`);
  }
  if (finite(endpoint?.workersMin, -1) !== 0 || finite(endpoint?.workersMax, -1) !== 0) {
    throw new Error(`INTELLIGENCE_DELETE_ENDPOINT_NOT_PARKED:${target.name}`);
  }
  if (activeWorkers(endpoint).length) {
    throw new Error(`INTELLIGENCE_DELETE_ENDPOINT_ACTIVE_WORKER:${target.name}`);
  }
  const attachedVolumes = volumeIds(endpoint);
  if (attachedVolumes.length) {
    throw new Error(`INTELLIGENCE_DELETE_ENDPOINT_HAS_STORAGE:${target.name}:${attachedVolumes.join(",")}`);
  }

  const health = await queue(target.id, "/health", { timeoutMs: 20_000 }).catch((error) => {
    if (Number(error?.httpStatus) === 404) return null;
    throw error;
  });
  if (health) {
    let counts = queueCounts(health);
    if (counts.in_progress > 0) {
      throw new Error(`INTELLIGENCE_DELETE_ENDPOINT_JOB_IN_PROGRESS:${target.name}:${counts.in_progress}`);
    }
    if (counts.queued > 0) {
      await queue(target.id, "/purge-queue", { method: "POST", timeoutMs: 30_000 });
      const afterPurge = await queue(target.id, "/health", { timeoutMs: 20_000 });
      counts = queueCounts(afterPurge);
      if (counts.queued > 0 || counts.in_progress > 0) {
        throw new Error(`INTELLIGENCE_DELETE_ENDPOINT_QUEUE_NOT_EMPTY:${target.name}:${counts.queued}:${counts.in_progress}`);
      }
    }
  }

  await rest(`/endpoints/${encodeURIComponent(target.id)}`, { method: "DELETE" });
  try {
    await rest(`/endpoints/${encodeURIComponent(target.id)}?includeTemplate=false&includeWorkers=true`);
    throw new Error(`INTELLIGENCE_DELETE_ENDPOINT_STILL_EXISTS:${target.name}`);
  } catch (error) {
    if (Number(error?.httpStatus) !== 404) throw error;
  }
  console.log(`AVANTIQO_INTELLIGENCE_CANARY_ENDPOINT_DELETED=${target.name}`);
}

const [afterEndpointsRaw, afterVolumesRaw] = await Promise.all([
  rest("/endpoints?includeTemplate=false&includeWorkers=true"),
  rest("/networkvolumes"),
]);
const afterEndpoints = rows(afterEndpointsRaw, "endpoints");
const afterStorage = storageSignature(afterVolumesRaw);

for (const expected of KEEP) {
  assertKeepEndpoint(afterEndpoints.find((endpoint) => text(endpoint?.id) === expected.id), expected);
}
for (const target of DELETE) {
  if (afterEndpoints.some((endpoint) => text(endpoint?.id) === target.id || text(endpoint?.name) === target.name)) {
    throw new Error(`INTELLIGENCE_DELETE_ENDPOINT_VERIFY_FAILED:${target.name}`);
  }
}
if (JSON.stringify(afterStorage) !== JSON.stringify(beforeStorage)) {
  throw new Error(`INTELLIGENCE_STORAGE_SET_CHANGED:${JSON.stringify({ before: beforeStorage, after: afterStorage })}`);
}

console.log(`AVANTIQO_INTELLIGENCE_CANARY_CLEANUP_STORAGE_COUNT=${afterStorage.length}`);
console.log(`AVANTIQO_INTELLIGENCE_CANARY_CLEANUP_STORAGE_IDS=${afterStorage.map((volume) => volume.id).join(",")}`);
console.log("AVANTIQO_INTELLIGENCE_CANARY_CLEANUP_STORAGE_UNCHANGED=PASS");
console.log("AVANTIQO_INTELLIGENCE_CANARY_CLEANUP=PASS");
