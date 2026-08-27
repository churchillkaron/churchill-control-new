import { spawnSync } from "node:child_process";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_VIDEO_EU_RO1_RUNTIME_PROBE_V36";
const APPROVAL_ENV = "AVANTIQO_VIDEO_EU_RO1_RUNTIME_PROBE_V36_APPROVED";
const CINEMA_ID = "r0bzqq9zoi92h7";
const IMAGE_ID = "m9ieryijbnq77q";
const SOURCE_VOLUME_ID = "7pcdebhpga";
const DESTINATION_VOLUME_ID = "t4erb6kxi1";
const V19 = "scripts/run-avantiqo-video-wan22-runtime-probe-safe-lease-v19-local.mjs";
const RELEVANT_PATHS = [
  "services/avantiqo-video-engine",
  "audits/results/avantiqo-video-worker-image.json",
  "config/avantiqo-runpod-safe-lease-policy.json",
  "scripts/run-avantiqo-runpod-safe-lease-v2-local.mjs",
  "scripts/run-avantiqo-video-wan22-runtime-probe-safe-lease-v19-local.mjs",
  "scripts/bind-avantiqo-video-eu-ro1-multivolume-v34-local.mjs",
  "scripts/verify-avantiqo-video-eu-ro1-cache-s3-v34-helper.py",
  "scripts/run-avantiqo-video-eu-ro1-runtime-probe-v36-local.mjs",
];

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const yes = (value) => ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase());
const unique = (values) => [...new Set(values.map(text).filter(Boolean))].sort();

function redact(value) {
  return text(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]");
}
function shell(name, args, code, allowOne = false) {
  const result = spawnSync(name, args, { cwd: process.cwd(), encoding: "utf8", env: process.env, stdio: ["ignore", "pipe", "pipe"] });
  if (allowOne && [0, 1].includes(result.status)) return result;
  if (result.status !== 0) throw new Error(`${code}:${redact(result.stderr || result.stdout).slice(0, 1200)}`);
  return result;
}
async function requestJson(url, key) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch {}
  if (!response.ok) throw new Error(`AVANTIQO_VIDEO_V36_HTTP_${response.status}:${redact(body?.message || body?.error || raw).slice(0, 900)}`);
  return body ?? {};
}
function endpointVolumeIds(endpoint = {}) {
  return unique([endpoint.networkVolumeId, ...list(endpoint.networkVolumeIds)]);
}
function healthSummary(body = {}) {
  const jobs = body.jobs || {};
  const workers = body.workers || {};
  const workerTotal = ["idle", "initializing", "ready", "running", "throttled", "unhealthy"]
    .reduce((sum, key) => sum + finite(workers[key], 0), 0);
  return {
    in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
    in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
    worker_total: workerTotal,
    unhealthy: finite(workers.unhealthy, 0),
  };
}
function assertQuiescent(health, label) {
  if (health.in_queue !== 0 || health.in_progress !== 0 || health.worker_total !== 0 || health.unhealthy !== 0) {
    throw new Error(`AVANTIQO_VIDEO_V36_${label}_NOT_QUIESCENT:${JSON.stringify(health)}`);
  }
}
async function selectQueueKey(endpointId, candidates) {
  const seen = new Set();
  for (const [source, key] of candidates) {
    if (!key || seen.has(key)) continue;
    seen.add(key);
    try {
      await requestJson(`${QUEUE_BASE}/${endpointId}/health`, key);
      return { source, key };
    } catch {}
  }
  throw new Error(`AVANTIQO_VIDEO_V36_QUEUE_KEY_NOT_FOUND:${endpointId}`);
}

if (Number(process.versions.node.split(".")[0]) < 24) throw new Error(`AVANTIQO_VIDEO_V36_NODE24_REQUIRED:${process.version}`);
const apply = process.argv.includes("--apply");
if (apply && !yes(process.env[APPROVAL_ENV])) throw new Error(`${APPROVAL_ENV}=YES_REQUIRED`);

