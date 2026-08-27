import { spawnSync } from "node:child_process";

const CONTRACT = "AVANTIQO_VIDEO_WAN22_FULL_BLACKWELL_POOL_PROBE_V26";
const SAFE_LEASE = "scripts/run-avantiqo-runpod-safe-lease-v2-local.mjs";
const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const PROBE = "scripts/run-avantiqo-video-wan22-runtime-probe-safe-lease-v19-local.mjs";
const APPROVAL_ENV = "AVANTIQO_VIDEO_WAN22_FULL_BLACKWELL_POOL_PROBE_APPROVED";
const LANE = "cinema";
const CINEMA_NAME = "avantiqo-cinema-v1";
const LEASE_TTL_MS = 600_000;
const REQUIRED_DC = "US-NC-2";
const REQUIRED_VOLUME_ID = "7pcdebhpga";
const MIN_MEMORY_GB = 80;
const CERTIFIED_BLACKWELL_POOL = [
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
const unique = (values) => [...new Set(values.map(text).filter(Boolean))].sort();

function sameSet(left, right) {
  const a = unique(left);
  const b = unique(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function required(name, fallback = "") {
  const value = text(process.env[name] || fallback);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function redact(value) {
  return text(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]");
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
    if (found) return redact(found).slice(0, 1400);
  }
  return redact(reversed[0] || "UNKNOWN_CHILD_FAILURE").slice(0, 1400);
}

async function readJson(response, label) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch {}
  if (!response.ok) {
    throw new Error(`${label}_HTTP_${response.status}:${redact(body?.message || body?.error || body?.detail || raw).slice(0, 900)}`);
  }
  return body ?? {};
}

async function rest(pathname, key) {
  return readJson(await fetch(`${REST_BASE}${pathname}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "AVANTIQO_VIDEO_V26_REST");
}

async function queue(endpointId, pathname, key) {
  return readJson(await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}${pathname}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "AVANTIQO_VIDEO_V26_QUEUE");
}

async function queueCredentialWorks(endpointId, key) {
  if (!key) return false;
  try {
    const response = await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
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
  throw new Error("AVANTIQO_VIDEO_V26_QUEUE_CREDENTIAL_NOT_FOUND");
}

function healthSummary(body = {}) {
  const jobs = body.jobs || {};
  const workers = body.workers || {};
  const workerCounts = {
    idle: finite(workers.idle, 0),
    initializing: finite(workers.initializing, 0),
    ready: finite(workers.ready, 0),
    running: finite(workers.running, 0),
    throttled: finite(workers.throttled, 0),
    unhealthy: finite(workers.unhealthy, 0),
  };
  return {
    jobs: {
      in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
    },
    workers: workerCounts,
    worker_total: Object.values(workerCounts).reduce((sum, value) => sum + value, 0),
  };
}

async function securePoolStock(managementKey) {
  const queryText = `
    query AvantiqoVideoV26SecureStock($input: GpuAvailabilityInput) {
      gpuTypes {
        id
        displayName
        memoryInGb
        secureCloud
        communityCloud
      }
      dataCenters {
        id
        gpuAvailability(input: $input) {
          gpuTypeId
          gpuTypeDisplayName
          displayName
          stockStatus
        }
      }
    }
  `;
  const variables = {
    input: {
      gpuCount: 1,
      minDisk: 5,
      minMemoryInGb: MIN_MEMORY_GB,
      secureCloud: true,
    },
  };
  const response = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${managementKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: queryText, variables }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await readJson(response, "AVANTIQO_VIDEO_V26_GRAPHQL");
  if (Array.isArray(body.errors) && body.errors.length) {
    throw new Error(`AVANTIQO_VIDEO_V26_GRAPHQL_ERROR:${redact(body.errors.map((entry) => entry?.message).filter(Boolean).join(" | ")).slice(0, 1200)}`);
  }
  const data = body.data || {};
  const dc = list(data.dataCenters).find((entry) => text(entry?.id) === REQUIRED_DC);
  if (!dc) throw new Error(`AVANTIQO_VIDEO_V26_DATACENTER_NOT_FOUND:${REQUIRED_DC}`);
  const gpuTypes = new Map(list(data.gpuTypes).map((entry) => [text(entry?.id), entry]));
  const availability = new Map(list(dc.gpuAvailability).map((entry) => [text(entry?.gpuTypeId), entry]));
  const rows = CERTIFIED_BLACKWELL_POOL.map((gpuTypeId, priorityIndex) => {
    const meta = gpuTypes.get(gpuTypeId) || {};
    const stock = availability.get(gpuTypeId) || {};
    const stockStatus = text(stock.stockStatus) || "not-listed";
    return {
      priority: priorityIndex + 1,
      gpu_type_id: gpuTypeId,
      display_name: text(stock.gpuTypeDisplayName || stock.displayName || meta.displayName) || null,
      memory_gb: finite(meta.memoryInGb, null),
      secure_cloud_supported: meta.secureCloud === true,
      community_cloud_supported: meta.communityCloud === true,
      secure_filtered_stock: stockStatus,
      schedulable_candidate: !["", "none", "not-listed", "unavailable", "out of stock", "no stock"].includes(stockStatus.toLowerCase()),
    };
  });
  const schedulable = rows.filter((entry) => entry.schedulable_candidate && finite(entry.memory_gb, 0) >= MIN_MEMORY_GB);
  if (!schedulable.length) throw new Error(`AVANTIQO_VIDEO_V26_NO_SECURE_CERTIFIED_BLACKWELL_STOCK:${JSON.stringify(rows)}`);
  return { rows, schedulable };
}

async function endpointState(endpointId, managementKey) {
  return rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=false&includeWorkers=true`, managementKey);
}

async function resolveCinema(managementKey) {
  const raw = await rest("/endpoints?includeTemplate=false&includeWorkers=true", managementKey);
  const endpoints = Array.isArray(raw) ? raw : list(raw.endpoints || raw.data || raw.items || raw.results);
  const configuredId = text(process.env.RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID);
  const matches = configuredId
    ? endpoints.filter((entry) => text(entry?.id) === configuredId && text(entry?.name) === CINEMA_NAME)
    : endpoints.filter((entry) => text(entry?.name) === CINEMA_NAME);
  if (matches.length !== 1) throw new Error(`AVANTIQO_VIDEO_V26_CINEMA_RESOLUTION_FAILED:${matches.length}`);
  return matches[0];
}

function endpointVolumeIds(endpoint = {}) {
  return unique([text(endpoint.networkVolumeId), ...list(endpoint.networkVolumeIds).map(text)]);
}

async function assertFullPoolEndpoint(endpoint, expectedWorkersMax) {
  if (text(endpoint.name) !== CINEMA_NAME) throw new Error(`AVANTIQO_VIDEO_V26_TARGET_NAME_MISMATCH:${text(endpoint.name)}`);
  if (finite(endpoint.workersMin, -1) !== 0 || finite(endpoint.workersMax, -1) !== expectedWorkersMax) {
    throw new Error(`AVANTIQO_VIDEO_V26_CAPACITY_INVALID:${finite(endpoint.workersMin)}/${finite(endpoint.workersMax)}:expected=0/${expectedWorkersMax}`);
  }
  if (!sameSet(list(endpoint.gpuTypeIds), CERTIFIED_BLACKWELL_POOL)) {
    throw new Error(`AVANTIQO_VIDEO_V26_FULL_CERTIFIED_POOL_REQUIRED:${JSON.stringify(unique(list(endpoint.gpuTypeIds)))}`);
  }
  const volumeIds = endpointVolumeIds(endpoint);
  if (!volumeIds.includes(REQUIRED_VOLUME_ID)) {
    throw new Error(`AVANTIQO_VIDEO_V26_SHARED_VOLUME_BINDING_REQUIRED:${JSON.stringify(volumeIds)}`);
  }
  if (finite(endpoint.gpuCount, 1) !== 1) throw new Error(`AVANTIQO_VIDEO_V26_GPU_COUNT_INVALID:${finite(endpoint.gpuCount)}`);
}

async function runLeased() {
  if (
    text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE).toUpperCase() !== "YES" ||
    text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT) !== SAFE_LEASE_CONTRACT ||
    text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_LANE) !== LANE
  ) {
    throw new Error("AVANTIQO_VIDEO_V26_VALID_CINEMA_SAFE_LEASE_REQUIRED");
  }
  const endpointId = text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID);
  if (!endpointId) throw new Error("AVANTIQO_VIDEO_V26_LEASE_ENDPOINT_ID_REQUIRED");
  const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
  const queueCredential = await selectQueueCredential(endpointId, managementKey);

  const [stock, initial] = await Promise.all([
    securePoolStock(managementKey),
    endpointState(endpointId, managementKey),
  ]);
  await assertFullPoolEndpoint(initial, 1);
  const initialHealth = healthSummary(await queue(endpointId, "/health", queueCredential.key));
  if (initialHealth.jobs.in_queue !== 0 || initialHealth.jobs.in_progress !== 0 || initialHealth.workers.unhealthy !== 0) {
    throw new Error(`AVANTIQO_VIDEO_V26_CINEMA_NOT_CLEAN_BEFORE_PROBE:${JSON.stringify(initialHealth)}`);
  }

  console.log(`AVANTIQO_VIDEO_V26_FULL_BLACKWELL_POOL_ACTIVE=${JSON.stringify({
    pool: CERTIFIED_BLACKWELL_POOL,
    secure_schedulable_candidates: stock.schedulable,
    gpu_pool_mutation_performed: false,
  })}`);

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
    throw new Error(`AVANTIQO_VIDEO_V26_RUNTIME_PROBE_FAILED:exit=${probe.status}:inner=${inner}`);
  }

  const final = await endpointState(endpointId, managementKey);
  await assertFullPoolEndpoint(final, 1);

  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    endpoint_id: endpointId,
    certified_blackwell_pool: CERTIFIED_BLACKWELL_POOL,
    secure_schedulable_candidates: stock.schedulable,
    full_pool_preserved: true,
    gpu_pool_mutation_performed: false,
    safe_lease_capacity: "0/1",
    direct_workers_max_write: false,
    runpod_job_outside_safe_lease: false,
    generation_requested: false,
    inference_performed: false,
    model_download_performed: false,
    storage_mutation_performed: false,
    production_web_deploy: false,
    secrets_printed: false,
  }, null, 2));
  console.log("AVANTIQO_VIDEO_WAN22_FULL_BLACKWELL_POOL_PROBE_V26_CHILD=PASS");
}

