import { readFile } from "node:fs/promises";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const GRAPHQL_BASE = "https://api.runpod.io/graphql";
const CONTRACT = "AVANTIQO_VIDEO_PRODUCTION_ENDPOINT_PROVISION_V53";
const APPROVAL = "AVANTIQO_VIDEO_PRODUCTION_ENDPOINT_V53_APPROVED";
const CERTIFICATION_ENDPOINT_NAME = "avantiqo-cinema-v1";
const PRODUCTION_ENDPOINT_NAME = "avantiqo-cinema-production-v1";
const PRODUCTION_TEMPLATE_NAME = "avantiqo-cinema-production-v4";
const IMAGE_EVIDENCE_PATH = "audits/results/avantiqo-video-worker-image.json";
const EXPECTED_IMAGE_CONTRACT = "AVANTIQO_VIDEO_WORKER_IMAGE_RESULT_V2";
const EXPECTED_IMAGE_REVISION = "AVANTIQO_VIDEO_WORKER_IMAGE_V4_WAN22_CINEMA_QUALITY_V1";
const EXPECTED_ENTRYPOINT = "handler_v4.py";
const EXPECTED_RUNTIME_REVISION = "AVANTIQO_VIDEO_WAN22_A14B_CINEMA_QUALITY_V1";
const EXPECTED_QUALITY_CONTRACT = "AVANTIQO_VIDEO_WAN22_A14B_CINEMA_QUALITY_V1";
const WORKERS_MIN = 0;
const WORKERS_MAX = 1;
const ENDPOINTS_QUERY = `
query AvantiqoVideoProductionSource {
  myself {
    endpoints {
      id
      name
      templateId
      gpuIds
      gpuCount
      instanceIds
      workersMin
      workersMax
      locations
      networkVolumeId
      networkVolumeIds { networkVolumeId }
      idleTimeout
      scalerType
      scalerValue
      executionTimeoutMs
      minCudaVersion
      flashBootType
    }
  }
}`;
const GPU_POOLS_QUERY = `
query AvantiqoVideoProductionGpuPools {
  serverlessGpuPools { id gpuTypeIds }
}`;
const SAVE_ENDPOINT_MUTATION = `
mutation AvantiqoVideoProductionSaveEndpoint($input: EndpointInput!) {
  saveEndpoint(input: $input) {
    id
    name
    templateId
    gpuIds
    gpuCount
    workersMin
    workersMax
    networkVolumeId
    networkVolumeIds { networkVolumeId }
    locations
    minCudaVersion
    flashBootType
  }
}`;

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const yes = (value) => ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase());
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function redact(value) {
  return text(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]");
}

