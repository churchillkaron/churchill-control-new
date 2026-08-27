import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const GRAPHQL_URL = "https://api.runpod.io/graphql";
const CONTRACT = "AVANTIQO_VIDEO_EU_RO1_RUNTIME_PROBE_V35";
const APPROVAL_ENV = "AVANTIQO_VIDEO_EU_RO1_RUNTIME_PROBE_V35_APPROVED";
const CINEMA_ENDPOINT_ID = "r0bzqq9zoi92h7";
const CINEMA_NAME = "avantiqo-cinema-v1";
const IMAGE_ENDPOINT_ID = "m9ieryijbnq77q";
const SOURCE_VOLUME_ID = "7pcdebhpga";
const DESTINATION_VOLUME_ID = "t4erb6kxi1";
const DESTINATION_DC = "EU-RO-1";
const TARGET_VOLUMES = [SOURCE_VOLUME_ID, DESTINATION_VOLUME_ID].sort();
const V19 = "scripts/run-avantiqo-video-wan22-runtime-probe-safe-lease-v19-local.mjs";
const SAFE_LEASE = "scripts/run-avantiqo-runpod-safe-lease-v2-local.mjs";
const SAFE_POLICY = "config/avantiqo-runpod-safe-lease-policy.json";
const VIDEO_EVIDENCE = "audits/results/avantiqo-video-worker-image.json";
const EXPECTED_TEMPLATE_ID = "xrewk5kost";
const EXPECTED_EXECUTION_TIMEOUT_MS = 1_800_000;
const CERTIFIED_GPU_POOL = [
  "NVIDIA RTX PRO 6000 Blackwell Max-Q Workstation Edition",
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
  "NVIDIA RTX PRO 6000 Blackwell Workstation Edition",
].sort();

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const yes = (value) => ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase());
const unique = (values) => [...new Set(values.map(text).filter(Boolean))].sort();

