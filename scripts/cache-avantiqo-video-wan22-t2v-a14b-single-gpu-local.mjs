import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const GRAPHQL_URL = "https://api.runpod.io/graphql";
const CONTRACT = "AVANTIQO_VIDEO_WAN22_T2V_A14B_SINGLE_GPU_CACHE_FILL_V1";
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
const ORIGINAL_EXECUTION_TIMEOUT_MS = 1_800_000;
const CACHE_ROOT = "/runpod-volume/huggingface-cache/hub";
const T2V_MODEL = "Wan-AI/Wan2.2-T2V-A14B-Diffusers";
const I2V_MODEL = "Wan-AI/Wan2.2-I2V-A14B-Diffusers";
const ORIGINAL_BLACKWELL_POOL = [
  "NVIDIA RTX PRO 6000 Blackwell Max-Q Workstation Edition",
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
  "NVIDIA RTX PRO 6000 Blackwell Workstation Edition",
];
const COMPATIBLE_CACHE_GPU_PATTERN = /(RTX\s*(?:PRO\s*)?6000|A6000|6000\s*Ada|\bL40S?\b|\bA100\b|\bH100\b|\bH200\b|\bB200\b)/i;
const POLL_MS = Math.max(3_000, Number(process.env.AVANTIQO_VIDEO_WAN22_SINGLE_GPU_POLL_MS || 5_000));
const RESTORE_WAIT_MS = Math.max(
  60_000,
  Number(process.env.AVANTIQO_VIDEO_WAN22_SINGLE_GPU_RESTORE_WAIT_MS || 10 * 60 * 1000),
);

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
    encoding: "utf8",
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

function currentMainRefs() {
  shell("git", ["fetch", "origin", "main"], "AVANTIQO_VIDEO_SINGLE_GPU_FETCH_MAIN_FAILED");
  const branch = shell("git", ["branch", "--show-current"], "AVANTIQO_VIDEO_SINGLE_GPU_BRANCH_READ_FAILED");
  if (branch !== "main") throw new Error(`AVANTIQO_VIDEO_SINGLE_GPU_MAIN_REQUIRED:${branch || "DETACHED"}`);
  return {
    head: shell("git", ["rev-parse", "HEAD"], "AVANTIQO_VIDEO_SINGLE_GPU_HEAD_READ_FAILED"),
    remote: shell("git", ["rev-parse", "origin/main"], "AVANTIQO_VIDEO_SINGLE_GPU_REMOTE_READ_FAILED"),
  };
}

function requireCurrentMain() {
  const refs = currentMainRefs();
  if (refs.head !== refs.remote) {
    throw new Error(`AVANTIQO_VIDEO_SINGLE_GPU_LOCAL_MAIN_NOT_CURRENT:head=${refs.head}:origin=${refs.remote}`);
  }
  const dirty = shell(
    "git",
    ["status", "--porcelain", "--untracked-files=no", "--", VIDEO_SOURCE_PATH, BASE_RUNNER],
    "AVANTIQO_VIDEO_SINGLE_GPU_SOURCE_STATUS_FAILED",
  );
  if (dirty) throw new Error("AVANTIQO_VIDEO_SINGLE_GPU_VIDEO_OWNED_FILES_HAVE_LOCAL_CHANGES");
  return refs.head;
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

function assertIdle(health, label) {
  const workers = workerCount(health);
  if (health.jobs.in_queue !== 0 || health.jobs.in_progress !== 0 || workers !== 0) {
    throw new Error(`${label}_NOT_IDLE:queue=${health.jobs.in_queue}:progress=${health.jobs.in_progress}:workers=${workers}`);
  }
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
  }), "AVANTIQO_VIDEO_SINGLE_GPU_REST");
}

async function queueRequest(endpointId, pathname, key, options = {}) {
  return readJson(await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  }), "AVANTIQO_VIDEO_SINGLE_GPU_QUEUE");
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

