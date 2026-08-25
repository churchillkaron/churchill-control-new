import { readFile } from "node:fs/promises";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const GQL_BASE = "https://api.runpod.io/graphql";
const CONTRACT = "AVANTIQO_IMAGE_VIDEO_RUNPOD_READINESS_V1";
const IMAGE_ENDPOINT_NAME = "avantiqo-image-v1";
const VIDEO_ENDPOINT_NAMES = new Set(["avantiqo-video-v1", "avantiqo-cinema-v1"]);
const IMAGE_EVIDENCE_PATH = "audits/results/avantiqo-image-worker-image.json";
const VIDEO_EVIDENCE_PATH = "audits/results/avantiqo-video-worker-image.json";
const IMAGE_EVIDENCE_CONTRACT = "AVANTIQO_IMAGE_WORKER_IMAGE_RESULT_V4";
const VIDEO_EVIDENCE_CONTRACT = "AVANTIQO_VIDEO_WORKER_IMAGE_RESULT_V1";
const CANONICAL_GHCR_AUTH_NAME = "avantiqo-ghcr";
const MIN_IMAGE_VOLUME_GB = 64;

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

function required(name, fallback = "") {
  const value = text(process.env[name] || fallback);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function unique(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function normalizeListResponse(value, candidateKeys = [], depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 4) return null;
  for (const key of [...candidateKeys, "data", "items", "results"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const normalized = normalizeListResponse(value[key], candidateKeys, depth + 1);
    if (normalized) return normalized;
  }
  return null;
}

function endpointVolumeIds(endpoint = {}) {
  return unique([endpoint.networkVolumeId, ...list(endpoint.networkVolumeIds)]);
}

function healthSummary(value = {}) {
  const jobs = object(value.jobs);
  const workers = object(value.workers);
  return {
    jobs: {
      in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
      completed: finite(jobs.completed, 0),
      failed: finite(jobs.failed, 0),
      retried: finite(jobs.retried, 0),
    },
    workers: {
      idle: finite(workers.idle, 0),
      initializing: finite(workers.initializing, 0),
      ready: finite(workers.ready, 0),
      running: finite(workers.running, 0),
      throttled: finite(workers.throttled, 0),
      unhealthy: finite(workers.unhealthy, 0),
    },
  };
}

function managementSummary(endpoint = {}) {
  const workers = list(endpoint.workers).map((worker) => ({
    id_present: Boolean(text(worker?.id)),
    desired_status: text(worker?.desiredStatus || worker?.desired_status).toUpperCase() || null,
    status: text(worker?.status || worker?.workerStatus || worker?.runtimeStatus).toUpperCase() || null,
    gpu_type: text(worker?.gpuTypeId || worker?.gpu?.displayName || worker?.machine?.gpuDisplayName) || null,
    data_center_id: text(worker?.dataCenterId || worker?.machine?.dataCenterId) || null,
    cost_per_hr: finite(worker?.costPerHr),
  }));
  return {
    worker_count: workers.length,
    non_exited_worker_count: workers.filter((worker) => worker.desired_status !== "EXITED").length,
    workers,
  };
}

function zeroActivity(health, management) {
  const healthWorkers = Object.values(health.workers).reduce((sum, value) => sum + finite(value, 0), 0);
  return (
    health.jobs.in_queue === 0 &&
    health.jobs.in_progress === 0 &&
    healthWorkers === 0 &&
    management.non_exited_worker_count === 0
  );
}

function safeVolume(volume = {}) {
  return {
    name: text(volume.name) || null,
    size_gb: finite(volume.size ?? volume.sizeGb),
    data_center_id: text(volume.dataCenterId ?? volume.data_center_id) || null,
  };
}

function safeTemplate(template = {}, authRows = []) {
  const authId = text(template.containerRegistryAuthId);
  return {
    id_present: Boolean(text(template.id)),
    name: text(template.name) || null,
    image_name: text(template.imageName) || null,
    image_is_immutable: text(template.imageName).includes("@sha256:"),
    registry_auth_configured: Boolean(authId),
    registry_auth_resolves: Boolean(authId && authRows.some((row) => text(row?.id) === authId)),
    volume_mount_path: text(template.volumeMountPath) || null,
  };
}

function safeEndpoint(endpoint = {}, volumes = []) {
  const ids = endpointVolumeIds(endpoint);
  const attached = volumes.filter((volume) => ids.includes(text(volume?.id))).map(safeVolume);
  const volumeDataCenters = unique(attached.map((volume) => volume.data_center_id));
  const explicitDataCenters = list(endpoint.dataCenterIds).map(text).filter(Boolean);
  return {
    id: text(endpoint.id) || null,
    name: text(endpoint.name) || null,
    version: finite(endpoint.version),
    compute_type: text(endpoint.computeType) || null,
    gpu_count: finite(endpoint.gpuCount),
    gpu_type_ids: list(endpoint.gpuTypeIds).map(text).filter(Boolean),
    workers_min: finite(endpoint.workersMin),
    workers_max: finite(endpoint.workersMax),
    scaler_type: text(endpoint.scalerType) || null,
    scaler_value: finite(endpoint.scalerValue),
    idle_timeout_seconds: finite(endpoint.idleTimeout),
    flashboot: endpoint.flashboot ?? endpoint.flashBoot ?? null,
    allowed_cuda_versions: list(endpoint.allowedCudaVersions),
    min_cuda_version: text(endpoint.minCudaVersion) || null,
    template_id_present: Boolean(text(endpoint.templateId || endpoint.template?.id)),
    network_volume_count: ids.length,
    attached_network_volumes: attached,
    effective_data_center_ids: volumeDataCenters.length ? volumeDataCenters : explicitDataCenters,
    effective_placement_source: volumeDataCenters.length
      ? "NETWORK_VOLUME_DATACENTER"
      : explicitDataCenters.length
        ? "ENDPOINT_DATACENTER_RESTRICTION"
        : "RUNPOD_AVAILABLE_DATACENTERS",
  };
}

async function readJson(response, prefix) {
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 800);
    throw new Error(`${prefix}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body ?? {};
}

async function rest(pathname, credential) {
  const response = await fetch(`${REST_BASE}${pathname}`, {
    headers: {
      Authorization: `Bearer ${credential}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });
  return readJson(response, "AVANTIQO_MEDIA_READINESS_REST");
}

