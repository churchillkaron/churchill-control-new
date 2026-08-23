const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const DEFAULT_ENDPOINT_NAME = "avantiqo-image-v1";

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

function normalizeEnv(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [String(key), String(child ?? "")]),
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

function imageReferenceKind(imageName) {
  const value = text(imageName);
  if (!value) return "MISSING";
  if (value.includes("@sha256:")) return "IMMUTABLE_DIGEST";
  const slash = value.lastIndexOf("/");
  const tail = slash >= 0 ? value.slice(slash + 1) : value;
  if (!tail.includes(":")) return "MUTABLE_DEFAULT_TAG";
  return "MUTABLE_EXPLICIT_TAG";
}

function safeEndpoint(endpoint = {}) {
  return {
    id: text(endpoint.id) || null,
    name: text(endpoint.name) || null,
    version: finite(endpoint.version),
    template_id: text(endpoint.templateId || endpoint.template?.id) || null,
    network_volume_id: text(endpoint.networkVolumeId) || null,
    network_volume_ids: Array.isArray(endpoint.networkVolumeIds)
      ? endpoint.networkVolumeIds.map((value) => text(value)).filter(Boolean)
      : [],
    workers_min: finite(endpoint.workersMin),
    workers_max: finite(endpoint.workersMax),
    scaler_type: text(endpoint.scalerType) || null,
    scaler_value: finite(endpoint.scalerValue),
    gpu_type_ids: Array.isArray(endpoint.gpuTypeIds) ? endpoint.gpuTypeIds : [],
    workers: Array.isArray(endpoint.workers)
      ? endpoint.workers.map((worker) => ({
          id_present: Boolean(text(worker?.id)),
          desired_status: text(worker?.desiredStatus) || null,
          last_status_change: text(worker?.lastStatusChange) || null,
          gpu: text(worker?.gpu?.displayName || worker?.machine?.gpuDisplayName) || null,
        }))
      : [],
  };
}

function safeTemplate(template = {}) {
  const env = normalizeEnv(template.env);
  const imageName = text(template.imageName);
  return {
    id: text(template.id) || null,
    name: text(template.name) || null,
    image_name: imageName || null,
    image_reference_kind: imageReferenceKind(imageName),
    container_disk_gb: finite(template.containerDiskInGb),
    local_volume_gb: finite(template.volumeInGb),
    volume_mount_path: text(template.volumeMountPath) || null,
    container_registry_auth_configured: Boolean(text(template.containerRegistryAuthId)),
    env_keys: Object.keys(env).sort(),
  };
}

function safeHealth(body = {}) {
  const jobs = body?.jobs && typeof body.jobs === "object" ? body.jobs : {};
  const workers = body?.workers && typeof body.workers === "object" ? body.workers : {};
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

async function resolveEndpointId(managementKey) {
  const configuredId = text(process.env.RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID);
  if (configuredId) {
    return { endpointId: configuredId, discoveredByName: false };
  }

  const endpointName =
    text(process.env.AVANTIQO_IMAGE_RUNPOD_ENDPOINT_NAME) || DEFAULT_ENDPOINT_NAME;
  const endpoints = await request(
    `${REST_BASE}/endpoints?includeTemplate=false&includeWorkers=false`,
    managementKey,
    "management",
  );
  if (!Array.isArray(endpoints)) {
    throw new Error("RUNPOD_IMAGE_ENDPOINT_LIST_INVALID");
  }
  const matches = endpoints.filter((entry) => text(entry?.name) === endpointName);
  if (matches.length !== 1) {
    throw new Error(
      `RUNPOD_IMAGE_ENDPOINT_DISCOVERY_FAILED:name=${endpointName}:matches=${matches.length}`,
    );
  }
  const endpointId = text(matches[0]?.id);
  if (!endpointId) throw new Error("RUNPOD_IMAGE_ENDPOINT_DISCOVERED_ID_MISSING");
  return { endpointId, discoveredByName: true };
}

const inferenceKey =
  text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY) || required("RUNPOD_API_KEY");
const managementKey = required(
  "RUNPOD_MANAGEMENT_API_KEY",
  "RUNPOD_MANAGEMENT_API_KEY_REQUIRED_FOR_READ_ONLY_IMAGE_ENDPOINT_INSPECTION",
);
const { endpointId, discoveredByName } = await resolveEndpointId(managementKey);

console.log("AVANTIQO_IMAGE_RUNPOD_INSPECT_READ_ONLY=true");
console.log("AVANTIQO_IMAGE_RUNPOD_MANAGEMENT_CREDENTIAL=DEDICATED");
console.log(
  `AVANTIQO_IMAGE_ENDPOINT_ID_SOURCE=${discoveredByName ? "DISCOVERED_BY_EXACT_NAME" : "ENV"}`,
);
if (discoveredByName) {
  console.log(`AVANTIQO_IMAGE_ENDPOINT_ID_DISCOVERED=${endpointId}`);
}

const endpoint = await request(
  `${REST_BASE}/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
  managementKey,
  "management",
);
if (text(endpoint?.id) !== endpointId) {
  throw new Error("RUNPOD_IMAGE_ENDPOINT_ID_MISMATCH");
}

const templateId = text(endpoint.templateId || endpoint.template?.id);
if (!templateId) throw new Error("RUNPOD_IMAGE_TEMPLATE_ID_REQUIRED");
const template = await request(
  `${REST_BASE}/templates/${encodeURIComponent(templateId)}`,
  managementKey,
  "management",
);
if (text(template?.id) !== templateId) {
  throw new Error("RUNPOD_IMAGE_TEMPLATE_BINDING_MISMATCH");
}

const health = await request(
  `${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`,
  inferenceKey,
  "inference",
);

const result = {
  success: true,
  contract: "AVANTIQO_IMAGE_RUNPOD_INSPECT_V3",
  read_only: true,
  mutation_performed: false,
  inference_performed: false,
  endpoint_id_source: discoveredByName ? "DISCOVERED_BY_EXACT_NAME" : "ENV",
  endpoint: safeEndpoint(endpoint),
  template: safeTemplate(template),
  health: safeHealth(health),
  next_action_basis: {
    immutable_digest_requires_new_image_reference:
      imageReferenceKind(template.imageName) === "IMMUTABLE_DIGEST",
    mutable_tag_can_rolling_release_after_registry_publish:
      imageReferenceKind(template.imageName).startsWith("MUTABLE_"),
  },
  dedicated_management_credential_used: true,
  secrets_in_output: false,
};

console.log("AVANTIQO_IMAGE_RUNPOD_INSPECT=COMPLETE");
console.log(JSON.stringify(result, null, 2));
