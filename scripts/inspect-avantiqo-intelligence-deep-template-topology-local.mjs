const REST_BASE = "https://rest.runpod.io/v1";
const CONTRACT = "AVANTIQO_INTELLIGENCE_DEEP_TEMPLATE_TOPOLOGY_V1";
const DEEP_NAME = "avantiqo-intelligence-v1";
const FAST_NAME = "avantiqo-intelligence-fast-v1";
const DEEP_MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507";
const FAST_MODEL = "Qwen/Qwen3-30B-A3B-Instruct-2507";

const text = (value, limit = 6000) => String(value ?? "").trim().slice(0, limit);
const list = (value) => (Array.isArray(value) ? value : []);
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function redact(value) {
  return String(value ?? "")
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/([?&](?:token|key|api_key|apikey|sig|signature)=)[^&\s]+/gi, "$1[REDACTED]")
    .slice(0, 6000);
}

function credential() {
  const value = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY, 1000);
  if (!value) throw new Error("RUNPOD_MANAGEMENT_OR_API_KEY_REQUIRED");
  return value;
}

async function getJson(path, key) {
  const response = await fetch(`${REST_BASE}${path}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    throw new Error(`AVANTIQO_DEEP_TEMPLATE_TOPOLOGY_HTTP_${response.status}:${redact(text(body?.message || body?.error || body?.detail || raw, 700))}`);
  }
  if (body === null) throw new Error("AVANTIQO_DEEP_TEMPLATE_TOPOLOGY_INVALID_JSON");
  return body;
}

function rows(value, keys = []) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  for (const key of [...keys, "data", "items", "results"]) {
    if (Array.isArray(value[key])) return value[key];
  }
  return [];
}

function resolveOne(items, name, code) {
  const matches = rows(items).filter((entry) => text(entry?.name, 300) === name);
  if (matches.length !== 1) throw new Error(`${code}:matches=${matches.length}`);
  return matches[0];
}

function templateId(endpoint = {}) {
  return text(endpoint?.templateId || endpoint?.template?.id, 300);
}

function resolveTemplate(endpoint, templates) {
  const id = templateId(endpoint);
  const resolved = rows(templates).find((item) => text(item?.id, 300) === id) || endpoint?.template;
  if (!id || !resolved) throw new Error(`AVANTIQO_DEEP_TEMPLATE_TOPOLOGY_BOUND_TEMPLATE_REQUIRED:${text(endpoint?.name, 300)}`);
  return resolved;
}

function command(value) {
  return (Array.isArray(value) ? value : [value])
    .map((entry) => redact(text(entry, 3000)))
    .filter(Boolean);
}

function envPairs(value) {
  return Array.isArray(value)
    ? value.map((entry) => [text(entry?.key || entry?.name, 300), String(entry?.value ?? "")])
    : Object.entries(object(value)).map(([key, entryValue]) => [text(key, 300), String(entryValue ?? "")]);
}

function safeEnvSummary(value) {
  return envPairs(value)
    .filter(([key]) => key)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entryValue]) => ({
      key,
      value_present: entryValue.length > 0,
      deep_model_binding: entryValue.includes(DEEP_MODEL),
      fast_model_binding: entryValue.includes(FAST_MODEL),
      runpod_reference: /runpod/i.test(entryValue),
      serverless_reference: /serverless/i.test(entryValue),
      vllm_reference: /vllm|api_server|openai/i.test(entryValue),
      secret_like_key: /api[_-]?key|token|password|secret|authorization/i.test(key),
      value_printed: false,
    }));
}

function topology(template = {}) {
  const entrypoint = command(template?.dockerEntrypoint);
  const startCmd = command(template?.dockerStartCmd);
  const env = safeEnvSummary(template?.env);
  const commandText = [...entrypoint, ...startCmd].join(" ");
  const combinedSafeSignals = JSON.stringify({ commandText, env });
  const runpodReference = /runpod/i.test(combinedSafeSignals);
  const serverlessReference = /serverless/i.test(combinedSafeSignals);
  const vllmReference = /vllm|api_server|openai/i.test(combinedSafeSignals);
  const pythonHandlerReference = /handler\.py|python\s+[^ ]*handler|python3\s+[^ ]*handler/i.test(commandText);
  let classification = "CONTAINER_STARTUP_TOPOLOGY_AMBIGUOUS";
  if (vllmReference && !runpodReference && !serverlessReference && !pythonHandlerReference) {
    classification = "DIRECT_VLLM_STARTUP_NO_EXPLICIT_SERVERLESS_WRAPPER";
  } else if (runpodReference || serverlessReference || pythonHandlerReference) {
    classification = "EXPLICIT_SERVERLESS_OR_HANDLER_STARTUP_REFERENCE";
  } else if (!entrypoint.length && !startCmd.length) {
    classification = "IMAGE_DEFAULT_ENTRYPOINT_TOPOLOGY";
  }
  return {
    image_name: text(template?.imageName, 1000) || null,
    container_disk_gb: finite(template?.containerDiskInGb),
    docker_entrypoint: entrypoint,
    docker_start_cmd: startCmd,
    ports: list(template?.ports),
    volume_gb: finite(template?.volumeInGb),
    volume_mount_path: text(template?.volumeMountPath, 1000) || null,
    env: env,
    signals: {
      runpod_reference: runpodReference,
      serverless_reference: serverlessReference,
      vllm_reference: vllmReference,
      python_handler_reference: pythonHandlerReference,
      deep_model_binding: combinedSafeSignals.includes(DEEP_MODEL),
      fast_model_binding: combinedSafeSignals.includes(FAST_MODEL),
    },
    classification,
  };
}

function differenceFields(left, right) {
  const fields = [
    "image_name",
    "docker_entrypoint",
    "docker_start_cmd",
    "ports",
    "volume_gb",
    "volume_mount_path",
  ];
  return fields.filter((field) => JSON.stringify(left[field]) !== JSON.stringify(right[field]));
}

const key = credential();
const [endpointsRaw, templatesRaw] = await Promise.all([
  getJson("/endpoints?includeTemplate=true&includeWorkers=true", key),
  getJson("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", key),
]);
const endpointRows = rows(endpointsRaw, ["endpoints", "serverlessEndpoints"]);
const deepEndpoint = resolveOne(endpointRows, DEEP_NAME, "AVANTIQO_DEEP_TEMPLATE_TOPOLOGY_DEEP_ENDPOINT_RESOLUTION_FAILED");
const fastEndpoint = resolveOne(endpointRows, FAST_NAME, "AVANTIQO_DEEP_TEMPLATE_TOPOLOGY_FAST_ENDPOINT_RESOLUTION_FAILED");
const deepTemplate = resolveTemplate(deepEndpoint, templatesRaw);
const fastTemplate = resolveTemplate(fastEndpoint, templatesRaw);
const deep = topology(deepTemplate);
const fast = topology(fastTemplate);
const differenceFields = differenceFields(deep, fast);

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: "READ_ONLY",
  deep_endpoint: {
    name: DEEP_NAME,
    template_id_present: Boolean(templateId(deepEndpoint)),
    workers_min: finite(deepEndpoint?.workersMin),
    workers_max: finite(deepEndpoint?.workersMax),
  },
  fast_endpoint: {
    name: FAST_NAME,
    template_id_present: Boolean(templateId(fastEndpoint)),
    workers_min: finite(fastEndpoint?.workersMin),
    workers_max: finite(fastEndpoint?.workersMax),
  },
  deep_template: deep,
  fast_template: fast,
  topology_difference_fields: differenceFields,
  image_identity_equal: deep.image_name === fast.image_name,
  deep_startup_classification: deep.classification,
  inference_performed: false,
  generation_submitted: false,
  endpoint_mutation_performed: false,
  template_mutation_performed: false,
  production_deploy_performed: false,
  env_values_printed: false,
  secrets_printed: false,
}, null, 2));
console.log(`AVANTIQO_INTELLIGENCE_DEEP_TEMPLATE_TOPOLOGY=${deep.classification}`);
console.log("AVANTIQO_INTELLIGENCE_DEEP_TEMPLATE_TOPOLOGY_INSPECTION=PASS");