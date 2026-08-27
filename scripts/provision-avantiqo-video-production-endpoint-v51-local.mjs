import { readFile } from "node:fs/promises";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_VIDEO_PRODUCTION_ENDPOINT_PROVISION_V1";
const APPROVAL = "AVANTIQO_VIDEO_PRODUCTION_ENDPOINT_V51_APPROVED";
const CERTIFICATION_ENDPOINT_NAME = "avantiqo-cinema-v1";
const PRODUCTION_ENDPOINT_NAME = "avantiqo-cinema-production-v1";
const PRODUCTION_TEMPLATE_NAME = "avantiqo-cinema-production-v4";
const IMAGE_EVIDENCE_PATH = "audits/results/avantiqo-video-worker-image.json";
const EXPECTED_IMAGE_CONTRACT = "AVANTIQO_VIDEO_WORKER_IMAGE_RESULT_V2";
const EXPECTED_IMAGE_REVISION = "AVANTIQO_VIDEO_WORKER_IMAGE_V4_WAN22_CINEMA_QUALITY_V1";
const EXPECTED_ENTRYPOINT = "handler_v4.py";
const EXPECTED_ENTRYPOINT_REVISION = "AVANTIQO_VIDEO_HANDLER_V4_WAN22_CINEMA_QUALITY_V1";
const EXPECTED_RUNTIME_REVISION = "AVANTIQO_VIDEO_WAN22_A14B_CINEMA_QUALITY_V1";
const EXPECTED_QUALITY_CONTRACT = "AVANTIQO_VIDEO_WAN22_A14B_CINEMA_QUALITY_V1";
const PRODUCTION_WORKERS_MIN = 0;
const PRODUCTION_WORKERS_MAX = 1;

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

function approved(name) {
  return text(process.env[name]).toUpperCase() === "YES";
}