async function queueHealth(endpointId, credential) {
  const response = await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, {
    headers: {
      Authorization: `Bearer ${credential}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });
  return readJson(response, "AVANTIQO_MEDIA_READINESS_QUEUE");
}

async function anonymousPullProof(reference) {
  const match = text(reference).match(/^ghcr\.io\/(.+)@(sha256:[a-f0-9]{64})$/i);
  if (!match) {
    return { public_pull: false, token_status: null, manifest_status: null, invalid_reference: true };
  }
  const repository = match[1];
  const digest = match[2];
  try {
    const tokenUrl = new URL("https://ghcr.io/token");
    tokenUrl.searchParams.set("service", "ghcr.io");
    tokenUrl.searchParams.set("scope", `repository:${repository}:pull`);
    const tokenResponse = await fetch(tokenUrl, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
    const tokenBody = object(await tokenResponse.json().catch(() => ({})));
    const token = text(tokenBody.token || tokenBody.access_token);
    if (!tokenResponse.ok || !token) {
      return { public_pull: false, token_status: tokenResponse.status, manifest_status: null };
    }
    const manifestResponse = await fetch(
      `https://ghcr.io/v2/${repository}/manifests/${encodeURIComponent(digest)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.oci.image.index.v1+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.docker.distribution.manifest.v2+json",
        },
        signal: AbortSignal.timeout(30_000),
      },
    );
    const contentDigest = text(manifestResponse.headers.get("docker-content-digest"));
    await manifestResponse.arrayBuffer();
    const digestMatches = !contentDigest || contentDigest.toLowerCase() === digest.toLowerCase();
    return {
      public_pull: manifestResponse.ok && digestMatches,
      token_status: tokenResponse.status,
      manifest_status: manifestResponse.status,
      digest_matches: digestMatches,
    };
  } catch (error) {
    return {
      public_pull: false,
      token_status: null,
      manifest_status: null,
      network_error: text(error?.cause?.code || error?.code || error?.message).slice(0, 120),
    };
  }
}