async function selectQueueCredential(endpointId, candidates, label) {
  const seen = new Set();
  for (const [source, key] of candidates) {
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (await queueCredentialWorks(endpointId, key)) return { source, key };
  }
  throw new Error(`${label}_QUEUE_CREDENTIAL_NOT_FOUND`);
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
  if (!endpoints || !volumes || !templates) throw new Error("AVANTIQO_VIDEO_SINGLE_GPU_INVENTORY_INVALID");
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
  if (matches.length !== 1) throw new Error(`AVANTIQO_VIDEO_SINGLE_GPU_VOLUME_RESOLUTION_FAILED:${matches.length}`);
  const volume = matches[0];
  const size = finite(volume.size ?? volume.sizeGb, 0);
  if (text(volume.id) !== VOLUME_ID || text(volume.name) !== VOLUME_NAME || text(volume.dataCenterId) !== VOLUME_DC || size < MIN_VOLUME_GB) {
    throw new Error(`AVANTIQO_VIDEO_SINGLE_GPU_VOLUME_INVALID:id=${text(volume.id)}:name=${text(volume.name)}:dc=${text(volume.dataCenterId)}:size=${size}`);
  }
  return volume;
}

function validateVideoEvidence(evidence) {
  if (
    evidence?.success !== true ||
    text(evidence.contract) !== "AVANTIQO_VIDEO_WORKER_IMAGE_RESULT_V2" ||
    text(evidence.evidence_revision) !== "AVANTIQO_VIDEO_WORKER_IMAGE_V3_WAN22_A14B_DEFAULT_ROUTING_CACHE_V2" ||
    evidence.source_sha_matches_trigger !== true ||
    text(evidence.source_sha) !== text(evidence.trigger_sha) ||
    text(evidence.entrypoint) !== "handler_v3.py" ||
    text(evidence.runtime_revision) !== "AVANTIQO_VIDEO_WAN22_A14B_DEFAULT_ROUTING_CACHE_V1" ||
    text(evidence.configured_text_to_video_foundation) !== T2V_MODEL ||
    text(evidence.configured_image_to_video_foundation) !== I2V_MODEL ||
    text(evidence.cache_authorization_contract) !== "AVANTIQO_VIDEO_WAN22_CACHE_AUTHORIZATION_V1" ||
    text(evidence.cache_completion_contract) !== "AVANTIQO_VIDEO_WAN22_CACHE_COMPLETION_V1" ||
    Number(evidence.minimum_network_volume_quota_gb_for_cache) !== 400 ||
    evidence.partial_snapshot_satisfies_final_worker_fitness !== false
  ) throw new Error("AVANTIQO_VIDEO_SINGLE_GPU_BUILD_EVIDENCE_INVALID");
  const immutable = text(evidence.immutable_image_reference);
  if (!/^ghcr\.io\/churchillkaron\/avantiqo-video-worker@sha256:[a-f0-9]{64}$/i.test(immutable)) {
    throw new Error("AVANTIQO_VIDEO_SINGLE_GPU_IMMUTABLE_IMAGE_INVALID");
  }
  const templateName = `avantiqo-video-cache-v3-${text(evidence.image_digest).replace("sha256:", "").slice(0, 12)}`;
  return { immutable, templateName };
}

function validateImageLock(lock) {
  const immutable = text(lock?.build_evidence?.immutable_image_reference);
  if (
    lock?.success !== true ||
    lock?.production_certified !== true ||
    text(lock?.status) !== "PRODUCTION_CERTIFIED_NOT_DEPLOYED" ||
    text(lock?.generation_default?.foundation_model) !== "Tongyi-MAI/Z-Image" ||
    lock?.release_gate?.image_runtime_certified !== true ||
    lock?.release_gate?.image_default_routing_certified !== true ||
    lock?.release_gate?.image_human_quality_certified !== true ||
    lock?.release_gate?.image_economics_certified !== true ||
    lock?.release_gate?.production_deploy_completed !== false ||
    !immutable
  ) throw new Error("AVANTIQO_VIDEO_SINGLE_GPU_IMAGE_V9_LOCK_INVALID");
  return immutable;
}

function validateImage(endpoint, template, immutable) {
  if (
    text(endpoint.name) !== IMAGE_NAME ||
    finite(endpoint.workersMin) !== 0 ||
    finite(endpoint.workersMax) !== 1 ||
    !sameSet(endpointVolumeIds(endpoint), [VOLUME_ID]) ||
    text(template.imageName) !== immutable ||
    !text(template.name).startsWith("avantiqo-image-immutable-v9-")
  ) throw new Error("AVANTIQO_VIDEO_SINGLE_GPU_IMAGE_V9_CHANGED");
}

