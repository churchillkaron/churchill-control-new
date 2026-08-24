const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const DEFAULT_AUDIO_ENDPOINT_NAME = "avantiqo-audio-v1";

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
      throw new Error(`RUNPOD_MANAGEMENT_API_KEY_UNAUTHORIZED:${detail || "EMPTY_BODY"}`);
    }
    throw new Error(`RUNPOD_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body;
}

async function optionalRequest(url, credential, credentialKind) {
  try {
    return { ok: true, body: await request(url, credential, credentialKind), error: null };
  } catch (error) {
    return { ok: false, body: null, error: text(error?.message || error) };
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

function endpointVolumeIds(endpoint = {}) {
  const ids = [
    text(endpoint.networkVolumeId ?? endpoint.network_volume_id),
    ...list(endpoint.networkVolumeIds ?? endpoint.network_volume_ids).map(text),
  ].filter(Boolean);
  return [...new Set(ids)];
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

function safeTemplate(template = {}, expectedTemplateId = "") {
  const source = object(template);
  const templateId = text(source.id || expectedTemplateId);
  const imageName = text(source.imageName);
  const env = normalizeEnv(source.env);
  const found = Object.keys(source).length > 0;
  return {
    status: found ? "FOUND" : templateId ? "NOT_RETURNED" : "MISSING",
    id: templateId || null,
    name: text(source.name) || null,
    image_name: imageName || null,
    image_reference_kind: imageReferenceKind(imageName),
    container_disk_gb: finite(source.containerDiskInGb),
    local_volume_gb: finite(source.volumeInGb),
    volume_mount_path: text(source.volumeMountPath) || null,
    container_registry_auth_configured: Boolean(text(source.containerRegistryAuthId)),
    env_keys: Object.keys(env).sort(),
    endpoint_bound_template_returned: found,
  };
}

function safeNetworkVolume(volume = {}) {
  return {
    id: text(volume.id) || null,
    name: text(volume.name) || null,
    size_gb: finite(volume.size),
    data_center_id: text(volume.dataCenterId) || null,
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

const inferenceKey = text(process.env.RUNPOD_AVANTIQO_AUDIO_API_KEY) || required("RUNPOD_API_KEY");
const managementKey = required(
  "RUNPOD_MANAGEMENT_API_KEY",
  "RUNPOD_MANAGEMENT_API_KEY_REQUIRED_FOR_READ_ONLY_AUDIO_ENDPOINT_INSPECTION",
);
const configuredEndpointId = text(process.env.RUNPOD_AVANTIQO_AUDIO_ENDPOINT_ID);
const endpointName = text(process.env.AVANTIQO_AUDIO_RUNPOD_ENDPOINT_NAME) || DEFAULT_AUDIO_ENDPOINT_NAME;

console.log("AVANTIQO_AUDIO_RUNPOD_INSPECT_READ_ONLY=true");
console.log("AVANTIQO_AUDIO_RUNPOD_MANAGEMENT_CREDENTIAL=DEDICATED");

const [endpoints, templates, networkVolumes] = await Promise.all([
  request(`${REST_BASE}/endpoints?includeTemplate=true&includeWorkers=true`, managementKey, "management"),
  request(
    `${REST_BASE}/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false`,
    managementKey,
    "management",
  ),
  request(`${REST_BASE}/networkvolumes`, managementKey, "management"),
]);

if (!Array.isArray(endpoints)) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");
if (!Array.isArray(templates)) throw new Error("RUNPOD_TEMPLATE_LIST_INVALID");
if (!Array.isArray(networkVolumes)) throw new Error("RUNPOD_NETWORK_VOLUME_LIST_INVALID");

const templateById = new Map(
  templates.map((template) => [text(template?.id), template]).filter(([id]) => id),
);
const volumeById = new Map(
  networkVolumes.map((volume) => [text(volume?.id), volume]).filter(([id]) => id),
);

const sanitizedEndpoints = endpoints.map((endpoint) => {
  const templateId = text(endpoint?.templateId || endpoint?.template?.id);
  const resolvedTemplate = Object.keys(object(endpoint?.template)).length > 0
    ? endpoint.template
    : templateById.get(templateId) || {};
  return {
    endpoint: safeEndpoint(endpoint),
    template: safeTemplate(resolvedTemplate, templateId),
  };
});

const matchesById = configuredEndpointId
  ? sanitizedEndpoints.filter((entry) => entry.endpoint.id === configuredEndpointId)
  : [];
const matchesByName = sanitizedEndpoints.filter((entry) => entry.endpoint.name === endpointName);
const selected = configuredEndpointId
  ? matchesById[0] || null
  : matchesByName.length === 1
    ? matchesByName[0]
    : null;

let healthRead = { ok: false, body: null, error: "AUDIO_ENDPOINT_NOT_SELECTED" };
if (selected?.endpoint?.id) {
  healthRead = await optionalRequest(
    `${QUEUE_BASE}/${encodeURIComponent(selected.endpoint.id)}/health`,
    inferenceKey,
    "inference",
  );
}

const attachedVolumeIds = selected ? endpointVolumeIds(selected.endpoint) : [];
const attachedVolumes = attachedVolumeIds.map((id) => ({
  id,
  found_in_account: volumeById.has(id),
  volume: volumeById.has(id) ? safeNetworkVolume(volumeById.get(id)) : null,
}));

const result = {
  success: true,
  contract: "AVANTIQO_AUDIO_RUNPOD_WORKER_INSPECT_V1",
  read_only: true,
  mutation_performed: false,
  inference_performed: false,
  endpoint_count: sanitizedEndpoints.length,
  template_count: templates.length,
  network_volume_count: networkVolumes.length,
  audio_target: {
    requested_name: endpointName,
    configured_id_present: Boolean(configuredEndpointId),
    configured_id_match_count: matchesById.length,
    exact_name_match_count: matchesByName.length,
    selected: selected
      ? {
          endpoint: selected.endpoint,
          template: selected.template,
          attached_network_volumes: attachedVolumes,
          health: healthRead.ok ? safeHealth(healthRead.body) : null,
          health_read: { ok: healthRead.ok, error: healthRead.error },
          local_binding: selected.endpoint.id
            ? `RUNPOD_AVANTIQO_AUDIO_ENDPOINT_ID=${selected.endpoint.id}`
            : null,
        }
      : null,
  },
  endpoint_bindings: sanitizedEndpoints.map((entry) => ({
    endpoint_id: entry.endpoint.id,
    endpoint_name: entry.endpoint.name,
    template_id: entry.endpoint.template_id,
    template_status: entry.template.status,
    network_volume_ids: endpointVolumeIds(entry.endpoint),
  })),
  safety: {
    read_only: true,
    endpoint_mutations_performed: 0,
    template_mutations_performed: 0,
    volume_mutations_performed: 0,
    runpod_generation_jobs_submitted: 0,
    production_deploy_performed: false,
    secret_values_in_output: false,
  },
};

console.log(JSON.stringify(result, null, 2));

if (!selected) {
  throw new Error(
    configuredEndpointId
      ? "AVANTIQO_AUDIO_CONFIGURED_ENDPOINT_NOT_FOUND"
      : matchesByName.length > 1
        ? "AVANTIQO_AUDIO_ENDPOINT_NAME_AMBIGUOUS"
        : "AVANTIQO_AUDIO_ENDPOINT_NOT_FOUND",
  );
}
if (!healthRead.ok) {
  throw new Error(`AVANTIQO_AUDIO_ENDPOINT_HEALTH_UNREACHABLE:${healthRead.error || "UNKNOWN"}`);
}