async function gpuAvailability(credential) {
  const query = `
    query AvantiqoImageVideoReadiness($input: GpuAvailabilityInput) {
      dataCenters {
        id
        name
        location
        storageSupport
        gpuAvailability(input: $input) {
          available
          stockStatus
          gpuTypeId
          gpuTypeDisplayName
          displayName
        }
      }
    }
  `;
  try {
    const response = await fetch(`${GQL_BASE}?api_key=${encodeURIComponent(credential)}`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        variables: { input: { gpuCount: 1, minDisk: 5, minMemoryInGb: 1, secureCloud: true } },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const raw = await response.text();
    let body = null;
    try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
    if (!response.ok || body?.errors?.length || !Array.isArray(body?.data?.dataCenters)) {
      const detail = text(body?.errors?.map((entry) => entry?.message).filter(Boolean).join(" | ") || raw).slice(0, 400);
      return { ok: false, error: `status=${response.status}:${detail || "INVALID_RESPONSE"}`, data_centers: [] };
    }
    return { ok: true, error: null, data_centers: body.data.dataCenters };
  } catch (error) {
    return { ok: false, error: text(error?.cause?.code || error?.code || error?.message).slice(0, 200), data_centers: [] };
  }
}

function capacityFor(endpoint, dataCenters) {
  const rows = [];
  for (const dataCenterId of endpoint.effective_data_center_ids) {
    const dc = dataCenters.find((candidate) => text(candidate?.id) === dataCenterId);
    for (const gpuTypeId of endpoint.gpu_type_ids) {
      const gpu = list(dc?.gpuAvailability).find((candidate) => text(candidate?.gpuTypeId) === gpuTypeId) || null;
      rows.push({
        data_center_id: dataCenterId,
        gpu_type_id: gpuTypeId,
        gpu_name: text(gpu?.gpuTypeDisplayName || gpu?.displayName) || null,
        available: gpu?.available === true,
        stock_status: text(gpu?.stockStatus) || "UNAVAILABLE",
        returned_by_api: Boolean(gpu),
      });
    }
  }
  return rows;
}

function resolveImageEndpoint(endpoints) {
  const configuredId = text(process.env.RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID);
  if (configuredId) {
    const matches = endpoints.filter((entry) => text(entry?.id) === configuredId);
    if (matches.length !== 1 || text(matches[0]?.name) !== IMAGE_ENDPOINT_NAME) {
      throw new Error(`AVANTIQO_MEDIA_READINESS_IMAGE_ENDPOINT_INVALID:${matches.length}`);
    }
    return { endpoint: matches[0], resolution: "CONFIGURED_ID" };
  }
  const matches = endpoints.filter((entry) => text(entry?.name) === IMAGE_ENDPOINT_NAME);
  if (matches.length !== 1) throw new Error(`AVANTIQO_MEDIA_READINESS_IMAGE_ENDPOINT_RESOLUTION_FAILED:${matches.length}`);
  return { endpoint: matches[0], resolution: "EXACT_NAME" };
}

function resolveVideoEndpoint(endpoints) {
  const configuredId = text(process.env.RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID);
  if (configuredId) {
    const matches = endpoints.filter((entry) => text(entry?.id) === configuredId);
    if (matches.length !== 1 || !VIDEO_ENDPOINT_NAMES.has(text(matches[0]?.name))) {
      throw new Error(`AVANTIQO_MEDIA_READINESS_VIDEO_ENDPOINT_INVALID:${matches.length}`);
    }
    return { endpoint: matches[0], resolution: "CONFIGURED_ID" };
  }
  const matches = endpoints.filter((entry) => VIDEO_ENDPOINT_NAMES.has(text(entry?.name)));
  if (matches.length !== 1) throw new Error(`AVANTIQO_MEDIA_READINESS_VIDEO_ENDPOINT_RESOLUTION_FAILED:${matches.length}`);
  return { endpoint: matches[0], resolution: "CANONICAL_NAME" };
}

function resolveTemplate(endpoint, templates, label) {
  const templateId = text(endpoint?.templateId || endpoint?.template?.id);
  if (!templateId) throw new Error(`AVANTIQO_MEDIA_READINESS_${label}_TEMPLATE_ID_REQUIRED`);
  const matches = templates.filter((entry) => text(entry?.id) === templateId);
  if (matches.length !== 1) throw new Error(`AVANTIQO_MEDIA_READINESS_${label}_TEMPLATE_RESOLUTION_FAILED:${matches.length}`);
  return matches[0];
}

function authPath(template, authRows, publicProof) {
  const boundId = text(template.containerRegistryAuthId);
  const boundResolves = Boolean(boundId && authRows.some((row) => text(row?.id) === boundId));
  const canonicalMatches = authRows.filter((row) => text(row?.name) === CANONICAL_GHCR_AUTH_NAME);
  const canonicalExists = canonicalMatches.length === 1;
  if (publicProof.public_pull) return { mode: "PUBLIC_PULL", current_template_ready: true, canonical_auth_exists: canonicalExists };
  if (boundResolves) return { mode: "BOUND_RUNPOD_AUTH", current_template_ready: true, canonical_auth_exists: canonicalExists };
  if (canonicalExists) return { mode: "BIND_EXISTING_CANONICAL_AUTH_REQUIRED", current_template_ready: false, canonical_auth_exists: true };
  return { mode: "CREATE_AND_BIND_GHCR_AUTH_REQUIRED", current_template_ready: false, canonical_auth_exists: false };
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
const imageQueueKey = text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY) || required("RUNPOD_API_KEY", managementKey);
const videoQueueKey = text(process.env.RUNPOD_AVANTIQO_VIDEO_API_KEY) || text(process.env.RUNPOD_API_KEY) || managementKey;

console.log("AVANTIQO_IMAGE_VIDEO_RUNPOD_READINESS_MODE=READ_ONLY");
console.log("AVANTIQO_IMAGE_VIDEO_RUNPOD_READINESS_ENDPOINT_MUTATION=false");
console.log("AVANTIQO_IMAGE_VIDEO_RUNPOD_READINESS_TEMPLATE_MUTATION=false");
console.log("AVANTIQO_IMAGE_VIDEO_RUNPOD_READINESS_REGISTRY_MUTATION=false");
console.log("AVANTIQO_IMAGE_VIDEO_RUNPOD_READINESS_JOB_SUBMISSION=false");
console.log("AVANTIQO_IMAGE_VIDEO_RUNPOD_READINESS_MODEL_DOWNLOAD=false");
console.log("AVANTIQO_IMAGE_VIDEO_RUNPOD_READINESS_PRODUCTION_DEPLOY=false");
console.log("AVANTIQO_IMAGE_VIDEO_RUNPOD_READINESS_SECRETS_PRINTED=false");

const [imageEvidence, videoEvidence] = await Promise.all([
  readFile(IMAGE_EVIDENCE_PATH, "utf8").then(JSON.parse),
  readFile(VIDEO_EVIDENCE_PATH, "utf8").then(JSON.parse),
]);
if (imageEvidence?.success !== true || imageEvidence?.contract !== IMAGE_EVIDENCE_CONTRACT) {
  throw new Error("AVANTIQO_MEDIA_READINESS_IMAGE_EVIDENCE_INVALID");
}
if (videoEvidence?.success !== true || videoEvidence?.contract !== VIDEO_EVIDENCE_CONTRACT) {
  throw new Error("AVANTIQO_MEDIA_READINESS_VIDEO_EVIDENCE_INVALID");
}
const imageImmutable = text(imageEvidence.immutable_image_reference);
const videoImmutable = text(videoEvidence.immutable_image_reference);
if (!/^ghcr\.io\/churchillkaron\/avantiqo-image-worker@sha256:[a-f0-9]{64}$/i.test(imageImmutable)) {
  throw new Error("AVANTIQO_MEDIA_READINESS_IMAGE_IMMUTABLE_REFERENCE_INVALID");
}
if (!/^ghcr\.io\/churchillkaron\/avantiqo-video-worker@sha256:[a-f0-9]{64}$/i.test(videoImmutable)) {
  throw new Error("AVANTIQO_MEDIA_READINESS_VIDEO_IMMUTABLE_REFERENCE_INVALID");
}

const [endpointsRaw, templatesRaw, volumesRaw, authRaw, imagePublicProof, videoPublicProof, availability] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", managementKey),
  rest("/networkvolumes", managementKey),
  rest("/containerregistryauth", managementKey),
  anonymousPullProof(imageImmutable),
  anonymousPullProof(videoImmutable),
  gpuAvailability(managementKey),
]);

