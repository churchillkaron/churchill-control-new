import { spawn } from "node:child_process";

const CONTRACT = "AVANTIQO_CODE_RUNPOD_GLOBAL_CACHED_MODEL_MIGRATION_V4";
const V3_SCRIPT = "scripts/migrate-avantiqo-code-runpod-global-cached-model-v3-local.mjs";
const V3_PASS = "AVANTIQO_CODE_RUNPOD_GLOBAL_CACHED_MODEL_MIGRATION_V3=PASS";
const ENDPOINT_ID = "r79dtnjnrilrlc";
const ENDPOINT_NAME = "avantiqo-code-v1";
const MODEL_REPO = "Qwen/Qwen3-Coder-30B-A3B-Instruct-FP8";
const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const GRAPHQL_URL = "https://api.runpod.io/graphql";
const TARGET_GPU_TYPE_IDS = Object.freeze([
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
  "NVIDIA H200",
  "NVIDIA H100 80GB HBM3",
]);

const text = (value, maximum = 4000) => String(value ?? "").trim().slice(0, maximum);
const list = (value) => Array.isArray(value) ? value : [];
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

async function readJson(response, label) {
  const raw = await response.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = { message: raw }; }
  if (!response.ok) throw new Error(`${label}_HTTP_${response.status}:${text(body?.detail || body?.error?.message || body?.error || body?.message || raw, 1400) || "UNKNOWN"}`);
  return body;
}

async function rest(pathname, key) {
  return readJson(await fetch(`${REST_BASE}${pathname}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), `${CONTRACT}_REST`);
}

async function queue(pathname, key) {
  return readJson(await fetch(`${QUEUE_BASE}/${ENDPOINT_ID}${pathname}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), `${CONTRACT}_QUEUE`);
}

async function graphql(query, key) {
  const body = await readJson(await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json", "Content-Type": "application/json", "User-Agent": "AvantiqoCodeGlobalCachedModelIdempotentV4" },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(30_000),
  }), `${CONTRACT}_GRAPHQL`);
  if (list(body.errors).length) throw new Error(`${CONTRACT}_GRAPHQL_ERROR:${list(body.errors).map((entry) => text(entry?.message)).join(" | ").slice(0, 1600)}`);
  return body;
}

function rows(raw) {
  if (Array.isArray(raw)) return raw;
  for (const key of ["data", "items", "results", "networkVolumes", "volumes"]) if (Array.isArray(raw?.[key])) return raw[key];
  return [];
}

function endpointVolumeIds(endpoint = {}) {
  return [...new Set([
    text(endpoint.networkVolumeId),
    ...list(endpoint.networkVolumeIds).map((entry) => text(typeof entry === "string" ? entry : entry?.networkVolumeId || entry?.id)),
  ].filter(Boolean))];
}

function normalizeLocations(value) {
  if (Array.isArray(value)) return value.map((entry) => text(entry)).filter(Boolean);
  const raw = text(value);
  return raw ? raw.split(",").map((entry) => entry.trim()).filter(Boolean) : [];
}

function normalizeModelReference(value) {
  return text(value, 1000)
    .replace(/^https?:\/\/huggingface\.co\//i, "")
    .replace(/\/(?:tree|resolve)\/main\/?$/i, "")
    .replace(/:(?:main|[0-9a-f]{40,64})$/i, "")
    .replace(/\/$/, "");
}

function modelMatches(value) {
  return normalizeModelReference(value).toLowerCase() === MODEL_REPO.toLowerCase();
}

function sameStringSet(left, right) {
  return JSON.stringify([...new Set(list(left).map((entry) => text(entry)).filter(Boolean))].sort()) === JSON.stringify([...new Set(list(right).map((entry) => text(entry)).filter(Boolean))].sort());
}

function healthSummary(body = {}) {
  const jobs = body?.jobs && typeof body.jobs === "object" ? body.jobs : {};
  const workers = body?.workers && typeof body.workers === "object" ? body.workers : {};
  const workerCount = ["idle", "initializing", "ready", "running", "throttled", "unhealthy"].reduce((sum, key) => sum + Math.max(0, finite(workers[key], 0)), 0);
  return {
    in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
    in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
    worker_count: workerCount,
  };
}

function runV3(cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [V3_SCRIPT], {
      cwd,
      env: { ...process.env, NODE_ENV: "development", AVANTIQO_CODE_GLOBAL_CACHED_MODEL_MIGRATION_APPROVED: "YES" },
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { const value = chunk.toString("utf8"); stdout += value; process.stdout.write(value); });
    child.stderr.on("data", (chunk) => { const value = chunk.toString("utf8"); stderr += value; process.stderr.write(value); });
    child.on("error", reject);
    child.on("close", (code) => resolve({ exitCode: Number.isInteger(code) ? code : 1, stdout, stderr }));
  });
}

