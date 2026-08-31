const REST_BASE = "https://rest.runpod.io/v1";
const ENDPOINT_NAME = "avantiqo-intelligence-v1";
const CONTRACT = "AVANTIQO_INTELLIGENCE_DEEP_COLD_START_CONFIG_V1";

const text = (value, limit = 4000) => String(value ?? "").trim().slice(0, limit);
const list = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function key() {
  const value = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY, 8000);
  if (!value) throw new Error("RUNPOD_MANAGEMENT_OR_API_KEY_REQUIRED");
  return value;
}

function redact(value) {
  return text(value, 1800)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/\bhf_[A-Za-z0-9]{8,}\b/g, "hf_[REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]");
}

async function requestJson(pathname, credential) {
  const response = await fetch(`${REST_BASE}${pathname}`, {
    headers: { Authorization: `Bearer ${credential}`, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(30000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok || body === null) {
    throw new Error(`${CONTRACT}_HTTP_${response.status}:${redact(raw)}`);
  }
  return body;
}

function rows(value, keys = []) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  for (const name of [...keys, "data", "items", "results"]) {
    if (Array.isArray(value[name])) return value[name];
  }
  return [];
}

function envMap(value) {
  const pairs = Array.isArray(value)
    ? value.map((entry) => [text(entry?.key || entry?.name, 300), String(entry?.value ?? "")])
    : Object.entries(object(value)).map(([name, entryValue]) => [text(name, 300), String(entryValue ?? "")]);
  return Object.fromEntries(pairs.filter(([name]) => name));
}

function command(value) {
  return (Array.isArray(value) ? value : [value]).map((entry) => text(entry, 5000)).filter(Boolean);
}

const credential = key();
const endpointBody = await requestJson("/endpoints?includeTemplate=true&includeWorkers=true", credential);
const endpoints = rows(endpointBody, ["endpoints", "serverlessEndpoints"]);
const matches = endpoints.filter((row) => text(row?.name, 300) === ENDPOINT_NAME);
if (matches.length !== 1) throw new Error(`${CONTRACT}_ENDPOINT_RESOLUTION_FAILED:${matches.length}`);
const endpoint = matches[0];
const templateId = text(endpoint?.templateId || endpoint?.template?.id, 300);
if (!templateId) throw new Error(`${CONTRACT}_TEMPLATE_ID_REQUIRED`);
let template = object(endpoint?.template);
if (!text(template?.imageName, 1200)) {
  template = await requestJson(`/templates/${encodeURIComponent(templateId)}`, credential);
}
const env = envMap(template?.env);
const interestingEnvNames = [
  "ENFORCE_EAGER",
  "SAFETENSORS_LOAD_STRATEGY",
  "VLLM_CACHE_ROOT",
  "TORCHINDUCTOR_CACHE_DIR",
  "CUDA_GRAPHS_CACHE_DIR",
  "HF_HOME",
  "HUGGINGFACE_HUB_CACHE",
  "HF_HUB_OFFLINE",
  "TRANSFORMERS_OFFLINE",
  "VLLM_USE_MODELSCOPE",
].filter((name) => Object.prototype.hasOwnProperty.call(env, name));
const interestingEnv = Object.fromEntries(interestingEnvNames.map((name) => [name, redact(env[name])]));

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: "READ_ONLY",
  endpoint: {
    id_present: Boolean(text(endpoint?.id, 300)),
    name: text(endpoint?.name, 300),
    workers_min: finite(endpoint?.workersMin),
    workers_max: finite(endpoint?.workersMax),
    idle_timeout_seconds: finite(endpoint?.idleTimeout),
    scaler_type: text(endpoint?.scalerType, 200) || null,
    scaler_value: finite(endpoint?.scalerValue),
    flash_boot_type: text(endpoint?.flashBootType, 200) || null,
    gpu_count: finite(endpoint?.gpuCount),
    gpu_type_ids: list(endpoint?.gpuTypeIds).map((value) => text(value, 300)).filter(Boolean),
    network_volume_id: text(endpoint?.networkVolumeId, 300) || null,
    data_center_ids: list(endpoint?.dataCenterIds).map((value) => text(value, 300)).filter(Boolean),
  },
  template: {
    template_id_present: Boolean(templateId),
    image_reference_present: Boolean(text(template?.imageName, 1200)),
    image_reference: text(template?.imageName, 1200) || null,
    volume_mount_path: text(template?.volumeMountPath, 1000) || null,
    volume_gb: finite(template?.volumeInGb),
    container_disk_gb: finite(template?.containerDiskInGb),
    docker_entrypoint: command(template?.dockerEntrypoint),
    docker_start_cmd: command(template?.dockerStartCmd),
    cold_start_env: interestingEnv,
  },
  assessment: {
    flashboot_configured: Boolean(text(endpoint?.flashBootType, 200)),
    eager_enabled: text(env.ENFORCE_EAGER, 40).toLowerCase() === "true",
    safetensors_prefetch_enabled: text(env.SAFETENSORS_LOAD_STRATEGY, 80).toLowerCase() === "prefetch",
    persistent_vllm_cache_configured: Boolean(text(env.VLLM_CACHE_ROOT, 1000)),
    persistent_torch_compile_cache_configured: Boolean(text(env.TORCHINDUCTOR_CACHE_DIR, 1000)),
    persistent_cuda_graph_cache_configured: Boolean(text(env.CUDA_GRAPHS_CACHE_DIR, 1000)),
    hf_cache_configured: Boolean(text(env.HF_HOME, 1000) || text(env.HUGGINGFACE_HUB_CACHE, 1000)),
    offline_model_resolution_enabled: ["1", "true", "yes"].includes(text(env.HF_HUB_OFFLINE, 40).toLowerCase()) || ["1", "true", "yes"].includes(text(env.TRANSFORMERS_OFFLINE, 40).toLowerCase()),
  },
  inference_performed: false,
  gpu_mutation_performed: false,
  endpoint_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
console.log(`${CONTRACT}=PASS`);