const endpoints = normalizeListResponse(endpointsRaw, ["endpoints", "serverlessEndpoints"]);
const templates = normalizeListResponse(templatesRaw, ["templates"]);
const volumes = normalizeListResponse(volumesRaw, ["networkVolumes", "networkvolumes", "volumes"]);
const authRows = normalizeListResponse(authRaw, ["containerRegistryAuths", "containerRegistryCreds", "registryAuths", "registryCredentials", "credentials", "auths"]) || [];
if (!endpoints) throw new Error("AVANTIQO_MEDIA_READINESS_ENDPOINT_LIST_INVALID");
if (!templates) throw new Error("AVANTIQO_MEDIA_READINESS_TEMPLATE_LIST_INVALID");
if (!volumes) throw new Error("AVANTIQO_MEDIA_READINESS_VOLUME_LIST_INVALID");

const imageResolved = resolveImageEndpoint(endpoints);
const videoResolved = resolveVideoEndpoint(endpoints);
const imageTemplate = resolveTemplate(imageResolved.endpoint, templates, "IMAGE");
const videoTemplate = resolveTemplate(videoResolved.endpoint, templates, "VIDEO");
const imageEndpointId = text(imageResolved.endpoint.id);
const videoEndpointId = text(videoResolved.endpoint.id);
const [imageHealthRaw, videoHealthRaw] = await Promise.all([
  queueHealth(imageEndpointId, imageQueueKey),
  queueHealth(videoEndpointId, videoQueueKey),
]);