function required(name, fallback = "") {
  const value = text(process.env[name] || fallback);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function normalizeRows(value, keys = [], depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 4) return [];
  for (const key of [...keys, "data", "items", "results"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const nested = normalizeRows(value[key], keys, depth + 1);
    if (nested.length || Array.isArray(value[key])) return nested;
  }
  return [];
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

function volumeId(value) {
  return text(typeof value === "string" ? value : value?.networkVolumeId || value?.id);
}

function endpointVolumeIds(endpoint = {}) {
  return [...new Set([
    volumeId(endpoint.networkVolumeId),
    ...list(endpoint.networkVolumeIds).map(volumeId),
  ].filter(Boolean))];
}

function sameSet(left, right) {
  return JSON.stringify([...new Set(list(left).map(text).filter(Boolean))].sort()) ===
    JSON.stringify([...new Set(list(right).map(text).filter(Boolean))].sort());
}

function sameOrdered(left, right) {
  return JSON.stringify(list(left).map(text)) === JSON.stringify(list(right).map(text));
}

async function requestJson(url, credential, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${credential}`,
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 AvantiqoVideoV53",
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    throw new Error(`${CONTRACT}_HTTP_${response.status}:${redact(body?.message || body?.error || body?.detail || raw).slice(0, 1200)}`);
  }
  if (options.allowEmpty && !raw) return null;
  if (body === null && !options.allowEmpty) throw new Error(`${CONTRACT}_HTTP_${response.status}:INVALID_JSON`);
  return body;
}

const rest = (path, key, options = {}) => requestJson(`${REST_BASE}${path}`, key, options);
const queueHealth = (endpointId, key) => requestJson(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, key, { timeoutMs: 20_000 });

async function graphql(query, variables, key) {
  const url = `${GRAPHQL_BASE}?api_key=${encodeURIComponent(key)}`;
  const response = await requestJson(url, key, {
    method: "POST",
    body: { query, variables },
    timeoutMs: 30_000,
  });
  if (Array.isArray(response?.errors) && response.errors.length) {
    throw new Error(`${CONTRACT}_GRAPHQL:${redact(response.errors.map((entry) => entry?.message).join(" | ")).slice(0, 1200)}`);
  }
  return response;
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

function activeManagementWorkers(endpoint = {}) {
  return list(endpoint.workers).filter((worker) => {
    const desired = text(worker?.desiredStatus ?? worker?.desired_status).toUpperCase();
    const status = text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus).toUpperCase();
    const effective = desired || status;
    return Boolean(effective && !["EXITED", "STOPPED", "TERMINATED", "DELETED"].includes(effective));
  }).length;
}

function assertResting(label, endpoint, health) {
  const queue = queueSummary(health);
  const workerTotal = Object.values(queue.workers).reduce((sum, value) => sum + finite(value, 0), 0);
  const management = activeManagementWorkers(endpoint);
  if (queue.jobs.in_queue !== 0 || queue.jobs.in_progress !== 0 || workerTotal !== 0 || management !== 0) {
    throw new Error(`${label}_NOT_RESTING:queue=${queue.jobs.in_queue}:progress=${queue.jobs.in_progress}:workers=${workerTotal}:management=${management}`);
  }
  return { queue, management_non_exited_workers: management };
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

function templateBody(baseTemplate, imageName) {
  const body = {
    containerDiskInGb: Math.max(1, finite(baseTemplate?.containerDiskInGb, 5)),
    dockerEntrypoint: list(baseTemplate?.dockerEntrypoint),
    dockerStartCmd: list(baseTemplate?.dockerStartCmd),
    env: normalizeEnv(baseTemplate?.env),
    imageName,
    isPublic: false,
    isServerless: true,
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

function templateContract(template = {}) {
  return JSON.stringify({
    imageName: text(template.imageName),
    containerDiskInGb: finite(template.containerDiskInGb, 0),
    containerRegistryAuthId: text(template.containerRegistryAuthId),
    dockerEntrypoint: list(template.dockerEntrypoint),
    dockerStartCmd: list(template.dockerStartCmd),
    env: normalizeEnv(template.env),
    isPublic: template.isPublic === true,
    ports: list(template.ports),
    volumeInGb: finite(template.volumeInGb, 0),
    volumeMountPath: text(template.volumeMountPath),
  });
}

async function imageEvidence() {
  const evidence = JSON.parse(await readFile(IMAGE_EVIDENCE_PATH, "utf8"));
  const valid =
    evidence?.success === true &&
    text(evidence?.contract) === EXPECTED_IMAGE_CONTRACT &&
    text(evidence?.evidence_revision) === EXPECTED_IMAGE_REVISION &&
    evidence?.source_sha_matches_trigger === true &&
    text(evidence?.source_sha) === text(evidence?.trigger_sha) &&
    text(evidence?.entrypoint) === EXPECTED_ENTRYPOINT &&
    text(evidence?.runtime_revision) === EXPECTED_RUNTIME_REVISION &&
    text(evidence?.quality_contract) === EXPECTED_QUALITY_CONTRACT &&
    evidence?.native_720p_dimensions === true &&
    finite(evidence?.minimum_cinema_fps, 0) >= 16 &&
    finite(evidence?.t2v_inference_steps, 0) >= 40 &&
    text(evidence?.vae_decode_dtype) === "float32" &&
    text(evidence?.diffusion_dtype) === "bfloat16" &&
    finite(evidence?.cinema_export_quality, 0) >= 9;
  if (!valid) throw new Error(`${CONTRACT}_V4_IMAGE_EVIDENCE_INVALID`);
  const image = text(evidence?.immutable_image_reference);
  if (!/^ghcr\.io\/churchillkaron\/avantiqo-video-worker@sha256:[a-f0-9]{64}$/i.test(image)) {
    throw new Error(`${CONTRACT}_IMMUTABLE_IMAGE_INVALID`);
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

function resolveOne(rows, predicate, label) {
  const matches = rows.filter(predicate);
  if (matches.length !== 1) throw new Error(`${label}:matches=${matches.length}`);
  return matches[0];
}

function resolveTemplate(endpoint, templates, label) {
  const id = text(endpoint?.templateId || endpoint?.template?.id);
  if (!id) throw new Error(`${label}_TEMPLATE_ID_REQUIRED`);
  return resolveOne(templates, (template) => text(template?.id) === id, `${label}_TEMPLATE_RESOLUTION_FAILED`);
}

async function graphqlEndpoints(key) {
  const response = await graphql(ENDPOINTS_QUERY, {}, key);
  return list(response?.data?.myself?.endpoints);
}

async function resolveGpuIds(sourceGraphql, sourceRest, key) {
  const existing = text(sourceGraphql?.gpuIds);
  if (existing) return existing;
  const gpuTypes = list(sourceRest?.gpuTypeIds).map(text).filter(Boolean);
  if (!gpuTypes.length) throw new Error(`${CONTRACT}_GPU_TYPES_REQUIRED`);
  const response = await graphql(GPU_POOLS_QUERY, {}, key);
  const pools = list(response?.data?.serverlessGpuPools);
  const ids = [];
  for (const gpuType of gpuTypes) {
    const pool = pools.find((entry) => list(entry?.gpuTypeIds).map(text).includes(gpuType));
    const id = text(pool?.id);
    if (!id) throw new Error(`${CONTRACT}_GPU_POOL_RESOLUTION_FAILED:${gpuType}`);
    if (!ids.includes(id)) ids.push(id);
  }
  return ids.join(",");
}

function productionInput(sourceGraphql, sourceRest, templateId, gpuIds) {
  const input = {
    name: PRODUCTION_ENDPOINT_NAME,
    templateId,
    gpuIds,
    gpuCount: Math.max(1, finite(sourceGraphql?.gpuCount ?? sourceRest?.gpuCount, 1)),
    workersMin: WORKERS_MIN,
    workersMax: WORKERS_MAX,
  };
  const instanceIds = list(sourceGraphql?.instanceIds).map(text).filter(Boolean);
  if (instanceIds.length) input.instanceIds = instanceIds;
  const locations = text(sourceGraphql?.locations);
  if (locations) input.locations = locations;
  const volumes = endpointVolumeIds(sourceRest);
  if (!volumes.length) throw new Error(`${CONTRACT}_CACHE_VOLUMES_REQUIRED`);
  input.networkVolumeIds = volumes.map((networkVolumeId) => ({ networkVolumeId }));
  const primary = text(sourceGraphql?.networkVolumeId);
  if (primary) input.networkVolumeId = primary;
  const idleTimeout = finite(sourceGraphql?.idleTimeout ?? sourceRest?.idleTimeout);
  if (idleTimeout !== null && idleTimeout > 0) input.idleTimeout = idleTimeout;
  const scalerType = text(sourceGraphql?.scalerType || sourceRest?.scalerType);
  if (scalerType) input.scalerType = scalerType;
  const scalerValue = finite(sourceGraphql?.scalerValue ?? sourceRest?.scalerValue);
  if (scalerValue !== null && scalerValue > 0) input.scalerValue = scalerValue;
  const executionTimeoutMs = finite(sourceGraphql?.executionTimeoutMs ?? sourceRest?.executionTimeoutMs);
  if (executionTimeoutMs !== null && executionTimeoutMs >= 0) input.executionTimeoutMs = executionTimeoutMs;
  const minCudaVersion = text(sourceGraphql?.minCudaVersion || sourceRest?.minCudaVersion);
  if (minCudaVersion) input.minCudaVersion = minCudaVersion;
  input.flashBootType = text(sourceGraphql?.flashBootType) || "FLASHBOOT";
  return input;
}

async function fetchEndpointEventually(endpointId, key) {
  let lastError = null;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      return await rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, key);
    } catch (error) {
      lastError = error;
      await sleep(500);
    }
  }
  throw lastError || new Error(`${CONTRACT}_ENDPOINT_PROPAGATION_FAILED`);
}

async function healthEventually(endpointId, key) {
  let lastError = null;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      return await queueHealth(endpointId, key);
    } catch (error) {
      lastError = error;
      await sleep(500);
    }
  }
  throw lastError || new Error(`${CONTRACT}_QUEUE_PROPAGATION_FAILED`);
}

function assertProductionEndpoint(candidate, certification, templateId) {
  if (text(candidate?.name) !== PRODUCTION_ENDPOINT_NAME) throw new Error(`${CONTRACT}_NAME_INVALID`);
  if (text(candidate?.templateId || candidate?.template?.id) !== templateId) throw new Error(`${CONTRACT}_TEMPLATE_INVALID`);
  if (finite(candidate?.workersMin, -1) !== WORKERS_MIN || finite(candidate?.workersMax, -1) !== WORKERS_MAX) {
    throw new Error(`${CONTRACT}_SCALING_INVALID:${finite(candidate?.workersMin)}/${finite(candidate?.workersMax)}`);
  }
  if (!sameOrdered(candidate?.gpuTypeIds, certification?.gpuTypeIds)) throw new Error(`${CONTRACT}_GPU_PRIORITY_DRIFT`);
  if (!sameSet(endpointVolumeIds(candidate), endpointVolumeIds(certification))) throw new Error(`${CONTRACT}_CACHE_VOLUME_DRIFT`);
  if (!sameSet(candidate?.allowedCudaVersions, certification?.allowedCudaVersions)) throw new Error(`${CONTRACT}_CUDA_DRIFT`);
}

const apply = process.argv.includes("--apply");
if (apply && !yes(process.env[APPROVAL])) throw new Error(`${APPROVAL}=YES_REQUIRED`);

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
const runtimeKey = required("RUNPOD_AVANTIQO_VIDEO_API_KEY", process.env.RUNPOD_API_KEY || managementKey);
const certificationId = required("RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID");
const image = await imageEvidence();

const [rawEndpoints, rawTemplates, gqlEndpoints] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", managementKey),
  graphqlEndpoints(managementKey),
]);
const endpoints = normalizeRows(rawEndpoints, ["endpoints", "serverlessEndpoints"]);
const templates = normalizeRows(rawTemplates, ["templates"]);
if (!endpoints.length || !templates.length) throw new Error(`${CONTRACT}_INVENTORY_INVALID`);

const certification = resolveOne(
  endpoints,
  (entry) => text(entry?.id) === certificationId && text(entry?.name) === CERTIFICATION_ENDPOINT_NAME,
  `${CONTRACT}_CERTIFICATION_ENDPOINT_RESOLUTION_FAILED`,
);
const certificationGraphql = resolveOne(
  gqlEndpoints,
  (entry) => text(entry?.id) === certificationId && text(entry?.name) === CERTIFICATION_ENDPOINT_NAME,
  `${CONTRACT}_CERTIFICATION_GRAPHQL_RESOLUTION_FAILED`,
);
const certificationTemplate = resolveTemplate(certification, templates, `${CONTRACT}_CERTIFICATION`);
if (finite(certification?.workersMin, -1) !== 0 || finite(certification?.workersMax, -1) !== 0) {
  throw new Error(`${CONTRACT}_CERTIFICATION_0_0_REQUIRED`);
}
if (text(certificationTemplate?.imageName) !== image.image) throw new Error(`${CONTRACT}_CERTIFICATION_V4_IMAGE_REQUIRED`);
const certificationHealth = await queueHealth(certificationId, runtimeKey);
assertResting(`${CONTRACT}_CERTIFICATION`, certification, certificationHealth);

const gpuIds = await resolveGpuIds(certificationGraphql, certification, managementKey);
const desiredTemplate = templateBody(certificationTemplate, image.image);
const templateMatches = templates.filter((entry) => text(entry?.name) === PRODUCTION_TEMPLATE_NAME);
if (templateMatches.length > 1) throw new Error(`${CONTRACT}_TEMPLATE_AMBIGUOUS:${templateMatches.length}`);
let productionTemplate = templateMatches[0] || null;
if (productionTemplate) {
  const normalizedExisting = { ...productionTemplate, readme: desiredTemplate.readme };
  if (templateContract(normalizedExisting) !== templateContract(desiredTemplate)) {
    throw new Error(`${CONTRACT}_EXISTING_TEMPLATE_MISMATCH`);
  }
}

const endpointMatches = endpoints.filter((entry) => text(entry?.name) === PRODUCTION_ENDPOINT_NAME);
if (endpointMatches.length > 1) throw new Error(`${CONTRACT}_ENDPOINT_AMBIGUOUS:${endpointMatches.length}`);
const allowedCudaVersions = list(certification?.allowedCudaVersions).map(text).filter(Boolean);
if (!sameSet(allowedCudaVersions, ["12.8", "12.9", "13.0"])) {
  throw new Error(`${CONTRACT}_CERTIFICATION_CUDA_CONTRACT_UNEXPECTED:${JSON.stringify(allowedCudaVersions)}`);
}
const plannedInput = productionInput(certificationGraphql, certification, text(productionTemplate?.id || "PENDING_TEMPLATE_ID"), gpuIds);

if (endpointMatches[0]) {
  if (!productionTemplate) productionTemplate = resolveTemplate(endpointMatches[0], templates, `${CONTRACT}_EXISTING_PRODUCTION`);
  assertProductionEndpoint(endpointMatches[0], certification, text(productionTemplate.id));
  const liveHealth = await queueHealth(text(endpointMatches[0].id), runtimeKey);
  const restState = assertResting(`${CONTRACT}_EXISTING_PRODUCTION`, endpointMatches[0], liveHealth);
  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    mode: apply ? "APPLY" : "PLAN",
    production_endpoint_exists: true,
    production_endpoint: safeEndpoint(endpointMatches[0]),
    production_template: safeTemplate(productionTemplate),
    immutable_image: image,
    zero_idle_cost_contract: true,
    idle_gpu_cost_usd_per_hour: 0,
    resting_state: restState,
    graphql_multi_volume_objects_verified: true,
    env_binding: `RUNPOD_AVANTIQO_VIDEO_PRODUCTION_ENDPOINT_ID=${text(endpointMatches[0].id)}`,
    mutation_performed: false,
    generation_submitted: false,
    inference_performed: false,
    model_download_performed: false,
    safe_lease_changed: false,
    image_endpoint_mutated: false,
    next_action: "BIND_PRODUCTION_ENDPOINT_ENV_AND_RUN_READ_ONLY_ROUTE_INSPECTION",
  }, null, 2));
  process.exit(0);
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  production_endpoint_exists: false,
  production_template_exists: Boolean(productionTemplate),
  certification_endpoint: safeEndpoint(certification),
  immutable_image: image,
  production_endpoint_name: PRODUCTION_ENDPOINT_NAME,
  production_template_name: PRODUCTION_TEMPLATE_NAME,
  workers_min: WORKERS_MIN,
  workers_max: WORKERS_MAX,
  gpu_type_ids: list(certification?.gpuTypeIds).map(text).filter(Boolean),
  gpu_pool_ids_present: Boolean(gpuIds),
  allowed_cuda_versions: allowedCudaVersions,
  network_volume_ids: endpointVolumeIds(certification),
  graphql_network_volume_input: plannedInput.networkVolumeIds,
  source_locations_present: Boolean(text(certificationGraphql?.locations)),
  zero_idle_cost_contract: true,
  idle_gpu_cost_usd_per_hour_expected: 0,
  mutation_performed: false,
  generation_submitted: false,
  inference_performed: false,
  model_download_performed: false,
  safe_lease_changed: false,
  image_endpoint_mutated: false,
  next_action: apply ? "CREATE_TEMPLATE_AND_GRAPHQL_PRODUCTION_ENDPOINT" : "APPROVE_V53_PROVISION",
}, null, 2));

if (!apply) process.exit(0);

let createdTemplateId = "";
let createdEndpointId = "";
try {
  if (!productionTemplate) {
    productionTemplate = await rest("/templates", managementKey, {
      method: "POST",
      body: desiredTemplate,
    });
    createdTemplateId = text(productionTemplate?.id);
    if (!createdTemplateId) throw new Error(`${CONTRACT}_CREATED_TEMPLATE_ID_REQUIRED`);
  }
  const productionTemplateId = text(productionTemplate?.id);
  if (!productionTemplateId) throw new Error(`${CONTRACT}_TEMPLATE_ID_REQUIRED`);

  const freshRaw = await rest("/endpoints?includeTemplate=false&includeWorkers=true", managementKey);
  const freshEndpoints = normalizeRows(freshRaw, ["endpoints", "serverlessEndpoints"]);
  if (freshEndpoints.some((entry) => text(entry?.name) === PRODUCTION_ENDPOINT_NAME)) {
    throw new Error(`${CONTRACT}_ENDPOINT_APPEARED_REPLAN_REQUIRED`);
  }

  const input = productionInput(certificationGraphql, certification, productionTemplateId, gpuIds);
  const saved = await graphql(SAVE_ENDPOINT_MUTATION, { input }, managementKey);
  createdEndpointId = text(saved?.data?.saveEndpoint?.id);
  if (!createdEndpointId) throw new Error(`${CONTRACT}_GRAPHQL_CREATE_ID_REQUIRED`);

  await rest(`/endpoints/${encodeURIComponent(createdEndpointId)}`, managementKey, {
    method: "PATCH",
    body: { allowedCudaVersions },
  });

  const verified = await fetchEndpointEventually(createdEndpointId, managementKey);
  assertProductionEndpoint(verified, certification, productionTemplateId);
  const verifiedTemplate = object(verified?.template);
  if (Object.keys(verifiedTemplate).length && text(verifiedTemplate.imageName) !== image.image) {
    throw new Error(`${CONTRACT}_VERIFIED_IMAGE_MISMATCH`);
  }
  const verifiedHealth = await healthEventually(createdEndpointId, runtimeKey);
  const restState = assertResting(`${CONTRACT}_PRODUCTION`, verified, verifiedHealth);

  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    mode: "APPLY",
    production_endpoint_exists: true,
    production_endpoint: safeEndpoint(verified),
    production_template: safeTemplate(Object.keys(verifiedTemplate).length ? verifiedTemplate : productionTemplate),
    immutable_image: image,
    template_created: Boolean(createdTemplateId),
    endpoint_created: true,
    creation_transport: "RUNPOD_GRAPHQL_SAVE_ENDPOINT",
    network_volume_input_shape: "OBJECTS",
    cuda_patch_transport: "RUNPOD_REST_PATCH",
    zero_idle_cost_contract: true,
    idle_worker_count: 0,
    idle_gpu_cost_usd_per_hour: 0,
    resting_state: restState,
    env_binding: `RUNPOD_AVANTIQO_VIDEO_PRODUCTION_ENDPOINT_ID=${createdEndpointId}`,
    mutation_performed: true,
    rollback_performed: false,
    generation_submitted: false,
    inference_performed: false,
    model_download_performed: false,
    safe_lease_changed: false,
    image_endpoint_mutated: false,
    secrets_printed: false,
    next_action: "BIND_PRODUCTION_ENDPOINT_ENV_AND_RUN_READ_ONLY_ROUTE_INSPECTION",
  }, null, 2));
  console.log("AVANTIQO_VIDEO_PRODUCTION_ENDPOINT_V53=PASS");
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
      await rest(`/endpoints/${encodeURIComponent(createdEndpointId)}`, managementKey, { method: "DELETE", allowEmpty: true });
      rollback.endpoint_deleted = true;
    } catch {}
  }
  if (createdTemplateId) {
    rollback.template_delete_attempted = true;
    try {
      await rest(`/templates/${encodeURIComponent(createdTemplateId)}`, managementKey, { method: "DELETE", allowEmpty: true });
      rollback.template_deleted = true;
    } catch {}
  }
  console.error(JSON.stringify({
    success: false,
    contract: CONTRACT,
    mode: "APPLY",
    error: redact(error?.message || error),
    rollback,
    generation_submitted: false,
    inference_performed: false,
    model_download_performed: false,
    safe_lease_changed: false,
    image_endpoint_mutated: false,
    secrets_printed: false,
  }, null, 2));
  process.exitCode = 1;
}