function validateCinema(endpoint, template, videoImmutable, templateName, expectedGpuPool) {
  const env = normalizeEnv(template.env);
  const failures = [];
  if (!CINEMA_NAMES.has(text(endpoint.name))) failures.push("name");
  if (finite(endpoint.workersMin) !== 0 || finite(endpoint.workersMax) !== 0) failures.push("scaling");
  if (!sameSet(endpointVolumeIds(endpoint), [VOLUME_ID])) failures.push("volume");
  if (finite(endpoint.executionTimeoutMs ?? endpoint.executionTimeout) !== ORIGINAL_EXECUTION_TIMEOUT_MS) failures.push("executionTimeout");
  if (!sameSet(list(endpoint.gpuTypeIds), expectedGpuPool)) failures.push("gpuPool");
  if (text(template.name) !== templateName) failures.push("templateName");
  if (text(template.imageName) !== videoImmutable) failures.push("immutableImage");
  if (text(env.AVANTIQO_VIDEO_T2V_MODEL) !== T2V_MODEL) failures.push("t2vModel");
  if (text(env.AVANTIQO_VIDEO_I2V_MODEL) !== I2V_MODEL) failures.push("i2vModel");
  if (text(env.AVANTIQO_VIDEO_HF_CACHE_ROOT) !== CACHE_ROOT) failures.push("cacheRoot");
  if (text(env.AVANTIQO_VIDEO_NETWORK_VOLUME_QUOTA_GB) !== "400") failures.push("quota");
  if (text(env.AVANTIQO_VIDEO_REQUIRE_CACHED_MODEL) !== "0") failures.push("requireCached");
  if (text(env.AVANTIQO_VIDEO_CERTIFIED_CAPABILITIES) !== "__cache_only__") failures.push("cacheOnly");
  if (text(env.AVANTIQO_VIDEO_CERTIFICATION_EXECUTION_ENABLED) !== "0") failures.push("certificationExecution");
  if (failures.length) throw new Error(`AVANTIQO_VIDEO_SINGLE_GPU_CINEMA_INVALID:${failures.join(",")}`);
}