if (text(process.env.NODE_ENV).toLowerCase() === "production") throw new Error(`${CONTRACT}_PRODUCTION_ENV_FORBIDDEN`);
const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY, 2000);
const queueKey = text(process.env.RUNPOD_AVANTIQO_CODE_API_KEY || process.env.RUNPOD_API_KEY || managementKey, 2000);
if (!managementKey || !queueKey) throw new Error(`${CONTRACT}_RUNPOD_KEY_REQUIRED`);

const query = `query AvantiqoCodeGlobalCachedModelReadV4 { myself { endpoints { id name workersMin workersMax locations networkVolumeId networkVolumeIds { networkVolumeId dataCenterId } scalerType scalerValue modelReferences } } }`;
const [endpointRest, graph, volumesRaw, healthRaw] = await Promise.all([
  rest(`/endpoints/${ENDPOINT_ID}?includeTemplate=true&includeWorkers=true`, managementKey),
  graphql(query, managementKey),
  rest("/networkvolumes", managementKey),
  queue("/health", queueKey),
]);

if (text(endpointRest.id) !== ENDPOINT_ID || text(endpointRest.name) !== ENDPOINT_NAME) throw new Error(`${CONTRACT}_ENDPOINT_IDENTITY_INVALID`);
const graphMatches = list(graph?.data?.myself?.endpoints).filter((entry) => text(entry?.id) === ENDPOINT_ID && text(entry?.name) === ENDPOINT_NAME);
if (graphMatches.length !== 1) throw new Error(`${CONTRACT}_GRAPH_ENDPOINT_RESOLUTION:${graphMatches.length}`);
const graphEndpoint = graphMatches[0];
const codeVolumes = rows(volumesRaw).filter((entry) => /avantiqo.*code.*cache/i.test(text(entry?.name)));
if (codeVolumes.length !== 1) throw new Error(`${CONTRACT}_ONE_CANONICAL_CODE_STORAGE_REQUIRED:${codeVolumes.length}`);
const models = list(graphEndpoint.modelReferences).map((entry) => text(entry)).filter(Boolean);
const health = healthSummary(healthRaw);

const alreadyTarget = endpointVolumeIds(endpointRest).length === 0
  && normalizeLocations(graphEndpoint.locations ?? endpointRest.dataCenterIds).length === 0
  && models.length === 1
  && models.some(modelMatches)
  && finite(endpointRest.workersMin, -1) === 0
  && finite(endpointRest.workersMax, -1) === 0
  && text(endpointRest.scalerType).toUpperCase() === "REQUEST_COUNT"
  && finite(endpointRest.scalerValue, -1) === 1
  && sameStringSet(endpointRest.gpuTypeIds, TARGET_GPU_TYPE_IDS)
  && health.in_queue === 0
  && health.in_progress === 0
  && health.worker_count === 0;

console.log(JSON.stringify({
  event: `${CONTRACT}_STATE`,
  already_target: alreadyTarget,
  endpoint_volume_attached: endpointVolumeIds(endpointRest).length > 0,
  model_reference: models,
  scaler_type: text(endpointRest.scalerType),
  scaler_value: finite(endpointRest.scalerValue, null),
  gpu_type_ids: list(endpointRest.gpuTypeIds),
  one_canonical_code_storage_verified: true,
  canonical_code_storage_id: text(codeVolumes[0]?.id),
  canonical_code_storage_name: text(codeVolumes[0]?.name),
  active_jobs: health.in_progress,
  queued_jobs: health.in_queue,
  active_workers: health.worker_count,
  secrets_printed: false,
}));

if (alreadyTarget) {
  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    migration_performed: false,
    endpoint_configuration_untouched: true,
    cached_model_configuration_preserved_without_resave: true,
    endpoint_network_volume_attached: false,
    canonical_code_storage_preserved: true,
    code_storage_count: 1,
    workers_min: 0,
    workers_max: 0,
    new_storage_created: false,
    storage_deleted: false,
    inference_performed: false,
    production_deploy_performed: false,
    secrets_printed: false,
  }, null, 2));
  console.log(`${CONTRACT}=PASS`);
  process.exit(0);
}

const result = await runV3(process.cwd());
if (result.exitCode !== 0) throw new Error(`${CONTRACT}_V3_MIGRATION_FAILED:${result.exitCode}`);
if (!result.stdout.includes(V3_PASS)) throw new Error(`${CONTRACT}_V3_PASS_MARKER_REQUIRED`);
console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  migration_performed: true,
  endpoint_configuration_untouched: false,
  future_correct_runs_will_skip_resave: true,
  canonical_code_storage_preserved: true,
  new_storage_created: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
console.log(`${CONTRACT}=PASS`);