function normalizeEnv(value) {
  if (Array.isArray(value)) {
    return Object.fromEntries(
      value
        .map((entry) => [text(entry?.key || entry?.name), String(entry?.value ?? "")])
        .filter(([key]) => Boolean(key)),
    );
  }
  return Object.fromEntries(
    Object.entries(object(value)).map(([key, child]) => [String(key), String(child ?? "")]),
  );
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

async function readJson(response, prefix) {
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 1200);
    throw new Error(`${prefix}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body ?? {};
}

async function rest(pathname, credential, options = {}) {
  const response = await fetch(`${REST_BASE}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${credential}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  return readJson(response, "AVANTIQO_VIDEO_PRODUCTION_REST");
}

async function queueHealth(endpointId, credential) {
  const response = await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, {
    headers: {
      Authorization: `Bearer ${credential}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });
  return readJson(response, "AVANTIQO_VIDEO_PRODUCTION_QUEUE");
}

function endpointVolumeIds(endpoint = {}) {
  return [...new Set([
    text(endpoint.networkVolumeId),
    ...list(endpoint.networkVolumeIds).map(text),
  ].filter(Boolean))];
}

function queueSummary(value = {}) {
  const jobs = object(value.jobs);
  const workers = object(value.workers);
  return {
    jobs: {
      in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
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
  }));
  const nonExited = workers.filter((worker) => {
    const effective = worker.desired_status || worker.status;
    return effective && !["EXITED", "STOPPED", "TERMINATED", "DELETED"].includes(effective);
  });
  return {
    worker_count: workers.length,
    non_exited_worker_count: nonExited.length,
    workers,
  };
}

function assertResting(label, queue, management) {
  if (queue.jobs.in_queue !== 0 || queue.jobs.in_progress !== 0) {
    throw new Error(`${label}_JOBS_NOT_IDLE:in_queue=${queue.jobs.in_queue}:in_progress=${queue.jobs.in_progress}`);
  }
  const active = Object.values(queue.workers).reduce((sum, value) => sum + finite(value, 0), 0);
  if (active !== 0 || management.non_exited_worker_count !== 0) {
    throw new Error(`${label}_WORKERS_NOT_IDLE:queue_workers=${active}:management_non_exited=${management.non_exited_worker_count}`);
  }
}

function sameOrdered(left, right) {
  return JSON.stringify(list(left).map(text)) === JSON.stringify(list(right).map(text));
}

function sameSet(left, right) {
  return JSON.stringify([...new Set(list(left).map(text).filter(Boolean))].sort()) ===
    JSON.stringify([...new Set(list(right).map(text).filter(Boolean))].sort());
}

function safeEndpoint(endpoint = {}) {
  return {
    id: text(endpoint.id) || null,
    name: text(endpoint.name) || null,
    template_id: text(endpoint.templateId || endpoint.template?.id) || null,
    workers_min: finite(endpoint.workersMin),
    workers_max: finite(endpoint.workersMax),
    gpu_type_ids: list(endpoint.gpuTypeIds).map(text).filter(Boolean),
    allowed_cuda_versions: list(endpoint.allowedCudaVersions).map(text).filter(Boolean),
    network_volume_ids: endpointVolumeIds(endpoint),
    execution_timeout_ms: finite(endpoint.executionTimeoutMs),
    idle_timeout_seconds: finite(endpoint.idleTimeout),
    scaler_type: text(endpoint.scalerType) || null,
    scaler_value: finite(endpoint.scalerValue),
    flashboot: endpoint.flashboot === true || endpoint.flashBoot === true,
  };
}

function safeTemplate(template = {}) {
  return {
    id: text(template.id) || null,
    name: text(template.name) || null,
    image_name: text(template.imageName) || null,
    volume_mount_path: text(template.volumeMountPath) || null,
    registry_auth_configured: Boolean(text(template.containerRegistryAuthId)),
    env_keys: Object.keys(normalizeEnv(template.env)).sort(),
  };
}

function templateContractKey(template = {}) {
  return JSON.stringify({
    containerDiskInGb: finite(template.containerDiskInGb, 0),
    containerRegistryAuthId: text(template.containerRegistryAuthId),
    dockerEntrypoint: list(template.dockerEntrypoint),
    dockerStartCmd: list(template.dockerStartCmd),
    env: normalizeEnv(template.env),
    imageName: text(template.imageName),
    isPublic: template.isPublic === true,
    ports: list(template.ports),
    volumeInGb: finite(template.volumeInGb, 0),
    volumeMountPath: text(template.volumeMountPath),
  });
}

function templateBody(baseTemplate, imageName) {
  const body = {
    containerDiskInGb: Math.max(1, finite(baseTemplate?.containerDiskInGb, 5)),
    dockerEntrypoint: list(baseTemplate?.dockerEntrypoint),
    dockerStartCmd: list(baseTemplate?.dockerStartCmd),
    env: normalizeEnv(baseTemplate?.env),
    imageName,
    isPublic: false,
    name: PRODUCTION_TEMPLATE_NAME,
    ports: list(baseTemplate?.ports),
    readme: "Avantiqo Cinema V4 production template. Zero-idle-cost customer lane; capacity-routed with managed fallback.",
    volumeInGb: Math.max(0, finite(baseTemplate?.volumeInGb, 0)),
    volumeMountPath: text(baseTemplate?.volumeMountPath) || "/runpod-volume",
  };
  const registryAuthId = text(baseTemplate?.containerRegistryAuthId);
  if (registryAuthId) body.containerRegistryAuthId = registryAuthId;
  return body;
}

function endpointBody(baseEndpoint, templateId) {
  const body = {
    templateId,
    computeType: text(baseEndpoint?.computeType) || "GPU",
    executionTimeoutMs: finite(baseEndpoint?.executionTimeoutMs, 1_800_000),
    flashboot: baseEndpoint?.flashboot === true || baseEndpoint?.flashBoot === true,
    gpuCount: Math.max(1, finite(baseEndpoint?.gpuCount, 1)),
    gpuTypeIds: list(baseEndpoint?.gpuTypeIds).map(text).filter(Boolean),
    idleTimeout: Math.max(1, finite(baseEndpoint?.idleTimeout, 5)),
    name: PRODUCTION_ENDPOINT_NAME,
    scalerType: text(baseEndpoint?.scalerType) || "QUEUE_DELAY",
    scalerValue: finite(baseEndpoint?.scalerValue, 4),
    workersMax: PRODUCTION_WORKERS_MAX,
    workersMin: PRODUCTION_WORKERS_MIN,
  };
  const volumeIds = endpointVolumeIds(baseEndpoint);
  if (volumeIds.length === 1) body.networkVolumeId = volumeIds[0];
  if (volumeIds.length > 1) body.networkVolumeIds = volumeIds;
  const dataCenterIds = list(baseEndpoint?.dataCenterIds).map(text).filter(Boolean);
  if (dataCenterIds.length) body.dataCenterIds = dataCenterIds;
  const allowedCudaVersions = list(baseEndpoint?.allowedCudaVersions).map(text).filter(Boolean);
  if (allowedCudaVersions.length) body.allowedCudaVersions = allowedCudaVersions;
  if (text(baseEndpoint?.minCudaVersion)) body.minCudaVersion = text(baseEndpoint.minCudaVersion);
  return body;
}

async function imageEvidence() {
  const evidence = JSON.parse(await readFile(IMAGE_EVIDENCE_PATH, "utf8"));
  const checks = {
    success: evidence?.success === true,
    contract: text(evidence?.contract) === EXPECTED_IMAGE_CONTRACT,
    revision: text(evidence?.evidence_revision) === EXPECTED_IMAGE_REVISION,
    source_trigger: evidence?.source_sha_matches_trigger === true && text(evidence?.source_sha) === text(evidence?.trigger_sha),
    entrypoint: text(evidence?.entrypoint) === EXPECTED_ENTRYPOINT,
    entrypoint_revision: text(evidence?.entrypoint_revision) === EXPECTED_ENTRYPOINT_REVISION,
    runtime_revision: text(evidence?.runtime_revision) === EXPECTED_RUNTIME_REVISION,
    quality_contract: text(evidence?.quality_contract) === EXPECTED_QUALITY_CONTRACT,
    native_720p: evidence?.native_720p_dimensions === true,
    minimum_fps: finite(evidence?.minimum_cinema_fps, 0) >= 16,
    t2v_steps: finite(evidence?.t2v_inference_steps, 0) >= 40,
    vae_float32: text(evidence?.vae_decode_dtype) === "float32",
    diffusion_bfloat16: text(evidence?.diffusion_dtype) === "bfloat16",
    export_quality: finite(evidence?.cinema_export_quality, 0) >= 9,
  };
  const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([key]) => key);
  if (failed.length) {
    throw new Error(`AVANTIQO_VIDEO_PRODUCTION_IMAGE_EVIDENCE_INVALID:${failed.join(",")}`);
  }
  const image = text(evidence?.immutable_image_reference);
  if (!/^ghcr\.io\/churchillkaron\/avantiqo-video-worker@sha256:[a-f0-9]{64}$/i.test(image)) {
    throw new Error("AVANTIQO_VIDEO_PRODUCTION_IMMUTABLE_IMAGE_REFERENCE_INVALID");
  }
  return {
    image,
    digest: text(evidence.image_digest),
    source_sha: text(evidence.source_sha),
    entrypoint: text(evidence.entrypoint),
    runtime_revision: text(evidence.runtime_revision),
    quality_contract: text(evidence.quality_contract),
  };
}

function resolveCertificationEndpoint(endpoints, configuredId) {
  const matches = endpoints.filter((endpoint) =>
    text(endpoint?.id) === configuredId && text(endpoint?.name) === CERTIFICATION_ENDPOINT_NAME,
  );
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_VIDEO_CERTIFICATION_ENDPOINT_RESOLUTION_FAILED:matches=${matches.length}`);
  }
  return matches[0];
}

function resolveTemplate(endpoint, templates) {
  const templateId = text(endpoint?.templateId || endpoint?.template?.id);
  if (!templateId) throw new Error("AVANTIQO_VIDEO_CERTIFICATION_TEMPLATE_ID_REQUIRED");
  const inline = object(endpoint?.template);
  if (Object.keys(inline).length && text(inline.id) === templateId) return inline;
  const matches = templates.filter((template) => text(template?.id) === templateId);
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_VIDEO_CERTIFICATION_TEMPLATE_RESOLUTION_FAILED:matches=${matches.length}`);
  }
  return matches[0];
}

function assertProductionEndpoint(candidate, certification, templateId) {
  if (text(candidate?.name) !== PRODUCTION_ENDPOINT_NAME) {
    throw new Error("AVANTIQO_VIDEO_PRODUCTION_ENDPOINT_NAME_INVALID");
  }
  if (text(candidate?.templateId || candidate?.template?.id) !== templateId) {
    throw new Error("AVANTIQO_VIDEO_PRODUCTION_TEMPLATE_BINDING_INVALID");
  }
  if (finite(candidate?.workersMin, -1) !== PRODUCTION_WORKERS_MIN) {
    throw new Error("AVANTIQO_VIDEO_PRODUCTION_WORKERS_MIN_INVALID");
  }
  if (finite(candidate?.workersMax, -1) !== PRODUCTION_WORKERS_MAX) {
    throw new Error("AVANTIQO_VIDEO_PRODUCTION_WORKERS_MAX_INVALID");
  }
  if (!sameOrdered(candidate?.gpuTypeIds, certification?.gpuTypeIds)) {
    throw new Error("AVANTIQO_VIDEO_PRODUCTION_GPU_PRIORITY_NOT_PRESERVED");
  }
  if (!sameSet(endpointVolumeIds(candidate), endpointVolumeIds(certification))) {
    throw new Error("AVANTIQO_VIDEO_PRODUCTION_CACHE_VOLUMES_NOT_PRESERVED");
  }
  if (!sameOrdered(candidate?.allowedCudaVersions, certification?.allowedCudaVersions)) {
    throw new Error("AVANTIQO_VIDEO_PRODUCTION_CUDA_VERSIONS_NOT_PRESERVED");
  }
}

const apply = process.argv.includes("--apply");
if (apply && !approved(APPROVAL)) {
  throw new Error(`${APPROVAL}=YES_REQUIRED`);
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const runtimeKey = text(process.env.RUNPOD_AVANTIQO_VIDEO_API_KEY || process.env.RUNPOD_API_KEY);
if (!runtimeKey) throw new Error("RUNPOD_API_KEY_REQUIRED");
const certificationEndpointId = required("RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID");
const image = await imageEvidence();

const [rawEndpoints, rawTemplates] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  rest(
    "/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false",
    managementKey,
  ),
]);
const endpoints = normalizeListResponse(rawEndpoints, ["endpoints"]);
const templates = normalizeListResponse(rawTemplates, ["templates"]);
if (!endpoints) throw new Error("AVANTIQO_VIDEO_PRODUCTION_ENDPOINT_LIST_INVALID");
if (!templates) throw new Error("AVANTIQO_VIDEO_PRODUCTION_TEMPLATE_LIST_INVALID");

const certification = resolveCertificationEndpoint(endpoints, certificationEndpointId);
const certificationTemplate = resolveTemplate(certification, templates);
if (finite(certification.workersMin, -1) !== 0 || finite(certification.workersMax, -1) !== 0) {
  throw new Error(
    `AVANTIQO_VIDEO_CERTIFICATION_REST_STATE_REQUIRED:workers_min=${finite(certification.workersMin)}:workers_max=${finite(certification.workersMax)}`,
  );
}
if (text(certificationTemplate.imageName) !== image.image) {
  throw new Error("AVANTIQO_VIDEO_CERTIFICATION_V4_IMMUTABLE_IMAGE_REQUIRED");
}
const certificationQueue = queueSummary(await queueHealth(certificationEndpointId, runtimeKey));
const certificationManagement = managementSummary(certification);
assertResting("AVANTIQO_VIDEO_CERTIFICATION", certificationQueue, certificationManagement);

const productionTemplateMatches = templates.filter((template) => text(template?.name) === PRODUCTION_TEMPLATE_NAME);
if (productionTemplateMatches.length > 1) {
  throw new Error(`AVANTIQO_VIDEO_PRODUCTION_TEMPLATE_NAME_AMBIGUOUS:matches=${productionTemplateMatches.length}`);
}
const productionEndpointMatches = endpoints.filter((endpoint) => text(endpoint?.name) === PRODUCTION_ENDPOINT_NAME);
if (productionEndpointMatches.length > 1) {
  throw new Error(`AVANTIQO_VIDEO_PRODUCTION_ENDPOINT_NAME_AMBIGUOUS:matches=${productionEndpointMatches.length}`);
}

const desiredTemplate = templateBody(certificationTemplate, image.image);
let existingProductionTemplate = productionTemplateMatches[0] || null;
if (existingProductionTemplate) {
  const existingKey = templateContractKey({
    ...existingProductionTemplate,
    readme: desiredTemplate.readme,
  });
  const desiredKey = templateContractKey(desiredTemplate);
  if (existingKey !== desiredKey) {
    throw new Error("AVANTIQO_VIDEO_PRODUCTION_EXISTING_TEMPLATE_CONTRACT_MISMATCH");
  }
}

let existingProductionEndpoint = productionEndpointMatches[0] || null;
if (existingProductionEndpoint) {
  if (!existingProductionTemplate) {
    const candidateTemplate = resolveTemplate(existingProductionEndpoint, templates);
    if (text(candidateTemplate.name) !== PRODUCTION_TEMPLATE_NAME) {
      throw new Error("AVANTIQO_VIDEO_PRODUCTION_EXISTING_ENDPOINT_TEMPLATE_NAME_MISMATCH");
    }
    existingProductionTemplate = candidateTemplate;
  }
  assertProductionEndpoint(existingProductionEndpoint, certification, text(existingProductionTemplate.id));
  const productionQueue = queueSummary(await queueHealth(text(existingProductionEndpoint.id), runtimeKey));
  const productionManagement = managementSummary(existingProductionEndpoint);
  assertResting("AVANTIQO_VIDEO_PRODUCTION", productionQueue, productionManagement);

  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    mode: apply ? "APPLY" : "PLAN",
    certification_endpoint: safeEndpoint(certification),
    production_endpoint_exists: true,
    production_endpoint: safeEndpoint(existingProductionEndpoint),
    production_template: safeTemplate(existingProductionTemplate),
    immutable_image: image,
    zero_idle_cost_contract: true,
    workers_min: 0,
    workers_max: 1,
    idle_worker_count: 0,
    idle_gpu_cost_usd_per_hour: 0,
    env_binding: `RUNPOD_AVANTIQO_VIDEO_PRODUCTION_ENDPOINT_ID=${text(existingProductionEndpoint.id)}`,
    mutation_performed: false,
    generation_submitted: false,
    inference_performed: false,
    model_download_performed: false,
    image_endpoint_mutation_performed: false,
    safe_lease_changed: false,
    next_action: "BIND_PRODUCTION_ENDPOINT_ENV_THEN_RUN_READ_ONLY_ROUTE_INSPECTION",
  }, null, 2));
  process.exit(0);
}

const plan = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  certification_endpoint: safeEndpoint(certification),
  certification_template: safeTemplate(certificationTemplate),
  production_endpoint_exists: false,
  production_template_exists: Boolean(existingProductionTemplate),
  production_endpoint_name: PRODUCTION_ENDPOINT_NAME,
  production_template_name: PRODUCTION_TEMPLATE_NAME,
  immutable_image: image,
  gpu_type_ids: list(certification.gpuTypeIds).map(text).filter(Boolean),
  allowed_cuda_versions: list(certification.allowedCudaVersions).map(text).filter(Boolean),
  network_volume_ids: endpointVolumeIds(certification),
  workers_min: PRODUCTION_WORKERS_MIN,
  workers_max: PRODUCTION_WORKERS_MAX,
  zero_idle_cost_contract: true,
  idle_worker_count_expected: 0,
  idle_gpu_cost_usd_per_hour_expected: 0,
  capacity_policy: "OWNED_ONLY_WHEN_PRODUCTION_WORKER_READY_OR_MEDIUM_HIGH_STOCK_OTHERWISE_MANAGED_FALLBACK",
  shared_v4_model_cache_reused: true,
  new_model_download_required: false,
  mutation_performed: false,
  generation_submitted: false,
  inference_performed: false,
  model_download_performed: false,
  image_endpoint_mutation_performed: false,
  safe_lease_changed: false,
  next_action: apply ? "CREATE_SEPARATE_PRODUCTION_TEMPLATE_AND_ZERO_IDLE_ENDPOINT" : "APPROVE_PRODUCTION_ENDPOINT_PROVISION",
};

if (!apply) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

let createdTemplateId = null;
let createdEndpointId = null;
try {
  let productionTemplate = existingProductionTemplate;
  if (!productionTemplate) {
    productionTemplate = await rest("/templates", managementKey, {
      method: "POST",
      body: desiredTemplate,
    });
    createdTemplateId = text(productionTemplate?.id);
    if (!createdTemplateId) throw new Error("AVANTIQO_VIDEO_PRODUCTION_CREATED_TEMPLATE_ID_REQUIRED");
  }
  const productionTemplateId = text(productionTemplate?.id);
  if (!productionTemplateId) throw new Error("AVANTIQO_VIDEO_PRODUCTION_TEMPLATE_ID_REQUIRED");

  const refreshedRawEndpoints = await rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey);
  const refreshedEndpoints = normalizeListResponse(refreshedRawEndpoints, ["endpoints"]);
  if (!refreshedEndpoints) throw new Error("AVANTIQO_VIDEO_PRODUCTION_REFRESHED_ENDPOINT_LIST_INVALID");
  const appeared = refreshedEndpoints.filter((endpoint) => text(endpoint?.name) === PRODUCTION_ENDPOINT_NAME);
  if (appeared.length) {
    throw new Error(`AVANTIQO_VIDEO_PRODUCTION_ENDPOINT_APPEARED_REPLAN_REQUIRED:matches=${appeared.length}`);
  }

  const created = await rest("/endpoints", managementKey, {
    method: "POST",
    body: endpointBody(certification, productionTemplateId),
  });
  createdEndpointId = text(created?.id);
  if (!createdEndpointId) throw new Error("AVANTIQO_VIDEO_PRODUCTION_CREATED_ENDPOINT_ID_REQUIRED");

  const verified = await rest(
    `/endpoints/${encodeURIComponent(createdEndpointId)}?includeTemplate=true&includeWorkers=true`,
    managementKey,
  );
  assertProductionEndpoint(verified, certification, productionTemplateId);
  const verifiedTemplate = object(verified.template);
  if (Object.keys(verifiedTemplate).length && text(verifiedTemplate.imageName) !== image.image) {
    throw new Error("AVANTIQO_VIDEO_PRODUCTION_VERIFIED_IMAGE_MISMATCH");
  }
  const productionQueue = queueSummary(await queueHealth(createdEndpointId, runtimeKey));
  const productionManagement = managementSummary(verified);
  assertResting("AVANTIQO_VIDEO_PRODUCTION", productionQueue, productionManagement);

  console.log(JSON.stringify({
    ...plan,
    mode: "APPLY",
    production_endpoint_exists: true,
    production_endpoint: safeEndpoint(verified),
    production_template: safeTemplate(Object.keys(verifiedTemplate).length ? verifiedTemplate : productionTemplate),
    template_created: Boolean(createdTemplateId),
    endpoint_created: true,
    idle_worker_count: 0,
    idle_gpu_cost_usd_per_hour: 0,
    env_binding: `RUNPOD_AVANTIQO_VIDEO_PRODUCTION_ENDPOINT_ID=${createdEndpointId}`,
    mutation_performed: true,
    rollback_performed: false,
    next_action: "BIND_PRODUCTION_ENDPOINT_ENV_THEN_RUN_READ_ONLY_ROUTE_INSPECTION",
  }, null, 2));
} catch (error) {
  const rollback = {
    endpoint_delete_attempted: false,
    endpoint_deleted: false,
    template_delete_attempted: false,
    template_deleted: false,
  };
  if (createdEndpointId) {
    rollback.endpoint_delete_attempted = true;
    try {
      await rest(`/endpoints/${encodeURIComponent(createdEndpointId)}`, managementKey, { method: "DELETE" });
      rollback.endpoint_deleted = true;
    } catch {
      rollback.endpoint_deleted = false;
    }
  }
  if (createdTemplateId) {
    rollback.template_delete_attempted = true;
    try {
      await rest(`/templates/${encodeURIComponent(createdTemplateId)}`, managementKey, { method: "DELETE" });
      rollback.template_deleted = true;
    } catch {
      rollback.template_deleted = false;
    }
  }
  console.error(JSON.stringify({
    success: false,
    contract: CONTRACT,
    mode: "APPLY",
    error: text(error?.message || error),
    rollback,
    generation_submitted: false,
    inference_performed: false,
    model_download_performed: false,
    image_endpoint_mutation_performed: false,
    safe_lease_changed: false,
    secrets_printed: false,
  }, null, 2));
  process.exitCode = 1;
}