shell("git", ["fetch", "origin", "main"], "AVANTIQO_VIDEO_V36_FETCH_MAIN_FAILED");
const head = text(shell("git", ["rev-parse", "HEAD"], "AVANTIQO_VIDEO_V36_HEAD_FAILED").stdout);
const remote = text(shell("git", ["rev-parse", "origin/main"], "AVANTIQO_VIDEO_V36_REMOTE_FAILED").stdout);
let unrelatedMainMovementTolerated = false;
if (head !== remote) {
  const relevant = shell("git", ["diff", "--quiet", head, remote, "--", ...RELEVANT_PATHS], "AVANTIQO_VIDEO_V36_RELEVANT_DIFF_FAILED", true);
  if (relevant.status === 1) {
    const changed = text(shell("git", ["diff", "--name-only", head, remote, "--", ...RELEVANT_PATHS], "AVANTIQO_VIDEO_V36_CHANGED_PATHS_FAILED").stdout);
    throw new Error(`AVANTIQO_VIDEO_V36_RELEVANT_MAIN_MOVED:${changed.replace(/\n/g, ",")}`);
  }
  unrelatedMainMovementTolerated = true;
}

const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
if (!managementKey) throw new Error("AVANTIQO_VIDEO_V36_MANAGEMENT_KEY_REQUIRED");
const videoQueue = await selectQueueKey(CINEMA_ID, [
  ["RUNPOD_AVANTIQO_VIDEO_API_KEY", text(process.env.RUNPOD_AVANTIQO_VIDEO_API_KEY)],
  ["RUNPOD_API_KEY", text(process.env.RUNPOD_API_KEY)],
  ["RUNPOD_MANAGEMENT_API_KEY", managementKey],
]);
const imageQueue = await selectQueueKey(IMAGE_ID, [
  ["RUNPOD_AVANTIQO_IMAGE_API_KEY", text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY)],
  ["RUNPOD_API_KEY", text(process.env.RUNPOD_API_KEY)],
  ["RUNPOD_MANAGEMENT_API_KEY", managementKey],
]);

const [cinema, image, cinemaHealthRaw, imageHealthRaw] = await Promise.all([
  requestJson(`${REST_BASE}/endpoints/${CINEMA_ID}?includeTemplate=false&includeWorkers=true`, managementKey),
  requestJson(`${REST_BASE}/endpoints/${IMAGE_ID}?includeTemplate=false&includeWorkers=true`, managementKey),
  requestJson(`${QUEUE_BASE}/${CINEMA_ID}/health`, videoQueue.key),
  requestJson(`${QUEUE_BASE}/${IMAGE_ID}/health`, imageQueue.key),
]);

if (text(cinema.id) !== CINEMA_ID || text(cinema.name) !== "avantiqo-cinema-v1") throw new Error("AVANTIQO_VIDEO_V36_CINEMA_ID_OR_NAME_INVALID");
if (finite(cinema.workersMin, -1) !== 0 || finite(cinema.workersMax, -1) !== 0) {
  throw new Error(`AVANTIQO_VIDEO_V36_CINEMA_NOT_RESTING_0_0:${finite(cinema.workersMin)}/${finite(cinema.workersMax)}`);
}
const volumes = endpointVolumeIds(cinema);
if (JSON.stringify(volumes) !== JSON.stringify([SOURCE_VOLUME_ID, DESTINATION_VOLUME_ID].sort())) {
  throw new Error(`AVANTIQO_VIDEO_V36_MULTIVOLUME_BINDING_INVALID:${volumes.join("|")}`);
}
const cinemaHealth = healthSummary(cinemaHealthRaw);
const imageHealth = healthSummary(imageHealthRaw);
assertQuiescent(cinemaHealth, "CINEMA");
assertQuiescent(imageHealth, "IMAGE");
const imageWorkersMin = finite(image.workersMin, -1);
const imageWorkersMax = finite(image.workersMax, -1);
if (imageWorkersMin !== 0 || ![0, 1].includes(imageWorkersMax)) {
  throw new Error(`AVANTIQO_VIDEO_V36_IMAGE_PEER_BASELINE_INVALID:${imageWorkersMin}/${imageWorkersMax}`);
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  head_sha: head,
  origin_main_sha: remote,
  unrelated_main_movement_tolerated: unrelatedMainMovementTolerated,
  cinema: { workers_min: 0, workers_max: 0, network_volume_ids: volumes, quiescent: true },
  image_peer: { workers_min: imageWorkersMin, workers_max: imageWorkersMax, quiescent: true, preserved_by_scoped_inert_peer_isolation: true },
  execution: { safe_lease: "AVANTIQO_RUNPOD_SAFE_LEASE_V2", child: "AVANTIQO_VIDEO_WAN22_RUNTIME_PROBE_SAFE_LEASE_V19", operation: "runtime_probe" },
  generation_requested: false,
  inference_performed: false,
  model_download_performed: false,
  direct_workers_max_write: false,
  production_web_deploy: false,
  secrets_printed: false,
}, null, 2));

