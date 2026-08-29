import process from "node:process";

const CONTRACT = "AVANTIQO_CODE_ZERO_IDLE_COLD_START_AUDIT_V1";
const ENDPOINT_ID = "r79dtnjnrilrlc";
const REST = "https://rest.runpod.io/v1";

function text(value, maximum = 1000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

async function readJson(url, key) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`CODE_ZERO_IDLE_AUDIT_HTTP_${response.status}:${text(body?.error || body?.message || body?.detail) || "UNKNOWN"}`);
  }
  return body;
}

const key = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
if (!key) throw new Error("RUNPOD_MANAGEMENT_API_KEY_OR_RUNPOD_API_KEY_REQUIRED");

const endpoint = await readJson(`${REST}/endpoints/${ENDPOINT_ID}`, key);
const workersMin = Number(endpoint.workersMin ?? endpoint.workers_min ?? -1);
const workersMax = Number(endpoint.workersMax ?? endpoint.workers_max ?? -1);
const idleTimeout = Number(endpoint.idleTimeout ?? endpoint.idle_timeout ?? -1);
const flashboot = endpoint.flashboot === true || endpoint.flashBoot === true || text(endpoint.flashBootType).toUpperCase() === "FLASHBOOT";

const zeroIdleCostEligible = workersMin === 0;
const flashbootReady = flashboot === true;
const costOptimizedTarget = zeroIdleCostEligible && flashbootReady && workersMax >= 1;

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  endpoint: {
    id: text(endpoint.id) || ENDPOINT_ID,
    name: text(endpoint.name) || null,
    workers_min: workersMin,
    workers_max: workersMax,
    idle_timeout_seconds: idleTimeout,
    flashboot: flashbootReady,
    network_volume_id: text(endpoint.networkVolumeId || endpoint.network_volume_id) || null,
    template_id: text(endpoint.templateId || endpoint.template_id) || null,
    gpu_type_ids: Array.isArray(endpoint.gpuTypeIds) ? endpoint.gpuTypeIds : [],
  },
  zero_idle_gpu_cost_eligible: zeroIdleCostEligible,
  flashboot_fast_cold_start_enabled: flashbootReady,
  customer_zero_idle_target_ready: costOptimizedTarget,
  required_target: {
    workers_min: 0,
    workers_max_at_least: 1,
    flashboot: true,
    network_volume_required: true,
  },
  mutation_performed: false,
  generation_submitted: false,
  provider_inference_performed: false,
  wallet_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
