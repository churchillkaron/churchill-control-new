import { spawnSync } from "node:child_process";

const CONTRACT = "AVANTIQO_VIDEO_WAN22_STOCKED_BLACKWELL_PROBE_V21";
const SAFE_LEASE = "scripts/run-avantiqo-runpod-safe-lease-v2-local.mjs";
const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const PROBE = "scripts/run-avantiqo-video-wan22-runtime-probe-safe-lease-v19-local.mjs";
const APPROVAL_ENV = "AVANTIQO_VIDEO_WAN22_STOCKED_BLACKWELL_PROBE_APPROVED";
const LANE = "cinema";
const CINEMA_NAME = "avantiqo-cinema-v1";
const LEASE_TTL_MS = 600_000;
const STOCKED_GPU = "NVIDIA RTX PRO 6000 Blackwell Server Edition";
const REQUIRED_DC = "US-NC-2";
const REQUIRED_VOLUME_ID = "7pcdebhpga";
const ORIGINAL_BLACKWELL_POOL = [
  "NVIDIA RTX PRO 6000 Blackwell Max-Q Workstation Edition",
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
  "NVIDIA RTX PRO 6000 Blackwell Workstation Edition",
];
const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const GRAPHQL_URL = "https://api.runpod.io/graphql";
const CHILD_MAX_BUFFER_BYTES = 16 * 1024 * 1024;

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const approved = (value) => ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase());
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const unique = (values) => [...new Set(values.map(text).filter(Boolean))].sort();

function sameSet(left, right) {
  const a = unique(left);
  const b = unique(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function redact(value) {
  return text(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]");
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function relayCaptured(result) {
  const stdout = String(result?.stdout ?? "");
  const stderr = String(result?.stderr ?? "");
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  return `${stdout}\n${stderr}`;
}

function diagnosticLine(raw, preferredMarkers = []) {
  const lines = String(raw || "")
    .split(/\r?\n/)
    .map((line) => text(line))
    .filter(Boolean);
  const reversed = [...lines].reverse();
  for (const marker of preferredMarkers) {
    const found = reversed.find((line) => line.includes(marker));
    if (found) return redact(found).slice(0, 1200);
  }
  return redact(reversed[0] || "UNKNOWN_CHILD_FAILURE").slice(0, 1200);
}

async function readJson(response, label) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch {}
  if (!response.ok) throw new Error(`${label}_HTTP_${response.status}:${redact(body?.message || body?.error || raw).slice(0, 800)}`);
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
  }), "AVANTIQO_VIDEO_V21_REST");
}

async function queue(endpointId, pathname, key, options = {}) {
  return readJson(await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  }), "AVANTIQO_VIDEO_V21_QUEUE");
}

async function graphql(query, key) {
  const body = await readJson(await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(30_000),
  }), "AVANTIQO_VIDEO_V21_GRAPHQL");
  if (Array.isArray(body.errors) && body.errors.length) {
    throw new Error(`AVANTIQO_VIDEO_V21_GRAPHQL_ERROR:${redact(body.errors[0]?.message).slice(0, 800)}`);
  }
  return body.data || {};
}

