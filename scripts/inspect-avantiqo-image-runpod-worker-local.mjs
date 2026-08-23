const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const DEFAULT_IMAGE_ENDPOINT_NAME = "avantiqo-image-v1";

const KNOWN_ENDPOINT_ENV_BY_NAME = new Map([
  ["avantiqo-image-v1", "RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID"],
  ["avantiqo-cinema-v1", "RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID"],
  ["avantiqo-intelligence-v1", "RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID"],
  ["avantiqo-code-v1", "RUNPOD_AVANTIQO_CODE_ENDPOINT_ID"],
  ["avantiqo-voice-stt-v1", "RUNPOD_AVANTIQO_VOICE_STT_ENDPOINT_ID"],
  ["avantiqo-voice-tts-v1", "RUNPOD_AVANTIQO_VOICE_TTS_ENDPOINT_ID"],
  ["avantiqo-audio-v1", "RUNPOD_AVANTIQO_AUDIO_ENDPOINT_ID"],
  ["avantiqo-lipsync-v1", "RUNPOD_AVANTIQO_LIPSYNC_ENDPOINT_ID"],
]);

function text(value) {
  return String(value ?? "").trim();
}

function required(name, code = `${name}_REQUIRED`) {
  const value = text(process.env[name]);
  if (!value) throw new Error(code);
  return value;
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeEnv(value) {
  return Object.fromEntries(
    Object.entries(object(value)).map(([key, child]) => [String(key), String(child ?? "")]),
  );
}

async function request(url, credential, credentialKind) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${credential}`,
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
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 1000);
    if (response.status === 401 && credentialKind === "management") {
      throw new Error(
        `RUNPOD_MANAGEMENT_API_KEY_UNAUTHORIZED:${detail || "EMPTY_BODY"}`,
      );
    }
    throw new Error(`RUNPOD_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body;
}

async function optionalRequest(url, credential, credentialKind) {
  try {
    return {
      ok: true,
      body: await request(url, credential, credentialKind),
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      body: null,
      error: text(error?.message || error),
    };
  }
}

function imageReferenceKind(imageName) {
  const value = text(imageName);
  if (!value) return "MISSING";
  if (value.includes("@sha256:")) return "IMMUTABLE_DIGEST";
  const slash = value.lastIndexOf("/");
  const tail = slash >= 0 ? value.slice(slash + 1) : value;
  if (!tail.includes(":")) return "MUTABLE_DEFAULT_TAG";
  return "MUTABLE_EXPLICIT_TAG";
}

function safeWorker(worker = {}) {
  return {
    id_present: Boolean(text(worker.id)),
    desired_status: text(worker.desiredStatus) || null,
    last_status_change: text(worker.lastStatusChange) || null,
    gpu: text(worker.gpu?.displayName || worker.machine?.gpuDisplayName) || null,
    cost_per_hour: finite(worker.costPerHr),
    adjusted_cost_per_hour: finite(worker.adjustedCostPerHr),
  };
}

function safeEndpoint(endpoint = {}) {
  return {
    id: text(endpoint.id) || null,
    name: text(endpoint.name) || null,
    version: finite(endpoint.version),
    compute_type: text(endpoint.computeType) || null,
    gpu_count: finite(endpoint.gpuCount),
    template_id: text(endpoint.templateId || endpoint.template?.id) || null,
    network_volume_id: text(endpoint.networkVolumeId) || null,
    network_volume_ids: list(endpoint.networkVolumeIds).map(text).filter(Boolean),
    workers_min: finite(endpoint.workersMin),
    workers_max: finite(endpoint.workersMax),
    idle_timeout_seconds: finite(endpoint.idleTimeout),
    execution_timeout_ms: finite(endpoint.executionTimeoutMs),
    scaler_type: text(endpoint.scalerType) || null,
    scaler_value: finite(endpoint.scalerValue),
    gpu_type_ids: list(endpoint.gpuTypeIds).map(text).filter(Boolean),
    data_center_ids: list(endpoint.dataCenterIds).map(text).filter(Boolean),
    flashboot: endpoint.flashboot === true,
    workers: list(endpoint.workers).map(safeWorker),
  };
}

function safeTemplate(endpoint = {}) {
  const template = object(endpoint.template);
  const templateId = text(endpoint.templateId || template.id);
  const imageName = text(template.imageName);
  const env = normalizeEnv(template.env);
  const hasInlineTemplate = Object.keys(template).length > 0;

  return {
    status: hasInlineTemplate
      ? "INLINE_AVAILABLE"
      : templateId
        ? "REFERENCE_ONLY_OR_STALE"
        : "MISSING",
    id: text(template.id) || templateId || null,
    name: text(template.name) || null,
    image_name: imageName || null,
    image_reference_kind: imageReferenceKind(imageName),
    container_disk_gb: finite(template.containerDiskInGb),
    local_volume_gb: finite(template.volumeInGb),
    volume_mount_path: text(template.volumeMountPath) || null,
    container_registry_auth_configured: Boolean(text(template.containerRegistryAuthId)),
    env_keys: Object.keys(env).sort(),
    inline_template_available: hasInlineTemplate,
    stale_template_reference_possible: Boolean(templateId && !hasInlineTemplate),
  };
}

