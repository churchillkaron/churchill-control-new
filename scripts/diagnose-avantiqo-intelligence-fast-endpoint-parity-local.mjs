const REST_BASE = "https://rest.runpod.io/v1";
const DEEP_NAME = "avantiqo-intelligence-v1";
const FAST_NAME = "avantiqo-intelligence-fast-v1";
const CONTRACT = "AVANTIQO_INTELLIGENCE_FAST_ENDPOINT_PARITY_DIAGNOSTIC_V1";

const text = (value) => String(value ?? "").trim();
const list = (value) => (Array.isArray(value) ? value : []);
const object = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
const sortedText = (value) => list(value).map(text).filter(Boolean).sort();

function managementCredential() {
  const value = text(
    process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY,
  );
  if (!value) throw new Error("RUNPOD_MANAGEMENT_OR_API_KEY_REQUIRED");
  return value;
}

async function getJson(path, apiKey) {
  const response = await fetch(`${REST_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
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
    const detail = text(body?.message || body?.error || body?.detail || raw)
      .replace(/\s+/g, " ")
      .slice(0, 500);
    throw new Error(
      `RUNPOD_FAST_ENDPOINT_PARITY_HTTP_${response.status}:${detail || "EMPTY_BODY"}`,
    );
  }
  return body;
}

function resolveOne(items, name, code) {
  const matches = list(items).filter((item) => text(item?.name) === name);
  if (matches.length !== 1) throw new Error(`${code}:matches=${matches.length}`);
  return matches[0];
}

function networkVolumeIds(endpoint) {
  return [
    ...sortedText(endpoint?.networkVolumeIds),
    text(endpoint?.networkVolumeId),
  ]
    .filter(Boolean)
    .filter((value, index, source) => source.indexOf(value) === index)
    .sort();
}

function placement(endpoint) {
  return {
    compute_type: text(endpoint?.computeType) || null,
    gpu_count: finite(endpoint?.gpuCount),
    gpu_type_ids: sortedText(endpoint?.gpuTypeIds),
    data_center_ids: sortedText(endpoint?.dataCenterIds),
    allowed_cuda_versions: sortedText(endpoint?.allowedCudaVersions),
    minimum_cuda_version: text(endpoint?.minCudaVersion) || null,
    network_volume_ids: networkVolumeIds(endpoint),
    flashboot: endpoint?.flashboot === true,
  };
}

function operation(endpoint) {
  return {
    execution_timeout_ms: finite(endpoint?.executionTimeoutMs),
    idle_timeout_seconds: finite(endpoint?.idleTimeout),
    scaler_type: text(endpoint?.scalerType) || null,
    scaler_value: finite(endpoint?.scalerValue),
    workers_min: finite(endpoint?.workersMin),
    workers_max: finite(endpoint?.workersMax),
  };
}

function activeWorkerCount(endpoint) {
  return list(endpoint?.workers).filter((worker) => {
    const desired = text(worker?.desiredStatus || worker?.desired_status).toUpperCase();
    return desired !== "EXITED";
  }).length;
}

function safeEndpoint(endpoint) {
  return {
    present: Boolean(text(endpoint?.id)),
    name: text(endpoint?.name) || null,
    template_id_present: Boolean(
      text(endpoint?.templateId || endpoint?.template?.id),
    ),
    placement: placement(endpoint),
    operation: operation(endpoint),
    active_management_workers: activeWorkerCount(endpoint),
  };
}

function templateFor(endpoint, templates) {
  const templateId = text(endpoint?.templateId || endpoint?.template?.id);
  const template =
    list(templates).find((item) => text(item?.id) === templateId) ||
    endpoint?.template;
  if (!templateId || !template) {
    throw new Error(`AVANTIQO_INTELLIGENCE_BOUND_TEMPLATE_REQUIRED:${text(endpoint?.name)}`);
  }
  return template;
}

function templateRuntime(template) {
  const env = object(template?.env);
  const envEntries = Array.isArray(template?.env)
    ? template.env.map((entry) => [text(entry?.key || entry?.name), String(entry?.value ?? "")])
    : Object.entries(env).map(([key, value]) => [key, String(value ?? "")]);
  const serialized = JSON.stringify({
    dockerEntrypoint: template?.dockerEntrypoint,
    dockerStartCmd: template?.dockerStartCmd,
    env: Object.fromEntries(envEntries),
  });
  return {
    image_name: text(template?.imageName) || null,
    container_disk_gb: finite(template?.containerDiskInGb),
    volume_gb: finite(template?.volumeInGb),
    volume_mount_path: text(template?.volumeMountPath) || null,
    registry_auth_present: Boolean(text(template?.containerRegistryAuthId)),
    env_key_count: envEntries.filter(([key]) => key).length,
    fast_model_binding_present: serialized.includes(
      "Qwen/Qwen3-30B-A3B-Instruct-2507",
    ),
    deep_model_binding_present: serialized.includes(
      "Qwen/Qwen3-30B-A3B-Thinking-2507",
    ),
    reasoning_parser_present: /reasoning[_-]?parser|--reasoning-parser/i.test(
      serialized,
    ),
  };
}

function differentFields(left, right) {
  return Object.keys(left).filter(
    (key) => JSON.stringify(left[key]) !== JSON.stringify(right[key]),
  );
}

const apiKey = managementCredential();
const [endpoints, templates] = await Promise.all([
  getJson("/endpoints?includeTemplate=true&includeWorkers=true", apiKey),
  getJson(
    "/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false",
    apiKey,
  ),
]);

const deep = resolveOne(
  endpoints,
  DEEP_NAME,
  "AVANTIQO_INTELLIGENCE_DEEP_ENDPOINT_RESOLUTION_FAILED",
);
const fast = resolveOne(
  endpoints,
  FAST_NAME,
  "AVANTIQO_INTELLIGENCE_FAST_ENDPOINT_RESOLUTION_FAILED",
);
const deepPlacement = placement(deep);
const fastPlacement = placement(fast);
const placementDifferences = differentFields(deepPlacement, fastPlacement);
const deepTemplate = templateFor(deep, templates);
const fastTemplate = templateFor(fast, templates);
const deepTemplateRuntime = templateRuntime(deepTemplate);
const fastTemplateRuntime = templateRuntime(fastTemplate);

const fastParked =
  finite(fast?.workersMin) === 0 &&
  finite(fast?.workersMax) === 0 &&
  activeWorkerCount(fast) === 0;
const deepRestored =
  finite(deep?.workersMin) === 0 && finite(deep?.workersMax) === 1;

console.log(
  JSON.stringify(
    {
      success: true,
      contract: CONTRACT,
      mode: "READ_ONLY",
      deep_endpoint: safeEndpoint(deep),
      fast_endpoint: safeEndpoint(fast),
      runtime_critical_placement_difference_fields: placementDifferences,
      runtime_critical_placement_parity: placementDifferences.length === 0,
      deep_template_runtime: deepTemplateRuntime,
      fast_template_runtime: fastTemplateRuntime,
      fast_model_binding_valid:
        fastTemplateRuntime.fast_model_binding_present === true &&
        fastTemplateRuntime.deep_model_binding_present === false &&
        fastTemplateRuntime.reasoning_parser_present === false,
      post_failure_state_safe: deepRestored && fastParked,
      next_action:
        placementDifferences.length > 0
          ? "REPAIR_FAST_ENDPOINT_RUNTIME_PLACEMENT_PARITY"
          : "INSPECT_FAST_WORKER_STARTUP_LOGS_FOR_MODEL_OR_HANDLER_FAILURE",
      generation_submitted: false,
      endpoint_mutation_performed: false,
      production_deploy_performed: false,
      secrets_in_output: false,
    },
    null,
    2,
  ),
);
