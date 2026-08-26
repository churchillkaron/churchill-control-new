import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const GRAPHQL_URL = "https://api.runpod.io/graphql";
const CONTRACT = "AVANTIQO_VIDEO_WAN22_T2V_A14B_CAPACITY_AWARE_CACHE_FILL_V1";
const BASE_RUNNER = "scripts/cache-avantiqo-video-wan22-t2v-a14b-local.mjs";
const VIDEO_EVIDENCE_PATH = "audits/results/avantiqo-video-worker-image.json";
const IMAGE_LOCK_PATH = "audits/results/avantiqo-image-v9-certification-lock.json";
const VIDEO_SOURCE_PATH = "services/avantiqo-video-engine";
const IMAGE_NAME = "avantiqo-image-v1";
const CINEMA_NAMES = new Set(["avantiqo-video-v1", "avantiqo-cinema-v1"]);
const VOLUME_ID = "7pcdebhpga";
const VOLUME_NAME = "avantiqo-shared-image-video-cache";
const VOLUME_DC = "US-NC-2";
const MIN_VOLUME_GB = 400;
const EXPECTED_CACHE_TEMPLATE = "avantiqo-video-cache-v3-f91e402fca17";
const EXPECTED_VIDEO_IMAGE = "ghcr.io/churchillkaron/avantiqo-video-worker@sha256:f91e402fca17ed2caf941e115b61b6ac8f7680c2f920b2c5a4aa0a034ecb5c2e";
const CACHE_ROOT = "/runpod-volume/huggingface-cache/hub";
const T2V_MODEL = "Wan-AI/Wan2.2-T2V-A14B-Diffusers";
const I2V_MODEL = "Wan-AI/Wan2.2-I2V-A14B-Diffusers";
const ORIGINAL_BLACKWELL_POOL = [
  "NVIDIA RTX PRO 6000 Blackwell Max-Q Workstation Edition",
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
  "NVIDIA RTX PRO 6000 Blackwell Workstation Edition",
];
const COMPATIBLE_CACHE_GPU_PATTERN = /(RTX\s*(?:PRO\s*)?6000|A6000|6000\s*Ada|\bL40S?\b|\bA100\b|\bH100\b|\bH200\b|\bB200\b)/i;
const RESTORE_WAIT_MS = Math.max(
  60_000,
  Number(process.env.AVANTIQO_VIDEO_WAN22_CAPACITY_RESTORE_WAIT_MS || 10 * 60 * 1000),
);
const POLL_MS = Math.max(3_000, Number(process.env.AVANTIQO_VIDEO_WAN22_CAPACITY_POLL_MS || 5_000));

const text = (value) => String(value ?? "").trim();
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const list = (value) => Array.isArray(value) ? value : [];
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const unique = (values) => [...new Set(values.map(text).filter(Boolean))].sort();
const approved = (value) => ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase());
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function redact(value) {
  return String(value ?? "")
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/([?&](?:token|key|api_key|apikey|sig|signature)=)[^&\s]+/gi, "$1[REDACTED]");
}

function shell(name, args, code, options = {}) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(),
    encoding: options.encoding === undefined ? "utf8" : options.encoding,
    env: options.env || process.env,
    stdio: options.stdio || ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    const detail = options.stdio === "inherit"
      ? `exit=${result.status}`
      : redact(text(result.stderr || result.stdout)).slice(0, 1200);
    throw new Error(`${code}:${detail}`);
  }
  return options.stdio === "inherit" ? "" : text(result.stdout);
}

