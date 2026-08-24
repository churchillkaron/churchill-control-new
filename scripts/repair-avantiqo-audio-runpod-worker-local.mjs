import { readFile } from "node:fs/promises";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const AUDIO_ENDPOINT_NAME = "avantiqo-audio-v1";
const DEFAULT_VOLUME_MOUNT_PATH = "/workspace";
const NETWORK_VOLUME_MOUNT_ROOT = "/runpod-volume";
const EPHEMERAL_CHECKPOINT_ROOT = "/opt/ace-step/checkpoints";
const IMAGE_EVIDENCE_PATH = "audits/results/avantiqo-audio-worker-image.json";
const EXPECTED_CUDA_RUNTIME = "12.8";
const MIN_CONTAINER_DISK_GB = 30;
const CONTRACT = "AVANTIQO_AUDIO_RUNPOD_WORKER_REPAIR_V2";

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
  return [text(endpoint.networkVolumeId), ...list(endpoint.networkVolumeIds).map(text)].filter(Boolean);
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

function workerCount(counters) {
  return Object.values(counters.workers).reduce((sum, value) => sum + finite(value, 0), 0);
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
    image_reference_kind: /^ghcr\.io\/.+@sha256:[a-f0-9]{64}$/i.test(text(template.imageName))
      ? "IMMUTABLE_DIGEST"
      : text(template.imageName)
        ? "MUTABLE_OR_NON_GHCR_REFERENCE"
        : "MISSING",
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

async function imageEvidence() {
  let parsed = null;
  try {
    parsed = JSON.parse(await readFile(IMAGE_EVIDENCE_PATH, "utf8"));
  } catch {
    throw new Error("AVANTIQO_AUDIO_IMMUTABLE_WORKER_IMAGE_EVIDENCE_REQUIRED");
  }
  if (parsed?.success !== true || parsed?.contract !== "AVANTIQO_AUDIO_WORKER_IMAGE_RESULT_V2") {
    throw new Error("AVANTIQO_AUDIO_HARDENED_WORKER_IMAGE_EVIDENCE_REQUIRED");
  }
  if (
    parsed?.source_sha_matches_trigger !== true ||
    text(parsed?.source_sha) !== text(parsed?.trigger_sha) ||
    text(parsed?.cuda_runtime_expected) !== EXPECTED_CUDA_RUNTIME ||
    parsed?.cuda_enabled_torch_required !== true ||
    parsed?.owned_handler_import_smoke_required !== true ||
    parsed?.native_audio_import_smoke_required !== true ||
    parsed?.cuda_import_smoke_passed_by_docker_build !== true ||
    parsed?.native_audio_import_smoke_passed_by_docker_build !== true ||
    parsed?.production_web_deploy !== false ||
    parsed?.provider_job_submitted !== false ||
    parsed?.pricing_activation_performed !== false
  ) {
    throw new Error("AVANTIQO_AUDIO_WORKER_IMAGE_RUNTIME_EVIDENCE_INVALID");
  }
  const sourceSha = text(parsed.source_sha);
  if (!/^[a-f0-9]{40}$/i.test(sourceSha)) {
    throw new Error("AVANTIQO_AUDIO_WORKER_IMAGE_SOURCE_SHA_INVALID");
  }
  const image = text(parsed.immutable_image_reference);
  if (!/^ghcr\.io\/.+@sha256:[a-f0-9]{64}$/i.test(image)) {
    throw new Error("AVANTIQO_AUDIO_IMMUTABLE_WORKER_IMAGE_REFERENCE_INVALID");
  }
  return {
    image,
    source_sha: sourceSha,
    trigger_sha: text(parsed.trigger_sha),
    digest: text(parsed.image_digest),
  };
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
      throw new Error(
        `AVANTIQO_AUDIO_CONFIGURED_ENDPOINT_NAME_MISMATCH:actual=${text(matches[0]?.name) || "MISSING"}`,
      );
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

function resolveRegistryAuth(registryAuths, template) {
  const explicitId = text(process.env.AVANTIQO_AUDIO_RUNPOD_REGISTRY_AUTH_ID);
  if (explicitId) {
    const matches = registryAuths.filter((item) => text(item?.id) === explicitId);
    if (matches.length !== 1) {
      throw new Error(`AVANTIQO_AUDIO_RUNPOD_REGISTRY_AUTH_ID_NOT_FOUND:matches=${matches.length}`);
    }
    return matches[0];
  }

  const currentId = text(template.containerRegistryAuthId);
  if (currentId) {
    const current = registryAuths.find((item) => text(item?.id) === currentId);
    if (current && /ghcr|github/i.test(text(current?.name))) return current;
  }

  const candidates = registryAuths.filter((item) => /ghcr|github/i.test(text(item?.name)));
  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1) {
    throw new Error(`AVANTIQO_AUDIO_RUNPOD_GHCR_AUTH_AMBIGUOUS:matches=${candidates.length}`);
  }
  return null;
}

function requiredTemplateField(value, code) {
  const result = text(value);
  if (!result) throw new Error(code);
  return result;
}

function templateStateKey(template) {
  return JSON.stringify({
    id: text(template.id),
    image_name: text(template.imageName),
    container_disk_gb: finite(template.containerDiskInGb, 0),
    registry_auth_id: text(template.containerRegistryAuthId),
    volume_mount_path: text(template.volumeMountPath),
    local_volume_gb: finite(template.volumeInGb, 0),
    env: normalizeEnv(template.env),
  });
}

function templateUpdateBody(template, desiredEnv, desiredMountPath, desiredImage, registryAuthId) {
  const body = {
    containerDiskInGb: Math.max(MIN_CONTAINER_DISK_GB, finite(template.containerDiskInGb, 0)),
    dockerEntrypoint: list(template.dockerEntrypoint),
    dockerStartCmd: list(template.dockerStartCmd),
    env: desiredEnv,
    imageName: desiredImage,
    isPublic: template.isPublic === true,
    name: requiredTemplateField(template.name, "AVANTIQO_AUDIO_TEMPLATE_NAME_REQUIRED"),
    ports: list(template.ports),
    readme: text(template.readme),
    volumeInGb: Math.max(0, finite(template.volumeInGb, 0)),
    volumeMountPath: desiredMountPath,
  };
  if (registryAuthId) body.containerRegistryAuthId = registryAuthId;
  return body;
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

const immutableImage = await imageEvidence();
const [endpoints, templates, volumes, registryAuths] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  endpointBoundTemplates(managementKey),
  rest("/networkvolumes", managementKey),
  rest("/containerregistryauth", managementKey),
]);
if (!Array.isArray(endpoints)) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");
if (!Array.isArray(volumes)) throw new Error("RUNPOD_NETWORK_VOLUME_LIST_INVALID");
if (!Array.isArray(registryAuths)) throw new Error("RUNPOD_REGISTRY_AUTH_LIST_INVALID");