const imageHealth = healthSummary(imageHealthRaw);
const videoHealth = healthSummary(videoHealthRaw);
const imageManagement = managementSummary(imageResolved.endpoint);
const videoManagement = managementSummary(videoResolved.endpoint);
const imageEndpoint = safeEndpoint(imageResolved.endpoint, volumes);
const videoEndpoint = safeEndpoint(videoResolved.endpoint, volumes);
const imageAuth = authPath(imageTemplate, authRows, imagePublicProof);
const videoAuth = authPath(videoTemplate, authRows, videoPublicProof);
const imageTemplateId = text(imageTemplate.id);
const videoTemplateId = text(videoTemplate.id);
const imageConsumers = endpoints.filter((entry) => text(entry?.templateId || entry?.template?.id) === imageTemplateId);
const videoConsumers = endpoints.filter((entry) => text(entry?.templateId || entry?.template?.id) === videoTemplateId);
const imageExclusive = imageConsumers.length === 1 && text(imageConsumers[0]?.id) === imageEndpointId;
const videoExclusive = videoConsumers.length === 1 && text(videoConsumers[0]?.id) === videoEndpointId;
const imageIdle = zeroActivity(imageHealth, imageManagement);
const videoIdle = zeroActivity(videoHealth, videoManagement);
const imageVolumeReady = imageEndpoint.attached_network_volumes.some((volume) => finite(volume.size_gb, 0) >= MIN_IMAGE_VOLUME_GB);
const imageMutationRequired = text(imageTemplate.imageName) !== imageImmutable;
const videoMutationRequired = text(videoTemplate.imageName) !== videoImmutable;
const imageCapacity = availability.ok ? capacityFor(imageEndpoint, availability.data_centers) : [];
const videoCapacity = availability.ok ? capacityFor(videoEndpoint, availability.data_centers) : [];

