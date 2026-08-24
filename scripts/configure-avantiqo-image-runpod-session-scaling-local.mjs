const REST_BASE = "https://rest.runpod.io/v1";
const IMAGE_ENDPOINT_NAME = "avantiqo-image-v1";

const TARGET = Object.freeze({
  workersMin: 0,
  workersMax: 1,
  idleTimeout: 600,
  scalerType: "REQUEST_COUNT",
  scalerValue: 1,
  flashboot: true,
});

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function unique(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function sameSet(left, right) {
  const a = unique(left).sort();
  const b = unique(right).sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function endpointVolumeIds(endpoint = {}) {
  return unique([endpoint.networkVolumeId, ...list(endpoint.networkVolumeIds)]);
}

function snapshot(endpoint = {}) {
  return {
    id: text(endpoint.id) || null,
    name: text(endpoint.name) || null,
    template_id: text(endpoint.templateId) || null,
    network_volume_ids: endpointVolumeIds(endpoint),
    gpu_type_ids: list(endpoint.gpuTypeIds).map(text).filter(Boolean),
    execution_timeout_ms: finite(endpoint.executionTimeoutMs),
    workers_min: finite(endpoint.workersMin),
    workers_max: finite(endpoint.workersMax),
    idle_timeout_seconds: finite(endpoint.idleTimeout),
    scaler_type: text(endpoint.scalerType) || null,
    scaler_value: finite(endpoint.scalerValue),
    flashboot: endpoint.flashboot === true,
  };
}

function targetApplied(endpoint = {}) {
  return (
    finite(endpoint.workersMin) === TARGET.workersMin &&
    finite(endpoint.workersMax) === TARGET.workersMax &&
    finite(endpoint.idleTimeout) === TARGET.idleTimeout &&
    text(endpoint.scalerType) === TARGET.scalerType &&
    finite(endpoint.scalerValue) === TARGET.scalerValue &&
    endpoint.flashboot === TARGET.flashboot
  );
}

async function restRequest(path, credential, options = {}) {
  const response = await fetch(`${REST_BASE}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${credential}`,
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
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 1200);
    throw new Error(`RUNPOD_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }

  return body;
}

const apply = process.argv.includes("--apply");
const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");

console.log(`AVANTIQO_IMAGE_SESSION_SCALING_MODE=${apply ? "APPLY" : "PLAN"}`);
console.log("AVANTIQO_IMAGE_SESSION_SCALING_SCALE_TO_ZERO=true");
console.log("AVANTIQO_IMAGE_SESSION_SCALING_WORKER_REBUILD=false");
console.log("AVANTIQO_IMAGE_SESSION_SCALING_PRODUCTION_DEPLOY=false");
console.log("AVANTIQO_IMAGE_SESSION_SCALING_STORAGE_MUTATION=false");
console.log("AVANTIQO_IMAGE_SESSION_SCALING_GPU_POOL_MUTATION=false");
console.log("AVANTIQO_IMAGE_SESSION_SCALING_TEMPLATE_MUTATION=false");
console.log("AVANTIQO_IMAGE_SESSION_SCALING_SECRETS_PRINTED=false");

const endpoints = await restRequest(
  "/endpoints?includeTemplate=false&includeWorkers=false",
  managementKey,
);
if (!Array.isArray(endpoints)) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");

const matches = endpoints.filter((endpoint) => text(endpoint?.name) === IMAGE_ENDPOINT_NAME);
if (matches.length !== 1) {
  throw new Error(`AVANTIQO_IMAGE_SESSION_SCALING_ENDPOINT_RESOLUTION_FAILED:matches=${matches.length}`);
}

const endpointId = text(matches[0]?.id);
if (!endpointId) throw new Error("AVANTIQO_IMAGE_SESSION_SCALING_ENDPOINT_ID_MISSING");

const endpoint = await restRequest(
  `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
  managementKey,
);
if (text(endpoint?.name) !== IMAGE_ENDPOINT_NAME) {
  throw new Error("AVANTIQO_IMAGE_SESSION_SCALING_ENDPOINT_NAME_MISMATCH");
}

const before = snapshot(endpoint);
if (before.network_volume_ids.length < 1) {
  throw new Error("AVANTIQO_IMAGE_SESSION_SCALING_NETWORK_VOLUME_REQUIRED");
}
if (before.gpu_type_ids.length < 1) {
  throw new Error("AVANTIQO_IMAGE_SESSION_SCALING_GPU_POOL_REQUIRED");
}
if (!before.template_id) {
  throw new Error("AVANTIQO_IMAGE_SESSION_SCALING_TEMPLATE_REQUIRED");
}

const plan = {
  success: true,
  contract: "AVANTIQO_IMAGE_SESSION_SCALING_V1",
  endpoint_name: IMAGE_ENDPOINT_NAME,
  endpoint_id_present: true,
  before,
  target: {
    workers_min: TARGET.workersMin,
    workers_max: TARGET.workersMax,
    idle_timeout_seconds: TARGET.idleTimeout,
    scaler_type: TARGET.scalerType,
    scaler_value: TARGET.scalerValue,
    flashboot: TARGET.flashboot,
  },
  mutation_required: !targetApplied(endpoint),
  behavior: {
    scale_to_zero_preserved: true,
    first_request_after_long_idle_can_cold_start: true,
    active_session_warm_window_seconds: TARGET.idleTimeout,
    per_job_unblock_command_required: false,
  },
};

if (!apply) {
  console.log("AVANTIQO_IMAGE_SESSION_SCALING_PLAN=READY");
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

// Refetch immediately before the write to preserve concurrent endpoint changes.
const live = await restRequest(
  `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
  managementKey,
);
const liveSnapshot = snapshot(live);

if (liveSnapshot.name !== before.name) {
  throw new Error("AVANTIQO_IMAGE_SESSION_SCALING_NAME_CHANGED_BEFORE_WRITE");
}
if (liveSnapshot.template_id !== before.template_id) {
  throw new Error("AVANTIQO_IMAGE_SESSION_SCALING_TEMPLATE_CHANGED_BEFORE_WRITE");
}
if (!sameSet(liveSnapshot.network_volume_ids, before.network_volume_ids)) {
  throw new Error("AVANTIQO_IMAGE_SESSION_SCALING_VOLUMES_CHANGED_BEFORE_WRITE");
}
if (!sameSet(liveSnapshot.gpu_type_ids, before.gpu_type_ids)) {
  throw new Error("AVANTIQO_IMAGE_SESSION_SCALING_GPU_POOL_CHANGED_BEFORE_WRITE");
}
if (liveSnapshot.execution_timeout_ms !== before.execution_timeout_ms) {
  throw new Error("AVANTIQO_IMAGE_SESSION_SCALING_EXECUTION_TIMEOUT_CHANGED_BEFORE_WRITE");
}

if (!targetApplied(live)) {
  await restRequest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
    method: "PATCH",
    body: TARGET,
  });
}

const verified = await restRequest(
  `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
  managementKey,
);
const after = snapshot(verified);

if (!targetApplied(verified)) {
  throw new Error(
    `AVANTIQO_IMAGE_SESSION_SCALING_VERIFY_FAILED:${JSON.stringify({
      workersMin: verified?.workersMin,
      workersMax: verified?.workersMax,
      idleTimeout: verified?.idleTimeout,
      scalerType: verified?.scalerType,
      scalerValue: verified?.scalerValue,
      flashboot: verified?.flashboot,
    })}`,
  );
}
if (after.template_id !== liveSnapshot.template_id) {
  throw new Error("AVANTIQO_IMAGE_SESSION_SCALING_TEMPLATE_CHANGED_DURING_APPLY");
}
if (!sameSet(after.network_volume_ids, liveSnapshot.network_volume_ids)) {
  throw new Error("AVANTIQO_IMAGE_SESSION_SCALING_VOLUMES_CHANGED_DURING_APPLY");
}
if (!sameSet(after.gpu_type_ids, liveSnapshot.gpu_type_ids)) {
  throw new Error("AVANTIQO_IMAGE_SESSION_SCALING_GPU_POOL_CHANGED_DURING_APPLY");
}
if (after.execution_timeout_ms !== liveSnapshot.execution_timeout_ms) {
  throw new Error("AVANTIQO_IMAGE_SESSION_SCALING_EXECUTION_TIMEOUT_CHANGED_DURING_APPLY");
}

console.log("AVANTIQO_IMAGE_SESSION_SCALING_APPLY=COMPLETE");
console.log(JSON.stringify({
  ...plan,
  mutation_performed: !targetApplied(live),
  after,
  next_action: "CONTINUE_CURRENT_IMAGE_JOB_OR_RETEST_AFTER_TERMINAL_STATUS",
}, null, 2));
