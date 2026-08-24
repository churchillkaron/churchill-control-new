const REST = "https://rest.runpod.io/v1";
const SERVERLESS = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_CODE_INTERACTIVE_SCALING_V1";
const TARGET = Object.freeze({
  workersMin: 0,
  workersMax: 1,
  scalerType: "REQUEST_COUNT",
  scalerValue: 1,
  idleTimeout: 600,
});

function text(value) {
  return String(value ?? "").trim();
}

async function readJson(url, options = {}) {
  const response = await fetch(url, options);
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = { message: raw };
  }
  if (!response.ok) {
    throw new Error(`HTTP_${response.status}:${text(body?.message || raw).slice(0, 800)}`);
  }
  return body;
}

async function endpoint(managementKey, endpointId) {
  return readJson(`${REST}/endpoints/${encodeURIComponent(endpointId)}`, {
    headers: {
      Authorization: `Bearer ${managementKey}`,
      Accept: "application/json",
    },
  });
}

async function health(apiKey, endpointId) {
  return readJson(`${SERVERLESS}/${encodeURIComponent(endpointId)}/health`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });
}

function liveWork(healthBody = {}) {
  const jobs = healthBody.jobs || {};
  const workers = healthBody.workers || {};
  return {
    in_queue: Number(jobs.inQueue || jobs.in_queue || 0),
    in_progress: Number(jobs.inProgress || jobs.in_progress || 0),
    initializing: Number(workers.initializing || 0),
    running: Number(workers.running || 0),
    idle: Number(workers.idle || 0),
    ready: Number(workers.ready || 0),
  };
}

function safeEndpoint(value = {}) {
  return {
    id: text(value.id) || null,
    gpuTypeIds: Array.isArray(value.gpuTypeIds) ? value.gpuTypeIds : [],
    workersMin: Number(value.workersMin ?? 0),
    workersMax: Number(value.workersMax ?? 0),
    idleTimeout: Number(value.idleTimeout ?? 0),
    scalerType: text(value.scalerType) || null,
    scalerValue: Number(value.scalerValue ?? 0),
    flashBoot: value.flashBoot ?? value.flashboot ?? null,
    executionTimeoutMs: Number(value.executionTimeoutMs ?? value.executionTimeout ?? 0),
    networkVolumeId: text(value.networkVolumeId) || null,
    templateId: text(value.templateId) || null,
  };
}

function sameTarget(value = {}) {
  return Number(value.workersMin) === TARGET.workersMin &&
    Number(value.workersMax) === TARGET.workersMax &&
    text(value.scalerType).toUpperCase() === TARGET.scalerType &&
    Number(value.scalerValue) === TARGET.scalerValue &&
    Number(value.idleTimeout) === TARGET.idleTimeout;
}

const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY);
const apiKey = text(process.env.RUNPOD_API_KEY);
const endpointId = text(process.env.RUNPOD_AVANTIQO_CODE_ENDPOINT_ID);

if (!managementKey) throw new Error("RUNPOD_MANAGEMENT_API_KEY_REQUIRED");
if (!apiKey) throw new Error("RUNPOD_API_KEY_REQUIRED");
if (!endpointId) throw new Error("RUNPOD_AVANTIQO_CODE_ENDPOINT_ID_REQUIRED");

const before = await endpoint(managementKey, endpointId);
const beforeSafe = safeEndpoint(before);
if (beforeSafe.id !== endpointId) throw new Error("AVANTIQO_CODE_ENDPOINT_ID_MISMATCH");

const currentHealth = await health(apiKey, endpointId);
const work = liveWork(currentHealth);
if (work.in_queue > 0 || work.in_progress > 0 || work.initializing > 0 || work.running > 0) {
  console.log(JSON.stringify({
    success: false,
    contract: CONTRACT,
    status: "BLOCKED_ACTIVE_WORK",
    mutation_performed: false,
    endpoint: beforeSafe,
    health: work,
    target: TARGET,
    production_deploy_performed: false,
  }, null, 2));
  process.exit(2);
}

if (sameTarget(before)) {
  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    status: "ALREADY_CONFIGURED",
    mutation_performed: false,
    endpoint: beforeSafe,
    target: TARGET,
    production_deploy_performed: false,
  }, null, 2));
  process.exit(0);
}

// Refetch immediately before mutation and preserve all unrelated endpoint state.
const fresh = await endpoint(managementKey, endpointId);
const freshSafe = safeEndpoint(fresh);
for (const key of ["networkVolumeId", "templateId"]) {
  if (freshSafe[key] !== beforeSafe[key]) {
    throw new Error(`AVANTIQO_CODE_ENDPOINT_CONCURRENT_CHANGE:${key}`);
  }
}
if (JSON.stringify(freshSafe.gpuTypeIds) !== JSON.stringify(beforeSafe.gpuTypeIds)) {
  throw new Error("AVANTIQO_CODE_ENDPOINT_CONCURRENT_CHANGE:gpuTypeIds");
}

const patched = await readJson(`${REST}/endpoints/${encodeURIComponent(endpointId)}`, {
  method: "PATCH",
  headers: {
    Authorization: `Bearer ${managementKey}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  },
  body: JSON.stringify(TARGET),
});

const verified = await endpoint(managementKey, endpointId);
if (!sameTarget(verified)) {
  throw new Error(`AVANTIQO_CODE_INTERACTIVE_SCALING_VERIFY_FAILED:${JSON.stringify(safeEndpoint(verified))}`);
}

const verifiedSafe = safeEndpoint(verified);
for (const key of ["networkVolumeId", "templateId"]) {
  if (verifiedSafe[key] !== beforeSafe[key]) {
    throw new Error(`AVANTIQO_CODE_ENDPOINT_UNRELATED_FIELD_CHANGED:${key}`);
  }
}
if (JSON.stringify(verifiedSafe.gpuTypeIds) !== JSON.stringify(beforeSafe.gpuTypeIds)) {
  throw new Error("AVANTIQO_CODE_ENDPOINT_UNRELATED_FIELD_CHANGED:gpuTypeIds");
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  status: "CONFIGURED",
  mutation_performed: true,
  before: beforeSafe,
  after: verifiedSafe,
  target: TARGET,
  patch_response_id: text(patched?.id) || endpointId,
  gpu_binding_preserved: true,
  network_volume_preserved: true,
  template_preserved: true,
  flashboot_preserved: beforeSafe.flashBoot === verifiedSafe.flashBoot,
  production_deploy_performed: false,
}, null, 2));