function safeHealth(body = {}) {
  const jobs = object(body.jobs);
  const workers = object(body.workers);
  return {
    jobs: {
      completed: finite(jobs.completed) ?? 0,
      failed: finite(jobs.failed) ?? 0,
      in_progress: finite(jobs.inProgress ?? jobs.in_progress) ?? 0,
      in_queue: finite(jobs.inQueue ?? jobs.in_queue) ?? 0,
      retried: finite(jobs.retried) ?? 0,
    },
    workers: {
      idle: finite(workers.idle) ?? 0,
      initializing: finite(workers.initializing) ?? 0,
      ready: finite(workers.ready) ?? 0,
      running: finite(workers.running) ?? 0,
      throttled: finite(workers.throttled) ?? 0,
      unhealthy: finite(workers.unhealthy) ?? 0,
    },
  };
}

function envBindingHint(endpoint) {
  const name = text(endpoint?.name);
  const id = text(endpoint?.id);
  const envName = KNOWN_ENDPOINT_ENV_BY_NAME.get(name) || null;
  return {
    endpoint_name: name || null,
    endpoint_id: id || null,
    known_repo_env_name: envName,
    assignment: envName && id ? `${envName}=${id}` : null,
  };
}

const inferenceKey =
  text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY) || required("RUNPOD_API_KEY");
const managementKey = required(
  "RUNPOD_MANAGEMENT_API_KEY",
  "RUNPOD_MANAGEMENT_API_KEY_REQUIRED_FOR_READ_ONLY_RUNPOD_ENDPOINT_INSPECTION",
);
const configuredImageEndpointId = text(process.env.RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID);
const imageEndpointName =
  text(process.env.AVANTIQO_IMAGE_RUNPOD_ENDPOINT_NAME) || DEFAULT_IMAGE_ENDPOINT_NAME;

console.log("AVANTIQO_RUNPOD_INSPECT_READ_ONLY=true");
console.log("AVANTIQO_RUNPOD_MANAGEMENT_CREDENTIAL=DEDICATED");

const endpoints = await request(
  `${REST_BASE}/endpoints?includeTemplate=true&includeWorkers=true`,
  managementKey,
  "management",
);
if (!Array.isArray(endpoints)) {
  throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");
}

const inspectedEndpoints = [];
for (const endpoint of endpoints) {
  const endpointId = text(endpoint?.id);
  const healthResult = endpointId
    ? await optionalRequest(
        `${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`,
        inferenceKey,
        "inference",
      )
    : { ok: false, body: null, error: "RUNPOD_ENDPOINT_ID_MISSING" };

  inspectedEndpoints.push({
    endpoint: safeEndpoint(endpoint),
    template: safeTemplate(endpoint),
    health: healthResult.ok ? safeHealth(healthResult.body) : null,
    health_read: {
      ok: healthResult.ok,
      error: healthResult.error,
    },
    env_binding_hint: envBindingHint(endpoint),
  });
}

const imageMatchesByName = inspectedEndpoints.filter(
  (entry) => entry.endpoint.name === imageEndpointName,
);
const imageMatchesByConfiguredId = configuredImageEndpointId
  ? inspectedEndpoints.filter((entry) => entry.endpoint.id === configuredImageEndpointId)
  : [];
const selectedImage = configuredImageEndpointId
  ? imageMatchesByConfiguredId[0] || null
  : imageMatchesByName.length === 1
    ? imageMatchesByName[0]
    : null;

const staleTemplateReferences = inspectedEndpoints.filter(
  (entry) => entry.template.stale_template_reference_possible,
);
const immutableImageReferences = inspectedEndpoints.filter(
  (entry) => entry.template.image_reference_kind === "IMMUTABLE_DIGEST",
);
const mutableImageReferences = inspectedEndpoints.filter((entry) =>
  entry.template.image_reference_kind.startsWith("MUTABLE_"),
);

const result = {
  success: true,
  contract: "AVANTIQO_RUNPOD_WORKER_INSPECT_V4",
  read_only: true,
  mutation_performed: false,
  inference_performed: false,
  endpoint_count: inspectedEndpoints.length,
  endpoints: inspectedEndpoints,
  endpoint_bindings: inspectedEndpoints.map((entry) => entry.env_binding_hint),
  image_target: {
    requested_name: imageEndpointName,
    configured_id_present: Boolean(configuredImageEndpointId),
    exact_name_match_count: imageMatchesByName.length,
    configured_id_match_count: imageMatchesByConfiguredId.length,
    selected: selectedImage,
  },
  diagnostics: {
    stale_template_reference_count: staleTemplateReferences.length,
    stale_template_references: staleTemplateReferences.map((entry) => ({
      endpoint_id: entry.endpoint.id,
      endpoint_name: entry.endpoint.name,
      template_id: entry.endpoint.template_id,
    })),
    immutable_image_reference_count: immutableImageReferences.length,
    mutable_image_reference_count: mutableImageReferences.length,
  },
  safety: {
    read_only: true,
    endpoint_mutations_performed: 0,
    template_mutations_performed: 0,
    volume_mutations_performed: 0,
    runpod_generation_jobs_submitted: 0,
    secret_values_in_output: false,
  },
  dedicated_management_credential_used: true,
  secrets_in_output: false,
};

console.log(`AVANTIQO_RUNPOD_ENDPOINT_COUNT=${inspectedEndpoints.length}`);
for (const binding of result.endpoint_bindings) {
  console.log(
    `AVANTIQO_RUNPOD_ENDPOINT name=${binding.endpoint_name || "UNKNOWN"} id=${binding.endpoint_id || "MISSING"} env=${binding.known_repo_env_name || "UNMAPPED"}`,
  );
}
console.log("AVANTIQO_RUNPOD_INSPECT=COMPLETE");
console.log(JSON.stringify(result, null, 2));
