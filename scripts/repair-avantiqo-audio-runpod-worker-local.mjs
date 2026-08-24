const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const AUDIO_ENDPOINT_NAME = "avantiqo-audio-v1";
const DEFAULT_VOLUME_MOUNT_PATH = "/workspace";
const CONTRACT = "AVANTIQO_AUDIO_RUNPOD_WORKER_REPAIR_V1";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function yes(value) {
  return ["1", "true", "yes", "on", "approved"].includes(text(value).toLowerCase());
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function normalizeEnv(value) {
  return Object.fromEntries(
    Object.entries(object(value)).map(([key, child]) => [String(key), String(child ?? "")]),
  );
}

function endpointVolumeIds(endpoint = {}) {
  return [
    text(endpoint.networkVolumeId),
    ...list(endpoint.networkVolumeIds).map(text),
  ].filter(Boolean);
}

function healthCounters(body = {}) {
  const jobs = object(body.jobs);
  const workers = object(body.workers);
  return {
    jobs: {
      in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
      completed: finite(jobs.completed, 0),
      failed: finite(jobs.failed, 0),
    },
    workers: {
      idle: finite(workers.idle, 0),
      initializing: finite(workers.initializing, 0),
      ready: finite(workers.ready, 0),
      running: finite(workers.running, 0),
      unhealthy: finite(workers.unhealthy, 0),
    },
  };
}

function safeEndpoint(endpoint = {}) {
  return {
    id: text(endpoint.id) || null,
    name: text(endpoint.name) || null,
    version: finite(endpoint.version),
    template_id: text(endpoint.templateId || endpoint.template?.id) || null,
    network_volume_ids: endpointVolumeIds(endpoint),
    data_center_ids: list(endpoint.dataCenterIds).map(text).filter(Boolean),
    gpu_type_ids: list(endpoint.gpuTypeIds).map(text).filter(Boolean),
    workers_min: finite(endpoint.workersMin),
    workers_max: finite(endpoint.workersMax),
    idle_timeout_seconds: finite(endpoint.idleTimeout),
    execution_timeout_ms: finite(endpoint.executionTimeoutMs),
  };
}

function safeTemplate(template = {}) {
  const env = normalizeEnv(template.env);
  return {
    id: text(template.id) || null,
    name: text(template.name) || null,
    image_name: text(template.imageName) || null,
    container_disk_gb: finite(template.containerDiskInGb),
    local_volume_gb: finite(template.volumeInGb),
    volume_mount_path: text(template.volumeMountPath) || null,
    registry_auth_configured: Boolean(text(template.containerRegistryAuthId)),
    env_keys: Object.keys(env).sort(),
  };
}

function safeVolume(volume = {}) {
  return {
    id: text(volume.id) || null,
    name: text(volume.name) || null,
    size_gb: finite(volume.size),
    data_center_id: text(volume.dataCenterId) || null,
  };
}

async function rest(path, credential, options = {}) {
  const response = await fetch(`${REST_BASE}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${credential}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
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
    throw new Error(`RUNPOD_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body;
}

async function queueHealth(endpointId, apiKey) {
  const response = await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, {
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
    const detail = text(body?.message || body?.error || raw).slice(0, 1000);
    throw new Error(`RUNPOD_HEALTH_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body || {};
}

async function endpointBoundTemplates(managementKey) {
  const templates = await rest(
    "/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false",
    managementKey,
  );
  if (!Array.isArray(templates)) throw new Error("RUNPOD_TEMPLATE_LIST_INVALID");
  return templates;
}

function resolveTemplate(endpoint, templates) {
  const inline = object(endpoint.template);
  const templateId = text(endpoint.templateId || inline.id);
  if (!templateId) throw new Error("AVANTIQO_AUDIO_TEMPLATE_ID_REQUIRED");
  if (Object.keys(inline).length) return inline;
  const matches = templates.filter((template) => text(template?.id) === templateId);
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_AUDIO_ENDPOINT_BOUND_TEMPLATE_RESOLUTION_FAILED:id=${templateId}:matches=${matches.length}`);
  }
  return matches[0];
}

function resolveEndpoint(endpoints, configuredId) {
  if (configuredId) {
    const matches = endpoints.filter((endpoint) => text(endpoint?.id) === configuredId);
    if (matches.length !== 1) {
      throw new Error(`AVANTIQO_AUDIO_CONFIGURED_ENDPOINT_NOT_FOUND:matches=${matches.length}`);
    }
    if (text(matches[0]?.name) !== AUDIO_ENDPOINT_NAME) {
      throw new Error(`AVANTIQO_AUDIO_CONFIGURED_ENDPOINT_NAME_MISMATCH:actual=${text(matches[0]?.name) || "MISSING"}`);
    }
    return { endpoint: matches[0], resolution: "ENV_VERIFIED" };
  }

  const matches = endpoints.filter((endpoint) => text(endpoint?.name) === AUDIO_ENDPOINT_NAME);
  if (matches.length === 0) return { endpoint: null, resolution: "MISSING" };
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_AUDIO_ENDPOINT_NAME_AMBIGUOUS:matches=${matches.length}`);
  }
  return { endpoint: matches[0], resolution: "EXACT_NAME" };
}

function templateUpdateBody(template, desiredEnv, desiredMountPath) {
  const body = {
    containerDiskInGb: finite(template.containerDiskInGb, 30),
    dockerEntrypoint: list(template.dockerEntrypoint),
    dockerStartCmd: list(template.dockerStartCmd),
    env: desiredEnv,
    imageName: requiredTemplateField(template.imageName, "AVANTIQO_AUDIO_TEMPLATE_IMAGE_REQUIRED"),
    isPublic: template.isPublic === true,
    name: requiredTemplateField(template.name, "AVANTIQO_AUDIO_TEMPLATE_NAME_REQUIRED"),
    ports: list(template.ports),
    readme: text(template.readme),
    volumeInGb: finite(template.volumeInGb, 10),
    volumeMountPath: desiredMountPath,
  };
  if (text(template.containerRegistryAuthId)) {
    body.containerRegistryAuthId = text(template.containerRegistryAuthId);
  }
  return body;
}

function requiredTemplateField(value, code) {
  const result = text(value);
  if (!result) throw new Error(code);
  return result;
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const inferenceKey = text(process.env.RUNPOD_AVANTIQO_AUDIO_API_KEY) || required("RUNPOD_API_KEY");
const configuredId = text(process.env.RUNPOD_AVANTIQO_AUDIO_ENDPOINT_ID);
const apply = process.argv.includes("--apply");
const approved = text(process.env.AVANTIQO_AUDIO_RUNPOD_REPAIR_APPROVED).toUpperCase() === "YES";

if (apply && !approved) {
  throw new Error("AVANTIQO_AUDIO_RUNPOD_REPAIR_APPROVED=YES_REQUIRED");
}

console.log(`AVANTIQO_AUDIO_RUNPOD_REPAIR_MODE=${apply ? "APPLY" : "PLAN"}`);
console.log("AVANTIQO_AUDIO_RUNPOD_REPAIR_GENERATION_SUBMITTED=false");
console.log("AVANTIQO_AUDIO_RUNPOD_REPAIR_PRODUCTION_DEPLOY_PERFORMED=false");
console.log("AVANTIQO_AUDIO_RUNPOD_REPAIR_SECRET_VALUES_PRINTED=false");

const [endpoints, templates, volumes] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  endpointBoundTemplates(managementKey),
  rest("/networkvolumes", managementKey),
]);
if (!Array.isArray(endpoints)) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");
if (!Array.isArray(volumes)) throw new Error("RUNPOD_NETWORK_VOLUME_LIST_INVALID");

const resolved = resolveEndpoint(endpoints, configuredId);
if (!resolved.endpoint) {
  const missing = {
    success: false,
    contract: CONTRACT,
    mode: apply ? "APPLY" : "PLAN",
    endpoint_name: AUDIO_ENDPOINT_NAME,
    endpoint_exists: false,
    configured_endpoint_id_present: Boolean(configuredId),
    mutation_performed: false,
    generation_submitted: false,
    production_deploy_performed: false,
    next_action: "PROVISION_AUDIO_ENDPOINT_FROM_OWNED_WORKER_IMAGE",
  };
  console.log("AVANTIQO_AUDIO_RUNPOD_ENDPOINT=MISSING");
  console.log(JSON.stringify(missing, null, 2));
  process.exitCode = 2;
} else {
  const endpoint = resolved.endpoint;
  const endpointId = text(endpoint.id);
  const template = resolveTemplate(endpoint, templates);
  const templateId = text(template.id);
  const templateConsumers = endpoints.filter(
    (candidate) => text(candidate?.templateId || candidate?.template?.id) === templateId,
  );
  const attachedVolumeIds = endpointVolumeIds(endpoint);
  const attachedVolumes = volumes
    .filter((volume) => attachedVolumeIds.includes(text(volume?.id)))
    .map(safeVolume);
  const health = await queueHealth(endpointId, inferenceKey);
  const counters = healthCounters(health);

  const desiredMountPath =
    text(process.env.AVANTIQO_AUDIO_RUNPOD_VOLUME_MOUNT_PATH) ||
    text(template.volumeMountPath) ||
    DEFAULT_VOLUME_MOUNT_PATH;
  const checkpointRoot = desiredMountPath === "/opt/ace-step/checkpoints"
    ? desiredMountPath
    : `${desiredMountPath.replace(/\/$/, "")}/ace-step-checkpoints`;
  const currentEnv = normalizeEnv(template.env);
  const desiredEnv = {
    ...currentEnv,
    ACESTEP_CHECKPOINTS_DIR: checkpointRoot,
    AVANTIQO_AUDIO_DEVICE: "cuda",
    AVANTIQO_AUDIO_MODEL_FAMILY: "ACE_STEP_1_5",
    AVANTIQO_AUDIO_FOUNDATION_MODEL: "ACE-Step/Ace-Step1.5",
    AVANTIQO_AUDIO_MODEL_VARIANT: "acestep-v15-turbo",
    AVANTIQO_AUDIO_MODEL_SOURCE: "huggingface",
    AVANTIQO_AUDIO_CERTIFIED_CAPABILITIES: "ai.music.generate",
    AVANTIQO_AUDIO_FITNESS_LOAD_MODEL: "false",
    ACESTEP_INIT_LLM: "false",
    HF_HOME: `${checkpointRoot}/.hf-cache`,
  };
  const changedEnvKeys = Object.keys(desiredEnv)
    .filter((key) => currentEnv[key] !== desiredEnv[key])
    .sort();
  const mountChangeRequired = text(template.volumeMountPath) !== desiredMountPath;
  const mutationRequired = changedEnvKeys.length > 0 || mountChangeRequired;

  const plan = {
    success: true,
    contract: CONTRACT,
    mode: apply ? "APPLY" : "PLAN",
    endpoint_resolution: resolved.resolution,
    endpoint: safeEndpoint(endpoint),
    template: safeTemplate(template),
    template_consumer_count: templateConsumers.length,
    template_exclusive_to_audio_endpoint:
      templateConsumers.length === 1 && text(templateConsumers[0]?.id) === endpointId,
    attached_network_volumes: attachedVolumes,
    attached_network_volume_ids: attachedVolumeIds,
    health: counters,
    desired: {
      volume_mount_path: desiredMountPath,
      checkpoints_dir: checkpointRoot,
      changed_env_keys: changedEnvKeys,
      mount_change_required: mountChangeRequired,
    },
    mutation_required: mutationRequired,
    mutation_performed: false,
    generation_submitted: false,
    production_deploy_performed: false,
    next_action: attachedVolumeIds.length
      ? mutationRequired
        ? "APPLY_AUDIO_TEMPLATE_REPAIR_THEN_FINGERPRINT"
        : "FINGERPRINT_AUDIO_ENDPOINT"
      : "PROVISION_AUDIO_NETWORK_VOLUME",
  };

  if (!apply || !mutationRequired) {
    console.log(`AVANTIQO_AUDIO_RUNPOD_REPAIR_PLAN=${mutationRequired ? "READY" : "NO_TEMPLATE_CHANGE_REQUIRED"}`);
    console.log(JSON.stringify(plan, null, 2));
  } else {
    if (templateConsumers.length !== 1 || text(templateConsumers[0]?.id) !== endpointId) {
      throw new Error(`AVANTIQO_AUDIO_SHARED_TEMPLATE_REPAIR_BLOCKED:consumers=${templateConsumers.length}`);
    }
    if (counters.jobs.in_queue > 0 || counters.jobs.in_progress > 0) {
      throw new Error(
        `AVANTIQO_AUDIO_TEMPLATE_REPAIR_BLOCKED_LIVE_JOBS:in_queue=${counters.jobs.in_queue}:in_progress=${counters.jobs.in_progress}`,
      );
    }

    // Refetch endpoint and endpoint-bound templates immediately before mutation.
    const [freshEndpoints, freshTemplates] = await Promise.all([
      rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
      endpointBoundTemplates(managementKey),
    ]);
    const freshResolved = resolveEndpoint(freshEndpoints, endpointId);
    const freshEndpoint = freshResolved.endpoint;
    const freshTemplate = resolveTemplate(freshEndpoint, freshTemplates);
    if (text(freshTemplate.id) !== templateId) {
      throw new Error("AVANTIQO_AUDIO_TEMPLATE_CHANGED_REPLAN_REQUIRED");
    }
    if (endpointVolumeIds(freshEndpoint).join("|") !== attachedVolumeIds.join("|")) {
      throw new Error("AVANTIQO_AUDIO_VOLUME_BINDING_CHANGED_REPLAN_REQUIRED");
    }

    await rest(`/templates/${encodeURIComponent(templateId)}/update`, managementKey, {
      method: "POST",
      body: templateUpdateBody(freshTemplate, desiredEnv, desiredMountPath),
    });

    const verifyTemplates = await endpointBoundTemplates(managementKey);
    const verifiedEndpoint = await rest(
      `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
      managementKey,
    );
    const verifiedTemplate = resolveTemplate(verifiedEndpoint, verifyTemplates);
    const verifiedEnv = normalizeEnv(verifiedTemplate.env);
    const unresolvedEnv = Object.keys(desiredEnv).filter(
      (key) => verifiedEnv[key] !== desiredEnv[key],
    );
    if (unresolvedEnv.length) {
      throw new Error(`AVANTIQO_AUDIO_TEMPLATE_REPAIR_VERIFY_ENV_FAILED:${unresolvedEnv.join(",")}`);
    }
    if (text(verifiedTemplate.volumeMountPath) !== desiredMountPath) {
      throw new Error("AVANTIQO_AUDIO_TEMPLATE_REPAIR_VERIFY_MOUNT_FAILED");
    }

    console.log("AVANTIQO_AUDIO_RUNPOD_TEMPLATE_REPAIR=COMPLETE");
    console.log(JSON.stringify({
      ...plan,
      mode: "APPLY",
      endpoint: safeEndpoint(verifiedEndpoint),
      template: safeTemplate(verifiedTemplate),
      mutation_performed: true,
      next_action: attachedVolumeIds.length
        ? "FINGERPRINT_AUDIO_ENDPOINT"
        : "PROVISION_AUDIO_NETWORK_VOLUME",
    }, null, 2));
  }
}
