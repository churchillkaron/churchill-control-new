import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { spawnSync } from "node:child_process";
import {
  AVANTIQO_RUNPOD_SHARED_VOLUME_POLICY,
  classifyManagedVolumeName,
  groupCacheVolumes,
  managedCacheVolumes,
  sharedVolumeGroup,
  sharedVolumePolicySummary,
} from "./lib/avantiqo-runpod-shared-volumes.mjs";

const CONTRACT = "AVANTIQO_CODE_CAPACITY_RELOCATION_V1";
const CODE_ENDPOINT_NAME = "avantiqo-code-v1";
const SHARED_GROUP = sharedVolumeGroup("INTELLIGENCE_CODE");
const REST = "https://rest.runpod.io/v1";
const SERVERLESS = "https://api.runpod.ai/v2";
const GRAPHQL = "https://api.runpod.io/graphql";
const ENGINE_CONTRACT = "AVANTIQO_CODE_ENGINE_V1";
const FOUNDATION_MODEL = "Qwen/Qwen3-Coder-30B-A3B-Instruct";
const RUNTIME_MODEL = "Qwen/Qwen3-Coder-30B-A3B-Instruct-FP8";
const MIN_GPU_MEMORY_GB = 80;
const TARGET_VOLUME_SIZE_GB = 80;
const STORAGE_USD_PER_GB_MONTH = 0.07;
const POLL_MS = 5000;
const QUEUE_TIMEOUT_MS = 5 * 60 * 1000;
const JOB_TIMEOUT_MS = 20 * 60 * 1000;
const QUIESCENCE_TIMEOUT_MS = 5 * 60 * 1000;

const GPU_PROFILES = Object.freeze([
  Object.freeze({ key: "RTX_PRO_6000_96GB", match: /RTX\s*(?:PRO\s*6000|6000\s*PRO)/i, exclude: /\bMIG\b/i, vram_gb: 96, usd_per_hour_reference: 3.49, preference: 6000 }),
  Object.freeze({ key: "H100_NVL_94GB", match: /H100.*NVL|NVL.*H100/i, exclude: null, vram_gb: 94, usd_per_hour_reference: 4.79, preference: 5600 }),
  Object.freeze({ key: "H100_80GB", match: /\bH100\b/i, exclude: /NVL|\bMIG\b/i, vram_gb: 80, usd_per_hour_reference: 4.79, preference: 5500 }),
  Object.freeze({ key: "H200_141GB", match: /\bH200\b/i, exclude: /\bMIG\b/i, vram_gb: 141, usd_per_hour_reference: 5.93, preference: 5300 }),
  Object.freeze({ key: "B200_180GB", match: /\bB200\b/i, exclude: /\bMIG\b/i, vram_gb: 180, usd_per_hour_reference: 8.64, preference: 5100 }),
]);

function text(value) { return String(value ?? "").trim(); }
function array(value) { return Array.isArray(value) ? value : []; }
function list(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return text(value) ? text(value).split(",").map((entry) => entry.trim()).filter(Boolean) : [];
}
function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function unique(values) { return [...new Set(values.map(text).filter(Boolean))]; }
function upper(value) { return text(value).toUpperCase(); }
function yes(value) { return ["YES", "TRUE", "1", "APPROVED", "ON"].includes(upper(value)); }
function stockRank(value) { return ({ HIGH: 4, MEDIUM: 3, LOW: 2 }[upper(value)] || 0); }
function sleep(ms) { return new Promise((resolveSleep) => setTimeout(resolveSleep, ms)); }
function sameSet(left, right) {
  const a = unique(left).sort();
  const b = unique(right).sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
function endpointVolumeIds(endpoint = {}) {
  return unique([endpoint.networkVolumeId, ...list(endpoint.networkVolumeIds)]);
}
function endpointDataCenters(endpoint = {}) { return list(endpoint.dataCenterIds); }
function endpointGpuTypes(endpoint = {}) { return list(endpoint.gpuTypeIds); }

function loadLocalEnvironment() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return false;
  loadEnvFile(path);
  return true;
}

function command(name, args, code) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`${code}:${text(result.stderr || result.stdout).slice(0, 900) || `exit=${result.status}`}`);
  }
  return text(result.stdout);
}

function requireCurrentMain() {
  command("git", ["fetch", "origin", "main"], "CODE_CAPACITY_RELOCATION_FETCH_MAIN_FAILED");
  const branch = command("git", ["branch", "--show-current"], "CODE_CAPACITY_RELOCATION_BRANCH_READ_FAILED");
  if (branch !== "main") throw new Error(`CODE_CAPACITY_RELOCATION_MAIN_REQUIRED:${branch || "DETACHED"}`);
  const head = command("git", ["rev-parse", "HEAD"], "CODE_CAPACITY_RELOCATION_HEAD_READ_FAILED");
  const origin = command("git", ["rev-parse", "origin/main"], "CODE_CAPACITY_RELOCATION_ORIGIN_READ_FAILED");
  if (head !== origin) {
    throw new Error(`CODE_CAPACITY_RELOCATION_LOCAL_MAIN_NOT_CURRENT:head=${head}:origin=${origin}`);
  }
  return head;
}

function gpuProfile(gpu = {}) {
  const label = [gpu?.gpuTypeId, gpu?.gpuTypeDisplayName, gpu?.displayName].map(text).filter(Boolean).join(" ");
  if (/\bMIG\b/i.test(label)) return null;
  return GPU_PROFILES.find(
    (profile) => profile.match.test(label) && !(profile.exclude && profile.exclude.test(label)),
  ) || null;
}