if (Number(process.versions.node.split(".")[0]) < 24) {
  throw new Error(`AVANTIQO_VIDEO_V26_NODE24_REQUIRED:${process.version}`);
}

const apply = process.argv.includes("--apply");
const leased = process.argv.includes("--leased");

if (!apply) {
  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    mode: "PLAN",
    target: CINEMA_NAME,
    safe_lease_contract: SAFE_LEASE_CONTRACT,
    safe_lease_lane: LANE,
    required_datacenter: REQUIRED_DC,
    required_network_volume_id: REQUIRED_VOLUME_ID,
    certified_blackwell_pool: CERTIFIED_BLACKWELL_POOL,
    secure_stock_preflight_required: true,
    secure_stock_revalidated_inside_safe_lease: true,
    gpu_pool_mutation_performed: false,
    child_runtime_probe: PROBE,
    generation_requested: false,
    inference_performed: false,
    model_download_performed: false,
    storage_mutation_performed: false,
    direct_workers_max_write: false,
    runpod_job_outside_safe_lease: false,
    production_web_deploy: false,
    secrets_printed: false,
  }, null, 2));
  console.log("AVANTIQO_VIDEO_WAN22_FULL_BLACKWELL_POOL_PROBE_V26_APPLIED=false");
  process.exit(0);
}