let imageNextAction = "RUN_IMAGE_V6_RUNTIME_PROBE_AND_INSPECT_FOUNDATION_CAPACITY";
if (!imageExclusive) imageNextAction = "REPAIR_IMAGE_TEMPLATE_EXCLUSIVITY_BEFORE_BIND";
else if (!imageVolumeReady) imageNextAction = "REPAIR_IMAGE_NETWORK_VOLUME_BEFORE_BIND";
else if (!imageIdle) imageNextAction = "INSPECT_OR_DRAIN_IMAGE_SERVERLESS_WORKERS_BEFORE_BIND";
else if (!imageAuth.current_template_ready) imageNextAction = imageAuth.mode;
else if (imageMutationRequired) imageNextAction = "APPLY_IMAGE_V6_IMMUTABLE_BIND";

let videoNextAction = "RUN_VIDEO_RUNTIME_PROBE";
if (!videoExclusive) videoNextAction = "REPAIR_VIDEO_TEMPLATE_EXCLUSIVITY_BEFORE_BIND";
else if (!videoIdle) videoNextAction = "DRAIN_VIDEO_SERVERLESS_WORKERS_BEFORE_BIND";
else if (!videoAuth.current_template_ready) videoNextAction = videoAuth.mode;
else if (videoMutationRequired) videoNextAction = "APPLY_IMMUTABLE_VIDEO_IMAGE_BIND";

const report = {
  success: true,
  contract: CONTRACT,
  mutation_performed: false,
  provider_job_submitted: false,
  image_generation_submitted: false,
  video_generation_submitted: false,
  model_download_submitted: false,
  production_web_deploy: false,
  secrets_in_output: false,
  registry: {
    canonical_auth_name: CANONICAL_GHCR_AUTH_NAME,
    canonical_auth_count: authRows.filter((row) => text(row?.name) === CANONICAL_GHCR_AUTH_NAME).length,
    total_registry_auth_count: authRows.length,
  },
  gpu_availability_probe: {
    success: availability.ok,
    error: availability.error,
  },
  image: {
    endpoint_resolution: imageResolved.resolution,
    endpoint: imageEndpoint,
    template: safeTemplate(imageTemplate, authRows),
    template_consumer_count: imageConsumers.length,
    template_exclusive: imageExclusive,
    health: imageHealth,
    management: imageManagement,
    zero_activity: imageIdle,
    network_volume_ready: imageVolumeReady,
    bound_gpu_capacity: imageCapacity,
    immutable_image: {
      reference: imageImmutable,
      source_sha: text(imageEvidence.source_sha),
      entrypoint: text(imageEvidence.entrypoint),
      runtime_revision: text(imageEvidence.runtime_revision),
    },
    anonymous_pull_proof: imagePublicProof,
    registry_auth_path: imageAuth,
    mutation_required: imageMutationRequired,
    bind_preconditions_satisfied: imageExclusive && imageVolumeReady && imageIdle && imageAuth.current_template_ready,
    next_action: imageNextAction,
  },
  video: {
    endpoint_resolution: videoResolved.resolution,
    endpoint: videoEndpoint,
    template: safeTemplate(videoTemplate, authRows),
    template_consumer_count: videoConsumers.length,
    template_exclusive: videoExclusive,
    health: videoHealth,
    management: videoManagement,
    zero_activity: videoIdle,
    bound_gpu_capacity: videoCapacity,
    immutable_image: {
      reference: videoImmutable,
      source_sha: text(videoEvidence.source_sha),
      entrypoint: text(videoEvidence.entrypoint),
      engine_contract: text(videoEvidence.engine_contract),
    },
    anonymous_pull_proof: videoPublicProof,
    registry_auth_path: videoAuth,
    mutation_required: videoMutationRequired,
    bind_preconditions_satisfied: videoExclusive && videoIdle && videoAuth.current_template_ready,
    next_action: videoNextAction,
  },
};

console.log(JSON.stringify(report, null, 2));
