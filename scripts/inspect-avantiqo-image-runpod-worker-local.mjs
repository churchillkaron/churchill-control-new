const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const DEFAULT_IMAGE_ENDPOINT_NAME = "avantiqo-image-v1";
const QWEN_2512_REQUIRED_FREE_BYTES = 63_068_709_120;

const KNOWN_ENDPOINT_ENV_BY_NAME = new Map([
  ["avantiqo-image-v1", "RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID"],
  ["avantiqo-cinema-v1", "RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID"],
  ["avantiqo-intelligence-v1", "RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID"],
  ["avantiqo-code-v1", "RUNPOD_AVANTIQO_CODE_ENDPOINT_ID"],
  ["avantiqo-voice-stt-v1", "RUNPOD_AVANTIQO_VOICE_STT_ENDPOINT_ID"],
  ["avantiqo-voice-tts-v1", "RUNPOD_AVANTIQO_VOICE_TTS_ENDPOINT_ID"],
  ["services/avantiqo-voice-tts-v1", "RUNPOD_AVANTIQO_VOICE_TTS_ENDPOINT_ID"],
  ["avantiqo-audio-v1", "RUNPOD_AVANTIQO_AUDIO_ENDPOINT_ID"],
  ["avantiqo-lipsync-v1", "RUNPOD_AVANTIQO_LIPSYNC_ENDPOINT_ID"],
  ["avantiqo-lipsync-v1.", "RUNPOD_AVANTIQO_LIPSYNC_ENDPOINT_ID"],
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

function endpointVolumeIds(endpoint = {}) {
  return [
    text(endpoint.networkVolumeId),
    ...list(endpoint.networkVolumeIds).map(text),
  ].filter(Boolean);
}

function gbToBytes(sizeGb) {
  const value = finite(sizeGb);
  return value === null ? null : value * 1024 ** 3;
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

const [endpoints, templates, networkVolumes] = await Promise.all([
  request(
    `${REST_BASE}/endpoints?includeTemplate=true&includeWorkers=true`,
    managementKey,
    "management",
  ),
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

const inspectedEndpoints = [];
for (const endpoint of endpoints) {
  const endpointId = text(endpoint?.id);
  const templateId = text(endpoint?.templateId || endpoint?.template?.id);
  const resolvedTemplate =
    Object.keys(object(endpoint?.template)).length > 0
      ? endpoint.template
      : templateById.get(templateId) || {};
  const healthResult = endpointId
    ? await optionalRequest(
        `${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`,
        inferenceKey,
        "inference",
      )
    : { ok: false, body: null, error: "RUNPOD_ENDPOINT_ID_MISSING" };
  const attachedVolumeIds = [...new Set(endpointVolumeIds(endpoint))];

  inspectedEndpoints.push({
    endpoint: safeEndpoint(endpoint),
    template: safeTemplate(resolvedTemplate, templateId),
    attached_network_volumes: attachedVolumeIds.map((volumeId) => ({
      id: volumeId,
      found_in_account: volumeById.has(volumeId),
      volume: volumeById.has(volumeId) ? safeNetworkVolume(volumeById.get(volumeId)) : null,
    })),
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

const attachedVolumeIds = new Set(
  inspectedEndpoints.flatMap((entry) => endpointVolumeIds(entry.endpoint)),
);
const sanitizedVolumes = networkVolumes.map((volume) => ({
  ...safeNetworkVolume(volume),
  attached_to_endpoint_ids: inspectedEndpoints
    .filter((entry) => endpointVolumeIds(entry.endpoint).includes(text(volume?.id)))
    .map((entry) => entry.endpoint.id),
  attached_to_endpoint_names: inspectedEndpoints
    .filter((entry) => endpointVolumeIds(entry.endpoint).includes(text(volume?.id)))
    .map((entry) => entry.endpoint.name),
}));
const unattachedVolumes = sanitizedVolumes.filter(
  (volume) => volume.id && !attachedVolumeIds.has(volume.id),
);
const qwenSizedVolumes = sanitizedVolumes.filter((volume) => {
  const bytes = gbToBytes(volume.size_gb);
  return bytes !== null && bytes >= QWEN_2512_REQUIRED_FREE_BYTES;
});
const templatesMissing = inspectedEndpoints.filter(
  (entry) => entry.template.status !== "FOUND",
);

const imagePersistentVolumeAttached = Boolean(
  selectedImage && endpointVolumeIds(selectedImage.endpoint).length > 0,
);
const imageLocalVolumeGb = selectedImage?.template?.local_volume_gb ?? null;
const imageContainerDiskGb = selectedImage?.template?.container_disk_gb ?? null;

const result = {
  success: true,
  contract: "AVANTIQO_RUNPOD_WORKER_INSPECT_V5",
  read_only: true,
  mutation_performed: false,
  inference_performed: false,
  endpoint_count: inspectedEndpoints.length,
  template_count: templates.length,
  network_volume_count: sanitizedVolumes.length,
  endpoints: inspectedEndpoints,
  templates: templates.map((template) => safeTemplate(template)),
  network_volumes: sanitizedVolumes,
  endpoint_bindings: inspectedEndpoints.map((entry) => entry.env_binding_hint),
  image_target: {
    requested_name: imageEndpointName,
    configured_id_present: Boolean(configuredImageEndpointId),
    exact_name_match_count: imageMatchesByName.length,
    configured_id_match_count: imageMatchesByConfiguredId.length,
    selected: selectedImage,
    storage: {
      persistent_network_volume_attached: imagePersistentVolumeAttached,
      attached_network_volume_ids: selectedImage
        ? endpointVolumeIds(selectedImage.endpoint)
        : [],
      template_local_volume_gb: imageLocalVolumeGb,
      template_container_disk_gb: imageContainerDiskGb,
      volume_mount_path: selectedImage?.template?.volume_mount_path ?? null,
      qwen_2512_required_free_bytes: QWEN_2512_REQUIRED_FREE_BYTES,
    },
  },
  storage_analysis: {
    network_volume_count: sanitizedVolumes.length,
    unattached_network_volume_count: unattachedVolumes.length,
    unattached_network_volumes: unattachedVolumes,
    qwen_2512_size_candidate_volume_count: qwenSizedVolumes.length,
    qwen_2512_size_candidate_volumes: qwenSizedVolumes,
    automatic_attachment_allowed: false,
    automatic_volume_creation_allowed: false,
    automatic_volume_resize_allowed: false,
    automatic_deletion_allowed: false,
  },
  diagnostics: {
    endpoint_template_not_returned_count: templatesMissing.length,
    endpoint_template_not_returned: templatesMissing.map((entry) => ({
      endpoint_id: entry.endpoint.id,
      endpoint_name: entry.endpoint.name,
      template_id: entry.endpoint.template_id,
    })),
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
console.log(`AVANTIQO_RUNPOD_TEMPLATE_COUNT=${templates.length}`);
console.log(`AVANTIQO_RUNPOD_NETWORK_VOLUME_COUNT=${sanitizedVolumes.length}`);
for (const binding of result.endpoint_bindings) {
  console.log(
    `AVANTIQO_RUNPOD_ENDPOINT name=${binding.endpoint_name || "UNKNOWN"} id=${binding.endpoint_id || "MISSING"} env=${binding.known_repo_env_name || "UNMAPPED"}`,
  );
}
console.log(
  `AVANTIQO_IMAGE_PERSISTENT_NETWORK_VOLUME_ATTACHED=${imagePersistentVolumeAttached ? "YES" : "NO"}`,
);
console.log(`AVANTIQO_IMAGE_TEMPLATE_LOCAL_VOLUME_GB=${imageLocalVolumeGb ?? "UNKNOWN"}`);
console.log(`AVANTIQO_IMAGE_CONTAINER_DISK_GB=${imageContainerDiskGb ?? "UNKNOWN"}`);
console.log(
  `AVANTIQO_QWEN_2512_SIZE_CANDIDATE_VOLUMES=${qwenSizedVolumes.length}`,
);
console.log("AVANTIQO_RUNPOD_INSPECT=COMPLETE");
console.log(JSON.stringify(result, null, 2));
