const REST_BASE = "https://rest.runpod.io/v1";
const CONTRACT = "AVANTIQO_RUNPOD_IDLE_COST_GUARD_V1";

const TARGETS = Object.freeze([
  { name: "avantiqo-image-v1", idleTimeout: 10 },
  { name: "avantiqo-intelligence-v1", idleTimeout: 30 },
  { name: "avantiqo-code-v1", idleTimeout: 60 },
]);

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
    template_id: text(endpoint.templateId || endpoint.template?.id) || null,
    gpu_type_ids: unique(list(endpoint.gpuTypeIds)),
    data_center_ids: unique(list(endpoint.dataCenterIds)),
    network_volume_ids: endpointVolumeIds(endpoint),
    workers_min: finite(endpoint.workersMin),
    workers_max: finite(endpoint.workersMax),
    idle_timeout_seconds: finite(endpoint.idleTimeout),
    execution_timeout_ms: finite(endpoint.executionTimeoutMs ?? endpoint.executionTimeout),
    scaler_type: text(endpoint.scalerType) || null,
    scaler_value: finite(endpoint.scalerValue),
    flashboot: endpoint.flashboot === true || endpoint.flashBoot === true,
  };
}

function sameSet(left, right) {
  const a = unique(left).sort();
  const b = unique(right).sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

async function rest(path, key, options = {}) {
  const response = await fetch(`${REST_BASE}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    throw new Error(
      `RUNPOD_IDLE_COST_GUARD_HTTP_${response.status}:${text(body?.message || body?.error || body?.detail || raw).slice(0, 1000)}`,
    );
  }
  return body;
}

function assertUnrelatedPreserved(before, after) {
  for (const key of [
    "id",
    "name",
    "template_id",
    "workers_min",
    "workers_max",
    "execution_timeout_ms",
    "scaler_type",
    "scaler_value",
    "flashboot",
  ]) {
    if (before[key] !== after[key]) {
      throw new Error(`RUNPOD_IDLE_COST_GUARD_UNRELATED_FIELD_CHANGED:${before.name}:${key}`);
    }
  }
  if (!sameSet(before.gpu_type_ids, after.gpu_type_ids)) {
    throw new Error(`RUNPOD_IDLE_COST_GUARD_GPU_POOL_CHANGED:${before.name}`);
  }
  if (!sameSet(before.data_center_ids, after.data_center_ids)) {
    throw new Error(`RUNPOD_IDLE_COST_GUARD_DATACENTER_CHANGED:${before.name}`);
  }
  if (!sameSet(before.network_volume_ids, after.network_volume_ids)) {
    throw new Error(`RUNPOD_IDLE_COST_GUARD_NETWORK_VOLUME_CHANGED:${before.name}`);
  }
}

const apply = process.argv.includes("--apply");
if (apply && text(process.env.AVANTIQO_RUNPOD_COST_GUARD_APPROVED).toUpperCase() !== "YES") {
  throw new Error("AVANTIQO_RUNPOD_COST_GUARD_APPROVED=YES_REQUIRED");
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");

console.log(`AVANTIQO_RUNPOD_IDLE_COST_GUARD_CONTRACT=${CONTRACT}`);
console.log(`AVANTIQO_RUNPOD_IDLE_COST_GUARD_MODE=${apply ? "APPLY" : "PLAN"}`);
console.log("AVANTIQO_RUNPOD_IDLE_COST_GUARD_GENERATION=false");
console.log("AVANTIQO_RUNPOD_IDLE_COST_GUARD_CACHE_OPERATION=false");
console.log("AVANTIQO_RUNPOD_IDLE_COST_GUARD_TEMPLATE_MUTATION=false");
console.log("AVANTIQO_RUNPOD_IDLE_COST_GUARD_GPU_POOL_MUTATION=false");
console.log("AVANTIQO_RUNPOD_IDLE_COST_GUARD_NETWORK_VOLUME_MUTATION=false");
console.log("AVANTIQO_RUNPOD_IDLE_COST_GUARD_PRODUCTION_DEPLOY=false");

const endpoints = await rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey);
if (!Array.isArray(endpoints)) throw new Error("RUNPOD_IDLE_COST_GUARD_ENDPOINT_LIST_INVALID");

const plans = [];
for (const target of TARGETS) {
  const matches = endpoints.filter((endpoint) => text(endpoint?.name) === target.name);
  if (matches.length !== 1) {
    throw new Error(`RUNPOD_IDLE_COST_GUARD_ENDPOINT_RESOLUTION_FAILED:${target.name}:matches=${matches.length}`);
  }
  const before = snapshot(matches[0]);
  if (before.workers_min !== 0 || before.workers_max !== 1) {
    throw new Error(
      `RUNPOD_IDLE_COST_GUARD_WORKER_LIMITS_UNEXPECTED:${target.name}:min=${before.workers_min}:max=${before.workers_max}`,
    );
  }
  plans.push({
    target,
    before,
    mutation_required: before.idle_timeout_seconds !== target.idleTimeout,
  });
}

if (!apply) {
  console.log("AVANTIQO_RUNPOD_IDLE_COST_GUARD_PLAN=READY");
  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    mode: "PLAN",
    plans,
    production_deploy: false,
  }, null, 2));
  process.exit(0);
}

const results = [];
for (const plan of plans) {
  const { target, before } = plan;
  if (!plan.mutation_required) {
    results.push({
      name: target.name,
      mutation_performed: false,
      before,
      after: before,
    });
    continue;
  }

  const fresh = await rest(
    `/endpoints/${encodeURIComponent(before.id)}?includeTemplate=true&includeWorkers=true`,
    managementKey,
  );
  const freshSnapshot = snapshot(fresh);
  assertUnrelatedPreserved(before, freshSnapshot);
  if (freshSnapshot.idle_timeout_seconds !== before.idle_timeout_seconds) {
    throw new Error(`RUNPOD_IDLE_COST_GUARD_CONCURRENT_IDLE_CHANGE:${target.name}`);
  }

  await rest(`/endpoints/${encodeURIComponent(before.id)}`, managementKey, {
    method: "PATCH",
    body: { idleTimeout: target.idleTimeout },
  });

  const verified = await rest(
    `/endpoints/${encodeURIComponent(before.id)}?includeTemplate=true&includeWorkers=true`,
    managementKey,
  );
  const after = snapshot(verified);
  assertUnrelatedPreserved(before, after);
  if (after.idle_timeout_seconds !== target.idleTimeout) {
    throw new Error(
      `RUNPOD_IDLE_COST_GUARD_VERIFY_FAILED:${target.name}:actual=${after.idle_timeout_seconds}:expected=${target.idleTimeout}`,
    );
  }

  results.push({
    name: target.name,
    mutation_performed: true,
    before,
    after,
  });
  console.log(
    `AVANTIQO_RUNPOD_IDLE_COST_GUARD_APPLIED name=${target.name} before=${before.idle_timeout_seconds} after=${after.idle_timeout_seconds}`,
  );
}

console.log("AVANTIQO_RUNPOD_IDLE_COST_GUARD_COMPLETE=YES");
console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: "APPLY",
  results,
  preserved: {
    workers_min: true,
    workers_max: true,
    template: true,
    gpu_pool: true,
    network_volumes: true,
    data_center_ids: true,
    execution_timeout: true,
    scaler: true,
    flashboot: true,
  },
  generation_submitted: false,
  cache_operation_submitted: false,
  production_deploy: false,
}, null, 2));
