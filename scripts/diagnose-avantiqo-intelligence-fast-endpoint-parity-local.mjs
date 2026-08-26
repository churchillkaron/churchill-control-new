const REST_BASE = "https://rest.runpod.io/v1";
const DEEP_NAME = "avantiqo-intelligence-v1";
const FAST_NAME = "avantiqo-intelligence-fast-v1";
const DEEP_MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507";
const FAST_MODEL = "Qwen/Qwen3-30B-A3B-Instruct-2507";
const CONTRACT = "AVANTIQO_INTELLIGENCE_FAST_ENDPOINT_PARITY_DIAGNOSTIC_V2";

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

function envMap(value) {
  const pairs = Array.isArray(value)
    ? value.map((entry) => [text(entry?.key || entry?.name), String(entry?.value ?? "")])
    : Object.entries(object(value)).map(([key, entryValue]) => [key, String(entryValue ?? "")]);
  return Object.fromEntries(
    pairs.filter(([key]) => key).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function replaceModel(value) {
  if (typeof value === "string") return value.split(DEEP_MODEL).join(FAST_MODEL);
  if (Array.isArray(value)) return value.map(replaceModel);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [key, replaceModel(entryValue)]),
    );
  }
  return value;
}

function command(value) {
  const source = (Array.isArray(value) ? value : [text(value)].filter(Boolean)).map(replaceModel);
  const output = [];
  for (let index = 0; index < source.length; index += 1) {
    const current = text(source[index]);
    if (/^--reasoning-parser(?:=|$)/i.test(current)) {
      if (/^--reasoning-parser$/i.test(current)) index += 1;
      continue;
    }
    output.push(
      typeof source[index] === "string"
        ? source[index]
            .replace(/\s+--reasoning-parser(?:=\S+|\s+\S+)/gi, "")
            .trim()
        : source[index],
    );
  }
  return output.filter((entry) => text(entry));
}

function fastEnvFromDeep(value) {
  return Object.fromEntries(
    Object.entries(envMap(value))
      .filter(([key]) => !key.toUpperCase().includes("REASONING_PARSER"))
      .map(([key, entryValue]) => [key, replaceModel(entryValue)]),
  );
}