function capacityRow(dataCenter = {}, gpu = {}) {
  const profile = gpuProfile(gpu);
  return {
    data_center_id: text(dataCenter?.id) || null,
    data_center_name: text(dataCenter?.name) || null,
    location: text(dataCenter?.location) || null,
    storage_support: dataCenter?.storageSupport === true,
    gpu_type_id: text(gpu?.gpuTypeId) || null,
    gpu_name: text(gpu?.gpuTypeDisplayName || gpu?.displayName || gpu?.gpuTypeId) || null,
    profile: profile?.key || null,
    vram_gb: profile?.vram_gb || null,
    native_fp8: Boolean(profile),
    available: gpu?.available === true,
    stock_status: text(gpu?.stockStatus) || "UNAVAILABLE",
    stock_rank: stockRank(gpu?.stockStatus),
    usd_per_hour_reference: profile?.usd_per_hour_reference ?? null,
    preference: profile?.preference || 0,
  };
}

function rankedRows(rows) {
  return [...rows].sort((left, right) =>
    right.stock_rank - left.stock_rank ||
    left.usd_per_hour_reference - right.usd_per_hour_reference ||
    right.preference - left.preference ||
    String(left.gpu_type_id).localeCompare(String(right.gpu_type_id)),
  );
}

function safeEndpoint(endpoint = {}) {
  return {
    id: text(endpoint?.id) || null,
    name: text(endpoint?.name) || null,
    version: number(endpoint?.version, null),
    template_id: text(endpoint?.templateId || endpoint?.template?.id) || null,
    network_volume_ids: endpointVolumeIds(endpoint),
    data_center_ids: endpointDataCenters(endpoint),
    gpu_type_ids: endpointGpuTypes(endpoint),
    workers_min: number(endpoint?.workersMin),
    workers_max: number(endpoint?.workersMax),
    scaler_type: text(endpoint?.scalerType) || null,
    scaler_value: number(endpoint?.scalerValue, null),
    idle_timeout_seconds: number(endpoint?.idleTimeout, null),
    execution_timeout_ms: number(endpoint?.executionTimeoutMs ?? endpoint?.executionTimeout, null),
    flashboot: endpoint?.flashBoot ?? endpoint?.flashboot ?? null,
  };
}

function stableEndpoint(endpoint = {}) {
  const row = safeEndpoint(endpoint);
  return {
    template_id: row.template_id,
    scaler_type: row.scaler_type,
    scaler_value: row.scaler_value,
    idle_timeout_seconds: row.idle_timeout_seconds,
    execution_timeout_ms: row.execution_timeout_ms,
    flashboot: row.flashboot,
  };
}

function safeVolume(volume = {}) {
  return {
    id: text(volume?.id) || null,
    name: text(volume?.name) || null,
    size_gb: number(volume?.size ?? volume?.sizeGb, null),
    data_center_id: text(volume?.dataCenterId) || null,
    group: classifyManagedVolumeName(volume?.name)?.id || null,
  };
}

function healthCounters(health = {}) {
  const jobs = health.jobs || {};
  const workers = health.workers || {};
  return {
    jobs: {
      in_queue: number(jobs.inQueue ?? jobs.in_queue),
      in_progress: number(jobs.inProgress ?? jobs.in_progress),
      completed: number(jobs.completed),
      failed: number(jobs.failed),
      retried: number(jobs.retried),
    },
    workers: {
      idle: number(workers.idle),
      initializing: number(workers.initializing),
      ready: number(workers.ready),
      running: number(workers.running),
      throttled: number(workers.throttled),
      unhealthy: number(workers.unhealthy),
    },
  };
}

function activeExecution(counters) {
  return counters.jobs.in_queue + counters.jobs.in_progress + counters.workers.initializing + counters.workers.running;
}

function endpointUsers(endpoints, volumeId, ignoredEndpointId = null) {
  return array(endpoints)
    .filter((endpoint) => text(endpoint?.id) !== text(ignoredEndpointId))
    .filter((endpoint) => endpointVolumeIds(endpoint).includes(volumeId))
    .map((endpoint) => ({ id: text(endpoint?.id) || null, name: text(endpoint?.name) || null }));
}

async function readResponse(response, label) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    throw new Error(`${label}_HTTP_${response.status}:${text(body?.message || body?.error || raw).slice(0, 1000)}`);
  }
  return body;
}

async function rest(path, key, options = {}) {
  return readResponse(await fetch(`${REST}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  }), "RUNPOD_REST");
}

async function serverless(endpointId, path, key, options = {}) {
  return readResponse(await fetch(`${SERVERLESS}/${encodeURIComponent(endpointId)}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  }), "RUNPOD_SERVERLESS");
}

