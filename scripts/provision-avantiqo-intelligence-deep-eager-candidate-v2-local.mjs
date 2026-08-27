import { spawnSync } from "node:child_process";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const GRAPHQL_URL = "https://api.runpod.io/graphql";
const CONTRACT = "AVANTIQO_INTELLIGENCE_DEEP_EAGER_CANDIDATE_V2";
const DEEP_NAME = "avantiqo-intelligence-v1";
const CANDIDATE_NAME = "avantiqo-intelligence-deep-eager-candidate-v1";
const CANDIDATE_TEMPLATE_NAME = "avantiqo-intelligence-deep-eager-candidate-v1";
const APPROVAL_ENV = "AVANTIQO_INTELLIGENCE_DEEP_EAGER_CANDIDATE_APPROVED";
const EXPECTED_MAIN_ENV = "AVANTIQO_INTELLIGENCE_DEEP_EAGER_CANDIDATE_EXPECTED_MAIN";
const EAGER_KEY = "ENFORCE_EAGER";
const TERMINAL = new Set(["EXITED", "STOPPED", "TERMINATED", "DELETED"]);

const text = (value, limit = 6000) => String(value ?? "").trim().slice(0, limit);
const list = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const yes = (value) => ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value, 40).toUpperCase());

function redact(value) {
  return text(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]");
}