const resolved = resolveEndpoint(endpoints, configuredId);
if (!resolved.endpoint) {
  const missing = {
    success: false,
    contract: CONTRACT,
    mode: apply ? "APPLY" : "PLAN",
    endpoint_name: AUDIO_ENDPOINT_NAME,
    endpoint_exists: false,
    configured_endpoint_id_present: Boolean(configuredId),
    immutable_worker_image_verified: true,
    immutable_worker_image: immutableImage.image,
    image_source_sha: immutableImage.source_sha,
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
  const activeWorkers = workerCount(counters);

  const registryAuth = resolveRegistryAuth(registryAuths, template);
  const registryAuthId = text(registryAuth?.id);
  const currentImage = text(template.imageName);
  const imageChangeRequired = currentImage !== immutableImage.image;
  const ghcrRegistryAuthRequired = imageChangeRequired && !registryAuthId;

  const desiredMountPath =
    text(process.env.AVANTIQO_AUDIO_RUNPOD_VOLUME_MOUNT_PATH) ||
    text(template.volumeMountPath) ||
    DEFAULT_VOLUME_MOUNT_PATH;
  const checkpointRoot = attachedVolumeIds.length
    ? `${NETWORK_VOLUME_MOUNT_ROOT}/ace-step-checkpoints`
    : text(process.env.AVANTIQO_AUDIO_EPHEMERAL_CHECKPOINTS_DIR) || EPHEMERAL_CHECKPOINT_ROOT;
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
  const containerDiskChangeRequired = finite(template.containerDiskInGb, 0) < MIN_CONTAINER_DISK_GB;
  const registryAuthChangeRequired =
    Boolean(registryAuthId) && text(template.containerRegistryAuthId) !== registryAuthId;
  const mutationRequired =
    changedEnvKeys.length > 0 ||
    mountChangeRequired ||
    imageChangeRequired ||
    containerDiskChangeRequired ||
    registryAuthChangeRequired;

  let nextAction = "FINGERPRINT_AUDIO_ENDPOINT";
  if (ghcrRegistryAuthRequired) nextAction = "CONFIGURE_RUNPOD_GHCR_REGISTRY_AUTH";
  else if (counters.jobs.in_queue > 0 || counters.jobs.in_progress > 0 || activeWorkers > 0) {
    nextAction = "WAIT_FOR_AUDIO_WORKER_DRAIN";
  } else if (mutationRequired) {
    nextAction = attachedVolumeIds.length
      ? "APPLY_AUDIO_TEMPLATE_REPAIR_THEN_FINGERPRINT"
      : "APPLY_IMMUTABLE_AUDIO_TEMPLATE_REPAIR_THEN_PROVISION_NETWORK_VOLUME";
  } else if (!attachedVolumeIds.length) {
    nextAction = "PROVISION_AUDIO_NETWORK_VOLUME";
  }

  const plan = {
    success: !ghcrRegistryAuthRequired,
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
    immutable_worker_image: {
      verified: true,
      reference: immutableImage.image,
      source_sha: immutableImage.source_sha,
      trigger_sha: immutableImage.trigger_sha,
      digest: immutableImage.digest,
      cuda_runtime: EXPECTED_CUDA_RUNTIME,
    },
    registry_auth: {
      ghcr_auth_found: Boolean(registryAuthId),
      ghcr_auth_id_present: Boolean(registryAuthId),
      auth_required_before_image_switch: ghcrRegistryAuthRequired,
      secret_value_in_output: false,
    },
    desired: {
      image_name: immutableImage.image,
      image_change_required: imageChangeRequired,
      minimum_container_disk_gb: MIN_CONTAINER_DISK_GB,
      container_disk_change_required: containerDiskChangeRequired,
      local_volume_mount_path: desiredMountPath,
      network_volume_mount_root: attachedVolumeIds.length ? NETWORK_VOLUME_MOUNT_ROOT : null,
      checkpoints_dir: checkpointRoot,
      cache_persistence: attachedVolumeIds.length ? "RUNPOD_NETWORK_VOLUME" : "EPHEMERAL_CONTAINER_DISK",
      changed_env_keys: changedEnvKeys,
      mount_change_required: mountChangeRequired,
      registry_auth_change_required: registryAuthChangeRequired,
    },
    active_worker_count: activeWorkers,
    mutation_required: mutationRequired,
    mutation_performed: false,
    generation_submitted: false,
    production_deploy_performed: false,
    next_action: nextAction,
  };

  if (!apply) {
    console.log(
      `AVANTIQO_AUDIO_RUNPOD_REPAIR_PLAN=${
        ghcrRegistryAuthRequired ? "BLOCKED_GHCR_AUTH" : mutationRequired ? "READY" : "NO_TEMPLATE_CHANGE_REQUIRED"
      }`,
    );
    console.log(JSON.stringify(plan, null, 2));
    if (ghcrRegistryAuthRequired) process.exitCode = 3;
  } else {
    if (ghcrRegistryAuthRequired) {
      throw new Error("AVANTIQO_AUDIO_RUNPOD_GHCR_REGISTRY_AUTH_REQUIRED_FOR_IMMUTABLE_IMAGE");
    }
    if (templateConsumers.length !== 1 || text(templateConsumers[0]?.id) !== endpointId) {
      throw new Error(`AVANTIQO_AUDIO_SHARED_TEMPLATE_REPAIR_BLOCKED:consumers=${templateConsumers.length}`);
    }
    if (counters.jobs.in_queue > 0 || counters.jobs.in_progress > 0) {
      throw new Error(
        `AVANTIQO_AUDIO_TEMPLATE_REPAIR_BLOCKED_LIVE_JOBS:in_queue=${counters.jobs.in_queue}:in_progress=${counters.jobs.in_progress}`,
      );
    }
    if (activeWorkers > 0) {
      throw new Error(`AVANTIQO_AUDIO_TEMPLATE_REPAIR_BLOCKED_ACTIVE_WORKERS:count=${activeWorkers}`);
    }

    if (!mutationRequired) {
      console.log("AVANTIQO_AUDIO_RUNPOD_REPAIR_PLAN=NO_TEMPLATE_CHANGE_REQUIRED");
      console.log(JSON.stringify(plan, null, 2));
    } else {
      const freshImage = await imageEvidence();
      if (
        freshImage.image !== immutableImage.image ||
        freshImage.source_sha !== immutableImage.source_sha ||
        freshImage.trigger_sha !== immutableImage.trigger_sha
      ) {
        throw new Error("AVANTIQO_AUDIO_IMAGE_EVIDENCE_CHANGED_REPLAN_REQUIRED");
      }

      const [freshEndpoints, freshTemplates, freshRegistryAuths] = await Promise.all([
        rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
        endpointBoundTemplates(managementKey),
        rest("/containerregistryauth", managementKey),
      ]);
      const freshResolved = resolveEndpoint(freshEndpoints, endpointId);
      const freshEndpoint = freshResolved.endpoint;
      const freshTemplate = resolveTemplate(freshEndpoint, freshTemplates);
      if (text(freshTemplate.id) !== templateId) {
        throw new Error("AVANTIQO_AUDIO_TEMPLATE_CHANGED_REPLAN_REQUIRED");
      }
      if (templateStateKey(freshTemplate) !== templateStateKey(template)) {
        throw new Error("AVANTIQO_AUDIO_TEMPLATE_CONTENT_CHANGED_REPLAN_REQUIRED");
      }
      if (endpointVolumeIds(freshEndpoint).join("|") !== attachedVolumeIds.join("|")) {
        throw new Error("AVANTIQO_AUDIO_VOLUME_BINDING_CHANGED_REPLAN_REQUIRED");
      }

      const freshRegistryAuth = resolveRegistryAuth(freshRegistryAuths, freshTemplate);
      const freshRegistryAuthId = text(freshRegistryAuth?.id);
      if (freshRegistryAuthId !== registryAuthId) {
        throw new Error("AVANTIQO_AUDIO_REGISTRY_AUTH_CHANGED_REPLAN_REQUIRED");
      }

      const freshHealth = healthCounters(await queueHealth(endpointId, inferenceKey));
      if (freshHealth.jobs.in_queue > 0 || freshHealth.jobs.in_progress > 0) {
        throw new Error(
          `AVANTIQO_AUDIO_TEMPLATE_REPAIR_BLOCKED_LIVE_JOBS:in_queue=${freshHealth.jobs.in_queue}:in_progress=${freshHealth.jobs.in_progress}`,
        );
      }
      if (workerCount(freshHealth) > 0) {
        throw new Error(`AVANTIQO_AUDIO_TEMPLATE_REPAIR_BLOCKED_ACTIVE_WORKERS:count=${workerCount(freshHealth)}`);
      }

      await rest(`/templates/${encodeURIComponent(templateId)}/update`, managementKey, {
        method: "POST",
        body: templateUpdateBody(
          freshTemplate,
          desiredEnv,
          desiredMountPath,
          immutableImage.image,
          registryAuthId,
        ),
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
      if (text(verifiedTemplate.imageName) !== immutableImage.image) {
        throw new Error("AVANTIQO_AUDIO_TEMPLATE_REPAIR_VERIFY_IMMUTABLE_IMAGE_FAILED");
      }
      if (finite(verifiedTemplate.containerDiskInGb, 0) < MIN_CONTAINER_DISK_GB) {
        throw new Error("AVANTIQO_AUDIO_TEMPLATE_REPAIR_VERIFY_CONTAINER_DISK_FAILED");
      }
      if (registryAuthId && text(verifiedTemplate.containerRegistryAuthId) !== registryAuthId) {
        throw new Error("AVANTIQO_AUDIO_TEMPLATE_REPAIR_VERIFY_REGISTRY_AUTH_FAILED");
      }

      console.log("AVANTIQO_AUDIO_RUNPOD_TEMPLATE_REPAIR=COMPLETE");
      console.log(
        JSON.stringify(
          {
            ...plan,
            success: true,
            mode: "APPLY",
            endpoint: safeEndpoint(verifiedEndpoint),
            template: safeTemplate(verifiedTemplate),
            mutation_performed: true,
            next_action: attachedVolumeIds.length
              ? "FINGERPRINT_AUDIO_ENDPOINT"
              : "PROVISION_AUDIO_NETWORK_VOLUME_THEN_REPAIR_CACHE",
          },
          null,
          2,
        ),
      );
    }
  }
}
