const REST = "https://rest.runpod.io/v1";
const GQL = "https://api.runpod.io/graphql";
const SERVERLESS = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_CODE_GPU_REBIND_V2";
const MINIMUM_VRAM_GB = 80;
const MAX_GPU_POOL_SIZE = 4;

const PROFILES = Object.freeze([
  Object.freeze({
    key: "RTX_PRO_6000_96GB",
    match: /RTX\s*PRO\s*6000/i,
    usd_per_hour_reference: 3.49,
    priority: 5000,
    production_certified: false,
  }),
  Object.freeze({
    key: "H100_80GB",
    match: /\bH100\b/i,
    usd_per_hour_reference: 4.79,
    priority: 4500,
    production_certified: false,
  }),
  Object.freeze({
    key: "H200_141GB",
    match: /\bH200\b/i,
    usd_per_hour_reference: 5.93,
    priority: 4400,
    production_certified: false,
  }),
  Object.freeze({
    key: "B200_180GB",
    match: /\bB200\b/i,
    usd_per_hour_reference: 8.64,
    priority: 4300,
    production_certified: true,
  }),
]);

function text(value) {
  return String(value ?? "").trim();
}

function yes(value) {
  return ["1", "true", "yes", "on"].includes(text(value).toLowerCase());
}

function stockRank(value) {
  return ({ HIGH: 4, MEDIUM: 3, LOW: 2 }[text(value).toUpperCase()] || 0);
}

function unique(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(text).filter(Boolean))];
}

function sameSet(left, right) {
  const a = unique(left).sort();
  const b = unique(right).sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function endpointVolumeId(endpoint = {}) {
  return text(
    endpoint.networkVolumeId ||
      (Array.isArray(endpoint.networkVolumeIds) ? endpoint.networkVolumeIds[0] : null),
  );
}

function stableEndpointSnapshot(endpoint = {}) {
  return {
    template_id: text(endpoint.templateId || endpoint.template?.id) || null,
    workers_min: Number(endpoint.workersMin || 0),
    workers_max: Number(endpoint.workersMax || 0),
    idle_timeout_seconds: Number(endpoint.idleTimeout || 0),
    scaler_type: text(endpoint.scalerType) || null,
    scaler_value: Number(endpoint.scalerValue || 0),
    execution_timeout_ms: Number(endpoint.executionTimeoutMs || endpoint.executionTimeout || 0),
    flashboot: endpoint.flashBoot ?? endpoint.flashboot ?? null,
    data_center_ids: unique(endpoint.dataCenterIds),
  };
}

function gpuName(gpu = {}) {
  return text(gpu.gpuTypeDisplayName || gpu.displayName || gpu.gpuTypeId);
}

function profileForGpu(gpu = {}) {
  const name = `${text(gpu.gpuTypeId)} ${gpuName(gpu)}`;
  return PROFILES.find((profile) =>
    profile.match.test(name) && !(profile.exclude && profile.exclude.test(name)),
  ) || null;
}

async function rest(key, path, options = {}) {
  const response = await fetch(`${REST}${path}`, {
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
    body = { message: raw };
  }
  if (!response.ok) {
    throw new Error(`RUNPOD_MANAGEMENT_HTTP_${response.status}:${raw.slice(0, 800)}`);
  }
  return body;
}

async function endpointHealth(apiKey, endpointId) {
  if (!apiKey) return null;
  const response = await fetch(
    `${SERVERLESS}/${encodeURIComponent(endpointId)}/health`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(30_000),
    },
  );
  const raw = await response.text();
  let body = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = { message: raw };
  }
  if (!response.ok) {
    throw new Error(`RUNPOD_HEALTH_HTTP_${response.status}:${raw.slice(0, 800)}`);
  }
  return body;
}

function healthCounters(health = {}) {
  const jobs = health.jobs || {};
  const workers = health.workers || {};
  return {
    jobs: {
      in_queue: Number(jobs.inQueue || jobs.in_queue || 0),
      in_progress: Number(jobs.inProgress || jobs.in_progress || 0),
      completed: Number(jobs.completed || 0),
      failed: Number(jobs.failed || 0),
    },
    workers: {
      idle: Number(workers.idle || 0),
      initializing: Number(workers.initializing || 0),
      ready: Number(workers.ready || 0),
      running: Number(workers.running || 0),
      throttled: Number(workers.throttled || 0),
      unhealthy: Number(workers.unhealthy || 0),
    },
  };
}