function normalizedPorts(value) {
  return list(value)
    .map((entry) => (entry && typeof entry === "object" ? entry : text(entry)))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function expectedFastRuntimeFromDeep(template) {
  return {
    image_name: text(template?.imageName) || null,
    container_disk_gb: finite(template?.containerDiskInGb),
    docker_entrypoint: command(template?.dockerEntrypoint),
    docker_start_cmd: command(template?.dockerStartCmd),
    env: fastEnvFromDeep(template?.env),
    ports: normalizedPorts(template?.ports),
    volume_gb: finite(template?.volumeInGb),
    volume_mount_path: text(template?.volumeMountPath) || null,
    registry_auth_id: text(template?.containerRegistryAuthId) || null,
    is_public: template?.isPublic === true,
  };
}

function actualFastRuntime(template) {
  return {
    image_name: text(template?.imageName) || null,
    container_disk_gb: finite(template?.containerDiskInGb),
    docker_entrypoint: Array.isArray(template?.dockerEntrypoint)
      ? template.dockerEntrypoint
      : [text(template?.dockerEntrypoint)].filter(Boolean),
    docker_start_cmd: Array.isArray(template?.dockerStartCmd)
      ? template.dockerStartCmd
      : [text(template?.dockerStartCmd)].filter(Boolean),
    env: envMap(template?.env),
    ports: normalizedPorts(template?.ports),
    volume_gb: finite(template?.volumeInGb),
    volume_mount_path: text(template?.volumeMountPath) || null,
    registry_auth_id: text(template?.containerRegistryAuthId) || null,
    is_public: template?.isPublic === true,
  };
}

function templateRuntimeSummary(template) {
  const env = envMap(template?.env);
  const serialized = JSON.stringify({
    dockerEntrypoint: template?.dockerEntrypoint,
    dockerStartCmd: template?.dockerStartCmd,
    env,
  });
  const entrypoint = Array.isArray(template?.dockerEntrypoint)
    ? template.dockerEntrypoint
    : [text(template?.dockerEntrypoint)].filter(Boolean);
  const startCmd = Array.isArray(template?.dockerStartCmd)
    ? template.dockerStartCmd
    : [text(template?.dockerStartCmd)].filter(Boolean);
  return {
    image_name: text(template?.imageName) || null,
    container_disk_gb: finite(template?.containerDiskInGb),
    volume_gb: finite(template?.volumeInGb),
    volume_mount_path: text(template?.volumeMountPath) || null,
    registry_auth_present: Boolean(text(template?.containerRegistryAuthId)),
    entrypoint_present: entrypoint.length > 0,
    entrypoint_arg_count: entrypoint.length,
    start_cmd_present: startCmd.length > 0,
    start_cmd_arg_count: startCmd.length,
    ports_count: list(template?.ports).length,
    env_key_count: Object.keys(env).length,
    fast_model_binding_present: serialized.includes(FAST_MODEL),
    deep_model_binding_present: serialized.includes(DEEP_MODEL),
    reasoning_parser_present: /reasoning[_-]?parser|--reasoning-parser/i.test(serialized),
  };
}

function differentFields(left, right) {
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])];
  return keys.filter(
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
const deepTemplateRuntime = templateRuntimeSummary(deepTemplate);
const fastTemplateRuntime = templateRuntimeSummary(fastTemplate);
const expectedFastRuntime = expectedFastRuntimeFromDeep(deepTemplate);
const observedFastRuntime = actualFastRuntime(fastTemplate);
const templateRuntimeDifferences = differentFields(expectedFastRuntime, observedFastRuntime);

const fastParked =
  finite(fast?.workersMin) === 0 &&
  finite(fast?.workersMax) === 0 &&
  activeWorkerCount(fast) === 0;
const deepRestored =
  finite(deep?.workersMin) === 0 && finite(deep?.workersMax) === 1;
const postFailureStateSafe = deepRestored && fastParked;
const fastModelBindingValid =
  fastTemplateRuntime.fast_model_binding_present === true &&
  fastTemplateRuntime.deep_model_binding_present === false &&
  fastTemplateRuntime.reasoning_parser_present === false;
const templateRuntimeParity = templateRuntimeDifferences.length === 0;

let nextAction = "INSPECT_FAST_WORKER_STARTUP_LOGS_FOR_HANDLER_CLAIM_FAILURE";
if (!postFailureStateSafe) {
  nextAction = "RESTORE_CANONICAL_INTELLIGENCE_SLOT_BEFORE_ANY_MUTATION";
} else if (placementDifferences.length > 0) {
  nextAction = "REPAIR_FAST_ENDPOINT_RUNTIME_PLACEMENT_PARITY";
} else if (!fastModelBindingValid) {
  nextAction = "REPAIR_FAST_TEMPLATE_MODEL_BINDING";
} else if (!templateRuntimeParity) {
  nextAction = "REPAIR_FAST_TEMPLATE_RUNTIME_PARITY";
}

console.log(
  JSON.stringify(
    {
      success: true,
      contract: CONTRACT,
      mode: "READ_ONLY_FULL_RUNTIME_PARITY",
      deep_endpoint: safeEndpoint(deep),
      fast_endpoint: safeEndpoint(fast),
      runtime_critical_placement_difference_fields: placementDifferences,
      runtime_critical_placement_parity: placementDifferences.length === 0,
      deep_template_runtime: deepTemplateRuntime,
      fast_template_runtime: fastTemplateRuntime,
      template_runtime_expected_from_proven_deep: true,
      template_runtime_difference_fields: templateRuntimeDifferences,
      template_runtime_parity: templateRuntimeParity,
      fast_model_binding_valid: fastModelBindingValid,
      post_failure_state_safe: postFailureStateSafe,
      next_action: nextAction,
      generation_submitted: false,
      endpoint_mutation_performed: false,
      template_mutation_performed: false,
      queue_mutation_performed: false,
      production_deploy_performed: false,
      secrets_in_output: false,
    },
    null,
    2,
  ),
);
console.log(`AVANTIQO_INTELLIGENCE_FAST_PARITY_NEXT_ACTION=${nextAction}`);
console.log("AVANTIQO_INTELLIGENCE_FAST_ENDPOINT_PARITY_DIAGNOSTIC=PASS");
