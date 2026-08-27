import { spawnSync } from "node:child_process";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const GRAPHQL_URL = "https://api.runpod.io/graphql";
const CONTRACT = "AVANTIQO_INTELLIGENCE_DEEP_EAGER_CANDIDATE_V1";
const DEEP_NAME = "avantiqo-intelligence-v1";
const CANDIDATE_NAME = "avantiqo-intelligence-deep-eager-candidate-v1";
const CANDIDATE_TEMPLATE_NAME = "avantiqo-intelligence-deep-eager-candidate-v1";
const APPROVAL_ENV = "AVANTIQO_INTELLIGENCE_DEEP_EAGER_CANDIDATE_APPROVED";
const EXPECTED_MAIN_ENV = "AVANTIQO_INTELLIGENCE_DEEP_EAGER_CANDIDATE_EXPECTED_MAIN";
const EAGER_KEY = "ENFORCE_EAGER";

const text = (value, limit = 6000) => String(value ?? "").trim().slice(0, limit);
const list = (value) => (Array.isArray(value) ? value : []);
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const yes = (value) => ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value, 40).toUpperCase());

function redact(value) {
  return text(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/([?&](?:token|key|api_key|apikey|sig|signature)=)[^&\s]+/gi, "$1[REDACTED]");
}

function shell(name, args, code) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) throw new Error(`${code}:${redact(result.stderr || result.stdout).slice(0, 900)}`);
  return text(result.stdout, 1000);
}

function validateRemoteMain() {
  const branch = shell("git", ["branch", "--show-current"], `${CONTRACT}_GIT_BRANCH_FAILED`);
  if (branch !== "main") throw new Error(`${CONTRACT}_MAIN_REQUIRED:${branch || "DETACHED"}`);
  shell("git", ["fetch", "origin", "main"], `${CONTRACT}_GIT_FETCH_FAILED`);
  const remote = shell("git", ["rev-parse", "origin/main"], `${CONTRACT}_GIT_REMOTE_FAILED`);
  const expected = text(process.env[EXPECTED_MAIN_ENV], 80);
  if (expected && !/^[0-9a-f]{40}$/i.test(expected)) throw new Error(`${CONTRACT}_EXPECTED_MAIN_INVALID`);
  if (expected && remote !== expected) throw new Error(`${CONTRACT}_REMOTE_MAIN_MOVED:expected=${expected}:actual=${remote}`);
  return remote;
}

function managementKey() {
  const key = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY, 2000);
  if (!key) throw new Error("RUNPOD_MANAGEMENT_OR_API_KEY_REQUIRED");
  return key;
}

function runtimeKey(management) {
  return text(process.env.RUNPOD_API_KEY || management, 2000);
}