function shell(name, args, code) {
  const result = spawnSync(name, args, { cwd: process.cwd(), env: process.env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
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
  if (!response.ok) throw new Error(`${CONTRACT}_HTTP_${response.status}:${redact(body?.message || body?.error || body?.detail || raw).slice(0, 900)}`);
  if (options.allowEmpty && !raw) return null;
  if (body === null && !options.allowEmpty) throw new Error(`${CONTRACT}_HTTP_${response.status}:INVALID_JSON`);
  return body;
}

const rest = (path, key, options = {}) => requestJson(`${REST_BASE}${path}`, key, options);
const health = (endpointId, key) => requestJson(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, key, { timeoutMs: 20_000 });

async function graphql(query, variables, key) {
  const response = await requestJson(GRAPHQL_URL, key, { method: "POST", body: { query, variables } });
  if (Array.isArray(response?.errors) && response.errors.length) {
    throw new Error(`${CONTRACT}_GRAPHQL:${redact(response.errors.map((entry) => entry?.message).join(" | ")).slice(0, 900)}`);
  }
  return response;
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

const templateId = (endpoint = {}) => text(endpoint?.templateId || endpoint?.template?.id, 300);

function activeManagementWorkers(endpoint = {}) {
  return list(endpoint?.workers).filter((worker) => {
    const status = text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus, 80).toUpperCase();
    const desired = text(worker?.desiredStatus ?? worker?.desired_status, 80).toUpperCase();
    if (status && !TERMINAL.has(status)) return true;
    if (desired && !TERMINAL.has(desired)) return true;
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

function assertParked(endpoint, summary, code) {
  const workerCount = Object.values(summary.workers).reduce((sum, value) => sum + finite(value, 0), 0);
  if (
    finite(endpoint?.workersMin, -1) !== 0 || finite(endpoint?.workersMax, -1) !== 0 ||
    summary.jobs.in_queue !== 0 || summary.jobs.in_progress !== 0 || workerCount !== 0 ||
    activeManagementWorkers(endpoint) !== 0
  ) {
    throw new Error(`${code}:min=${finite(endpoint?.workersMin, -1)}:max=${finite(endpoint?.workersMax, -1)}:queue=${summary.jobs.in_queue}:progress=${summary.jobs.in_progress}:workers=${workerCount}:management=${activeManagementWorkers(endpoint)}`);
  }
}

function envMap(value) {
  const pairs = Array.isArray(value)
    ? value.map((entry) => [text(entry?.key || entry?.name, 300), String(entry?.value ?? "")])
    : Object.entries(object(value)).map(([key, entryValue]) => [text(key, 300), String(entryValue ?? "")]);
  return Object.fromEntries(pairs.filter(([key]) => key).sort(([a], [b]) => a.localeCompare(b)));
}

const command = (value) => (Array.isArray(value) ? value : [value]).map((entry) => text(entry, 3000)).filter(Boolean);

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
  for (const field of ["container_disk_gb", "docker_entrypoint", "docker_start_cmd", "ports", "volume_gb", "volume_mount_path", "registry_auth_id", "is_public"]) {
    if (JSON.stringify(candidate[field]) !== JSON.stringify(source[field])) throw new Error(`${code}_${field.toUpperCase()}_DRIFT`);
  }
  if (text(source.env[EAGER_KEY], 40).toLowerCase() === "true") throw new Error(`${code}_SOURCE_ALREADY_EAGER`);
  if (text(candidate.env[EAGER_KEY], 40).toLowerCase() !== "true") throw new Error(`${code}_EAGER_TRUE_REQUIRED`);
  const keys = [...new Set([...Object.keys(source.env), ...Object.keys(candidate.env)])].sort();
  const drift = keys.filter((key) => key !== EAGER_KEY && source.env[key] !== candidate.env[key]);
  if (drift.length) throw new Error(`${code}_ENV_DRIFT:${drift.join(",")}`);
  return { only_runtime_difference: EAGER_KEY, source_eager_enabled: false, candidate_eager_enabled: true };
}

function desiredTemplate(source = {}) {
  const sourceEnv = envMap(source?.env);
  const body = {
    imageName: text(source?.imageName, 1200),
    name: CANDIDATE_TEMPLATE_NAME,
    category: text(source?.category, 300) || "NVIDIA",
    containerDiskInGb: Math.max(10, finite(source?.containerDiskInGb, 30)),
    dockerEntrypoint: command(source?.dockerEntrypoint),
    dockerStartCmd: command(source?.dockerStartCmd),
    env: { ...sourceEnv, [EAGER_KEY]: "true" },
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

function deepSignature(endpoint = {}) {
  return {
    id: text(endpoint?.id, 300),
    template_id: templateId(endpoint),
    gpu_count: finite(endpoint?.gpuCount),
    gpu_type_ids: list(endpoint?.gpuTypeIds).map((value) => text(value, 300)).filter(Boolean),
    network_volume_id: text(endpoint?.networkVolumeId, 300),
    workers_min: finite(endpoint?.workersMin),
    workers_max: finite(endpoint?.workersMax),
  };
}

const ENDPOINTS_QUERY = `query AvantiqoDeepEagerCandidateSource { myself { endpoints { id name templateId gpuIds gpuCount instanceIds workersMin workersMax locations networkVolumeId networkVolumeIds { networkVolumeId } idleTimeout scalerType scalerValue executionTimeoutMs minCudaVersion flashBootType } } }`;
const GPU_POOLS_QUERY = `query AvantiqoDeepEagerCandidateGpuPools { serverlessGpuPools { id gpuTypeIds } }`;
const CREATE_MUTATION = `mutation AvantiqoDeepEagerCandidateSaveEndpoint($input: EndpointInput!) { saveEndpoint(input: $input) { id name templateId gpuIds gpuCount workersMin workersMax flashBootType } }`;

async function graphqlEndpoints(key) {
  const response = await graphql(ENDPOINTS_QUERY, {}, key);
  return list(response?.data?.myself?.endpoints);
}

async function resolveGpuIds(sourceGraphql, sourceRest, key) {
  const existing = text(sourceGraphql?.gpuIds, 1000);
  if (existing) return existing;
  const types = list(sourceRest?.gpuTypeIds).map((value) => text(value, 300)).filter(Boolean);
  if (!types.length) throw new Error(`${CONTRACT}_GPU_TYPE_IDS_REQUIRED`);
  const response = await graphql(GPU_POOLS_QUERY, {}, key);
  const pools = list(response?.data?.serverlessGpuPools);
  const ids = [];
  for (const type of types) {
    const pool = pools.find((entry) => list(entry?.gpuTypeIds).map((value) => text(value, 300)).includes(type));
    const id = text(pool?.id, 300);
    if (!id) throw new Error(`${CONTRACT}_GPU_POOL_RESOLUTION_FAILED:${type}`);
    if (!ids.includes(id)) ids.push(id);
  }
  return ids.join(",");
}

function endpointInput(source, candidateTemplateId, gpuIds) {
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
  if (text(source?.locations, 1000)) input.locations = text(source.locations, 1000);
  if (text(source?.networkVolumeId, 300)) input.networkVolumeId = text(source.networkVolumeId, 300);
  const volumeIds = list(source?.networkVolumeIds).map((entry) => text(typeof entry === "string" ? entry : entry?.networkVolumeId || entry?.id, 300)).filter(Boolean).map((networkVolumeId) => ({ networkVolumeId }));
  if (volumeIds.length) input.networkVolumeIds = volumeIds;
  if (finite(source?.idleTimeout) > 0) input.idleTimeout = finite(source.idleTimeout);
  if (text(source?.scalerType, 200)) input.scalerType = text(source.scalerType, 200);
  if (finite(source?.scalerValue) > 0) input.scalerValue = finite(source.scalerValue);
  if (finite(source?.executionTimeoutMs) !== null && finite(source.executionTimeoutMs) >= 0) input.executionTimeoutMs = finite(source.executionTimeoutMs);
  if (text(source?.minCudaVersion, 200)) input.minCudaVersion = text(source.minCudaVersion, 200);
  input.flashBootType = text(source?.flashBootType, 200) || "FLASHBOOT";
  return input;
}

async function fullTemplate(id, key, code) {
  if (!id) throw new Error(`${code}_ID_REQUIRED`);
  const template = await rest(`/templates/${encodeURIComponent(id)}`, key);
  if (!text(template?.id, 300)) throw new Error(`${code}_FETCH_INVALID`);
  return template;
}

async function candidateState(endpointId, mKey, qKey) {
  const [endpoint, rawHealth] = await Promise.all([
    rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, mKey),
    health(endpointId, qKey),
  ]);
  const summary = healthSummary(rawHealth);
  assertParked(endpoint, summary, `${CONTRACT}_CANDIDATE_NOT_PARKED`);
  return { endpoint, health: summary };
}

const deleteEndpoint = (id, key) => rest(`/endpoints/${encodeURIComponent(id)}`, key, { method: "DELETE", allowEmpty: true });
const deleteTemplate = (id, key) => rest(`/templates/${encodeURIComponent(id)}`, key, { method: "DELETE", allowEmpty: true });

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
const deepTemplate = await fullTemplate(templateId(deep), mKey, `${CONTRACT}_DEEP_TEMPLATE`);
const deepHealth = healthSummary(await health(text(deep?.id, 300), qKey));
assertParked(deep, deepHealth, `${CONTRACT}_DEEP_SOURCE_MUST_BE_PARKED_0_0`);
const deepRuntimeBefore = runtime(deepTemplate);
const deepSignatureBefore = deepSignature(deep);
const desired = desiredTemplate(deepTemplate);
const desiredProof = assertOneVariableEager(deepTemplate, desired, `${CONTRACT}_DESIRED_TEMPLATE`);
const gpuIds = await resolveGpuIds(deepGraphql, deep, mKey);

const existingEndpoints = endpoints.filter((entry) => text(entry?.name, 300) === CANDIDATE_NAME);
if (existingEndpoints.length > 1) throw new Error(`${CONTRACT}_MULTIPLE_CANDIDATE_ENDPOINTS:${existingEndpoints.length}`);
const existingTemplates = templates.filter((entry) => text(entry?.name, 300) === CANDIDATE_TEMPLATE_NAME);
if (existingTemplates.length > 1) throw new Error(`${CONTRACT}_MULTIPLE_CANDIDATE_TEMPLATES:${existingTemplates.length}`);

if (existingEndpoints[0]) {
  const state = await candidateState(text(existingEndpoints[0]?.id, 300), mKey, qKey);
  const authoritative = await fullTemplate(templateId(state.endpoint), mKey, `${CONTRACT}_EXISTING_CANDIDATE_TEMPLATE`);
  const proof = assertOneVariableEager(deepTemplate, authoritative, `${CONTRACT}_EXISTING_CANDIDATE`);
  console.log(JSON.stringify({ success: true, contract: CONTRACT, mode: apply ? "APPLY" : "PLAN", main_commit: mainCommit, candidate_existing: true, candidate_parked_0_0: true, one_variable_experiment: proof, authoritative_template_fetch_verified: true, inference_performed: false, generation_submitted: false, production_deep_mutation_performed: false, production_deploy_performed: false, secrets_printed: false }, null, 2));
  console.log(`${CONTRACT}=ALREADY_CREATED`);
  process.exit(0);
}

console.log(JSON.stringify({ success: true, contract: CONTRACT, mode: apply ? "APPLY" : "PLAN", main_commit: mainCommit, candidate_existing: false, candidate_template_existing: Boolean(existingTemplates[0]), one_variable_experiment: desiredProof, authoritative_template_fetch_required: true, inference_performed: false, generation_submitted: false, gpu_activation_performed: false, production_deep_mutation_performed: false, production_deploy_performed: false, secrets_printed: false }, null, 2));
if (!apply) {
  console.log(`${CONTRACT}=PLAN_READY`);
  process.exit(0);
}

let candidateTemplate = existingTemplates[0] ? await fullTemplate(text(existingTemplates[0]?.id, 300), mKey, `${CONTRACT}_EXISTING_TEMPLATE`) : null;
let createdTemplateId = "";
let createdEndpointId = "";
try {
  if (candidateTemplate) assertOneVariableEager(deepTemplate, candidateTemplate, `${CONTRACT}_EXISTING_TEMPLATE`);
  if (!candidateTemplate) {
    const created = await rest("/templates", mKey, { method: "POST", body: desired });
    createdTemplateId = text(created?.id, 300);
    candidateTemplate = await fullTemplate(createdTemplateId, mKey, `${CONTRACT}_CREATED_TEMPLATE`);
    assertOneVariableEager(deepTemplate, candidateTemplate, `${CONTRACT}_CREATED_TEMPLATE`);
  }
  const candidateTemplateId = text(candidateTemplate?.id, 300);

  validateRemoteMain();
  const [freshDeep, freshDeepGraphql] = await Promise.all([
    rest(`/endpoints/${encodeURIComponent(text(deep?.id, 300))}?includeTemplate=true&includeWorkers=true`, mKey),
    graphqlEndpoints(mKey).then((items) => resolveOne(items, DEEP_NAME, `${CONTRACT}_FRESH_DEEP_GRAPHQL_RESOLUTION_FAILED`)),
  ]);
  const freshDeepTemplate = await fullTemplate(templateId(freshDeep), mKey, `${CONTRACT}_FRESH_DEEP_TEMPLATE`);
  const freshDeepHealth = healthSummary(await health(text(freshDeep?.id, 300), qKey));
  assertParked(freshDeep, freshDeepHealth, `${CONTRACT}_FRESH_DEEP_SOURCE_MUST_BE_PARKED_0_0`);
  if (JSON.stringify(runtime(freshDeepTemplate)) !== JSON.stringify(deepRuntimeBefore)) throw new Error(`${CONTRACT}_DEEP_TEMPLATE_CHANGED_BEFORE_CREATE`);
  if (JSON.stringify(deepSignature(freshDeep)) !== JSON.stringify(deepSignatureBefore)) throw new Error(`${CONTRACT}_DEEP_ENDPOINT_CHANGED_BEFORE_CREATE`);
  assertOneVariableEager(freshDeepTemplate, candidateTemplate, `${CONTRACT}_PRECREATE_CANDIDATE_TEMPLATE`);

  const freshGpuIds = await resolveGpuIds(freshDeepGraphql, freshDeep, mKey);
  const response = await graphql(CREATE_MUTATION, { input: endpointInput(freshDeepGraphql, candidateTemplateId, freshGpuIds) }, mKey);
  createdEndpointId = text(response?.data?.saveEndpoint?.id, 300);
  if (!createdEndpointId) throw new Error(`${CONTRACT}_CREATE_RETURNED_EMPTY_ENDPOINT`);

  const candidate = await candidateState(createdEndpointId, mKey, qKey);
  if (text(candidate.endpoint?.name, 300) !== CANDIDATE_NAME) throw new Error(`${CONTRACT}_CANDIDATE_NAME_VERIFY_FAILED`);
  if (templateId(candidate.endpoint) !== candidateTemplateId) throw new Error(`${CONTRACT}_CANDIDATE_TEMPLATE_VERIFY_FAILED`);
  const authoritativeCandidateTemplate = await fullTemplate(candidateTemplateId, mKey, `${CONTRACT}_CANDIDATE_TEMPLATE`);
  assertOneVariableEager(freshDeepTemplate, authoritativeCandidateTemplate, `${CONTRACT}_CANDIDATE_VERIFY`);

  const finalDeep = await rest(`/endpoints/${encodeURIComponent(text(deep?.id, 300))}?includeTemplate=true&includeWorkers=true`, mKey);
  const finalDeepTemplate = await fullTemplate(templateId(finalDeep), mKey, `${CONTRACT}_FINAL_DEEP_TEMPLATE`);
  const finalDeepHealth = healthSummary(await health(text(finalDeep?.id, 300), qKey));
  assertParked(finalDeep, finalDeepHealth, `${CONTRACT}_FINAL_DEEP_SOURCE_MUST_BE_PARKED_0_0`);
  if (JSON.stringify(runtime(finalDeepTemplate)) !== JSON.stringify(deepRuntimeBefore)) throw new Error(`${CONTRACT}_PRODUCTION_DEEP_TEMPLATE_MUTATED`);
  if (JSON.stringify(deepSignature(finalDeep)) !== JSON.stringify(deepSignatureBefore)) throw new Error(`${CONTRACT}_PRODUCTION_DEEP_ENDPOINT_MUTATED`);

  console.log(JSON.stringify({ success: true, contract: CONTRACT, mode: "APPLY", main_commit: mainCommit, candidate_created: true, candidate_parked_0_0: true, one_variable_experiment: assertOneVariableEager(finalDeepTemplate, authoritativeCandidateTemplate, `${CONTRACT}_FINAL_PARITY`), authoritative_candidate_template_fetch_verified: true, authoritative_deep_template_fetch_verified: true, mutation_scope: "PARKED_DIAGNOSTIC_TEMPLATE_AND_ENDPOINT_ONLY", production_deep_unchanged_verified: true, inference_performed: false, generation_submitted: false, gpu_activation_performed: false, production_deploy_performed: false, secrets_printed: false, next_action: "RUN_SAFE_LEASE_DEEP_EAGER_COLDSTART_PROBE" }, null, 2));
  console.log(`${CONTRACT}=PASS`);
} catch (error) {
  const cleanup = { endpoint: "NOT_REQUIRED", template: "NOT_REQUIRED" };
  if (createdEndpointId) {
    try { await deleteEndpoint(createdEndpointId, mKey); cleanup.endpoint = "PASS"; }
    catch (cleanupError) { cleanup.endpoint = `FAIL:${redact(cleanupError?.message || cleanupError).slice(0, 500)}`; }
  }
  if (createdTemplateId) {
    try { await deleteTemplate(createdTemplateId, mKey); cleanup.template = "PASS"; }
    catch (cleanupError) { cleanup.template = `FAIL:${redact(cleanupError?.message || cleanupError).slice(0, 500)}`; }
  }
  throw new Error(`${CONTRACT}_APPLY_VERIFY_FAILED:${redact(error?.message || error)}:cleanup=${JSON.stringify(cleanup)}`);
}