async function discoverDatacenters(key) {
  const query = `query AvantiqoCodeCapacityRelocation($input: GpuAvailabilityInput) { dataCenters { id name location storageSupport gpuAvailability(input: $input) { available stockStatus gpuTypeId gpuTypeDisplayName displayName } } }`;
  const response = await fetch(`${GRAPHQL}?api_key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      variables: { input: { gpuCount: 1, minDisk: 5, minMemoryInGb: MIN_GPU_MEMORY_GB, secureCloud: true } },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok || body?.errors?.length || !Array.isArray(body?.data?.dataCenters)) {
    throw new Error(`RUNPOD_GPU_AVAILABILITY_FAILED:${response.status}:${text(body?.errors?.map((entry) => entry?.message).join(" | ") || raw).slice(0, 1000)}`);
  }
  return body.data.dataCenters;
}

function resolveCodeEndpoint(endpoints, configuredId) {
  const matches = configuredId
    ? endpoints.filter((endpoint) => text(endpoint?.id) === configuredId)
    : endpoints.filter((endpoint) => text(endpoint?.name) === CODE_ENDPOINT_NAME);
  if (matches.length !== 1 || text(matches[0]?.name) !== CODE_ENDPOINT_NAME) {
    throw new Error(`CODE_CAPACITY_RELOCATION_ENDPOINT_RESOLUTION_FAILED:matches=${matches.length}`);
  }
  return { endpoint: matches[0], source: configuredId ? "ENV_VERIFIED" : "EXACT_NAME" };
}

function capacityByRegion(dataCenters) {
  const rows = dataCenters
    .flatMap((dc) => array(dc?.gpuAvailability).map((gpu) => capacityRow(dc, gpu)))
    .filter((row) => row.storage_support && row.profile && row.vram_gb >= MIN_GPU_MEMORY_GB && row.gpu_type_id);
  const regions = dataCenters
    .filter((dc) => dc?.storageSupport === true)
    .map((dc) => {
      const available = rankedRows(rows.filter(
        (row) => row.data_center_id === text(dc?.id) && row.available && row.stock_rank > 0,
      ));
      return {
        data_center_id: text(dc?.id) || null,
        data_center_name: text(dc?.name) || null,
        location: text(dc?.location) || null,
        best_stock_rank: Math.max(0, ...available.map((row) => row.stock_rank)),
        available_gpu_pool: available,
      };
    })
    .filter((region) => region.data_center_id);
  return { rows, regions };
}

function selectTarget({ capacity, sourceDcId, groupVolumes, endpoints }) {
  const sourceRegion = capacity.regions.find((region) => region.data_center_id === sourceDcId) || null;
  const sourceRank = sourceRegion?.best_stock_rank || 0;
  const groupVolumeByDc = new Map();
  for (const volume of groupVolumes) {
    const dc = text(volume?.dataCenterId);
    if (!dc) continue;
    const users = endpointUsers(endpoints, text(volume?.id), null);
    const current = groupVolumeByDc.get(dc);
    const score = users.length ? 2 : 1;
    if (!current || score > current.score) groupVolumeByDc.set(dc, { volume, users, score });
  }
  const candidates = capacity.regions
    .filter((region) => region.data_center_id !== sourceDcId)
    .filter((region) => region.best_stock_rank > sourceRank && region.available_gpu_pool.length)
    .map((region) => ({ ...region, existing_group_volume: groupVolumeByDc.get(region.data_center_id) || null }))
    .sort((left, right) =>
      right.best_stock_rank - left.best_stock_rank ||
      Number(Boolean(right.existing_group_volume?.users?.length)) - Number(Boolean(left.existing_group_volume?.users?.length)) ||
      right.available_gpu_pool.length - left.available_gpu_pool.length ||
      left.available_gpu_pool[0].usd_per_hour_reference - right.available_gpu_pool[0].usd_per_hour_reference ||
      right.available_gpu_pool[0].preference - left.available_gpu_pool[0].preference ||
      left.data_center_id.localeCompare(right.data_center_id),
    );
  return { sourceRegion, sourceRank, candidates, selected: candidates[0] || null };
}

async function waitForQuiescence(endpointId, key, label) {
  const deadline = Date.now() + QUIESCENCE_TIMEOUT_MS;
  let last = null;
  while (Date.now() < deadline) {
    last = healthCounters(await serverless(endpointId, "/health", key));
    if (last.workers.unhealthy > 0) throw new Error(`${label}_UNHEALTHY_WORKER:${last.workers.unhealthy}`);
    if (activeExecution(last) === 0) return last;
    console.log(JSON.stringify({ event: "AVANTIQO_CODE_CAPACITY_RELOCATION_QUIESCENCE_WAIT", label, health: last }));
    await sleep(POLL_MS);
  }
  throw new Error(`${label}_QUIESCENCE_TIMEOUT:${JSON.stringify(last)}`);
}

async function waitForJob(endpointId, key, jobId, label) {
  const started = Date.now();
  let body = await serverless(endpointId, `/status/${encodeURIComponent(jobId)}`, key);
  let status = upper(body?.status);
  let lastPrinted = 0;
  while (!["COMPLETED", "FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(status)) {
    const elapsed = Date.now() - started;
    if (status === "IN_QUEUE" && elapsed >= QUEUE_TIMEOUT_MS) {
      await serverless(endpointId, `/cancel/${encodeURIComponent(jobId)}`, key, { method: "POST" }).catch(() => null);
      throw new Error(`${label}_QUEUE_TIMEOUT:${jobId}:${Math.round(elapsed / 1000)}s`);
    }
    if (elapsed >= JOB_TIMEOUT_MS) {
      await serverless(endpointId, `/cancel/${encodeURIComponent(jobId)}`, key, { method: "POST" }).catch(() => null);
      throw new Error(`${label}_JOB_TIMEOUT:${jobId}:${Math.round(elapsed / 1000)}s`);
    }
    if (Date.now() - lastPrinted >= 15_000) {
      const health = await serverless(endpointId, "/health", key).catch(() => null);
      console.log(JSON.stringify({
        event: `${label}_PROGRESS`,
        job_id: jobId,
        status,
        elapsed_seconds: Math.round(elapsed / 1000),
        health: health ? healthCounters(health) : null,
      }));
      lastPrinted = Date.now();
    }
    await sleep(POLL_MS);
    body = await serverless(endpointId, `/status/${encodeURIComponent(jobId)}`, key);
    status = upper(body?.status);
  }
  if (status !== "COMPLETED") {
    throw new Error(`${label}_${status}:${text(body?.error || body?.output?.error || body?.message)}`);
  }
  return body;
}

async function submitCache(endpointId, key) {
  const submit = await serverless(endpointId, "/run", key, {
    method: "POST",
    body: { input: {
      contract: ENGINE_CONTRACT,
      capability: "ai.code.debug",
      organization_id: "benchmark-only",
      organization_service_id: "benchmark-only",
      usage_id: `code-capacity-cache-${Date.now()}`,
      instruction: "Cache the source-locked Avantiqo Code FP8 runtime model only; do not perform inference.",
      structured_specification: { cache_runtime_model: true, target_model: RUNTIME_MODEL, purpose: "CODE_CAPACITY_RELOCATION_CACHE" },
    } },
  });
  const jobId = text(submit?.id);
  if (!jobId) throw new Error("CODE_CAPACITY_CACHE_JOB_ID_REQUIRED");
  console.log(`AVANTIQO_CODE_CAPACITY_CACHE_JOB=${jobId}`);
  const completed = await waitForJob(endpointId, key, jobId, "AVANTIQO_CODE_CAPACITY_CACHE");
  const output = completed?.output || {};
  if (text(output.runtime_model) !== RUNTIME_MODEL || output.cache_ready !== true || output.inference_performed !== false || output.engine_loaded !== false) {
    throw new Error(`CODE_CAPACITY_CACHE_VERIFY_FAILED:${JSON.stringify({ runtime_model: output.runtime_model || null, cache_ready: output.cache_ready ?? null, inference_performed: output.inference_performed ?? null, engine_loaded: output.engine_loaded ?? null })}`);
  }
  return { job_id: jobId, delay_ms: number(completed?.delayTime, null), execution_ms: number(completed?.executionTime, null), verified: true };
}

async function submitProbe(endpointId, key) {
  const submit = await serverless(endpointId, "/run", key, {
    method: "POST",
    body: { input: {
      contract: ENGINE_CONTRACT,
      capability: "ai.code.debug",
      foundation_model: FOUNDATION_MODEL,
      organization_id: "benchmark-only",
      organization_service_id: "benchmark-only",
      usage_id: `code-capacity-probe-${Date.now()}`,
      instruction: "Report the deployed Avantiqo Code runtime metadata only.",
      structured_specification: { runtime_probe: true, purpose: "CODE_CAPACITY_RELOCATION_RUNTIME_PROBE" },
    } },
  });
  const jobId = text(submit?.id);
  if (!jobId) throw new Error("CODE_CAPACITY_PROBE_JOB_ID_REQUIRED");
  console.log(`AVANTIQO_CODE_CAPACITY_PROBE_JOB=${jobId}`);
  const completed = await waitForJob(endpointId, key, jobId, "AVANTIQO_CODE_CAPACITY_PROBE");
  const output = completed?.output || {};
  const checks = {
    provider: text(output.provider) === "avantiqo-code",
    engine_contract: text(output.engine_contract) === ENGINE_CONTRACT,
    foundation_model: text(output.foundation_model) === FOUNDATION_MODEL,
    runtime_model: text(output.runtime_model) === RUNTIME_MODEL,
    serving_runtime: text(output.serving_runtime).toLowerCase() === "vllm",
    quantization: text(output.quantization).toLowerCase() === "fp8",
    cached_model_found: output.cached_model_found === true,
    raw_reasoning_boundary: output.raw_reasoning_persisted === false,
  };
  if (!Object.values(checks).every(Boolean)) throw new Error(`CODE_CAPACITY_PROBE_VERIFY_FAILED:${JSON.stringify(checks)}`);
  return { job_id: jobId, delay_ms: number(completed?.delayTime, null), execution_ms: number(completed?.executionTime, null), checks, verified: true };
}

async function submitInference(endpointId, key) {
  const submit = await serverless(endpointId, "/run", key, {
    method: "POST",
    body: { input: {
      contract: ENGINE_CONTRACT,
      capability: "ai.code.debug",
      foundation_model: FOUNDATION_MODEL,
      organization_id: "benchmark-only",
      organization_service_id: "benchmark-only",
      usage_id: `code-capacity-inference-${Date.now()}`,
      instruction: "Return only the corrected one-line JavaScript expression. Fix this so numeric string totals add numerically instead of concatenating: const total = rows.reduce((sum, row) => sum + row.total, 0); The corrected expression must use Number(row.total).",
      structured_specification: { benchmark_contract: CONTRACT, benchmark_case: "first_real_inference_after_capacity_relocation", response_style: "bounded" },
    } },
  });
  const jobId = text(submit?.id);
  if (!jobId) throw new Error("CODE_CAPACITY_INFERENCE_JOB_ID_REQUIRED");
  console.log(`AVANTIQO_CODE_CAPACITY_INFERENCE_JOB=${jobId}`);
  const completed = await waitForJob(endpointId, key, jobId, "AVANTIQO_CODE_CAPACITY_INFERENCE");
  const output = completed?.output || {};
  const result = text(output.result);
  const checks = {
    provider: text(output.provider) === "avantiqo-code",
    engine_contract: text(output.engine_contract) === ENGINE_CONTRACT,
    capability: text(output.capability) === "ai.code.debug",
    foundation_model: text(output.foundation_model) === FOUNDATION_MODEL,
    runtime_model: text(output.runtime_model) === RUNTIME_MODEL,
    serving_runtime: text(output.serving_runtime).toLowerCase() === "vllm",
    quantization: text(output.quantization).toLowerCase() === "fp8",
    raw_reasoning_boundary: output.raw_reasoning_persisted === false,
    semantic_result: result.includes("Number(row.total)") && result.includes("reduce"),
    nonempty_result: result.length > 10,
  };
  if (!Object.values(checks).every(Boolean)) throw new Error(`CODE_CAPACITY_INFERENCE_VERIFY_FAILED:${JSON.stringify(checks)}`);
  return { job_id: jobId, delay_ms: number(completed?.delayTime, null), execution_ms: number(completed?.executionTime, null), checks, verified: true };
}

const localEnvLoaded = loadLocalEnvironment();
const apply = yes(process.env.AVANTIQO_CODE_CAPACITY_RELOCATION_APPLY);
const approved = yes(process.env.AVANTIQO_CODE_CAPACITY_RELOCATION_APPROVED);
const storageApproved = yes(process.env.AVANTIQO_CODE_STORAGE_SPEND_APPROVED);
const providerApproved = yes(process.env.AVANTIQO_CODE_PROVIDER_SPEND_APPROVED);
const deleteApproved = yes(process.env.AVANTIQO_CODE_CAPACITY_RELOCATION_DELETE_APPROVED);
const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY);
const inferenceKey = text(process.env.RUNPOD_AVANTIQO_CODE_API_KEY) || text(process.env.RUNPOD_API_KEY);
const configuredEndpointId = text(process.env.RUNPOD_AVANTIQO_CODE_ENDPOINT_ID);

if (!managementKey) throw new Error("RUNPOD_MANAGEMENT_API_KEY_REQUIRED");
if (!inferenceKey) throw new Error("RUNPOD_AVANTIQO_CODE_API_KEY_OR_RUNPOD_API_KEY_REQUIRED");
if (apply && !approved) throw new Error("AVANTIQO_CODE_CAPACITY_RELOCATION_APPROVED=YES_REQUIRED");
if (apply && !providerApproved) throw new Error("AVANTIQO_CODE_PROVIDER_SPEND_APPROVED=YES_REQUIRED");
if (apply && !deleteApproved) throw new Error("AVANTIQO_CODE_CAPACITY_RELOCATION_DELETE_APPROVED=YES_REQUIRED");

const mainSha = requireCurrentMain();
console.log(`AVANTIQO_CODE_CAPACITY_RELOCATION_MODE=${apply ? "APPLY" : "PLAN"}`);
console.log(`AVANTIQO_CODE_CAPACITY_RELOCATION_CONTRACT=${CONTRACT}`);
console.log(`AVANTIQO_CODE_CAPACITY_RELOCATION_LOCAL_ENV_LOADED=${localEnvLoaded}`);
console.log("AVANTIQO_CODE_CAPACITY_RELOCATION_MIN_GPU_GB=80");
console.log("AVANTIQO_CODE_CAPACITY_RELOCATION_SUB_80GB_GPU_ALLOWED=false");
console.log("AVANTIQO_CODE_CAPACITY_RELOCATION_PRODUCTION_DEPLOY=false");
console.log("AVANTIQO_CODE_CAPACITY_RELOCATION_SECRETS_PRINTED=false");

let [endpoints, volumes, dataCenters] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  rest("/networkvolumes", managementKey),
  discoverDatacenters(managementKey),
]);
if (!Array.isArray(endpoints) || !Array.isArray(volumes)) throw new Error("CODE_CAPACITY_RELOCATION_RUNPOD_LIST_INVALID");
let resolved = resolveCodeEndpoint(endpoints, configuredEndpointId);
let endpoint = resolved.endpoint;
const endpointId = text(endpoint?.id);
const originalStable = stableEndpoint(endpoint);
const originalWorkers = { min: number(endpoint?.workersMin), max: number(endpoint?.workersMax) };
const sourceIds = endpointVolumeIds(endpoint);
if (sourceIds.length !== 1) throw new Error(`CODE_CAPACITY_RELOCATION_EXACTLY_ONE_SOURCE_VOLUME_REQUIRED:count=${sourceIds.length}`);
let sourceVolume = volumes.find((volume) => text(volume?.id) === sourceIds[0]) || null;
if (!sourceVolume || classifyManagedVolumeName(sourceVolume?.name)?.id !== SHARED_GROUP.id) throw new Error("CODE_CAPACITY_RELOCATION_SOURCE_VOLUME_GROUP_INVALID");
if (number(sourceVolume?.size ?? sourceVolume?.sizeGb, 0) < TARGET_VOLUME_SIZE_GB) throw new Error("CODE_CAPACITY_RELOCATION_SOURCE_VOLUME_TOO_SMALL");
const sourceVolumeId = text(sourceVolume?.id);
const sourceDcId = text(sourceVolume?.dataCenterId);
const sourceGpuTypes = endpointGpuTypes(endpoint);
const sourceDataCenterIds = endpointDataCenters(endpoint);
const sourceOtherUsers = endpointUsers(endpoints, sourceVolumeId, endpointId);
if (sourceOtherUsers.length) {
  throw new Error(`CODE_CAPACITY_RELOCATION_SOURCE_SHARED_WITH_OTHER_ENDPOINT_REQUIRES_COORDINATED_MOVE:${JSON.stringify(sourceOtherUsers)}`);
}

let groupVolumes = groupCacheVolumes(volumes, SHARED_GROUP);
let capacity = capacityByRegion(dataCenters);
let selection = selectTarget({ capacity, sourceDcId, groupVolumes, endpoints });
if (!selection.selected) {
  throw new Error(`CODE_CAPACITY_RELOCATION_NO_STRICTLY_BETTER_TARGET:source_rank=${selection.sourceRank}`);
}
const targetDcId = selection.selected.data_center_id;
const targetGpuTypes = unique(selection.selected.available_gpu_pool.slice(0, 4).map((row) => row.gpu_type_id));
if (!targetGpuTypes.length) throw new Error("CODE_CAPACITY_RELOCATION_TARGET_GPU_POOL_REQUIRED");

const existingTargetGroupVolumes = groupVolumes.filter((volume) => text(volume?.dataCenterId) === targetDcId);
if (existingTargetGroupVolumes.length > 1) throw new Error(`CODE_CAPACITY_RELOCATION_TARGET_GROUP_VOLUME_AMBIGUOUS:${existingTargetGroupVolumes.length}`);
let targetVolume = existingTargetGroupVolumes[0] || null;
if (targetVolume && number(targetVolume?.size ?? targetVolume?.sizeGb, 0) < TARGET_VOLUME_SIZE_GB) throw new Error("CODE_CAPACITY_RELOCATION_TARGET_VOLUME_TOO_SMALL");

const staleGroupVolumes = groupVolumes.filter((volume) => text(volume?.id) !== sourceVolumeId && text(volume?.id) !== text(targetVolume?.id));
const staleRows = staleGroupVolumes.map((volume) => ({ volume, users: endpointUsers(endpoints, text(volume?.id), null) }));
const blockedStale = staleRows.filter((entry) => entry.users.length);
if (blockedStale.length) {
  throw new Error(`CODE_CAPACITY_RELOCATION_OTHER_INTELLIGENCE_CODE_VOLUME_IN_USE:${JSON.stringify(blockedStale.map((entry) => ({ volume: safeVolume(entry.volume), users: entry.users })))}`);
}
const staleToDelete = staleRows.map((entry) => entry.volume);

const canonical = groupVolumes.filter((volume) => text(volume?.name) === SHARED_GROUP.canonical_name);
if (canonical.length > 1) throw new Error("CODE_CAPACITY_RELOCATION_CANONICAL_VOLUME_AMBIGUOUS");
if (!targetVolume && canonical.length === 1 && text(canonical[0]?.dataCenterId) !== targetDcId) {
  throw new Error(`CODE_CAPACITY_RELOCATION_CANONICAL_VOLUME_CONFLICT:canonical_dc=${text(canonical[0]?.dataCenterId)}:selected_dc=${targetDcId}`);
}

const managedCount = managedCacheVolumes(volumes).length;
const projectedAfterStaleDelete = managedCount - staleToDelete.length;
const targetCreateRequired = !targetVolume;
const projectedTransient = projectedAfterStaleDelete + (targetCreateRequired ? 1 : 0);
if (projectedTransient > AVANTIQO_RUNPOD_SHARED_VOLUME_POLICY.maximum_managed_cache_volumes + 1) {
  throw new Error(`CODE_CAPACITY_RELOCATION_TRANSIENT_VOLUME_LIMIT_EXCEEDED:projected=${projectedTransient}`);
}
if (targetCreateRequired && apply && !storageApproved) {
  throw new Error(`AVANTIQO_CODE_STORAGE_SPEND_APPROVED=YES_REQUIRED:estimated_monthly_usd=${(TARGET_VOLUME_SIZE_GB * STORAGE_USD_PER_GB_MONTH).toFixed(2)}`);
}

const initialHealth = healthCounters(await serverless(endpointId, "/health", inferenceKey));
if (initialHealth.jobs.in_queue > 0 || initialHealth.jobs.in_progress > 0) {
  throw new Error(`CODE_CAPACITY_RELOCATION_LIVE_JOB_BLOCKED:${JSON.stringify(initialHealth.jobs)}`);
}
if (initialHealth.workers.unhealthy > 0) throw new Error(`CODE_CAPACITY_RELOCATION_UNHEALTHY_WORKER:${initialHealth.workers.unhealthy}`);

const plan = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  main_sha: mainSha,
  endpoint_resolution: resolved.source,
  endpoint_before: safeEndpoint(endpoint),
  source_volume: safeVolume(sourceVolume),
  source_stock_rank: selection.sourceRank,
  source_other_endpoint_users: sourceOtherUsers,
  selected_target: {
    data_center_id: targetDcId,
    data_center_name: selection.selected.data_center_name,
    location: selection.selected.location,
    best_stock_rank: selection.selected.best_stock_rank,
    gpu_pool: selection.selected.available_gpu_pool.slice(0, 4),
    gpu_type_ids: targetGpuTypes,
  },
  target_volume_existing: targetVolume ? safeVolume(targetVolume) : null,
  target_volume_create_required: targetCreateRequired,
  target_volume_name_if_created: SHARED_GROUP.canonical_name,
  target_volume_size_gb: TARGET_VOLUME_SIZE_GB,
  estimated_monthly_storage_usd_if_created: Number((TARGET_VOLUME_SIZE_GB * STORAGE_USD_PER_GB_MONTH).toFixed(2)),
  stale_detached_intelligence_code_volumes_to_delete_before_create: staleToDelete.map(safeVolume),
  shared_volume_policy_before: sharedVolumePolicySummary(volumes),
  current_health: initialHealth,
  workflow: {
    cache_target_volume: true,
    runtime_probe_immediately_after_cache: true,
    real_inference_immediately_after_probe_while_worker_warm: true,
    rollback_to_source_if_any_post_switch_verification_fails: true,
    delete_source_only_after_real_inference_passes: true,
  },
  mutation_performed: false,
  provider_jobs_submitted: false,
  inference_performed: false,
  production_deploy_performed: false,
  next_action: apply ? "RELOCATE_CACHE_PROBE_INFER_CONSOLIDATE" : "RUN_WITH_EXPLICIT_CAPACITY_RELOCATION_APPROVALS",
};

if (!apply) {
  console.log("AVANTIQO_CODE_CAPACITY_RELOCATION_PLAN=READY");
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

requireCurrentMain();
[endpoints, volumes, dataCenters] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  rest("/networkvolumes", managementKey),
  discoverDatacenters(managementKey),
]);
resolved = resolveCodeEndpoint(endpoints, endpointId);
endpoint = resolved.endpoint;
if (!sameSet(endpointVolumeIds(endpoint), [sourceVolumeId])) throw new Error("CODE_CAPACITY_RELOCATION_SOURCE_BINDING_CHANGED_REPLAN_REQUIRED");
if (JSON.stringify(stableEndpoint(endpoint)) !== JSON.stringify(originalStable)) throw new Error("CODE_CAPACITY_RELOCATION_ENDPOINT_STABLE_FIELDS_CHANGED_REPLAN_REQUIRED");
const freshHealth = healthCounters(await serverless(endpointId, "/health", inferenceKey));
if (freshHealth.jobs.in_queue > 0 || freshHealth.jobs.in_progress > 0) throw new Error(`CODE_CAPACITY_RELOCATION_BECAME_BUSY:${JSON.stringify(freshHealth.jobs)}`);
if (freshHealth.workers.unhealthy > 0) throw new Error("CODE_CAPACITY_RELOCATION_BECAME_UNHEALTHY");
sourceVolume = volumes.find((volume) => text(volume?.id) === sourceVolumeId) || null;
if (!sourceVolume) throw new Error("CODE_CAPACITY_RELOCATION_SOURCE_VOLUME_DISAPPEARED");
groupVolumes = groupCacheVolumes(volumes, SHARED_GROUP);
capacity = capacityByRegion(dataCenters);
selection = selectTarget({ capacity, sourceDcId, groupVolumes, endpoints });
if (!selection.selected || selection.selected.data_center_id !== targetDcId) {
  throw new Error(`CODE_CAPACITY_RELOCATION_BEST_TARGET_CHANGED_REPLAN_REQUIRED:selected=${selection.selected?.data_center_id || "NONE"}:planned=${targetDcId}`);
}
const freshTargetGpuTypes = unique(selection.selected.available_gpu_pool.slice(0, 4).map((row) => row.gpu_type_id));
if (!freshTargetGpuTypes.length) throw new Error("CODE_CAPACITY_RELOCATION_TARGET_STOCK_DISAPPEARED");

for (const stale of staleToDelete) {
  requireCurrentMain();
  const freshEndpoints = await rest("/endpoints?includeTemplate=false&includeWorkers=true", managementKey);
  const users = endpointUsers(freshEndpoints, text(stale?.id), null);
  if (users.length) throw new Error(`CODE_CAPACITY_RELOCATION_STALE_VOLUME_GAINED_USER:id=${text(stale?.id)}`);
  await rest(`/networkvolumes/${encodeURIComponent(text(stale?.id))}`, managementKey, { method: "DELETE" });
  console.log(`AVANTIQO_CODE_CAPACITY_RELOCATION_STALE_VOLUME_DELETED=${text(stale?.id)}`);
}

requireCurrentMain();
volumes = await rest("/networkvolumes", managementKey);
const targetCandidatesAfterCleanup = groupCacheVolumes(volumes, SHARED_GROUP).filter((volume) => text(volume?.dataCenterId) === targetDcId);
if (targetCandidatesAfterCleanup.length > 1) throw new Error("CODE_CAPACITY_RELOCATION_TARGET_VOLUME_AMBIGUOUS_AFTER_CLEANUP");
targetVolume = targetCandidatesAfterCleanup[0] || null;
let targetVolumeCreated = false;
if (!targetVolume) {
  const canonicalAfterCleanup = groupCacheVolumes(volumes, SHARED_GROUP).filter((volume) => text(volume?.name) === SHARED_GROUP.canonical_name);
  if (canonicalAfterCleanup.length) throw new Error("CODE_CAPACITY_RELOCATION_CANONICAL_VOLUME_EXISTS_IN_OTHER_DATACENTER");
  targetVolume = await rest("/networkvolumes", managementKey, {
    method: "POST",
    body: { dataCenterId: targetDcId, name: SHARED_GROUP.canonical_name, size: TARGET_VOLUME_SIZE_GB },
  });
  targetVolumeCreated = true;
  console.log(`AVANTIQO_CODE_CAPACITY_RELOCATION_TARGET_VOLUME_CREATED=${text(targetVolume?.id) || "MISSING"}`);
}
const targetVolumeId = text(targetVolume?.id);
if (!targetVolumeId || text(targetVolume?.dataCenterId) !== targetDcId) throw new Error("CODE_CAPACITY_RELOCATION_TARGET_VOLUME_VERIFY_FAILED");

let switched = false;
try {
  requireCurrentMain();
  await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
    method: "PATCH",
    body: { workersMin: 0, workersMax: 0 },
  });
  await waitForQuiescence(endpointId, inferenceKey, "CODE_CAPACITY_RELOCATION_DRAIN");

  requireCurrentMain();
  const beforeSwitch = resolveCodeEndpoint(
    await rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
    endpointId,
  ).endpoint;
  if (!sameSet(endpointVolumeIds(beforeSwitch), [sourceVolumeId])) throw new Error("CODE_CAPACITY_RELOCATION_SOURCE_BINDING_CHANGED_AFTER_DRAIN");
  if (JSON.stringify(stableEndpoint(beforeSwitch)) !== JSON.stringify(originalStable)) throw new Error("CODE_CAPACITY_RELOCATION_ENDPOINT_CHANGED_AFTER_DRAIN");

  const liveCapacity = capacityByRegion(await discoverDatacenters(managementKey));
  const liveTarget = liveCapacity.regions.find((region) => region.data_center_id === targetDcId) || null;
  const liveGpuTypes = unique(array(liveTarget?.available_gpu_pool).slice(0, 4).map((row) => row.gpu_type_id));
  if (!liveTarget || liveTarget.best_stock_rank <= selection.sourceRank || !liveGpuTypes.length) {
    throw new Error("CODE_CAPACITY_RELOCATION_TARGET_STOCK_LOST_BEFORE_SWITCH");
  }

  await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
    method: "PATCH",
    body: {
      networkVolumeId: targetVolumeId,
      networkVolumeIds: [targetVolumeId],
      dataCenterIds: [],
      gpuTypeIds: liveGpuTypes,
      workersMin: originalWorkers.min,
      workersMax: originalWorkers.max,
    },
  });
  switched = true;

  const moved = resolveCodeEndpoint(
    await rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
    endpointId,
  ).endpoint;
  if (!sameSet(endpointVolumeIds(moved), [targetVolumeId])) throw new Error("CODE_CAPACITY_RELOCATION_TARGET_BINDING_VERIFY_FAILED");
  if (!sameSet(endpointDataCenters(moved), [targetDcId]) && endpointDataCenters(moved).length) throw new Error("CODE_CAPACITY_RELOCATION_TARGET_DATACENTER_VERIFY_FAILED");
  if (!sameSet(endpointGpuTypes(moved), liveGpuTypes)) throw new Error("CODE_CAPACITY_RELOCATION_TARGET_GPU_POOL_VERIFY_FAILED");
  if (JSON.stringify(stableEndpoint(moved)) !== JSON.stringify(originalStable)) throw new Error("CODE_CAPACITY_RELOCATION_STABLE_FIELDS_CHANGED_DURING_SWITCH");

  const cacheEvidence = await submitCache(endpointId, inferenceKey);
  const probeEvidence = await submitProbe(endpointId, inferenceKey);
  const inferenceEvidence = await submitInference(endpointId, inferenceKey);

  requireCurrentMain();
  const finalEndpoints = await rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey);
  const finalCode = resolveCodeEndpoint(finalEndpoints, endpointId).endpoint;
  if (!sameSet(endpointVolumeIds(finalCode), [targetVolumeId])) throw new Error("CODE_CAPACITY_RELOCATION_FINAL_TARGET_BINDING_LOST");
  const sourceUsersAfter = endpointUsers(finalEndpoints, sourceVolumeId, null);
  if (sourceUsersAfter.length) throw new Error(`CODE_CAPACITY_RELOCATION_SOURCE_VOLUME_STILL_IN_USE:${JSON.stringify(sourceUsersAfter)}`);
  await rest(`/networkvolumes/${encodeURIComponent(sourceVolumeId)}`, managementKey, { method: "DELETE" });
  const finalVolumes = await rest("/networkvolumes", managementKey);
  if (finalVolumes.some((volume) => text(volume?.id) === sourceVolumeId)) throw new Error("CODE_CAPACITY_RELOCATION_SOURCE_DELETE_VERIFY_FAILED");

  console.log("AVANTIQO_CODE_CAPACITY_RELOCATION=COMPLETE");
  console.log(JSON.stringify({
    ...plan,
    success: true,
    mode: "APPLY",
    mutation_performed: true,
    provider_jobs_submitted: true,
    inference_performed: true,
    target_volume: safeVolume(targetVolume),
    target_volume_created: targetVolumeCreated,
    endpoint_after: safeEndpoint(finalCode),
    cache: cacheEvidence,
    runtime_probe: probeEvidence,
    first_real_inference: inferenceEvidence,
    source_volume_deleted: true,
    shared_volume_policy_after: sharedVolumePolicySummary(finalVolumes),
    production_deploy_performed: false,
    next_action: "RUN_FINAL_AUTONOMOUS_REPAIR_CERTIFICATION",
  }, null, 2));
} catch (error) {
  if (switched) {
    try {
      await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
        method: "PATCH",
        body: { workersMin: 0, workersMax: 0 },
      });
      await waitForQuiescence(endpointId, inferenceKey, "CODE_CAPACITY_RELOCATION_ROLLBACK_DRAIN");
      await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
        method: "PATCH",
        body: {
          networkVolumeId: sourceVolumeId,
          networkVolumeIds: [sourceVolumeId],
          dataCenterIds: sourceDataCenterIds,
          gpuTypeIds: sourceGpuTypes,
          workersMin: originalWorkers.min,
          workersMax: originalWorkers.max,
        },
      });
      const rolledBack = resolveCodeEndpoint(
        await rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
        endpointId,
      ).endpoint;
      if (!sameSet(endpointVolumeIds(rolledBack), [sourceVolumeId])) throw new Error("CODE_CAPACITY_RELOCATION_ROLLBACK_VOLUME_VERIFY_FAILED");
      if (!sameSet(endpointGpuTypes(rolledBack), sourceGpuTypes)) throw new Error("CODE_CAPACITY_RELOCATION_ROLLBACK_GPU_VERIFY_FAILED");
      if (JSON.stringify(stableEndpoint(rolledBack)) !== JSON.stringify(originalStable)) throw new Error("CODE_CAPACITY_RELOCATION_ROLLBACK_STABLE_FIELDS_VERIFY_FAILED");
      console.error("AVANTIQO_CODE_CAPACITY_RELOCATION_ROLLBACK=VERIFIED");

      if (targetVolumeCreated) {
        const rollbackEndpoints = await rest("/endpoints?includeTemplate=false&includeWorkers=true", managementKey);
        const targetUsers = endpointUsers(rollbackEndpoints, targetVolumeId, null);
        if (!targetUsers.length) {
          await rest(`/networkvolumes/${encodeURIComponent(targetVolumeId)}`, managementKey, { method: "DELETE" });
          console.error(`AVANTIQO_CODE_CAPACITY_RELOCATION_FAILED_TARGET_VOLUME_DELETED=${targetVolumeId}`);
        }
      }
    } catch (rollbackError) {
      console.error(`AVANTIQO_CODE_CAPACITY_RELOCATION_ROLLBACK_FAILED=${text(rollbackError?.message || rollbackError)}`);
    }
  }
  throw error;
}