function healthSummary(body = {}) {
  const jobs = body.jobs || {};
  const workers = body.workers || {};
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

function stockRank(value) {
  const normalized = text(value).toLowerCase();
  if (normalized === "high") return 4;
  if (normalized === "medium") return 3;
  if (normalized === "low") return 2;
  if (!normalized || ["none", "unavailable", "out of stock", "no stock"].includes(normalized)) return 0;
  return 1;
}

async function assertStocked(managementKey) {
  const data = await graphql(`query AvantiqoVideoV21Stock {
    gpuTypes { id displayName memoryInGb secureCloud communityCloud }
    dataCenters {
      id
      gpuAvailability { gpuTypeId displayName stockStatus }
    }
  }`, managementKey);
  const dc = list(data.dataCenters).find((entry) => text(entry?.id) === REQUIRED_DC);
  if (!dc) throw new Error(`AVANTIQO_VIDEO_V21_DATACENTER_NOT_FOUND:${REQUIRED_DC}`);
  const stock = list(dc.gpuAvailability).find((entry) => text(entry?.gpuTypeId) === STOCKED_GPU);
  const gpu = list(data.gpuTypes).find((entry) => text(entry?.id) === STOCKED_GPU);
  if (!stock || stockRank(stock.stockStatus) <= 0) {
    throw new Error(`AVANTIQO_VIDEO_V21_CERTIFIED_BLACKWELL_NOT_IN_STOCK:${text(stock?.stockStatus) || "not-listed"}`);
  }
  if (finite(gpu?.memoryInGb, 0) < 80) throw new Error(`AVANTIQO_VIDEO_V21_GPU_MEMORY_INSUFFICIENT:${finite(gpu?.memoryInGb, 0)}`);
  return {
    gpu_type_id: STOCKED_GPU,
    display_name: text(stock.displayName || gpu?.displayName) || null,
    memory_gb: finite(gpu?.memoryInGb, null),
    stock_status: text(stock.stockStatus),
  };
}

async function endpointState(endpointId, managementKey) {
  return rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=false&includeWorkers=true`, managementKey);
}

async function patchGpuPool(endpointId, gpuTypeIds, managementKey, label) {
  await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
    method: "PATCH",
    body: { gpuTypeIds },
  });
  const fresh = await endpointState(endpointId, managementKey);
  if (!sameSet(list(fresh.gpuTypeIds), gpuTypeIds)) {
    throw new Error(`${label}_VERIFY_FAILED:${JSON.stringify(unique(list(fresh.gpuTypeIds)))}`);
  }
  return fresh;
}

async function runLeased() {
  if (
    text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE).toUpperCase() !== "YES" ||
    text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT) !== SAFE_LEASE_CONTRACT ||
    text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_LANE) !== LANE
  ) {
    throw new Error("AVANTIQO_VIDEO_V21_VALID_CINEMA_SAFE_LEASE_REQUIRED");
  }
  const endpointId = text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID);
  if (!endpointId) throw new Error("AVANTIQO_VIDEO_V21_LEASE_ENDPOINT_ID_REQUIRED");
  const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
  const queueKey = text(process.env.RUNPOD_AVANTIQO_VIDEO_API_KEY) || text(process.env.RUNPOD_API_KEY) || managementKey;

  const stock = await assertStocked(managementKey);
  const initial = await endpointState(endpointId, managementKey);
  if (text(initial.name) !== CINEMA_NAME) throw new Error(`AVANTIQO_VIDEO_V21_TARGET_NAME_MISMATCH:${text(initial.name)}`);
  if (finite(initial.workersMin, -1) !== 0 || finite(initial.workersMax, -1) !== 1) {
    throw new Error(`AVANTIQO_VIDEO_V21_SAFE_LEASE_CAPACITY_REQUIRED:${finite(initial.workersMin)}/${finite(initial.workersMax)}`);
  }
  const volumeIds = unique([text(initial.networkVolumeId), ...list(initial.networkVolumeIds)]);
  if (!volumeIds.includes(REQUIRED_VOLUME_ID)) throw new Error(`AVANTIQO_VIDEO_V21_SHARED_VOLUME_BINDING_REQUIRED:${JSON.stringify(volumeIds)}`);
  if (!sameSet(list(initial.gpuTypeIds), ORIGINAL_BLACKWELL_POOL)) {
    throw new Error(`AVANTIQO_VIDEO_V21_ORIGINAL_BLACKWELL_POOL_CHANGED:${JSON.stringify(unique(list(initial.gpuTypeIds)))}`);
  }
  const initialHealth = healthSummary(await queue(endpointId, "/health", queueKey));
  if (initialHealth.jobs.in_queue !== 0 || initialHealth.jobs.in_progress !== 0 || initialHealth.workers.unhealthy !== 0) {
    throw new Error(`AVANTIQO_VIDEO_V21_CINEMA_NOT_CLEAN_BEFORE_POOL_NARROW:${JSON.stringify(initialHealth)}`);
  }

  let poolChanged = false;
  let probeError = null;
  try {
    await patchGpuPool(endpointId, [STOCKED_GPU], managementKey, "AVANTIQO_VIDEO_V21_STOCKED_POOL_APPLY");
    poolChanged = true;
    console.log(`AVANTIQO_VIDEO_V21_STOCKED_BLACKWELL_POOL_ACTIVE=${JSON.stringify(stock)}`);

    const probe = spawnSync(
      process.execPath,
      [PROBE, "--apply", "--leased"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          AVANTIQO_VIDEO_WAN22_RUNTIME_PROBE_APPROVED: "YES",
        },
        encoding: "utf8",
        maxBuffer: CHILD_MAX_BUFFER_BYTES,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const probeOutput = relayCaptured(probe);
    if (probe.error) throw probe.error;
    if (probe.status !== 0) {
      const inner = diagnosticLine(probeOutput, [
        "Error: AVANTIQO_VIDEO_V19_",
        "AVANTIQO_VIDEO_V19_RUNTIME_PROBE_TERMINAL_",
        "AVANTIQO_VIDEO_V19_UNSCHEDULED_ZERO_WORKERS",
        "AVANTIQO_VIDEO_V19_UNHEALTHY_WORKER",
        "AVANTIQO_VIDEO_V19_STATUS_TIMEOUT",
        "AVANTIQO_VIDEO_V19_HTTP_",
      ]);
      throw new Error(`AVANTIQO_VIDEO_V21_RUNTIME_PROBE_FAILED:exit=${probe.status}:inner=${inner}`);
    }
  } catch (error) {
    probeError = error;
  } finally {
    if (poolChanged) {
      const current = await endpointState(endpointId, managementKey);
      const currentPool = unique(list(current.gpuTypeIds));
      if (sameSet(currentPool, [STOCKED_GPU])) {
        await patchGpuPool(endpointId, ORIGINAL_BLACKWELL_POOL, managementKey, "AVANTIQO_VIDEO_V21_ORIGINAL_POOL_RESTORE");
        console.log("AVANTIQO_VIDEO_V21_ORIGINAL_BLACKWELL_POOL_RESTORED=true");
      } else if (!sameSet(currentPool, ORIGINAL_BLACKWELL_POOL)) {
        throw new Error(`AVANTIQO_VIDEO_V21_GPU_POOL_CONCURRENT_CHANGE:${JSON.stringify(currentPool)}`);
      }
    }
  }

  const final = await endpointState(endpointId, managementKey);
  if (!sameSet(list(final.gpuTypeIds), ORIGINAL_BLACKWELL_POOL)) {
    throw new Error("AVANTIQO_VIDEO_V21_FINAL_ORIGINAL_BLACKWELL_POOL_REQUIRED");
  }
  if (probeError) throw probeError;

  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    endpoint_id: endpointId,
    selected_gpu: stock,
    preflight_stock_checked_before_safe_lease: true,
    stock_revalidated_inside_safe_lease: true,
    temporary_gpu_pool_change_inside_safe_lease: true,
    original_blackwell_pool_restored_before_release: true,
    direct_workers_max_write: false,
    runpod_job_outside_safe_lease: false,
    generation_requested: false,
    inference_performed: false,
    model_download_performed: false,
    production_web_deploy: false,
    secrets_printed: false,
  }, null, 2));
  console.log("AVANTIQO_VIDEO_WAN22_STOCKED_BLACKWELL_PROBE_V21_CHILD=PASS");
}

if (Number(process.versions.node.split(".")[0]) < 24) {
  throw new Error(`AVANTIQO_VIDEO_V21_NODE24_REQUIRED:${process.version}`);
}

const apply = process.argv.includes("--apply");
const leased = process.argv.includes("--leased");

if (!apply) {
  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    mode: "PLAN",
    safe_lease_contract: SAFE_LEASE_CONTRACT,
    safe_lease_lane: LANE,
    target: CINEMA_NAME,
    selected_gpu: STOCKED_GPU,
    required_datacenter: REQUIRED_DC,
    required_network_volume_id: REQUIRED_VOLUME_ID,
    preflight_stock_checked_before_safe_lease: true,
    stock_revalidated_inside_lease: true,
    temporary_gpu_pool_change_inside_safe_lease: true,
    original_blackwell_pool_restore_required_before_release: true,
    child_runtime_probe: PROBE,
    generation_requested: false,
    inference_performed: false,
    model_download_performed: false,
    direct_workers_max_write: false,
    runpod_job_outside_safe_lease: false,
    production_web_deploy: false,
    secrets_printed: false,
  }, null, 2));
  console.log("AVANTIQO_VIDEO_WAN22_STOCKED_BLACKWELL_PROBE_V21_APPLIED=false");
  process.exit(0);
}

if (!approved(process.env[APPROVAL_ENV])) throw new Error(`${APPROVAL_ENV}=YES_REQUIRED`);

if (leased) {
  await runLeased();
  process.exit(0);
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const preflightStock = await assertStocked(managementKey);
console.log(`AVANTIQO_VIDEO_V21_PREFLIGHT_STOCK=${JSON.stringify(preflightStock)}`);

const cinemaQueueKey = text(process.env.RUNPOD_AVANTIQO_VIDEO_API_KEY) || text(process.env.RUNPOD_API_KEY) || managementKey;
if (!cinemaQueueKey) throw new Error("AVANTIQO_VIDEO_V21_CINEMA_QUEUE_KEY_REQUIRED");
const child = spawnSync(
  process.execPath,
  [SAFE_LEASE, `--lane=${LANE}`, `--ttl-ms=${LEASE_TTL_MS}`, "--", process.execPath, process.argv[1], "--apply", "--leased"],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      AVANTIQO_RUNPOD_SAFE_LEASE_APPROVED: "YES",
      AVANTIQO_RUNPOD_SAFE_LEASE_TARGET_QUEUE_API_KEY: cinemaQueueKey,
      AVANTIQO_RUNPOD_SAFE_LEASE_INERT_PEER_ISOLATION_LANE: LANE,
      AVANTIQO_VIDEO_WAN22_RUNTIME_PROBE_APPROVED: "YES",
    },
    encoding: "utf8",
    maxBuffer: CHILD_MAX_BUFFER_BYTES,
    stdio: ["ignore", "pipe", "pipe"],
  },
);
const safeLeaseOutput = relayCaptured(child);
if (child.error) throw child.error;
if (child.status !== 0) {
  const inner = diagnosticLine(safeLeaseOutput, [
    "Error: AVANTIQO_VIDEO_V21_RUNTIME_PROBE_FAILED:",
    "Error: AVANTIQO_VIDEO_V21_",
    "AVANTIQO_VIDEO_V21_RUNTIME_PROBE_FAILED:",
    "AVANTIQO_VIDEO_V19_",
    "AVANTIQO_RUNPOD_SAFE_LEASE_V2_TARGET_",
    "AVANTIQO_RUNPOD_SAFE_LEASE_V2_CHILD_",
  ]);
  throw new Error(`AVANTIQO_VIDEO_V21_SAFE_LEASE_FAILED:exit=${child.status}:inner=${inner}`);
}
console.log("AVANTIQO_VIDEO_WAN22_STOCKED_BLACKWELL_PROBE_V21_APPLIED=true");