if (!apply) {
  console.log("AVANTIQO_VIDEO_EU_RO1_RUNTIME_PROBE_V36_APPLIED=false");
  process.exit(0);
}

const env = {
  ...process.env,
  AVANTIQO_VIDEO_WAN22_RUNTIME_PROBE_APPROVED: "YES",
  AVANTIQO_RUNPOD_SAFE_LEASE_INERT_PEER_ISOLATION_LANE: "cinema",
};
const child = spawnSync(process.execPath, [V19, "--apply"], { cwd: process.cwd(), env, stdio: "inherit" });
if (child.error) throw child.error;

const [finalCinema, finalImage] = await Promise.all([
  requestJson(`${REST_BASE}/endpoints/${CINEMA_ID}?includeTemplate=false&includeWorkers=true`, managementKey),
  requestJson(`${REST_BASE}/endpoints/${IMAGE_ID}?includeTemplate=false&includeWorkers=true`, managementKey),
]);
if (finite(finalCinema.workersMin, -1) !== 0 || finite(finalCinema.workersMax, -1) !== 0) {
  throw new Error(`AVANTIQO_VIDEO_V36_FINAL_CINEMA_NOT_0_0:${finite(finalCinema.workersMin)}/${finite(finalCinema.workersMax)}`);
}
if (JSON.stringify(endpointVolumeIds(finalCinema)) !== JSON.stringify(volumes)) throw new Error("AVANTIQO_VIDEO_V36_FINAL_VOLUME_BINDING_CHANGED");
if (finite(finalImage.workersMin, -1) !== imageWorkersMin || finite(finalImage.workersMax, -1) !== imageWorkersMax) {
  throw new Error(`AVANTIQO_VIDEO_V36_IMAGE_PEER_CHANGED:${imageWorkersMin}/${imageWorkersMax}->${finite(finalImage.workersMin)}/${finite(finalImage.workersMax)}`);
}
assertQuiescent(healthSummary(await requestJson(`${QUEUE_BASE}/${CINEMA_ID}/health`, videoQueue.key)), "FINAL_CINEMA");
assertQuiescent(healthSummary(await requestJson(`${QUEUE_BASE}/${IMAGE_ID}/health`, imageQueue.key)), "FINAL_IMAGE");

if (child.status !== 0) {
  console.log(JSON.stringify({ success: false, contract: CONTRACT, child_exit: child.status, cleanup_verified: true, cinema_restored_0_0: true, image_peer_preserved: true }, null, 2));
  console.log("AVANTIQO_VIDEO_EU_RO1_RUNTIME_PROBE_V36=FAIL");
  process.exit(child.status || 3);
}

console.log(JSON.stringify({ success: true, contract: CONTRACT, cinema_restored_0_0: true, multivolume_binding_preserved: true, image_peer_preserved: true, runtime_probe_safe_lease_passed: true, generation_requested: false, inference_performed: false, model_download_performed: false, production_web_deploy: false, secrets_printed: false }, null, 2));
console.log("AVANTIQO_VIDEO_EU_RO1_RUNTIME_PROBE_V36=PASS");
console.log("AVANTIQO_VIDEO_EU_RO1_RUNTIME_PROBE_V36_APPLIED=true");