async function discoverCompatibleGpuStock(managementKey) {
  const queryText = `
    query AvantiqoVideoT2VSingleGpu($input: GpuAvailabilityInput) {
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
    throw new Error(`AVANTIQO_VIDEO_SINGLE_GPU_DISCOVERY_FAILED:${response.status}:${detail || "INVALID_RESPONSE"}`);
  }
  const dataCenter = body.data.dataCenters.find((entry) => text(entry?.id) === VOLUME_DC);
  if (!dataCenter) throw new Error(`AVANTIQO_VIDEO_SINGLE_GPU_DATACENTER_NOT_FOUND:${VOLUME_DC}`);
  return list(dataCenter.gpuAvailability)
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
}

function selectSingleGpu(candidates) {
  const nonBlackwell = candidates.filter((gpu) => !ORIGINAL_BLACKWELL_POOL.includes(gpu.id));
  const requested = text(process.env.AVANTIQO_VIDEO_WAN22_T2V_SINGLE_GPU_TYPE_ID);
  if (requested) {
    const exact = nonBlackwell.find((gpu) => gpu.id === requested);
    if (!exact) throw new Error(`AVANTIQO_VIDEO_SINGLE_GPU_REQUESTED_GPU_NOT_LIVE:${requested}`);
    return exact;
  }
  if (!nonBlackwell.length) {
    throw new Error(`AVANTIQO_VIDEO_SINGLE_GPU_NO_NON_BLACKWELL_CAPACITY:${JSON.stringify(candidates)}`);
  }
  return nonBlackwell[0];
}

async function sharedHealth(imageId, imageKey, cinemaId, cinemaKey) {
  const [imageRaw, cinemaRaw] = await Promise.all([
    queueRequest(imageId, "/health", imageKey),
    queueRequest(cinemaId, "/health", cinemaKey),
  ]);
  return { image: healthSummary(imageRaw), cinema: healthSummary(cinemaRaw) };
}

function assertSharedIdle(health, label) {
  assertIdle(health.image, `${label}_IMAGE`);
  assertIdle(health.cinema, `${label}_CINEMA`);
}

async function waitForCinemaDisabledIdle(endpointId, managementKey, queueKey) {
  const deadline = Date.now() + RESTORE_WAIT_MS;
  let last = null;
  while (Date.now() <= deadline) {
    const inv = await inventory(managementKey);
    const endpoint = resolveEndpoint(inv.endpoints, endpointId, CINEMA_NAMES, "AVANTIQO_VIDEO_SINGLE_GPU_RESTORE_CINEMA");
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
  throw new Error(`AVANTIQO_VIDEO_SINGLE_GPU_RESTORE_NOT_SAFE:${JSON.stringify(last)}`);
}

function compatibilitySource(baseSource) {
  const vulnerable = `  console.log(\`AVANTIQO_VIDEO_T2V_CACHE_\${label}_JOB=\${jobId}\`);\n  const job = await waitForJob(endpointId, jobId, key, label, waitMs);\n  return { job, jobId };`;
  const guarded = `  console.log(\`AVANTIQO_VIDEO_T2V_CACHE_\${label}_JOB=\${jobId}\`);\n  try {\n    const job = await waitForJob(endpointId, jobId, key, label, waitMs);\n    return { job, jobId };\n  } catch (error) {\n    try {\n      await queueRequest(endpointId, \`/cancel/\${encodeURIComponent(jobId)}\`, key, { method: \"POST\" });\n      console.error(\`AVANTIQO_VIDEO_T2V_CACHE_\${label}_WAIT_TIMEOUT_CANCEL_REQUESTED=true job=\${jobId}\`);\n    } catch (cancelError) {\n      console.error(\`AVANTIQO_VIDEO_T2V_CACHE_\${label}_WAIT_TIMEOUT_CANCEL_FAILED=\${redact(text(cancelError?.message || cancelError))}\`);\n    }\n    throw error;\n  }`;
  const count = baseSource.split(vulnerable).length - 1;
  if (count !== 1) {
    throw new Error(`AVANTIQO_VIDEO_SINGLE_GPU_BASE_RUNNER_COMPATIBILITY_ANCHOR_INVALID:${count}`);
  }
  return baseSource.replace(vulnerable, guarded);
}

async function createCompatibilityCopy() {
  const baseSource = await readFile(BASE_RUNNER, "utf8");
  const source = compatibilitySource(baseSource);
  const dir = await mkdtemp(join(tmpdir(), "avantiqo-video-single-gpu-"));
  const path = join(dir, "cache-avantiqo-video-wan22-t2v-a14b-compat.mjs");
  await writeFile(path, source, "utf8");
  const syntax = spawnSync(process.execPath, ["--check", path], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (syntax.status !== 0) {
    await rm(dir, { recursive: true, force: true });
    throw new Error(`AVANTIQO_VIDEO_SINGLE_GPU_COMPATIBILITY_SYNTAX_FAILED:${redact(text(syntax.stderr || syntax.stdout)).slice(0, 1200)}`);
  }
  return { dir, path };
}

if (Number(process.versions.node.split(".")[0]) < 24) {
  throw new Error(`AVANTIQO_VIDEO_SINGLE_GPU_NODE24_REQUIRED:${process.version}`);
}

const apply = process.argv.includes("--apply");
if (apply && !approved(process.env.AVANTIQO_VIDEO_WAN22_T2V_SINGLE_GPU_CACHE_APPROVED)) {
  throw new Error("AVANTIQO_VIDEO_WAN22_T2V_SINGLE_GPU_CACHE_APPROVED=YES_REQUIRED");
}

const mainSha = requireCurrentMain();
const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
if (!managementKey) throw new Error("AVANTIQO_VIDEO_SINGLE_GPU_MANAGEMENT_CREDENTIAL_REQUIRED");

const videoEvidence = JSON.parse(await readFile(VIDEO_EVIDENCE_PATH, "utf8"));
const { immutable: videoImmutable, templateName } = validateVideoEvidence(videoEvidence);
const imageLock = JSON.parse(await readFile(IMAGE_LOCK_PATH, "utf8"));
const imageImmutable = validateImageLock(imageLock);

const initial = await inventory(managementKey);
const volume = validateVolume(initial.volumes);
const image = resolveEndpoint(
  initial.endpoints,
  text(process.env.RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID),
  new Set([IMAGE_NAME]),
  "AVANTIQO_VIDEO_SINGLE_GPU_IMAGE",
);
const cinema = resolveEndpoint(
  initial.endpoints,
  text(process.env.RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID),
  CINEMA_NAMES,
  "AVANTIQO_VIDEO_SINGLE_GPU_CINEMA",
);
const imageTemplate = resolveTemplate(initial.templates, text(image.templateId || image.template?.id), "AVANTIQO_VIDEO_SINGLE_GPU_IMAGE_TEMPLATE");
const cinemaTemplate = resolveTemplate(initial.templates, text(cinema.templateId || cinema.template?.id), "AVANTIQO_VIDEO_SINGLE_GPU_CINEMA_TEMPLATE");
validateImage(image, imageTemplate, imageImmutable);
validateCinema(cinema, cinemaTemplate, videoImmutable, templateName, ORIGINAL_BLACKWELL_POOL);

const imageQueueCredential = await selectQueueCredential(
  text(image.id),
  [
    ["RUNPOD_AVANTIQO_IMAGE_API_KEY", text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY)],
    ["RUNPOD_API_KEY", text(process.env.RUNPOD_API_KEY)],
    ["RUNPOD_MANAGEMENT_API_KEY", managementKey],
  ],
  "AVANTIQO_VIDEO_SINGLE_GPU_IMAGE",
);
const cinemaQueueCredential = await selectQueueCredential(
  text(cinema.id),
  [
    ["RUNPOD_AVANTIQO_VIDEO_API_KEY", text(process.env.RUNPOD_AVANTIQO_VIDEO_API_KEY)],
    ["RUNPOD_API_KEY", text(process.env.RUNPOD_API_KEY)],
    ["RUNPOD_MANAGEMENT_API_KEY", managementKey],
  ],
  "AVANTIQO_VIDEO_SINGLE_GPU_CINEMA",
);

const initialHealth = await sharedHealth(
  text(image.id),
  imageQueueCredential.key,
  text(cinema.id),
  cinemaQueueCredential.key,
);
assertSharedIdle(initialHealth, "AVANTIQO_VIDEO_SINGLE_GPU_INITIAL_SHARED_VOLUME");

const candidates = await discoverCompatibleGpuStock(managementKey);
const selectedGpu = selectSingleGpu(candidates);

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  scope: "VIDEO_WITH_IMAGE_SHARED_VOLUME_GUARD_ONLY",
  main_sha: mainSha,
  selected_gpu: selectedGpu,
  automatic_fallback_gpu_types: 0,
  retry_attempts: apply ? 1 : 0,
  cinema_baseline: safeEndpoint(cinema),
  shared_volume: {
    id: text(volume.id),
    name: text(volume.name),
    size_gb: finite(volume.size ?? volume.sizeGb),
    data_center_id: text(volume.dataCenterId),
  },
  shared_volume_health: initialHealth,
  image_v9: {
    preserved: true,
    endpoint_mutation_planned: false,
    template_mutation_planned: false,
  },
  compatibility_runner: {
    base_runner: BASE_RUNNER,
    timeout_path_cancel_guard: true,
    fail_closed_if_base_runner_drifted: true,
  },
  queue_credentials: {
    image_source: imageQueueCredential.source,
    cinema_source: cinemaQueueCredential.source,
  },
  safety: {
    image_and_cinema_must_start_idle: true,
    cinema_must_start_disabled: true,
    cinema_original_execution_timeout_ms: ORIGINAL_EXECUTION_TIMEOUT_MS,
    cinema_original_blackwell_pool_preserved_after_run: true,
    single_gpu_type_only: true,
    no_automatic_second_attempt: true,
    image_mutation_planned: false,
    template_mutation_planned: false,
    volume_mutation_planned: false,
    data_center_mutation_planned: false,
    video_generation_submitted_by_wrapper: false,
    production_web_deploy: false,
    pricing_activation_performed: false,
    secrets_printed: false,
  },
}, null, 2));

