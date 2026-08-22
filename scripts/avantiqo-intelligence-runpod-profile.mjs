const REST_BASE = "https://rest.runpod.io/v1";

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function requiredEnvironment() {
  const endpointId = text(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID);
  const apiKey = text(process.env.RUNPOD_API_KEY);
  if (!endpointId) throw new Error("RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID_REQUIRED");
  if (!apiKey) throw new Error("RUNPOD_API_KEY_REQUIRED");
  return { endpointId, apiKey };
}

async function getJson(url, apiKey) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    const raw = await response.text();
    const body = raw ? JSON.parse(raw) : {};
    if (!response.ok) {
      throw new Error(`RUNPOD_PROFILE_REQUEST_FAILED:${response.status}:${text(body?.error || raw).slice(0, 500)}`);
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

const { endpointId, apiKey } = requiredEnvironment();
const endpoint = await getJson(
  `${REST_BASE}/endpoints/${encodeURIComponent(endpointId)}?includeWorkers=true&includeTemplate=false`,
  apiKey,
);

const workers = list(endpoint?.workers).map((worker) => ({
  pod_id_present: Boolean(text(worker?.id)),
  desired_status: text(worker?.desiredStatus) || null,
  gpu_type: text(worker?.gpu?.displayName || worker?.gpu?.id) || null,
  gpu_count: finite(worker?.gpu?.count),
  cost_per_hour_usd: finite(worker?.costPerHr),
  adjusted_cost_per_hour_usd: finite(worker?.adjustedCostPerHr),
  uptime_seconds: finite(worker?.uptimeSeconds),
}));

const profile = {
  contract: "AVANTIQO_RUNPOD_INTELLIGENCE_PROFILE_V1",
  endpoint_id_present: Boolean(text(endpoint?.id)),
  endpoint_name: text(endpoint?.name) || null,
  gpu_type_ids: list(endpoint?.gpuTypeIds).map(text).filter(Boolean),
  gpu_count_per_worker: finite(endpoint?.gpuCount),
  workers_min: finite(endpoint?.workersMin),
  workers_max: finite(endpoint?.workersMax),
  active_worker_count: workers.length,
  scaler_type: text(endpoint?.scalerType) || null,
  scaler_value: finite(endpoint?.scalerValue),
  idle_timeout_seconds: finite(endpoint?.idleTimeout),
  execution_timeout_ms: finite(endpoint?.executionTimeoutMs),
  flashboot: endpoint?.flashboot === true,
  workers,
};

console.log(JSON.stringify(profile, null, 2));