function redact(value) {
  return text(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]");
}
function sameSet(a, b) {
  const left = unique(a);
  const right = unique(b);
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
function endpointVolumeIds(endpoint = {}) {
  return unique([endpoint.networkVolumeId, ...list(endpoint.networkVolumeIds)]);
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
function shell(name, args, code) {
  const result = spawnSync(name, args, { cwd: process.cwd(), encoding: "utf8", env: process.env, stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) throw new Error(`${code}:${redact(result.stderr || result.stdout).slice(0, 1200)}`);
  return text(result.stdout);
}
async function requestJson(url, key, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch {}
  if (!response.ok) throw new Error(`AVANTIQO_VIDEO_V35_HTTP_${response.status}:${redact(body?.message || body?.error || body?.detail || raw).slice(0, 900)}`);
  return body ?? {};
}
async function rest(pathname, key) {
  return requestJson(`${REST_BASE}${pathname}`, key);
}
async function queueHealth(endpointId, key) {
  return requestJson(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, key);
}
function healthSummary(body = {}) {
  const jobs = object(body.jobs);
  const workers = object(body.workers);
  const normalizedWorkers = {
    idle: finite(workers.idle, 0), initializing: finite(workers.initializing, 0), ready: finite(workers.ready, 0),
    running: finite(workers.running, 0), throttled: finite(workers.throttled, 0), unhealthy: finite(workers.unhealthy, 0),
  };
  return {
    jobs: { in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0), in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0) },
    workers: normalizedWorkers,
    worker_total: Object.values(normalizedWorkers).reduce((sum, value) => sum + value, 0),
  };
}
function assertQuiescent(health, label) {
  if (health.jobs.in_queue !== 0 || health.jobs.in_progress !== 0 || health.worker_total !== 0) {
    throw new Error(`AVANTIQO_VIDEO_V35_${label}_NOT_QUIESCENT:${JSON.stringify(health)}`);
  }
}
function stableEndpoint(endpoint = {}) {
  return {
    id: text(endpoint.id) || null,
    name: text(endpoint.name) || null,
    template_id: text(endpoint.templateId || endpoint.template?.id) || null,
    workers_min: finite(endpoint.workersMin ?? endpoint.workers_min),
    workers_max: finite(endpoint.workersMax ?? endpoint.workers_max),
    gpu_type_ids: unique(list(endpoint.gpuTypeIds)),
    network_volume_ids: endpointVolumeIds(endpoint),
    execution_timeout_ms: finite(endpoint.executionTimeoutMs ?? endpoint.executionTimeout),
  };
}
async function selectQueueKey(endpointId, managementKey, names) {
  const candidates = names.map((name) => [name, text(process.env[name])]).concat([["RUNPOD_MANAGEMENT_API_KEY", managementKey]]);
  const seen = new Set();
  for (const [source, key] of candidates) {
    if (!key || seen.has(key)) continue;
    seen.add(key);
    try {
      await queueHealth(endpointId, key);
      return { source, key };
    } catch {}
  }
  throw new Error(`AVANTIQO_VIDEO_V35_QUEUE_CREDENTIAL_NOT_FOUND:${endpointId}`);
}
async function liveEuRo1Blackwell(managementKey) {
  const query = `
    query AvantiqoVideoV35($input: GpuAvailabilityInput) {
      dataCenters {
        id
        storageSupport
        gpuAvailability(input: $input) {
          available
          stockStatus
          gpuTypeId
        }
      }
    }
  `;
  const response = await fetch(`${GRAPHQL_URL}?api_key=${encodeURIComponent(managementKey)}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { input: { gpuCount: 1, minDisk: 5, minMemoryInGb: 80, secureCloud: true } } }),
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch {}
  if (!response.ok || list(body?.errors).length) {
    throw new Error(`AVANTIQO_VIDEO_V35_GRAPHQL_FAILED:${redact(list(body?.errors).map((entry) => entry?.message).filter(Boolean).join(" | ") || raw).slice(0, 900)}`);
  }
  const dc = list(body?.data?.dataCenters).find((entry) => text(entry?.id) === DESTINATION_DC);
  if (!dc || dc.storageSupport !== true) throw new Error("AVANTIQO_VIDEO_V35_EU_RO1_STORAGE_SUPPORT_MISSING");
  const rows = list(dc.gpuAvailability)
    .filter((entry) => entry?.available === true && CERTIFIED_GPU_POOL.includes(text(entry?.gpuTypeId)))
    .map((entry) => ({ gpu_type_id: text(entry.gpuTypeId), stock_status: text(entry.stockStatus) || null }));
  if (!rows.length) throw new Error("AVANTIQO_VIDEO_V35_NO_LIVE_EU_RO1_CERTIFIED_BLACKWELL_STOCK");
  return rows;
}

if (Number(process.versions.node.split(".")[0]) < 24) throw new Error(`AVANTIQO_VIDEO_V35_NODE24_REQUIRED:${process.version}`);
const apply = process.argv.includes("--apply");
if (apply && !yes(process.env[APPROVAL_ENV])) throw new Error(`${APPROVAL_ENV}=YES_REQUIRED`);

shell("git", ["fetch", "origin", "main"], "AVANTIQO_VIDEO_V35_FETCH_MAIN_FAILED");
const head = shell("git", ["rev-parse", "HEAD"], "AVANTIQO_VIDEO_V35_HEAD_FAILED");
const remote = shell("git", ["rev-parse", "origin/main"], "AVANTIQO_VIDEO_V35_REMOTE_FAILED");
if (head !== remote) throw new Error(`AVANTIQO_VIDEO_V35_EXACT_ORIGIN_MAIN_REQUIRED:head=${head}:origin=${remote}`);

const [evidenceRaw, policyRaw] = await Promise.all([
  readFile(VIDEO_EVIDENCE, "utf8"),
  readFile(SAFE_POLICY, "utf8"),
]);
const evidence = JSON.parse(evidenceRaw);
const policy = JSON.parse(policyRaw);
if (evidence?.success !== true || text(evidence.contract) !== "AVANTIQO_VIDEO_WORKER_IMAGE_RESULT_V2" || evidence.source_sha_matches_trigger !== true) {
  throw new Error("AVANTIQO_VIDEO_V35_VIDEO_IMAGE_EVIDENCE_INVALID");
}
if (text(evidence.runtime_probe_contract) !== "AVANTIQO_VIDEO_RUNTIME_PROBE_V1" || text(evidence.runtime_revision) !== "AVANTIQO_VIDEO_WAN22_A14B_DEFAULT_ROUTING_CACHE_V1") {
  throw new Error("AVANTIQO_VIDEO_V35_RUNTIME_EVIDENCE_INVALID");
}
if (text(policy.contract) !== "AVANTIQO_RUNPOD_SAFE_LEASE_POLICY_V2" || policy?.lanes?.cinema !== CINEMA_NAME || policy.workers_min_one_allowed !== false || policy.fail_closed !== true) {
  throw new Error("AVANTIQO_VIDEO_V35_SAFE_LEASE_POLICY_INVALID");
}
const v19Text = await readFile(V19, "utf8");
const safeLeaseText = await readFile(SAFE_LEASE, "utf8");
if (!v19Text.includes('const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2"') || !v19Text.includes('body: { input: { operation: "runtime_probe" } }')) {
  throw new Error("AVANTIQO_VIDEO_V35_V19_CONTRACT_CHANGED");
}
if (!safeLeaseText.includes('await patch(targetId, 1, managementKey)') || !safeLeaseText.includes('await patch(targetId, 0, managementKey)')) {
  throw new Error("AVANTIQO_VIDEO_V35_SAFE_LEASE_OPEN_CLOSE_CONTRACT_CHANGED");
}

const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
if (!managementKey) throw new Error("AVANTIQO_VIDEO_V35_RUNPOD_MANAGEMENT_KEY_REQUIRED");
const videoCredential = await selectQueueKey(CINEMA_ENDPOINT_ID, managementKey, ["RUNPOD_AVANTIQO_VIDEO_API_KEY", "RUNPOD_API_KEY"]);
const imageCredential = await selectQueueKey(IMAGE_ENDPOINT_ID, managementKey, ["RUNPOD_AVANTIQO_IMAGE_API_KEY", "RUNPOD_API_KEY"]);

const [cinema, image, templatesRaw, liveStock] = await Promise.all([
  rest(`/endpoints/${CINEMA_ENDPOINT_ID}?includeTemplate=true&includeWorkers=true`, managementKey),
  rest(`/endpoints/${IMAGE_ENDPOINT_ID}?includeTemplate=false&includeWorkers=true`, managementKey),
  rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", managementKey),
  liveEuRo1Blackwell(managementKey),
]);
const cinemaStable = stableEndpoint(cinema);
const imageStable = stableEndpoint(image);
if (cinemaStable.id !== CINEMA_ENDPOINT_ID || cinemaStable.name !== CINEMA_NAME) throw new Error("AVANTIQO_VIDEO_V35_CINEMA_ID_OR_NAME_INVALID");
if (cinemaStable.workers_min !== 0 || cinemaStable.workers_max !== 0) throw new Error(`AVANTIQO_VIDEO_V35_CINEMA_NOT_RESTING_0_0:${cinemaStable.workers_min}/${cinemaStable.workers_max}`);
if (!sameSet(cinemaStable.network_volume_ids, TARGET_VOLUMES)) throw new Error(`AVANTIQO_VIDEO_V35_MULTIVOLUME_BINDING_INVALID:${cinemaStable.network_volume_ids.join("|")}`);
if (!sameSet(cinemaStable.gpu_type_ids, CERTIFIED_GPU_POOL)) throw new Error(`AVANTIQO_VIDEO_V35_GPU_POOL_CHANGED:${cinemaStable.gpu_type_ids.join("|")}`);
if (cinemaStable.execution_timeout_ms !== EXPECTED_EXECUTION_TIMEOUT_MS) throw new Error(`AVANTIQO_VIDEO_V35_EXECUTION_TIMEOUT_CHANGED:${cinemaStable.execution_timeout_ms}`);
if (cinemaStable.template_id !== EXPECTED_TEMPLATE_ID) throw new Error(`AVANTIQO_VIDEO_V35_TEMPLATE_ID_CHANGED:${cinemaStable.template_id}`);

const templates = normalizeList(templatesRaw, ["templates"]);
if (!templates) throw new Error("AVANTIQO_VIDEO_V35_TEMPLATE_LIST_INVALID");
const templateMatches = templates.filter((entry) => text(entry?.id) === EXPECTED_TEMPLATE_ID);
if (templateMatches.length !== 1) throw new Error(`AVANTIQO_VIDEO_V35_TEMPLATE_RESOLUTION_FAILED:${templateMatches.length}`);
const template = templateMatches[0];
if (text(template.imageName) !== text(evidence.immutable_image_reference)) throw new Error("AVANTIQO_VIDEO_V35_IMMUTABLE_IMAGE_BINDING_CHANGED");
const templateEnv = Array.isArray(template.env)
  ? Object.fromEntries(template.env.map((entry) => [text(entry?.key || entry?.name), String(entry?.value ?? "")]).filter(([key]) => key))
  : Object.fromEntries(Object.entries(object(template.env)).map(([key, value]) => [key, String(value ?? "")]));
if (templateEnv.AVANTIQO_VIDEO_REQUIRE_CACHED_MODEL !== "1") throw new Error("AVANTIQO_VIDEO_V35_REQUIRE_CACHED_MODEL_NOT_ENFORCED");
if (templateEnv.AVANTIQO_VIDEO_HF_CACHE_ROOT !== "/runpod-volume/huggingface-cache/hub") throw new Error("AVANTIQO_VIDEO_V35_CACHE_ROOT_CHANGED");
if (templateEnv.AVANTIQO_VIDEO_T2V_MODEL !== "Wan-AI/Wan2.2-T2V-A14B-Diffusers" || templateEnv.AVANTIQO_VIDEO_I2V_MODEL !== "Wan-AI/Wan2.2-I2V-A14B-Diffusers") {
  throw new Error("AVANTIQO_VIDEO_V35_DEFAULT_MODELS_CHANGED");
}

const [cinemaHealth, imageHealth] = await Promise.all([
  queueHealth(CINEMA_ENDPOINT_ID, videoCredential.key).then(healthSummary),
  queueHealth(IMAGE_ENDPOINT_ID, imageCredential.key).then(healthSummary),
]);
assertQuiescent(cinemaHealth, "CINEMA");
assertQuiescent(imageHealth, "IMAGE");

// Safe Lease V2 reaps unrelated unleased endpoints at workersMax=1. Refuse before paid work
// rather than mutating Image from the Video lane.
if (imageStable.workers_max === 1) {
  throw new Error("AVANTIQO_VIDEO_V35_IMAGE_PEER_AT_WORKERS_MAX_1_WOULD_BE_MUTATED_BY_SAFE_LEASE_REFUSING_VIDEO_PROBE");
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  main_sha: head,
  cinema: cinemaStable,
  image_peer: { id: imageStable.id, workers_min: imageStable.workers_min, workers_max: imageStable.workers_max, quiescent: true, mutation_planned: false },
  template: { id: text(template.id), image_name: text(template.imageName), require_cached_model: true, cache_root: templateEnv.AVANTIQO_VIDEO_HF_CACHE_ROOT },
  eu_ro1_live_certified_blackwell: liveStock,
  safe_lease_contract: "AVANTIQO_RUNPOD_SAFE_LEASE_V2",
  child_probe_contract: "AVANTIQO_VIDEO_WAN22_RUNTIME_PROBE_SAFE_LEASE_V19",
  runtime_operation: "runtime_probe",
  generation_requested: false,
  inference_performed: false,
  model_download_performed: false,
  direct_workers_max_write: false,
  image_mutation: false,
  production_web_deploy: false,
  secrets_printed: false,
}, null, 2));

if (!apply) {
  console.log("AVANTIQO_VIDEO_EU_RO1_RUNTIME_PROBE_V35_APPLIED=false");
  process.exit(0);
}

const childEnv = {
  ...process.env,
  AVANTIQO_VIDEO_WAN22_RUNTIME_PROBE_APPROVED: "YES",
};
const child = spawnSync(process.execPath, [V19, "--apply"], { cwd: process.cwd(), env: childEnv, stdio: "inherit" });
if (child.error) throw child.error;

const [finalCinema, finalImage] = await Promise.all([
  rest(`/endpoints/${CINEMA_ENDPOINT_ID}?includeTemplate=false&includeWorkers=true`, managementKey),
  rest(`/endpoints/${IMAGE_ENDPOINT_ID}?includeTemplate=false&includeWorkers=true`, managementKey),
]);
const finalCinemaStable = stableEndpoint(finalCinema);
const finalImageStable = stableEndpoint(finalImage);
if (finalCinemaStable.workers_min !== 0 || finalCinemaStable.workers_max !== 0) throw new Error(`AVANTIQO_VIDEO_V35_FINAL_CINEMA_NOT_0_0:${finalCinemaStable.workers_min}/${finalCinemaStable.workers_max}`);
if (!sameSet(finalCinemaStable.network_volume_ids, TARGET_VOLUMES)) throw new Error("AVANTIQO_VIDEO_V35_FINAL_MULTIVOLUME_BINDING_CHANGED");
if (JSON.stringify(finalImageStable) !== JSON.stringify(imageStable)) throw new Error("AVANTIQO_VIDEO_V35_IMAGE_CHANGED_DURING_VIDEO_PROBE");
assertQuiescent(await queueHealth(CINEMA_ENDPOINT_ID, videoCredential.key).then(healthSummary), "FINAL_CINEMA");

if (child.status !== 0) {
  console.log(JSON.stringify({
    success: false,
    contract: CONTRACT,
    child_exit: child.status,
    cleanup_verified: true,
    cinema_restored_0_0: true,
    multivolume_binding_preserved: true,
    image_preserved: true,
  }, null, 2));
  console.log("AVANTIQO_VIDEO_EU_RO1_RUNTIME_PROBE_V35=FAIL");
  process.exit(child.status || 3);
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  cinema_restored_0_0: true,
  multivolume_binding_preserved: true,
  image_preserved: true,
  runtime_probe_safe_lease_passed: true,
  generation_requested: false,
  inference_performed: false,
  model_download_performed: false,
  production_web_deploy: false,
  secrets_printed: false,
}, null, 2));
console.log("AVANTIQO_VIDEO_EU_RO1_RUNTIME_PROBE_V35=PASS");
console.log("AVANTIQO_VIDEO_EU_RO1_RUNTIME_PROBE_V35_APPLIED=true");