async function requestJson(url, key, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    const detail = redact(body?.message || body?.error || body?.detail || raw).slice(0, 900);
    throw new Error(`${CONTRACT}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  if (options.allowEmpty && !raw) return null;
  if (body === null && !options.allowEmpty) throw new Error(`${CONTRACT}_HTTP_${response.status}:INVALID_JSON`);
  return body;
}

async function rest(path, key, options = {}) {
  return requestJson(`${REST_BASE}${path}`, key, options);
}

async function graphql(query, variables, key) {
  const response = await requestJson(GRAPHQL_URL, key, {
    method: "POST",
    body: { query, variables },
  });
  if (Array.isArray(response?.errors) && response.errors.length) {
    throw new Error(`${CONTRACT}_GRAPHQL:${redact(response.errors.map((entry) => entry?.message).join(" | ")).slice(0, 900)}`);
  }
  return response;
}

async function health(endpointId, key) {
  return requestJson(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, key, { timeoutMs: 20_000 });
}

function rows(value, keys = []) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  for (const key of [...keys, "data", "items", "results"]) if (Array.isArray(value[key])) return value[key];
  return [];
}

function resolveOne(items, name, code) {
  const matches = rows(items).filter((entry) => text(entry?.name, 300) === name);
  if (matches.length !== 1) throw new Error(`${code}:name=${name}:matches=${matches.length}`);
  return matches[0];
}

function templateId(endpoint = {}) {
  return text(endpoint?.templateId || endpoint?.template?.id, 300);
}

function activeManagementWorkers(endpoint = {}) {
  return list(endpoint?.workers).filter((worker) => {
    const status = text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus, 80).toUpperCase();
    const desired = text(worker?.desiredStatus ?? worker?.desired_status, 80).toUpperCase();
    const terminal = new Set(["EXITED", "STOPPED", "TERMINATED", "DELETED"]);
    if (status && !terminal.has(status)) return true;
    if (desired && !terminal.has(desired)) return true;
    return !status && !desired;
  }).length;
}

function healthSummary(raw = {}) {
  const jobs = object(raw?.jobs);
  const workers = object(raw?.workers);
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

function workerTotal(summary) {
  return Object.values(summary.workers).reduce((sum, value) => sum + finite(value, 0), 0);
}

function assertParked(endpoint, summary, code) {
  if (
    finite(endpoint?.workersMin, -1) !== 0 ||
    finite(endpoint?.workersMax, -1) !== 0 ||
    summary.jobs.in_queue !== 0 ||
    summary.jobs.in_progress !== 0 ||
    workerTotal(summary) !== 0 ||
    activeManagementWorkers(endpoint) !== 0
  ) {
    throw new Error(
      `${code}:min=${finite(endpoint?.workersMin, -1)}:max=${finite(endpoint?.workersMax, -1)}:queue=${summary.jobs.in_queue}:progress=${summary.jobs.in_progress}:workers=${workerTotal(summary)}:management=${activeManagementWorkers(endpoint)}`,
    );
  }
}

function envMap(value) {
  const pairs = Array.isArray(value)
    ? value.map((entry) => [text(entry?.key || entry?.name, 300), String(entry?.value ?? "")])
    : Object.entries(object(value)).map(([key, entryValue]) => [text(key, 300), String(entryValue ?? "")]);
  return Object.fromEntries(pairs.filter(([key]) => key).sort(([left], [right]) => left.localeCompare(right)));
}

function envWithEager(value) {
  const source = envMap(value);
  return { ...source, [EAGER_KEY]: "true" };
}

function command(value) {
  return (Array.isArray(value) ? value : [value]).map((entry) => text(entry, 3000)).filter(Boolean);
}

function runtime(template = {}) {
  return {
    image_name: text(template?.imageName, 1200),
    container_disk_gb: finite(template?.containerDiskInGb, 0),
    docker_entrypoint: command(template?.dockerEntrypoint),
    docker_start_cmd: command(template?.dockerStartCmd),
    env: envMap(template?.env),
    ports: list(template?.ports),
    volume_gb: finite(template?.volumeInGb, 0),
    volume_mount_path: text(template?.volumeMountPath, 1000) || "/workspace",
    registry_auth_id: text(template?.containerRegistryAuthId, 500),
    is_public: template?.isPublic === true,
  };
}

function assertOneVariableEager(sourceTemplate, candidateTemplate, code) {
  const source = runtime(sourceTemplate);
  const candidate = runtime(candidateTemplate);
  if (!source.image_name || candidate.image_name !== source.image_name) throw new Error(`${code}_IMAGE_DRIFT`);
  for (const field of [
    "container_disk_gb",
    "docker_entrypoint",
    "docker_start_cmd",
    "ports",
    "volume_gb",
    "volume_mount_path",
    "registry_auth_id",
    "is_public",
  ]) {
    if (JSON.stringify(candidate[field]) !== JSON.stringify(source[field])) throw new Error(`${code}_${field.toUpperCase()}_DRIFT`);
  }
  if (text(source.env[EAGER_KEY], 40).toLowerCase() === "true") {
    throw new Error(`${code}_SOURCE_ALREADY_EAGER`);
  }
  if (text(candidate.env[EAGER_KEY], 40).toLowerCase() !== "true") throw new Error(`${code}_EAGER_TRUE_REQUIRED`);
  const keys = [...new Set([...Object.keys(source.env), ...Object.keys(candidate.env)])].sort();
  const drift = keys.filter((key) => key !== EAGER_KEY && source.env[key] !== candidate.env[key]);
  const extra = keys.filter((key) => key !== EAGER_KEY && !(key in source.env));
  const missing = keys.filter((key) => key !== EAGER_KEY && !(key in candidate.env));
  if (drift.length || extra.length || missing.length) {
    throw new Error(`${code}_ENV_DRIFT:drift=${drift.join(",")}:extra=${extra.join(",")}:missing=${missing.join(",")}`);
  }
  return {
    only_runtime_difference: EAGER_KEY,
    source_eager_value_present: Object.prototype.hasOwnProperty.call(source.env, EAGER_KEY),
    source_eager_enabled: false,
    candidate_eager_enabled: true,
  };
}

function templateBodyFromDeep(source = {}) {
  const body = {
    imageName: text(source?.imageName, 1200),
    name: CANDIDATE_TEMPLATE_NAME,
    category: text(source?.category, 300) || "NVIDIA",
    containerDiskInGb: Math.max(10, finite(source?.containerDiskInGb, 30)),
    dockerEntrypoint: command(source?.dockerEntrypoint),
    dockerStartCmd: command(source?.dockerStartCmd),
    env: envWithEager(source?.env),
    isPublic: source?.isPublic === true,
    isServerless: true,
    ports: list(source?.ports),
    readme: "Avantiqo Deep Intelligence cold-start diagnostic candidate. Exact Deep runtime with ENFORCE_EAGER=true only; never production routing.",
    volumeInGb: Math.max(0, finite(source?.volumeInGb, 0)),
    volumeMountPath: text(source?.volumeMountPath, 1000) || "/workspace",
    ...(text(source?.containerRegistryAuthId, 500) ? { containerRegistryAuthId: text(source.containerRegistryAuthId, 500) } : {}),
  };
  assertOneVariableEager(source, body, `${CONTRACT}_DESIRED_TEMPLATE`);
  return body;
}

function endpointPlacementSignature(endpoint = {}) {
  return {
    template_id: templateId(endpoint),
    compute_type: text(endpoint?.computeType, 200),
    gpu_count: finite(endpoint?.gpuCount),
    gpu_type_ids: list(endpoint?.gpuTypeIds).map((value) => text(value, 300)).filter(Boolean),
    data_center_ids: list(endpoint?.dataCenterIds).map((value) => text(value, 300)).filter(Boolean),
    network_volume_id: text(endpoint?.networkVolumeId, 300),
    network_volume_ids: list(endpoint?.networkVolumeIds).map((entry) => text(typeof entry === "string" ? entry : entry?.networkVolumeId || entry?.id, 300)).filter(Boolean),
    idle_timeout: finite(endpoint?.idleTimeout),
    scaler_type: text(endpoint?.scalerType, 200),
    scaler_value: finite(endpoint?.scalerValue),
    execution_timeout_ms: finite(endpoint?.executionTimeoutMs),
    minimum_cuda_version: text(endpoint?.minCudaVersion, 200),
    flashboot: endpoint?.flashboot !== false,
  };
}

const ENDPOINTS_QUERY = `
query AvantiqoDeepEagerCandidateSource {
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
query AvantiqoDeepEagerCandidateGpuPools {
  serverlessGpuPools {
    id
    gpuTypeIds
  }
}`;

const CREATE_MUTATION = `
mutation AvantiqoDeepEagerCandidateSaveEndpoint($input: EndpointInput!) {
  saveEndpoint(input: $input) {
    id
    name
    templateId
    gpuIds
    gpuCount
    workersMin
    workersMax
    flashBootType
  }
}`;

async function graphqlEndpoints(key) {
  const response = await graphql(ENDPOINTS_QUERY, {}, key);
  return list(response?.data?.myself?.endpoints);
}

async function resolveGpuIds(sourceGraphql, sourceRest, key) {
  const existing = text(sourceGraphql?.gpuIds, 1000);
  if (existing) return existing;
  const gpuTypeIds = list(sourceRest?.gpuTypeIds).map((value) => text(value, 300)).filter(Boolean);
  if (!gpuTypeIds.length) throw new Error(`${CONTRACT}_GPU_TYPE_IDS_REQUIRED`);
  const response = await graphql(GPU_POOLS_QUERY, {}, key);
  const pools = list(response?.data?.serverlessGpuPools);
  const ids = [];
  for (const gpuTypeId of gpuTypeIds) {
    const pool = pools.find((entry) => list(entry?.gpuTypeIds).map((value) => text(value, 300)).includes(gpuTypeId));
    const id = text(pool?.id, 300);
    if (!id) throw new Error(`${CONTRACT}_GPU_POOL_RESOLUTION_FAILED:${gpuTypeId}`);
    if (!ids.includes(id)) ids.push(id);
  }
  return ids.join(",");
}

function networkVolumeIdsGraphql(endpoint = {}) {
  return list(endpoint?.networkVolumeIds)
    .map((entry) => text(typeof entry === "string" ? entry : entry?.networkVolumeId || entry?.id, 300))
    .filter(Boolean)
    .map((networkVolumeId) => ({ networkVolumeId }));
}

function createEndpointInput(source, candidateTemplateId, gpuIds) {
  const input = {
    name: CANDIDATE_NAME,
    templateId: candidateTemplateId,
    gpuIds,
    gpuCount: Math.max(1, finite(source?.gpuCount, 1)),
    workersMin: 0,
    workersMax: 0,
  };
  const instanceIds = list(source?.instanceIds).map((value) => text(value, 300)).filter(Boolean);
  if (instanceIds.length) input.instanceIds = instanceIds;
  const locations = text(source?.locations, 1000);
  if (locations) input.locations = locations;
  const volumeId = text(source?.networkVolumeId, 300);
  if (volumeId) input.networkVolumeId = volumeId;
  const volumeIds = networkVolumeIdsGraphql(source);
  if (volumeIds.length) input.networkVolumeIds = volumeIds;
  const idleTimeout = finite(source?.idleTimeout);
  if (idleTimeout !== null && idleTimeout > 0) input.idleTimeout = idleTimeout;
  const scalerType = text(source?.scalerType, 200);
  if (scalerType) input.scalerType = scalerType;
  const scalerValue = finite(source?.scalerValue);
  if (scalerValue !== null && scalerValue > 0) input.scalerValue = scalerValue;
  const executionTimeoutMs = finite(source?.executionTimeoutMs);
  if (executionTimeoutMs !== null && executionTimeoutMs >= 0) input.executionTimeoutMs = executionTimeoutMs;
  const minCudaVersion = text(source?.minCudaVersion, 200);
  if (minCudaVersion) input.minCudaVersion = minCudaVersion;
  input.flashBootType = text(source?.flashBootType, 200) || "FLASHBOOT";
  return input;
}

async function deleteEndpoint(endpointId, key) {
  await rest(`/endpoints/${encodeURIComponent(endpointId)}`, key, { method: "DELETE", allowEmpty: true });
}

async function deleteTemplate(templateIdValue, key) {
  await rest(`/templates/${encodeURIComponent(templateIdValue)}`, key, { method: "DELETE", allowEmpty: true });
}

async function candidateState(endpointId, management, queueKey) {
  const [endpoint, rawHealth] = await Promise.all([
    rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, management),
    health(endpointId, queueKey),
  ]);
  const summary = healthSummary(rawHealth);
  assertParked(endpoint, summary, `${CONTRACT}_CANDIDATE_NOT_PARKED`);
  return { endpoint, health: summary };
}

function safeEndpoint(endpoint = {}) {
  return {
    present: Boolean(text(endpoint?.id, 300)),
    name: text(endpoint?.name, 300) || null,
    template_id_present: Boolean(templateId(endpoint)),
    gpu_count: finite(endpoint?.gpuCount),
    gpu_type_ids: list(endpoint?.gpuTypeIds).map((value) => text(value, 300)).filter(Boolean),
    workers_min: finite(endpoint?.workersMin),
    workers_max: finite(endpoint?.workersMax),
    active_management_workers: activeManagementWorkers(endpoint),
  };
}

const apply = process.argv.includes("--apply");
if (apply && !yes(process.env[APPROVAL_ENV])) throw new Error(`${APPROVAL_ENV}=YES_REQUIRED`);
const mainCommit = validateRemoteMain();
const mKey = managementKey();
const qKey = runtimeKey(mKey);

const [endpointsRaw, templatesRaw, gqlRows] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", mKey),
  rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", mKey),
  graphqlEndpoints(mKey),
]);
const endpoints = rows(endpointsRaw, ["endpoints", "serverlessEndpoints"]);
const templates = rows(templatesRaw, ["templates"]);
const deep = resolveOne(endpoints, DEEP_NAME, `${CONTRACT}_DEEP_REST_RESOLUTION_FAILED`);
const deepGraphql = resolveOne(gqlRows, DEEP_NAME, `${CONTRACT}_DEEP_GRAPHQL_RESOLUTION_FAILED`);
const deepTemplateId = templateId(deep);
const deepTemplate = templates.find((item) => text(item?.id, 300) === deepTemplateId) || deep?.template;
if (!deepTemplateId || !deepTemplate) throw new Error(`${CONTRACT}_DEEP_TEMPLATE_REQUIRED`);
const deepHealth = healthSummary(await health(text(deep?.id, 300), qKey));
assertParked(deep, deepHealth, `${CONTRACT}_DEEP_SOURCE_MUST_BE_PARKED_0_0`);

const desiredTemplate = templateBodyFromDeep(deepTemplate);
const desiredProof = assertOneVariableEager(deepTemplate, desiredTemplate, `${CONTRACT}_DESIRED_TEMPLATE`);
const deepRuntimeBefore = runtime(deepTemplate);
const deepPlacementBefore = endpointPlacementSignature(deep);
const gpuIds = await resolveGpuIds(deepGraphql, deep, mKey);

const existingEndpoints = endpoints.filter((entry) => text(entry?.name, 300) === CANDIDATE_NAME);
if (existingEndpoints.length > 1) throw new Error(`${CONTRACT}_MULTIPLE_CANDIDATE_ENDPOINTS:${existingEndpoints.length}`);
const existingTemplates = templates.filter((entry) => text(entry?.name, 300) === CANDIDATE_TEMPLATE_NAME);
if (existingTemplates.length > 1) throw new Error(`${CONTRACT}_MULTIPLE_CANDIDATE_TEMPLATES:${existingTemplates.length}`);

let existingCandidate = null;
let existingProof = null;
if (existingEndpoints[0]) {
  const state = await candidateState(text(existingEndpoints[0]?.id, 300), mKey, qKey);
  const candidateTemplateId = templateId(state.endpoint);
  const candidateTemplate = templates.find((item) => text(item?.id, 300) === candidateTemplateId) || state.endpoint?.template;
  if (!candidateTemplate) throw new Error(`${CONTRACT}_EXISTING_CANDIDATE_TEMPLATE_REQUIRED`);
  existingProof = assertOneVariableEager(deepTemplate, candidateTemplate, `${CONTRACT}_EXISTING_CANDIDATE`);
  existingCandidate = state;
}
if (existingTemplates[0]) {
  assertOneVariableEager(deepTemplate, existingTemplates[0], `${CONTRACT}_EXISTING_TEMPLATE`);
}
if (existingCandidate && existingTemplates[0] && templateId(existingCandidate.endpoint) !== text(existingTemplates[0]?.id, 300)) {
  throw new Error(`${CONTRACT}_CANDIDATE_TEMPLATE_BINDING_MISMATCH`);
}

const plan = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  main_commit: mainCommit,
  source_deep_endpoint: safeEndpoint(deep),
  source_deep_parked_0_0: true,
  source_deep_zero_queue: true,
  candidate_name: CANDIDATE_NAME,
  candidate_template_name: CANDIDATE_TEMPLATE_NAME,
  candidate_endpoint_exists: Boolean(existingCandidate),
  candidate_template_exists: Boolean(existingTemplates[0]),
  candidate_parked_0_0: existingCandidate ? true : null,
  one_variable_experiment: existingProof || desiredProof,
  only_runtime_difference: EAGER_KEY,
  desired_enforce_eager: true,
  same_image_required: true,
  same_model_and_env_except_eager_required: true,
  same_gpu_placement_required: true,
  source_gpu_pool_ids_present: Boolean(gpuIds),
  inference_performed: false,
  generation_submitted: false,
  gpu_activation_performed: false,
  endpoint_opened: false,
  production_deep_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
};

if (!apply || existingCandidate) {
  console.log(JSON.stringify({ ...plan, mutation_performed: false }, null, 2));
  console.log(`${CONTRACT}=${existingCandidate ? "ALREADY_CREATED" : "PLAN_READY"}`);
  process.exit(0);
}

let candidateTemplate = existingTemplates[0] || null;
let createdTemplateId = "";
let createdEndpointId = "";
try {
  if (!candidateTemplate) {
    candidateTemplate = await rest("/templates", mKey, { method: "POST", body: desiredTemplate });
    createdTemplateId = text(candidateTemplate?.id, 300);
    if (!createdTemplateId) throw new Error(`${CONTRACT}_CREATED_TEMPLATE_ID_REQUIRED`);
    candidateTemplate = await rest(`/templates/${encodeURIComponent(createdTemplateId)}`, mKey);
    assertOneVariableEager(deepTemplate, candidateTemplate, `${CONTRACT}_CREATED_TEMPLATE`);
  }
  const candidateTemplateId = text(candidateTemplate?.id, 300);
  if (!candidateTemplateId) throw new Error(`${CONTRACT}_CANDIDATE_TEMPLATE_ID_REQUIRED`);

  const [freshEndpointsRaw, freshTemplatesRaw, freshGqlRows] = await Promise.all([
    rest("/endpoints?includeTemplate=true&includeWorkers=true", mKey),
    rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", mKey),
    graphqlEndpoints(mKey),
  ]);
  const freshEndpoints = rows(freshEndpointsRaw, ["endpoints", "serverlessEndpoints"]);
  const freshTemplates = rows(freshTemplatesRaw, ["templates"]);
  const freshDeep = resolveOne(freshEndpoints, DEEP_NAME, `${CONTRACT}_FRESH_DEEP_REST_RESOLUTION_FAILED`);
  const freshDeepGraphql = resolveOne(freshGqlRows, DEEP_NAME, `${CONTRACT}_FRESH_DEEP_GRAPHQL_RESOLUTION_FAILED`);
  const freshDeepTemplate = freshTemplates.find((item) => text(item?.id, 300) === templateId(freshDeep)) || freshDeep?.template;
  if (!freshDeepTemplate) throw new Error(`${CONTRACT}_FRESH_DEEP_TEMPLATE_REQUIRED`);
  const freshDeepHealth = healthSummary(await health(text(freshDeep?.id, 300), qKey));
  assertParked(freshDeep, freshDeepHealth, `${CONTRACT}_FRESH_DEEP_SOURCE_MUST_BE_PARKED_0_0`);
  if (JSON.stringify(runtime(freshDeepTemplate)) !== JSON.stringify(deepRuntimeBefore)) throw new Error(`${CONTRACT}_DEEP_TEMPLATE_CHANGED_BEFORE_CREATE`);
  if (JSON.stringify(endpointPlacementSignature(freshDeep)) !== JSON.stringify(deepPlacementBefore)) throw new Error(`${CONTRACT}_DEEP_ENDPOINT_CHANGED_BEFORE_CREATE`);
  if (freshEndpoints.some((entry) => text(entry?.name, 300) === CANDIDATE_NAME)) throw new Error(`${CONTRACT}_CANDIDATE_APPEARED_REPLAN_REQUIRED`);
  assertOneVariableEager(freshDeepTemplate, candidateTemplate, `${CONTRACT}_PRECREATE_CANDIDATE_TEMPLATE`);

  const freshGpuIds = await resolveGpuIds(freshDeepGraphql, freshDeep, mKey);
  const response = await graphql(
    CREATE_MUTATION,
    { input: createEndpointInput(freshDeepGraphql, candidateTemplateId, freshGpuIds) },
    mKey,
  );
  createdEndpointId = text(response?.data?.saveEndpoint?.id, 300);
  if (!createdEndpointId) throw new Error(`${CONTRACT}_CREATE_RETURNED_EMPTY_ENDPOINT`);

  const candidate = await candidateState(createdEndpointId, mKey, qKey);
  if (text(candidate.endpoint?.name, 300) !== CANDIDATE_NAME) throw new Error(`${CONTRACT}_CANDIDATE_NAME_VERIFY_FAILED`);
  if (templateId(candidate.endpoint) !== candidateTemplateId) throw new Error(`${CONTRACT}_CANDIDATE_TEMPLATE_VERIFY_FAILED`);
  assertOneVariableEager(freshDeepTemplate, candidate.endpoint?.template || candidateTemplate, `${CONTRACT}_CANDIDATE_VERIFY`);

  const finalDeep = await rest(`/endpoints/${encodeURIComponent(text(freshDeep?.id, 300))}?includeTemplate=true&includeWorkers=true`, mKey);
  const finalDeepHealth = healthSummary(await health(text(finalDeep?.id, 300), qKey));
  assertParked(finalDeep, finalDeepHealth, `${CONTRACT}_FINAL_DEEP_SOURCE_MUST_BE_PARKED_0_0`);
  const finalDeepTemplate = finalDeep?.template || freshDeepTemplate;
  if (JSON.stringify(runtime(finalDeepTemplate)) !== JSON.stringify(deepRuntimeBefore)) throw new Error(`${CONTRACT}_PRODUCTION_DEEP_TEMPLATE_MUTATED`);
  if (JSON.stringify(endpointPlacementSignature(finalDeep)) !== JSON.stringify(deepPlacementBefore)) throw new Error(`${CONTRACT}_PRODUCTION_DEEP_ENDPOINT_MUTATED`);

  console.log(JSON.stringify({
    ...plan,
    mode: "APPLY",
    candidate_endpoint_exists: true,
    candidate_template_exists: true,
    candidate_endpoint: safeEndpoint(candidate.endpoint),
    candidate_parked_0_0: true,
    candidate_queue: candidate.health.jobs,
    template_created: Boolean(createdTemplateId),
    endpoint_created: true,
    mutation_performed: true,
    mutation_scope: "PARKED_DIAGNOSTIC_TEMPLATE_AND_ENDPOINT_ONLY",
    production_deep_unchanged_verified: true,
    next_action: "RUN_SAFE_LEASE_DEEP_EAGER_COLDSTART_PROBE",
  }, null, 2));
  console.log(`${CONTRACT}=PASS`);
} catch (error) {
  const cleanup = { endpoint: "NOT_REQUIRED", template: "NOT_REQUIRED" };
  if (createdEndpointId) {
    try {
      await deleteEndpoint(createdEndpointId, mKey);
      cleanup.endpoint = "PASS";
    } catch (cleanupError) {
      cleanup.endpoint = `FAIL:${redact(cleanupError?.message || cleanupError).slice(0, 500)}`;
    }
  }
  if (createdTemplateId) {
    try {
      await deleteTemplate(createdTemplateId, mKey);
      cleanup.template = "PASS";
    } catch (cleanupError) {
      cleanup.template = `FAIL:${redact(cleanupError?.message || cleanupError).slice(0, 500)}`;
    }
  }
  throw new Error(`${CONTRACT}_APPLY_VERIFY_FAILED:${redact(error?.message || error)}:cleanup=${JSON.stringify(cleanup)}`);
}