if (!apply) {
  console.log("AVANTIQO_VIDEO_WAN22_T2V_A14B_SINGLE_GPU_CACHE_APPLIED=false");
  process.exit(0);
}

const compatibility = await createCompatibilityCopy();
let gpuMutated = false;
let baseRunnerSucceeded = false;
let failure = null;
let mainMovedDuringRun = false;

try {
  const freshMain = requireCurrentMain();
  if (freshMain !== mainSha) {
    throw new Error(`AVANTIQO_VIDEO_SINGLE_GPU_MAIN_MOVED_BEFORE_WRITE:before=${mainSha}:after=${freshMain}`);
  }

  const fresh = await inventory(managementKey);
  validateVolume(fresh.volumes);
  const freshImage = resolveEndpoint(fresh.endpoints, text(image.id), new Set([IMAGE_NAME]), "AVANTIQO_VIDEO_SINGLE_GPU_FRESH_IMAGE");
  const freshCinema = resolveEndpoint(fresh.endpoints, text(cinema.id), CINEMA_NAMES, "AVANTIQO_VIDEO_SINGLE_GPU_FRESH_CINEMA");
  const freshImageTemplate = resolveTemplate(fresh.templates, text(freshImage.templateId || freshImage.template?.id), "AVANTIQO_VIDEO_SINGLE_GPU_FRESH_IMAGE_TEMPLATE");
  const freshCinemaTemplate = resolveTemplate(fresh.templates, text(freshCinema.templateId || freshCinema.template?.id), "AVANTIQO_VIDEO_SINGLE_GPU_FRESH_CINEMA_TEMPLATE");
  validateImage(freshImage, freshImageTemplate, imageImmutable);
  validateCinema(freshCinema, freshCinemaTemplate, videoImmutable, templateName, ORIGINAL_BLACKWELL_POOL);
  const freshHealth = await sharedHealth(
    text(freshImage.id),
    imageQueueCredential.key,
    text(freshCinema.id),
    cinemaQueueCredential.key,
  );
  assertSharedIdle(freshHealth, "AVANTIQO_VIDEO_SINGLE_GPU_PRE_WRITE_SHARED_VOLUME");

  const refreshedCandidates = await discoverCompatibleGpuStock(managementKey);
  const refreshedSelected = refreshedCandidates.find((gpu) => gpu.id === selectedGpu.id && gpu.stock_score > 0);
  if (!refreshedSelected) {
    throw new Error(`AVANTIQO_VIDEO_SINGLE_GPU_SELECTED_CAPACITY_DISAPPEARED:${selectedGpu.id}`);
  }

  await rest(`/endpoints/${encodeURIComponent(text(freshCinema.id))}`, managementKey, {
    method: "PATCH",
    body: { gpuTypeIds: [selectedGpu.id] },
  });
  gpuMutated = true;

  const claimed = await inventory(managementKey);
  const claimedImage = resolveEndpoint(claimed.endpoints, text(image.id), new Set([IMAGE_NAME]), "AVANTIQO_VIDEO_SINGLE_GPU_CLAIMED_IMAGE");
  const claimedCinema = resolveEndpoint(claimed.endpoints, text(cinema.id), CINEMA_NAMES, "AVANTIQO_VIDEO_SINGLE_GPU_CLAIMED_CINEMA");
  const claimedImageTemplate = resolveTemplate(claimed.templates, text(claimedImage.templateId || claimedImage.template?.id), "AVANTIQO_VIDEO_SINGLE_GPU_CLAIMED_IMAGE_TEMPLATE");
  const claimedCinemaTemplate = resolveTemplate(claimed.templates, text(claimedCinema.templateId || claimedCinema.template?.id), "AVANTIQO_VIDEO_SINGLE_GPU_CLAIMED_CINEMA_TEMPLATE");
  validateImage(claimedImage, claimedImageTemplate, imageImmutable);
  validateCinema(claimedCinema, claimedCinemaTemplate, videoImmutable, templateName, [selectedGpu.id]);
  const claimedHealth = await sharedHealth(
    text(claimedImage.id),
    imageQueueCredential.key,
    text(claimedCinema.id),
    cinemaQueueCredential.key,
  );
  assertSharedIdle(claimedHealth, "AVANTIQO_VIDEO_SINGLE_GPU_PRE_RUN_SHARED_VOLUME");
  console.log(`AVANTIQO_VIDEO_SINGLE_GPU_TEMPORARY_GPU_TYPE=${selectedGpu.id}`);

  const child = spawnSync(process.execPath, [compatibility.path, "--apply"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      AVANTIQO_VIDEO_WAN22_T2V_CACHE_APPROVED: "YES",
    },
    stdio: "inherit",
  });
  if (child.error) throw child.error;
  if (child.status !== 0) {
    throw new Error(`AVANTIQO_VIDEO_SINGLE_GPU_COMPATIBILITY_RUNNER_FAILED:exit=${child.status}`);
  }
  baseRunnerSucceeded = true;
} catch (error) {
  failure = redact(text(error?.message || error));
} finally {
  await rm(compatibility.dir, { recursive: true, force: true });

  if (gpuMutated) {
    try {
      const safe = await waitForCinemaDisabledIdle(text(cinema.id), managementKey, cinemaQueueCredential.key);
      const safeTemplate = resolveTemplate(safe.inv.templates, text(safe.endpoint.templateId || safe.endpoint.template?.id), "AVANTIQO_VIDEO_SINGLE_GPU_SAFE_RESTORE_TEMPLATE");
      validateCinema(safe.endpoint, safeTemplate, videoImmutable, templateName, [selectedGpu.id]);

      const refs = currentMainRefs();
      mainMovedDuringRun = refs.head !== refs.remote || refs.head !== mainSha;
      if (mainMovedDuringRun) {
        console.error(`AVANTIQO_VIDEO_SINGLE_GPU_MAIN_MOVED_DURING_RUN:head=${refs.head}:origin=${refs.remote}:start=${mainSha}`);
      }

      await rest(`/endpoints/${encodeURIComponent(text(cinema.id))}`, managementKey, {
        method: "PATCH",
        body: { gpuTypeIds: ORIGINAL_BLACKWELL_POOL },
      });

      const restored = await inventory(managementKey);
      const restoredImage = resolveEndpoint(restored.endpoints, text(image.id), new Set([IMAGE_NAME]), "AVANTIQO_VIDEO_SINGLE_GPU_RESTORED_IMAGE");
      const restoredCinema = resolveEndpoint(restored.endpoints, text(cinema.id), CINEMA_NAMES, "AVANTIQO_VIDEO_SINGLE_GPU_RESTORED_CINEMA");
      const restoredImageTemplate = resolveTemplate(restored.templates, text(restoredImage.templateId || restoredImage.template?.id), "AVANTIQO_VIDEO_SINGLE_GPU_RESTORED_IMAGE_TEMPLATE");
      const restoredCinemaTemplate = resolveTemplate(restored.templates, text(restoredCinema.templateId || restoredCinema.template?.id), "AVANTIQO_VIDEO_SINGLE_GPU_RESTORED_CINEMA_TEMPLATE");
      validateVolume(restored.volumes);
      validateImage(restoredImage, restoredImageTemplate, imageImmutable);
      validateCinema(restoredCinema, restoredCinemaTemplate, videoImmutable, templateName, ORIGINAL_BLACKWELL_POOL);
      const restoredCinemaHealth = healthSummary(await queueRequest(text(restoredCinema.id), "/health", cinemaQueueCredential.key));
      assertIdle(restoredCinemaHealth, "AVANTIQO_VIDEO_SINGLE_GPU_RESTORED_CINEMA");
      gpuMutated = false;
      console.log("AVANTIQO_VIDEO_SINGLE_GPU_ORIGINAL_BLACKWELL_POOL_RESTORED=true");
    } catch (restoreError) {
      const restoreMessage = redact(text(restoreError?.message || restoreError));
      console.error(`AVANTIQO_VIDEO_SINGLE_GPU_RESTORE_FAILED=${restoreMessage}`);
      console.error("AVANTIQO_VIDEO_SINGLE_GPU_BLIND_RESTORE_DURING_ACTIVE_CINEMA=false");
      if (!failure) failure = restoreMessage;
    }
  }
}