if (!approved(process.env[APPROVAL_ENV])) throw new Error(`${APPROVAL_ENV}=YES_REQUIRED`);

if (leased) {
  await runLeased();
  process.exit(0);
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
const cinema = await resolveCinema(managementKey);
await assertFullPoolEndpoint(cinema, 0);
const queueCredential = await selectQueueCredential(text(cinema.id), managementKey);
const preflightHealth = healthSummary(await queue(text(cinema.id), "/health", queueCredential.key));
if (preflightHealth.jobs.in_queue !== 0 || preflightHealth.jobs.in_progress !== 0 || preflightHealth.worker_total !== 0) {
  throw new Error(`AVANTIQO_VIDEO_V26_PREFLIGHT_NOT_QUIESCENT:${JSON.stringify(preflightHealth)}`);
}
const preflightStock = await securePoolStock(managementKey);
console.log(`AVANTIQO_VIDEO_V26_PREFLIGHT=${JSON.stringify({
  endpoint_id: text(cinema.id),
  full_certified_pool_present: true,
  secure_schedulable_candidates: preflightStock.schedulable,
  queue_and_workers_zero: true,
  gpu_pool_mutation_planned: false,
})}`);

const cinemaQueueKey = text(process.env.RUNPOD_AVANTIQO_VIDEO_API_KEY) || text(process.env.RUNPOD_API_KEY) || managementKey;
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
    "Error: AVANTIQO_VIDEO_V26_RUNTIME_PROBE_FAILED:",
    "Error: AVANTIQO_VIDEO_V26_",
    "AVANTIQO_VIDEO_V19_",
    "AVANTIQO_RUNPOD_SAFE_LEASE_V2_TARGET_",
    "AVANTIQO_RUNPOD_SAFE_LEASE_V2_CHILD_",
  ]);
  throw new Error(`AVANTIQO_VIDEO_V26_SAFE_LEASE_FAILED:exit=${child.status}:inner=${inner}`);
}
console.log("AVANTIQO_VIDEO_WAN22_FULL_BLACKWELL_POOL_PROBE_V26_APPLIED=true");