function shellStatus(name, args) {
  return spawnSync(name, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function requireCurrentMain() {
  shell("git", ["fetch", "origin", "main"], "AVANTIQO_VIDEO_CAPACITY_CACHE_FETCH_MAIN_FAILED");
  const branch = shell("git", ["branch", "--show-current"], "AVANTIQO_VIDEO_CAPACITY_CACHE_BRANCH_READ_FAILED");
  if (branch !== "main") throw new Error(`AVANTIQO_VIDEO_CAPACITY_CACHE_MAIN_REQUIRED:${branch || "DETACHED"}`);
  const head = shell("git", ["rev-parse", "HEAD"], "AVANTIQO_VIDEO_CAPACITY_CACHE_HEAD_READ_FAILED");
  const remote = shell("git", ["rev-parse", "origin/main"], "AVANTIQO_VIDEO_CAPACITY_CACHE_REMOTE_READ_FAILED");
  if (head !== remote) throw new Error(`AVANTIQO_VIDEO_CAPACITY_CACHE_MAIN_NOT_CURRENT:head=${head}:origin=${remote}`);
  const dirty = shell(
    "git",
    ["status", "--porcelain", "--untracked-files=no", "--", VIDEO_SOURCE_PATH, BASE_RUNNER],
    "AVANTIQO_VIDEO_CAPACITY_CACHE_SOURCE_STATUS_FAILED",
  );
  if (dirty) throw new Error("AVANTIQO_VIDEO_CAPACITY_CACHE_VIDEO_OWNED_FILES_HAVE_LOCAL_CHANGES");
  return head;
}

function assertBaseRunnerTracked() {
  const status = shellStatus("git", ["ls-files", "--error-unmatch", BASE_RUNNER]);
  if (status.status !== 0) throw new Error("AVANTIQO_VIDEO_CAPACITY_CACHE_BASE_RUNNER_NOT_TRACKED");
}

function normalizeEnv(value) {
  if (Array.isArray(value)) {
    return Object.fromEntries(
      value.map((entry) => [text(entry?.key || entry?.name), String(entry?.value ?? "")]).filter(([key]) => key),
    );
  }
  return Object.fromEntries(Object.entries(object(value)).map(([key, child]) => [String(key), String(child ?? "")]));
}

function normalizeList(value, keys = [], depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 4) return null;
  for (const key of [...keys, "data", "items", "results"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const found = normalizeList(value[key], keys, depth + 1);
    if (found) return found;
  }
  return null;
}

function endpointVolumeIds(endpoint = {}) {
  return unique([endpoint.networkVolumeId, ...list(endpoint.networkVolumeIds)]);
}

function sameSet(left, right) {
  const a = unique(left);
  const b = unique(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function safeEndpoint(endpoint = {}) {
  return {
    id: text(endpoint.id) || null,
    name: text(endpoint.name) || null,
    template_id: text(endpoint.templateId || endpoint.template?.id) || null,
    workers_min: finite(endpoint.workersMin),
    workers_max: finite(endpoint.workersMax),
    gpu_type_ids: unique(list(endpoint.gpuTypeIds)),
    data_center_ids: unique(list(endpoint.dataCenterIds)),
    network_volume_ids: endpointVolumeIds(endpoint),
    execution_timeout_ms: finite(endpoint.executionTimeoutMs ?? endpoint.executionTimeout),
    scaler_type: text(endpoint.scalerType) || null,
    scaler_value: finite(endpoint.scalerValue),
  };
}

function healthSummary(body = {}) {
  const jobs = object(body.jobs);
  const workers = object(body.workers);
  return {
    jobs: {
      completed: finite(jobs.completed, 0),
      failed: finite(jobs.failed, 0),
      in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
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

function workerCount(health) {
  return Object.values(health.workers).reduce((sum, value) => sum + Number(value || 0), 0);
}

function stockScore(value) {
  const status = text(value).toUpperCase();
  if (status === "HIGH") return 4;
  if (status === "MEDIUM") return 3;
  if (status === "LOW") return 2;
  if (status && status !== "NONE" && status !== "UNAVAILABLE") return 1;
  return 0;
}

function economicScore(value) {
  const label = text(value);
  if (/A6000/i.test(label)) return 100;
  if (/6000\s*Ada/i.test(label)) return 95;
  if (/\bL40S?\b/i.test(label)) return 90;
  if (/RTX\s*(?:PRO\s*)?6000/i.test(label)) return 85;
  if (/\bA100\b/i.test(label)) return 70;
  if (/\bH100\b/i.test(label)) return 60;
  if (/\bH200\b/i.test(label)) return 50;
  if (/\bB200\b/i.test(label)) return 40;
  return 0;
}

async function readJson(response, label) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    throw new Error(`${label}_HTTP_${response.status}:${redact(text(body?.message || body?.error || body?.detail || raw)).slice(0, 1200)}`);
  }
  return body ?? {};
}

async function rest(pathname, key, options = {}) {
  return readJson(await fetch(`${REST_BASE}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  }), "AVANTIQO_VIDEO_CAPACITY_CACHE_REST");
}

async function queueRequest(endpointId, pathname, key) {
  return readJson(await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}${pathname}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "AVANTIQO_VIDEO_CAPACITY_CACHE_QUEUE");
}

async function queueCredentialWorks(endpointId, key) {
  if (!key) return false;
  try {
    const response = await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    await response.arrayBuffer();
    return response.ok;
  } catch {
    return false;
  }
}

async function selectQueueCredential(endpointId, managementKey) {
  const candidates = [
    ["RUNPOD_AVANTIQO_VIDEO_API_KEY", text(process.env.RUNPOD_AVANTIQO_VIDEO_API_KEY)],
    ["RUNPOD_API_KEY", text(process.env.RUNPOD_API_KEY)],
    ["RUNPOD_MANAGEMENT_API_KEY", managementKey],
  ];
  const seen = new Set();
  for (const [source, key] of candidates) {
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (await queueCredentialWorks(endpointId, key)) return { source, key };
  }
  throw new Error("AVANTIQO_VIDEO_CAPACITY_CACHE_QUEUE_CREDENTIAL_NOT_FOUND");
}

async function inventory(key) {
  const [endpointsRaw, volumesRaw, templatesRaw] = await Promise.all([
    rest("/endpoints?includeTemplate=true&includeWorkers=true", key),
    rest("/networkvolumes", key),
    rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", key),
  ]);
  const endpoints = normalizeList(endpointsRaw, ["endpoints", "serverlessEndpoints"]);
  const volumes = normalizeList(volumesRaw, ["networkVolumes", "volumes"]);
  const templates = normalizeList(templatesRaw, ["templates"]);
  if (!endpoints || !volumes || !templates) throw new Error("AVANTIQO_VIDEO_CAPACITY_CACHE_INVENTORY_INVALID");
  return { endpoints, volumes, templates };
}

function resolveEndpoint(endpoints, configuredId, names, label) {
  const matches = configuredId
    ? endpoints.filter((entry) => text(entry.id) === configuredId && names.has(text(entry.name)))
    : endpoints.filter((entry) => names.has(text(entry.name)));
  if (matches.length !== 1) throw new Error(`${label}_ENDPOINT_RESOLUTION_FAILED:${matches.length}`);
  return matches[0];
}

function resolveTemplate(templates, id, label) {
  const matches = templates.filter((entry) => text(entry.id) === id);
  if (matches.length !== 1) throw new Error(`${label}_TEMPLATE_RESOLUTION_FAILED:${matches.length}`);
  return matches[0];
}

function validateVolume(volumes) {
  const matches = volumes.filter((volume) => text(volume.id) === VOLUME_ID || text(volume.name) === VOLUME_NAME);
  if (matches.length !== 1) throw new Error(`AVANTIQO_VIDEO_CAPACITY_CACHE_VOLUME_RESOLUTION_FAILED:${matches.length}`);
  const volume = matches[0];
  const size = finite(volume.size ?? volume.sizeGb, 0);
  if (text(volume.id) !== VOLUME_ID || text(volume.name) !== VOLUME_NAME || text(volume.dataCenterId) !== VOLUME_DC || size < MIN_VOLUME_GB) {
    throw new Error(`AVANTIQO_VIDEO_CAPACITY_CACHE_VOLUME_INVALID:id=${text(volume.id)}:name=${text(volume.name)}:dc=${text(volume.dataCenterId)}:size=${size}`);
  }
  return volume;
}

function validateVideoEvidence(evidence) {
  if (
    evidence?.success !== true ||
    text(evidence.contract) !== "AVANTIQO_VIDEO_WORKER_IMAGE_RESULT_V2" ||
    text(evidence.evidence_revision) !== "AVANTIQO_VIDEO_WORKER_IMAGE_V3_WAN22_A14B_DEFAULT_ROUTING_CACHE_V2" ||
    text(evidence.immutable_image_reference) !== EXPECTED_VIDEO_IMAGE ||
    text(evidence.entrypoint) !== "handler_v3.py" ||
    text(evidence.runtime_revision) !== "AVANTIQO_VIDEO_WAN22_A14B_DEFAULT_ROUTING_CACHE_V1" ||
    text(evidence.configured_text_to_video_foundation) !== T2V_MODEL ||
    text(evidence.configured_image_to_video_foundation) !== I2V_MODEL ||
    text(evidence.cache_authorization_contract) !== "AVANTIQO_VIDEO_WAN22_CACHE_AUTHORIZATION_V1" ||
    text(evidence.cache_completion_contract) !== "AVANTIQO_VIDEO_WAN22_CACHE_COMPLETION_V1" ||
    Number(evidence.minimum_network_volume_quota_gb_for_cache) !== 400 ||
    evidence.partial_snapshot_satisfies_final_worker_fitness !== false
  ) throw new Error("AVANTIQO_VIDEO_CAPACITY_CACHE_BUILD_EVIDENCE_INVALID");
}

function validateImageLock(lock) {
  const immutable = text(lock?.build_evidence?.immutable_image_reference);
  if (
    lock?.success !== true ||
    lock?.production_certified !== true ||
    text(lock?.status) !== "PRODUCTION_CERTIFIED_NOT_DEPLOYED" ||
    lock?.release_gate?.image_runtime_certified !== true ||
    lock?.release_gate?.image_default_routing_certified !== true ||
    lock?.release_gate?.image_human_quality_certified !== true ||
    lock?.release_gate?.image_economics_certified !== true ||
    !immutable
  ) throw new Error("AVANTIQO_VIDEO_CAPACITY_CACHE_IMAGE_LOCK_INVALID");
  return immutable;
}

function validateImage(endpoint, template, immutable) {
  if (
    text(endpoint.name) !== IMAGE_NAME ||
    finite(endpoint.workersMin) !== 0 ||
    finite(endpoint.workersMax) !== 1 ||
    !endpointVolumeIds(endpoint).includes(VOLUME_ID) ||
    text(template.imageName) !== immutable ||
    !text(template.name).startsWith("avantiqo-image-immutable-v9-")
  ) throw new Error("AVANTIQO_VIDEO_CAPACITY_CACHE_IMAGE_V9_CHANGED");
}

function validateCinemaBase(endpoint, template, allowedGpuPool = null) {
  const env = normalizeEnv(template.env);
  const failures = [];
  if (!CINEMA_NAMES.has(text(endpoint.name))) failures.push("name");
  if (finite(endpoint.workersMin) !== 0 || finite(endpoint.workersMax) !== 0) failures.push("scaling");
  if (!endpointVolumeIds(endpoint).includes(VOLUME_ID)) failures.push("volume");
  if (text(template.name) !== EXPECTED_CACHE_TEMPLATE) failures.push("templateName");
  if (text(template.imageName) !== EXPECTED_VIDEO_IMAGE) failures.push("immutableImage");
  if (text(env.AVANTIQO_VIDEO_T2V_MODEL) !== T2V_MODEL) failures.push("t2vModel");
  if (text(env.AVANTIQO_VIDEO_I2V_MODEL) !== I2V_MODEL) failures.push("i2vModel");
  if (text(env.AVANTIQO_VIDEO_HF_CACHE_ROOT) !== CACHE_ROOT) failures.push("cacheRoot");
  if (text(env.AVANTIQO_VIDEO_NETWORK_VOLUME_QUOTA_GB) !== "400") failures.push("quota");
  if (text(env.AVANTIQO_VIDEO_REQUIRE_CACHED_MODEL) !== "0") failures.push("requireCached");
  if (text(env.AVANTIQO_VIDEO_CERTIFIED_CAPABILITIES) !== "__cache_only__") failures.push("cacheOnly");
  if (text(env.AVANTIQO_VIDEO_CERTIFICATION_EXECUTION_ENABLED) !== "0") failures.push("certificationExecution");
  if (allowedGpuPool && !sameSet(list(endpoint.gpuTypeIds), allowedGpuPool)) failures.push("gpuPool");
  if (failures.length) throw new Error(`AVANTIQO_VIDEO_CAPACITY_CACHE_CINEMA_INVALID:${failures.join(",")}`);
}

async function discoverCompatibleGpuStock(managementKey) {
  const queryText = `
    query AvantiqoVideoT2VCapacityAwareGpuPool($input: GpuAvailabilityInput) {
      dataCenters {
        id
        gpuAvailability(input: $input) {
          stockStatus
          gpuTypeId
          gpuTypeDisplayName
          displayName
        }
      }
    }
  `;
  const response = await fetch(`${GRAPHQL_URL}?api_key=${encodeURIComponent(managementKey)}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      query: queryText,
      variables: { input: { gpuCount: 1, minDisk: 5, minMemoryInGb: 40, secureCloud: true } },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok || body?.errors?.length || !Array.isArray(body?.data?.dataCenters)) {
    const detail = redact(text(body?.errors?.map((entry) => entry?.message).filter(Boolean).join(" | ") || raw)).slice(0, 1000);
    throw new Error(`AVANTIQO_VIDEO_CAPACITY_CACHE_GPU_DISCOVERY_FAILED:${response.status}:${detail || "INVALID_RESPONSE"}`);
  }
  const dataCenter = body.data.dataCenters.find((entry) => text(entry?.id) === VOLUME_DC);
  if (!dataCenter) throw new Error(`AVANTIQO_VIDEO_CAPACITY_CACHE_DATACENTER_NOT_FOUND:${VOLUME_DC}`);
  const candidates = list(dataCenter.gpuAvailability)
    .map((gpu) => {
      const id = text(gpu?.gpuTypeId);
      const name = text(gpu?.gpuTypeDisplayName || gpu?.displayName || id);
      return {
        id,
        name,
        stock: text(gpu?.stockStatus) || "UNKNOWN",
        stock_score: stockScore(gpu?.stockStatus),
        economic_score: economicScore(`${id} ${name}`),
      };
    })
    .filter((gpu) => gpu.id && gpu.stock_score > 0 && gpu.economic_score > 0 && COMPATIBLE_CACHE_GPU_PATTERN.test(`${gpu.id} ${gpu.name}`))
    .sort((a, b) => b.stock_score - a.stock_score || b.economic_score - a.economic_score || a.id.localeCompare(b.id));
  if (!candidates.length) throw new Error(`AVANTIQO_VIDEO_CAPACITY_CACHE_NO_COMPATIBLE_GPU_STOCK:${VOLUME_DC}`);
  return candidates;
}

async function waitForQuiescentDisabled(endpointId, managementKey, queueKey) {
  const deadline = Date.now() + RESTORE_WAIT_MS;
  let last = null;
  while (Date.now() <= deadline) {
    const inv = await inventory(managementKey);
    const endpoint = resolveEndpoint(inv.endpoints, endpointId, CINEMA_NAMES, "AVANTIQO_VIDEO_CAPACITY_CACHE_RESTORE_CINEMA");
    const health = healthSummary(await queueRequest(endpointId, "/health", queueKey));
    last = { endpoint: safeEndpoint(endpoint), health };
    if (
      finite(endpoint.workersMin) === 0 &&
      finite(endpoint.workersMax) === 0 &&
      health.jobs.in_queue === 0 &&
      health.jobs.in_progress === 0 &&
      workerCount(health) === 0
    ) return { inv, endpoint, health };
    await sleep(POLL_MS);
  }
  throw new Error(`AVANTIQO_VIDEO_CAPACITY_CACHE_RESTORE_NOT_SAFE:${JSON.stringify(last)}`);
}

if (Number(process.versions.node.split(".")[0]) < 24) {
  throw new Error(`AVANTIQO_VIDEO_CAPACITY_CACHE_NODE24_REQUIRED:${process.version}`);
}
const apply = process.argv.includes("--apply");
if (apply && !approved(process.env.AVANTIQO_VIDEO_WAN22_T2V_CAPACITY_CACHE_APPROVED)) {
  throw new Error("AVANTIQO_VIDEO_WAN22_T2V_CAPACITY_CACHE_APPROVED=YES_REQUIRED");
}

const mainSha = requireCurrentMain();
assertBaseRunnerTracked();
const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
if (!managementKey) throw new Error("AVANTIQO_VIDEO_CAPACITY_CACHE_MANAGEMENT_CREDENTIAL_REQUIRED");
const videoEvidence = JSON.parse(await readFile(VIDEO_EVIDENCE_PATH, "utf8"));
validateVideoEvidence(videoEvidence);
const imageLock = JSON.parse(await readFile(IMAGE_LOCK_PATH, "utf8"));
const imageImmutable = validateImageLock(imageLock);

const initial = await inventory(managementKey);
const volume = validateVolume(initial.volumes);
const image = resolveEndpoint(initial.endpoints, text(process.env.RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID), new Set([IMAGE_NAME]), "AVANTIQO_VIDEO_CAPACITY_CACHE_IMAGE");
const cinema = resolveEndpoint(initial.endpoints, text(process.env.RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID), CINEMA_NAMES, "AVANTIQO_VIDEO_CAPACITY_CACHE_CINEMA");
const imageTemplate = resolveTemplate(initial.templates, text(image.templateId || image.template?.id), "AVANTIQO_VIDEO_CAPACITY_CACHE_IMAGE_TEMPLATE");
const cinemaTemplate = resolveTemplate(initial.templates, text(cinema.templateId || cinema.template?.id), "AVANTIQO_VIDEO_CAPACITY_CACHE_CINEMA_TEMPLATE");
validateImage(image, imageTemplate, imageImmutable);
validateCinemaBase(cinema, cinemaTemplate, ORIGINAL_BLACKWELL_POOL);
const queueCredential = await selectQueueCredential(text(cinema.id), managementKey);
const initialHealth = healthSummary(await queueRequest(text(cinema.id), "/health", queueCredential.key));
if (initialHealth.jobs.in_queue !== 0 || initialHealth.jobs.in_progress !== 0 || workerCount(initialHealth) !== 0) {
  throw new Error(`AVANTIQO_VIDEO_CAPACITY_CACHE_QUEUE_MUST_START_EMPTY:${JSON.stringify(initialHealth)}`);
}

const candidates = await discoverCompatibleGpuStock(managementKey);
const currentStock = candidates.filter((gpu) => ORIGINAL_BLACKWELL_POOL.includes(gpu.id));
const additionalStock = candidates.filter((gpu) => !ORIGINAL_BLACKWELL_POOL.includes(gpu.id));
const additionalIds = additionalStock.slice(0, 3).map((gpu) => gpu.id);
if (!additionalIds.length) {
  throw new Error(`AVANTIQO_VIDEO_CAPACITY_CACHE_NO_ADDITIONAL_GPU_CAPACITY:current=${JSON.stringify(currentStock)}`);
}
const temporaryGpuPool = unique([...ORIGINAL_BLACKWELL_POOL, ...additionalIds]);

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  scope: "VIDEO_ONLY",
  main_sha: mainSha,
  cinema: safeEndpoint(cinema),
  shared_volume: {
    id: text(volume.id),
    name: text(volume.name),
    size_gb: finite(volume.size ?? volume.sizeGb),
    data_center_id: text(volume.dataCenterId),
  },
  live_gpu_stock: {
    current_pool: currentStock,
    additional_compatible: additionalStock,
    temporary_gpu_pool: temporaryGpuPool,
  },
  base_runner: BASE_RUNNER,
  queue_credential_source: queueCredential.source,
  image_v9_preserved: true,
  safety: {
    queue_started_empty: true,
    normal_generation_fail_closed: true,
    image_mutation_planned: false,
    template_mutation_planned: false,
    volume_mutation_planned: false,
    data_center_mutation_planned: false,
    temporary_gpu_pool_mutation_planned: apply,
    base_runner_max_runtime_probe_jobs: apply ? 1 : 0,
    base_runner_max_t2v_cache_jobs: apply ? 1 : 0,
    video_generation_submitted_by_wrapper: false,
    inference_performed_by_wrapper: false,
    production_web_deploy: false,
    pricing_activation_performed: false,
    secrets_printed: false,
  },
}, null, 2));

if (!apply) {
  console.log("AVANTIQO_VIDEO_WAN22_T2V_CAPACITY_AWARE_CACHE_APPLIED=false");
  process.exit(0);
}

// Refetch every owned live object immediately before the temporary GPU-pool write.
const freshMain = requireCurrentMain();
if (freshMain !== mainSha) throw new Error(`AVANTIQO_VIDEO_CAPACITY_CACHE_MAIN_MOVED_BEFORE_WRITE:before=${mainSha}:after=${freshMain}`);
const fresh = await inventory(managementKey);
validateVolume(fresh.volumes);
const freshImage = resolveEndpoint(fresh.endpoints, text(image.id), new Set([IMAGE_NAME]), "AVANTIQO_VIDEO_CAPACITY_CACHE_FRESH_IMAGE");
const freshCinema = resolveEndpoint(fresh.endpoints, text(cinema.id), CINEMA_NAMES, "AVANTIQO_VIDEO_CAPACITY_CACHE_FRESH_CINEMA");
const freshImageTemplate = resolveTemplate(fresh.templates, text(freshImage.templateId || freshImage.template?.id), "AVANTIQO_VIDEO_CAPACITY_CACHE_FRESH_IMAGE_TEMPLATE");
const freshCinemaTemplate = resolveTemplate(fresh.templates, text(freshCinema.templateId || freshCinema.template?.id), "AVANTIQO_VIDEO_CAPACITY_CACHE_FRESH_CINEMA_TEMPLATE");
validateImage(freshImage, freshImageTemplate, imageImmutable);
validateCinemaBase(freshCinema, freshCinemaTemplate, ORIGINAL_BLACKWELL_POOL);
const freshHealth = healthSummary(await queueRequest(text(freshCinema.id), "/health", queueCredential.key));
if (freshHealth.jobs.in_queue !== 0 || freshHealth.jobs.in_progress !== 0 || workerCount(freshHealth) !== 0) {
  throw new Error(`AVANTIQO_VIDEO_CAPACITY_CACHE_QUEUE_CHANGED_BEFORE_WRITE:${JSON.stringify(freshHealth)}`);
}
const freshCandidates = await discoverCompatibleGpuStock(managementKey);
const stillAvailableAdditional = additionalIds.filter((id) => freshCandidates.some((gpu) => gpu.id === id && gpu.stock_score > 0));
if (!stillAvailableAdditional.length) {
  throw new Error("AVANTIQO_VIDEO_CAPACITY_CACHE_SELECTED_CAPACITY_DISAPPEARED_BEFORE_WRITE");
}
const finalTemporaryPool = unique([...ORIGINAL_BLACKWELL_POOL, ...stillAvailableAdditional]);

let gpuPoolMutated = false;
let baseRunnerSucceeded = false;
let baseRunnerError = null;
try {
  await rest(`/endpoints/${encodeURIComponent(text(freshCinema.id))}`, managementKey, {
    method: "PATCH",
    body: { gpuTypeIds: finalTemporaryPool },
  });
  gpuPoolMutated = true;

  const widened = await inventory(managementKey);
  const widenedCinema = resolveEndpoint(widened.endpoints, text(cinema.id), CINEMA_NAMES, "AVANTIQO_VIDEO_CAPACITY_CACHE_WIDEN_VERIFY");
  const widenedTemplate = resolveTemplate(widened.templates, text(widenedCinema.templateId || widenedCinema.template?.id), "AVANTIQO_VIDEO_CAPACITY_CACHE_WIDEN_TEMPLATE");
  validateCinemaBase(widenedCinema, widenedTemplate, finalTemporaryPool);
  const widenedHealth = healthSummary(await queueRequest(text(widenedCinema.id), "/health", queueCredential.key));
  if (widenedHealth.jobs.in_queue !== 0 || widenedHealth.jobs.in_progress !== 0 || workerCount(widenedHealth) !== 0) {
    throw new Error(`AVANTIQO_VIDEO_CAPACITY_CACHE_UNEXPECTED_ACTIVITY_AFTER_WIDEN:${JSON.stringify(widenedHealth)}`);
  }
  console.log(`AVANTIQO_VIDEO_CAPACITY_CACHE_TEMPORARY_GPU_POOL=${JSON.stringify(finalTemporaryPool)}`);

  const child = spawnSync(process.execPath, [BASE_RUNNER, "--apply"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      AVANTIQO_VIDEO_WAN22_T2V_CACHE_APPROVED: "YES",
    },
    stdio: "inherit",
  });
  if (child.error) throw child.error;
  if (child.status !== 0) {
    baseRunnerError = `exit=${child.status}`;
    throw new Error(`AVANTIQO_VIDEO_CAPACITY_CACHE_BASE_RUNNER_FAILED:${baseRunnerError}`);
  }
  baseRunnerSucceeded = true;
} catch (error) {
  baseRunnerError = redact(text(error?.message || error));
} finally {
  if (gpuPoolMutated) {
    try {
      const safe = await waitForQuiescentDisabled(text(cinema.id), managementKey, queueCredential.key);
      const safeTemplate = resolveTemplate(safe.inv.templates, text(safe.endpoint.templateId || safe.endpoint.template?.id), "AVANTIQO_VIDEO_CAPACITY_CACHE_SAFE_RESTORE_TEMPLATE");
      validateCinemaBase(safe.endpoint, safeTemplate, finalTemporaryPool);

      // Refetch current main immediately before the restore write too. A moving main
      // never justifies mutating a live endpoint from stale orchestration logic.
      const restoreMain = requireCurrentMain();
      if (restoreMain !== mainSha) {
        throw new Error(`AVANTIQO_VIDEO_CAPACITY_CACHE_MAIN_MOVED_BEFORE_RESTORE:before=${mainSha}:after=${restoreMain}`);
      }
      await rest(`/endpoints/${encodeURIComponent(text(cinema.id))}`, managementKey, {
        method: "PATCH",
        body: { gpuTypeIds: ORIGINAL_BLACKWELL_POOL },
      });
      const restored = await inventory(managementKey);
      const restoredImage = resolveEndpoint(restored.endpoints, text(image.id), new Set([IMAGE_NAME]), "AVANTIQO_VIDEO_CAPACITY_CACHE_RESTORED_IMAGE");
      const restoredCinema = resolveEndpoint(restored.endpoints, text(cinema.id), CINEMA_NAMES, "AVANTIQO_VIDEO_CAPACITY_CACHE_RESTORED_CINEMA");
      const restoredImageTemplate = resolveTemplate(restored.templates, text(restoredImage.templateId || restoredImage.template?.id), "AVANTIQO_VIDEO_CAPACITY_CACHE_RESTORED_IMAGE_TEMPLATE");
      const restoredCinemaTemplate = resolveTemplate(restored.templates, text(restoredCinema.templateId || restoredCinema.template?.id), "AVANTIQO_VIDEO_CAPACITY_CACHE_RESTORED_CINEMA_TEMPLATE");
      validateImage(restoredImage, restoredImageTemplate, imageImmutable);
      validateCinemaBase(restoredCinema, restoredCinemaTemplate, ORIGINAL_BLACKWELL_POOL);
      const restoredHealth = healthSummary(await queueRequest(text(restoredCinema.id), "/health", queueCredential.key));
      if (restoredHealth.jobs.in_queue !== 0 || restoredHealth.jobs.in_progress !== 0 || workerCount(restoredHealth) !== 0) {
        throw new Error(`AVANTIQO_VIDEO_CAPACITY_CACHE_RESTORED_QUEUE_NOT_EMPTY:${JSON.stringify(restoredHealth)}`);
      }
      gpuPoolMutated = false;
      console.log("AVANTIQO_VIDEO_CAPACITY_CACHE_ORIGINAL_BLACKWELL_POOL_RESTORED=true");
    } catch (restoreError) {
      const restoreMessage = redact(text(restoreError?.message || restoreError));
      console.error(`AVANTIQO_VIDEO_CAPACITY_CACHE_GPU_POOL_RESTORE_FAILED=${restoreMessage}`);
      console.error("AVANTIQO_VIDEO_CAPACITY_CACHE_BLIND_RESTORE_DURING_ACTIVE_STATE=false");
      if (!baseRunnerError) baseRunnerError = restoreMessage;
    }
  }
}

if (baseRunnerError || !baseRunnerSucceeded || gpuPoolMutated) {
  throw new Error(`AVANTIQO_VIDEO_CAPACITY_CACHE_FAILED:${baseRunnerError || "GPU_POOL_NOT_RESTORED"}`);
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: "APPLY",
  scope: "VIDEO_ONLY",
  main_sha: mainSha,
  t2v_cache_base_runner_completed: true,
  temporary_gpu_pool_used: finalTemporaryPool,
  original_blackwell_pool_restored: true,
  queue_finally_empty: true,
  cinema_finally_disabled: true,
  image_v9_preserved: true,
  shared_volume_preserved: true,
  video_generation_submitted_by_wrapper: false,
  inference_performed_by_wrapper: false,
  production_web_deploy: false,
  pricing_activation_performed: false,
  secrets_in_output: false,
  next_action: "CACHE_WAN22_I2V_A14B_CAPACITY_AWARE",
}, null, 2));
console.log("AVANTIQO_VIDEO_WAN22_T2V_CAPACITY_AWARE_CACHE_APPLIED=true");