function assertNoLiveJobs(health) {
  if (!health) throw new Error("RUNPOD_API_KEY_REQUIRED_FOR_SAFE_GPU_REBIND");
  const counters = healthCounters(health);
  if (counters.jobs.in_queue > 0 || counters.jobs.in_progress > 0) {
    throw new Error(
      `CODE_GPU_REBIND_BLOCKED_LIVE_JOBS:in_queue=${counters.jobs.in_queue}:in_progress=${counters.jobs.in_progress}`,
    );
  }
  if (
    counters.workers.initializing > 0 ||
    counters.workers.running > 0 ||
    counters.workers.unhealthy > 0
  ) {
    throw new Error(
      `CODE_GPU_REBIND_BLOCKED_ACTIVE_WORKER:initializing=${counters.workers.initializing}:running=${counters.workers.running}:unhealthy=${counters.workers.unhealthy}`,
    );
  }
  return counters;
}

async function availability(managementKey, datacenterId) {
  const query = `
query CodeGpuAvailability($input: GpuAvailabilityInput) {
  dataCenters {
    id
    gpuAvailability(input: $input) {
      available
      stockStatus
      gpuTypeId
      gpuTypeDisplayName
      displayName
    }
  }
}`;
  const response = await fetch(`${GQL}?api_key=${encodeURIComponent(managementKey)}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      variables: {
        input: {
          gpuCount: 1,
          minDisk: 5,
          minMemoryInGb: MINIMUM_VRAM_GB,
          secureCloud: true,
        },
      },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json();
  if (!response.ok || body.errors?.length) {
    throw new Error(`CODE_GPU_AVAILABILITY_FAILED:${JSON.stringify(body.errors || body)}`);
  }
  const datacenter = body.data?.dataCenters?.find((item) => item.id === datacenterId);
  if (!datacenter) throw new Error(`CODE_GPU_DATACENTER_NOT_FOUND:${datacenterId}`);
  return datacenter.gpuAvailability || [];
}

function rankedCandidates(rows, { certificationMode, currentGpuIds }) {
  return rows
    .filter((gpu) => gpu.available === true)
    .filter((gpu) => stockRank(gpu.stockStatus) > 0)
    .map((gpu) => ({ gpu, profile: profileForGpu(gpu) }))
    .filter((item) => item.profile)
    .filter((item) => certificationMode || item.profile.production_certified)
    .map((item) => ({
      id: text(item.gpu.gpuTypeId),
      name: gpuName(item.gpu),
      stock: text(item.gpu.stockStatus).toUpperCase(),
      profile: item.profile.key,
      usd_per_hour_reference: item.profile.usd_per_hour_reference,
      production_certified: item.profile.production_certified,
      current: currentGpuIds.includes(text(item.gpu.gpuTypeId)),
      priority: item.profile.priority,
    }))
    .sort((left, right) =>
      stockRank(right.stock) - stockRank(left.stock) ||
      left.usd_per_hour_reference - right.usd_per_hour_reference ||
      right.priority - left.priority ||
      left.id.localeCompare(right.id),
    );
}

function selectedPool(candidates) {
  return unique(candidates.slice(0, MAX_GPU_POOL_SIZE).map((candidate) => candidate.id));
}

async function main() {
  const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY);
  const apiKey = text(process.env.RUNPOD_AVANTIQO_CODE_API_KEY) || text(process.env.RUNPOD_API_KEY);
  const endpointId = text(process.env.RUNPOD_AVANTIQO_CODE_ENDPOINT_ID);
  const apply = yes(process.env.AVANTIQO_CODE_GPU_REBIND_APPLY);
  const approved = text(process.env.AVANTIQO_CODE_GPU_REBIND_APPROVED).toUpperCase() === "YES";
  const certificationMode = yes(process.env.AVANTIQO_CODE_GPU_CERTIFICATION_MODE);

  if (!managementKey) throw new Error("RUNPOD_MANAGEMENT_API_KEY_REQUIRED");
  if (!apiKey) throw new Error("RUNPOD_AVANTIQO_CODE_API_KEY_OR_RUNPOD_API_KEY_REQUIRED");
  if (!endpointId) throw new Error("RUNPOD_AVANTIQO_CODE_ENDPOINT_ID_REQUIRED");
  if (apply && !approved) throw new Error("AVANTIQO_CODE_GPU_REBIND_APPROVED=YES_REQUIRED");

  const endpoint = await rest(
    managementKey,
    `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
  );
  const volumeId = endpointVolumeId(endpoint);
  if (!volumeId) throw new Error("CODE_NETWORK_VOLUME_REQUIRED");
  const volume = await rest(managementKey, `/networkvolumes/${encodeURIComponent(volumeId)}`);
  const datacenterId = text(volume.dataCenterId);
  if (!datacenterId) throw new Error("CODE_NETWORK_VOLUME_DATACENTER_REQUIRED");

  const currentGpuIds = unique(endpoint.gpuTypeIds);
  const rows = await availability(managementKey, datacenterId);
  const candidates = rankedCandidates(rows, { certificationMode, currentGpuIds });
  const pool = selectedPool(candidates);
  const health = await endpointHealth(apiKey, endpointId);

  const plan = {
    success: true,
    contract: CONTRACT,
    mode: apply ? "APPLY" : "PLAN",
    certification_mode: certificationMode,
    minimum_vram_gb: MINIMUM_VRAM_GB,
    max_gpu_pool_size: MAX_GPU_POOL_SIZE,
    endpoint: {
      id: endpointId,
      gpu_type_ids: currentGpuIds,
      workers_min: Number(endpoint.workersMin || 0),
      workers_max: Number(endpoint.workersMax || 0),
      idle_timeout_seconds: Number(endpoint.idleTimeout || 0),
    },
    network_volume: {
      id: volumeId,
      name: text(volume.name) || null,
      size_gb: Number(volume.size || volume.sizeGb || 0),
      data_center_id: datacenterId,
    },
    health: healthCounters(health),
    available_candidates: candidates,
    selected_gpu_pool: pool,
    mutation_performed: false,
    cache_job_submitted: false,
    network_volume_replacement_allowed: false,
    production_deploy_performed: false,
  };

  if (!pool.length) {
    throw new Error("NO_APPROVED_CODE_GPU_POOL_AVAILABLE_IN_ATTACHED_VOLUME_DATACENTER");
  }

  if (!apply) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  assertNoLiveJobs(health);
  if (sameSet(currentGpuIds, pool)) {
    console.log(JSON.stringify({
      ...plan,
      mutation_performed: false,
      rebind_reason: "LIVE_COMPATIBLE_GPU_POOL_ALREADY_BOUND",
    }, null, 2));
    return;
  }

  const freshEndpoint = await rest(
    managementKey,
    `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
  );
  const freshVolumeId = endpointVolumeId(freshEndpoint);
  if (freshVolumeId !== volumeId) throw new Error("CODE_NETWORK_VOLUME_CHANGED_REPLAN_REQUIRED");
  if (JSON.stringify(stableEndpointSnapshot(freshEndpoint)) !== JSON.stringify(stableEndpointSnapshot(endpoint))) {
    throw new Error("CODE_ENDPOINT_STABLE_FIELDS_CHANGED_REPLAN_REQUIRED");
  }
  assertNoLiveJobs(await endpointHealth(apiKey, endpointId));

  const freshCandidates = rankedCandidates(
    await availability(managementKey, datacenterId),
    { certificationMode, currentGpuIds: unique(freshEndpoint.gpuTypeIds) },
  );
  const freshPool = selectedPool(freshCandidates);
  if (!freshPool.length) throw new Error("CODE_GPU_POOL_STOCK_DISAPPEARED_REPLAN_REQUIRED");

  await rest(managementKey, `/endpoints/${encodeURIComponent(endpointId)}`, {
    method: "PATCH",
    body: { gpuTypeIds: freshPool },
  });

  const verified = await rest(
    managementKey,
    `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
  );
  const verifiedVolumeId = endpointVolumeId(verified);
  if (verifiedVolumeId !== volumeId) throw new Error("CODE_NETWORK_VOLUME_CHANGED_UNEXPECTEDLY");
  if (!sameSet(unique(verified.gpuTypeIds), freshPool)) {
    throw new Error("CODE_GPU_POOL_REBIND_VERIFY_FAILED");
  }
  if (JSON.stringify(stableEndpointSnapshot(verified)) !== JSON.stringify(stableEndpointSnapshot(endpoint))) {
    throw new Error("CODE_ENDPOINT_STABLE_FIELDS_CHANGED_DURING_REBIND");
  }

  console.log(JSON.stringify({
    ...plan,
    mode: "APPLY",
    mutation_performed: true,
    selected_gpu_pool: freshPool,
    verified_gpu_type_ids: unique(verified.gpuTypeIds),
    verified_network_volume_id: verifiedVolumeId,
    cache_job_submitted: false,
    network_volume_preserved: true,
    workers_preserved: true,
    next_action: "RUN_CODE_RUNTIME_PROBE_THEN_FINAL_AUTONOMOUS_CERTIFICATION",
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    success: false,
    contract: CONTRACT,
    error: text(error?.message || error),
    mutation_performed: false,
    cache_job_submitted: false,
    production_deploy_performed: false,
  }, null, 2));
  process.exit(1);
});