if (failure || !baseRunnerSucceeded || gpuMutated || mainMovedDuringRun) {
  throw new Error(`AVANTIQO_VIDEO_SINGLE_GPU_FAILED:${failure || (mainMovedDuringRun ? "MAIN_MOVED_DURING_RUN" : "GPU_NOT_RESTORED")}`);
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: "APPLY",
  scope: "VIDEO_WITH_IMAGE_SHARED_VOLUME_GUARD_ONLY",
  main_sha: mainSha,
  selected_gpu_type: selectedGpu.id,
  selected_gpu_stock: selectedGpu.stock,
  single_gpu_attempt_completed: true,
  automatic_fallback_gpu_types: 0,
  compatibility_timeout_cancel_guard_used: true,
  original_blackwell_pool_restored: true,
  cinema_workers_min: 0,
  cinema_workers_max: 0,
  cinema_execution_timeout_restored_ms: ORIGINAL_EXECUTION_TIMEOUT_MS,
  image_v9_preserved: true,
  image_endpoint_mutated: false,
  shared_volume_preserved: true,
  video_generation_submitted_by_wrapper: false,
  production_web_deploy: false,
  pricing_activation_performed: false,
  secrets_in_output: false,
  next_action: "INSPECT_T2V_CACHE_RESULT_BEFORE_ANY_I2V_WORK",
}, null, 2));
console.log("AVANTIQO_VIDEO_WAN22_T2V_A14B_SINGLE_GPU_CACHE_APPLIED=true");
