import { spawnSync } from "node:child_process";

const CONTRACT = "AVANTIQO_VIDEO_EU_RO1_RUNTIME_PROOF_V37";
const APPROVAL_ENV = "AVANTIQO_VIDEO_EU_RO1_RUNTIME_PROOF_V37_APPROVED";
const SAFE_LEASE = "scripts/run-avantiqo-runpod-safe-lease-v2-local.mjs";
const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const LANE = "cinema";
const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const GRAPHQL_URL = "https://api.runpod.io/graphql";
const CINEMA_ID = "r0bzqq9zoi92h7";
const CINEMA_NAME = "avantiqo-cinema-v1";
const DESTINATION_DC = "EU-RO-1";
const SOURCE_VOLUME_ID = "7pcdebhpga";
const DESTINATION_VOLUME_ID = "t4erb6kxi1";
const T2V_MODEL = "Wan-AI/Wan2.2-T2V-A14B-Diffusers";
const I2V_MODEL = "Wan-AI/Wan2.2-I2V-A14B-Diffusers";
const T2V_REVISION = "5be7df9619b54f4e2667b2755bc6a756675b5cd7";
const I2V_REVISION = "596658fd9ca6b7b71d5057529bbf319ecbc61d74";
const PROBE_CONTRACT = "AVANTIQO_VIDEO_RUNTIME_PROBE_V1";
const RUNTIME_REVISION = "AVANTIQO_VIDEO_WAN22_A14B_DEFAULT_ROUTING_CACHE_V1";
const ENTRYPOINT_REVISION = "AVANTIQO_VIDEO_HANDLER_V3_WAN22_A14B_DEFAULT_ROUTING_V1";
const LEASE_TTL_MS = 600_000;
const STATUS_LIMIT_MS = 420_000;
const UNSCHEDULED_LIMIT_MS = 180_000;
const POLL_MS = 5_000;
const CERTIFIED_BLACKWELL_POOL = [
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
  "NVIDIA RTX PRO 6000 Blackwell Workstation Edition",
  "NVIDIA RTX PRO 6000 Blackwell Max-Q Workstation Edition",
];

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const yes = (value) => ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase());
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const unique = (values) => [...new Set(values.map(text).filter(Boolean))];

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
function normalizeStringList(value) {
  if (Array.isArray(value)) return unique(value);
  if (typeof value === "string") return unique(value.split(","));
  return [];
}
function endpointVolumeIds(endpoint = {}) {
  return unique([endpoint.networkVolumeId, ...list(endpoint.networkVolumeIds)]).sort();
}
function sameSet(left, right) {
  return JSON.stringify(unique(left).sort()) === JSON.stringify(unique(right).sort());
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
    jobs: { in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0), in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0) },
    workers: workerCounts,
    worker_total: Object.values(workerCounts).reduce((sum, value) => sum + value, 0),
  };
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
  if (!response.ok) throw new Error(`AVANTIQO_VIDEO_V37_HTTP_${response.status}:${redact(body?.message || body?.error || body?.detail || raw).slice(0, 900)}`);
  return body ?? {};
}
async function rest(pathname, key, options = {}) {
  return requestJson(`${REST_BASE}${pathname}`, key, options);
}
async function queue(endpointId, pathname, key, options = {}) {
  return requestJson(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}${pathname}`, key, options);
}
async function selectQueueKey(endpointId, managementKey) {
  const candidates = [
    ["RUNPOD_AVANTIQO_VIDEO_API_KEY", text(process.env.RUNPOD_AVANTIQO_VIDEO_API_KEY)],
    ["RUNPOD_API_KEY", text(process.env.RUNPOD_API_KEY)],
    ["RUNPOD_MANAGEMENT_API_KEY", managementKey],
  ];
  const seen = new Set();
  for (const [source, key] of candidates) {
    if (!key || seen.has(key)) continue;
    seen.add(key);
    try {
      await queue(endpointId, "/health", key);
      return { source, key };
    } catch {}
  }
  throw new Error("AVANTIQO_VIDEO_V37_CINEMA_QUEUE_CREDENTIAL_NOT_FOUND");
}
function stockRank(value) {
  const normalized = text(value).toUpperCase();
  if (normalized === "HIGH") return 3;
  if (normalized === "MEDIUM") return 2;
  if (normalized === "LOW") return 1;
  return 0;
}
async function selectLiveEuBlackwell(managementKey, allowedPool) {
  const queryText = `
    query AvantiqoVideoV37($input: GpuAvailabilityInput) {
      gpuTypes { id displayName memoryInGb secureCloud }
      dataCenters {
        id
        storageSupport
        gpuAvailability(input: $input) {
          available
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
    body: JSON.stringify({ query: queryText, variables: { input: { gpuCount: 1, minDisk: 5, minMemoryInGb: 80, secureCloud: true } } }),
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch {}
  if (!response.ok || list(body?.errors).length) {
    throw new Error(`AVANTIQO_VIDEO_V37_GRAPHQL_FAILED:${redact(list(body?.errors).map((entry) => entry?.message).filter(Boolean).join(" | ") || raw).slice(0, 900)}`);
  }
  const gpuMeta = new Map(list(body?.data?.gpuTypes).map((entry) => [text(entry?.id), entry]));
  const dc = list(body?.data?.dataCenters).find((entry) => text(entry?.id) === DESTINATION_DC);
  if (!dc || dc.storageSupport !== true) throw new Error("AVANTIQO_VIDEO_V37_EU_RO1_STORAGE_SUPPORT_REQUIRED");
  const candidates = list(dc.gpuAvailability)
    .map((entry) => {
      const gpuTypeId = text(entry?.gpuTypeId);
      const meta = gpuMeta.get(gpuTypeId) || {};
      return {
        gpu_type_id: gpuTypeId,
        display_name: text(entry?.gpuTypeDisplayName || entry?.displayName || meta?.displayName) || null,
        memory_gb: finite(meta?.memoryInGb, null),
        available: entry?.available === true,
        stock_status: text(entry?.stockStatus) || null,
        stock_rank: stockRank(entry?.stockStatus),
        secure_cloud: meta?.secureCloud === true,
      };
    })
    .filter((entry) => allowedPool.includes(entry.gpu_type_id) && entry.available && entry.stock_rank > 0 && finite(entry.memory_gb, 0) >= 80 && entry.secure_cloud)
    .sort((a, b) => b.stock_rank - a.stock_rank || CERTIFIED_BLACKWELL_POOL.indexOf(a.gpu_type_id) - CERTIFIED_BLACKWELL_POOL.indexOf(b.gpu_type_id));
  if (!candidates.length) throw new Error(`AVANTIQO_VIDEO_V37_NO_LIVE_EU_RO1_CERTIFIED_BLACKWELL:${allowedPool.join("|")}`);
  return { selected: candidates[0], candidates };
}
function normalizeWorker(worker = {}) {
  const machine = worker.machine || {};
  const networkVolume = worker.networkVolume || {};
  return {
    worker_id: text(worker.id) || null,
    status: text(worker.status ?? worker.workerStatus ?? worker.runtimeStatus) || null,
    gpu_type_id: text(machine.gpuTypeId || worker.gpu?.id) || null,
    gpu_display_name: text(machine.gpuDisplayName || machine.gpuType?.displayName || worker.gpu?.displayName) || null,
    data_center_id: text(machine.dataCenterId || networkVolume.dataCenterId) || null,
    network_volume_id: text(networkVolume.id) || null,
    network_volume_data_center_id: text(networkVolume.dataCenterId) || null,
    hourly_cost_usd: finite(worker.adjustedCostPerHr ?? worker.costPerHr, null),
  };
}
function placementObservation(endpoint = {}) {
  return list(endpoint.workers).map(normalizeWorker).filter((worker) => worker.worker_id || worker.data_center_id || worker.network_volume_id || worker.status);
}
function validateProbe(output) {
  if (!output || typeof output !== "object" || Array.isArray(output)) throw new Error("AVANTIQO_VIDEO_V37_PROBE_OUTPUT_INVALID");
  if (text(output.probe_contract) !== PROBE_CONTRACT) throw new Error(`AVANTIQO_VIDEO_V37_PROBE_CONTRACT_INVALID:${text(output.probe_contract)}`);
  if (text(output.runtime_revision) !== RUNTIME_REVISION) throw new Error(`AVANTIQO_VIDEO_V37_RUNTIME_REVISION_INVALID:${text(output.runtime_revision)}`);
  if (text(output.entrypoint_revision) !== ENTRYPOINT_REVISION) throw new Error(`AVANTIQO_VIDEO_V37_ENTRYPOINT_REVISION_INVALID:${text(output.entrypoint_revision)}`);
  if (output.generation_requested !== false || output.inference_performed !== false || output.model_download_performed !== false || output.storage_mutation_performed !== false) {
    throw new Error("AVANTIQO_VIDEO_V37_PROBE_MUTATION_OR_INFERENCE_FORBIDDEN");
  }
  if (text(output.configured_text_to_video_foundation) !== T2V_MODEL || text(output.configured_image_to_video_foundation) !== I2V_MODEL || output.require_cached_model !== true) {
    throw new Error("AVANTIQO_VIDEO_V37_DEFAULT_FOUNDATION_CONTRACT_INVALID");
  }
  const t2v = output.foundations?.text_to_video || {};
  const i2v = output.foundations?.image_to_video || {};
  for (const [label, foundation, model, revision] of [
    ["T2V", t2v, T2V_MODEL, T2V_REVISION],
    ["I2V", i2v, I2V_MODEL, I2V_REVISION],
  ]) {
    if (text(foundation.model) !== model || foundation.cache_ready !== true || foundation.cache_path_present !== true || foundation.completion_marker_valid !== true || text(foundation.snapshot_revision) !== revision) {
      throw new Error(`AVANTIQO_VIDEO_V37_${label}_CACHE_INVALID:${JSON.stringify({ model: foundation.model || null, cache_ready: foundation.cache_ready === true, cache_path_present: foundation.cache_path_present === true, completion_marker_valid: foundation.completion_marker_valid === true, snapshot_revision: foundation.snapshot_revision || null, expected_revision: revision })}`);
    }
  }
  return { t2v, i2v };
}
async function cancelExactJob(endpointId, jobId, queueKey, reason) {
  if (!jobId) return { attempted: false, reason };
  try {
    const body = await queue(endpointId, `/cancel/${encodeURIComponent(jobId)}`, queueKey, { method: "POST" });
    return { attempted: true, success: true, reason, result_status: text(body?.status) || null };
  } catch (error) {
    return { attempted: true, success: false, reason, error: redact(error.message).slice(0, 500) };
  }
}

async function runLeasedProof() {
  if (!yes(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE) || text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT) !== SAFE_LEASE_CONTRACT || text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_LANE) !== LANE) {
    throw new Error("AVANTIQO_VIDEO_V37_VALID_CINEMA_SAFE_LEASE_REQUIRED");
  }
  const leasedEndpointId = text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID);
  if (leasedEndpointId !== CINEMA_ID) throw new Error(`AVANTIQO_VIDEO_V37_SAFE_LEASE_ENDPOINT_INVALID:${leasedEndpointId}`);
  const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
  const credential = await selectQueueKey(CINEMA_ID, managementKey);
  const before = await rest(`/endpoints/${CINEMA_ID}?includeTemplate=false&includeWorkers=true`, managementKey);
  if (text(before.id) !== CINEMA_ID || text(before.name) !== CINEMA_NAME) throw new Error("AVANTIQO_VIDEO_V37_CINEMA_ID_OR_NAME_INVALID");
  if (finite(before.workersMin, -1) !== 0 || finite(before.workersMax, -1) !== 1) throw new Error(`AVANTIQO_VIDEO_V37_SAFE_LEASE_NOT_OPEN_0_1:${finite(before.workersMin)}/${finite(before.workersMax)}`);
  const originalDataCenters = normalizeStringList(before.dataCenterIds);
  const originalGpuPool = normalizeStringList(before.gpuTypeIds);
  const originalVolumes = endpointVolumeIds(before);
  if (!sameSet(originalVolumes, [SOURCE_VOLUME_ID, DESTINATION_VOLUME_ID])) throw new Error(`AVANTIQO_VIDEO_V37_MULTIVOLUME_BINDING_INVALID:${originalVolumes.join("|")}`);
  if (!originalGpuPool.length || !originalGpuPool.every((gpu) => CERTIFIED_BLACKWELL_POOL.includes(gpu))) throw new Error(`AVANTIQO_VIDEO_V37_ORIGINAL_GPU_POOL_INVALID:${originalGpuPool.join("|")}`);
  const [sourceVolume, destinationVolume, live] = await Promise.all([
    rest(`/networkvolumes/${SOURCE_VOLUME_ID}`, managementKey),
    rest(`/networkvolumes/${DESTINATION_VOLUME_ID}`, managementKey),
    selectLiveEuBlackwell(managementKey, originalGpuPool),
  ]);
  if (text(sourceVolume.dataCenterId) !== "US-NC-2") throw new Error(`AVANTIQO_VIDEO_V37_SOURCE_VOLUME_DC_INVALID:${text(sourceVolume.dataCenterId)}`);
  if (text(destinationVolume.dataCenterId) !== DESTINATION_DC) throw new Error(`AVANTIQO_VIDEO_V37_DESTINATION_VOLUME_DC_INVALID:${text(destinationVolume.dataCenterId)}`);

  const baselineHealth = healthSummary(await queue(CINEMA_ID, "/health", credential.key));
  if (baselineHealth.jobs.in_queue !== 0 || baselineHealth.jobs.in_progress !== 0 || baselineHealth.worker_total !== 0) {
    throw new Error(`AVANTIQO_VIDEO_V37_CINEMA_NOT_CLEAN_BEFORE_PLACEMENT_PIN:${JSON.stringify(baselineHealth)}`);
  }

  const placement = { dataCenterIds: [DESTINATION_DC], gpuTypeIds: [live.selected.gpu_type_id] };
  let placementPinned = false;
  let jobId = "";
  let latestStatus = null;
  let completed = false;
  const observations = [];
  let result = null;
  let failure = null;
  try {
    await rest(`/endpoints/${CINEMA_ID}`, managementKey, { method: "PATCH", body: placement });
    placementPinned = true;
    const pinned = await rest(`/endpoints/${CINEMA_ID}?includeTemplate=false&includeWorkers=true`, managementKey);
    if (!sameSet(normalizeStringList(pinned.dataCenterIds), [DESTINATION_DC])) throw new Error(`AVANTIQO_VIDEO_V37_DC_PIN_VERIFY_FAILED:${normalizeStringList(pinned.dataCenterIds).join("|")}`);
    if (!sameSet(normalizeStringList(pinned.gpuTypeIds), [live.selected.gpu_type_id])) throw new Error(`AVANTIQO_VIDEO_V37_GPU_PIN_VERIFY_FAILED:${normalizeStringList(pinned.gpuTypeIds).join("|")}`);
    if (!sameSet(endpointVolumeIds(pinned), originalVolumes)) throw new Error("AVANTIQO_VIDEO_V37_VOLUME_BINDING_CHANGED_DURING_PIN");
    if (finite(pinned.workersMin, -1) !== 0 || finite(pinned.workersMax, -1) !== 1) throw new Error("AVANTIQO_VIDEO_V37_SAFE_LEASE_CAPACITY_CHANGED_DURING_PIN");

    const submitted = await queue(CINEMA_ID, "/run", credential.key, { method: "POST", body: { input: { operation: "runtime_probe" } } });
    jobId = text(submitted.id || submitted.jobId || submitted.job_id);
    if (!jobId) throw new Error("AVANTIQO_VIDEO_V37_JOB_ID_REQUIRED");
    console.log(`AVANTIQO_VIDEO_V37_RUNTIME_PROBE_SUBMITTED=${jobId}`);

    const started = Date.now();
    let zeroWorkerQueuedSince = null;
    while (Date.now() - started < STATUS_LIMIT_MS) {
      const [statusBody, healthBody, endpointBody] = await Promise.all([
        queue(CINEMA_ID, `/status/${encodeURIComponent(jobId)}`, credential.key),
        queue(CINEMA_ID, "/health", credential.key),
        rest(`/endpoints/${CINEMA_ID}?includeTemplate=false&includeWorkers=true`, managementKey),
      ]);
      latestStatus = statusBody;
      const status = text(statusBody.status).toUpperCase();
      const health = healthSummary(healthBody);
      const workers = placementObservation(endpointBody);
      for (const worker of workers) {
        if (!observations.some((entry) => JSON.stringify(entry) === JSON.stringify(worker))) observations.push(worker);
      }
      console.log(`AVANTIQO_VIDEO_V37_PROGRESS=${JSON.stringify({ elapsed_seconds: Math.floor((Date.now() - started) / 1000), status, health, observed_workers: workers })}`);

      if (status === "COMPLETED") {
        const output = statusBody.output ?? statusBody.result;
        const verified = validateProbe(output);
        const euObservation = observations.find((worker) => worker.data_center_id === DESTINATION_DC && worker.network_volume_id === DESTINATION_VOLUME_ID && worker.network_volume_data_center_id === DESTINATION_DC);
        if (!euObservation) throw new Error(`AVANTIQO_VIDEO_V37_EU_WORKER_PLACEMENT_NOT_PROVEN:${JSON.stringify(observations)}`);
        if (euObservation.gpu_type_id && euObservation.gpu_type_id !== live.selected.gpu_type_id) {
          throw new Error(`AVANTIQO_VIDEO_V37_WORKER_GPU_MISMATCH:expected=${live.selected.gpu_type_id}:actual=${euObservation.gpu_type_id}`);
        }
        completed = true;
        result = { verified, euObservation };
        break;
      }
      if (["FAILED", "CANCELLED", "CANCELED", "TIMED_OUT"].includes(status)) {
        throw new Error(`AVANTIQO_VIDEO_V37_RUNTIME_PROBE_TERMINAL_${status}:${redact(statusBody.error || statusBody.output || statusBody.message).slice(0, 900)}`);
      }
      if (status === "IN_QUEUE" && health.worker_total === 0) {
        zeroWorkerQueuedSince ??= Date.now();
        if (Date.now() - zeroWorkerQueuedSince >= UNSCHEDULED_LIMIT_MS) {
          const cancelled = await cancelExactJob(CINEMA_ID, jobId, credential.key, "EU_RO1_IN_QUEUE_ZERO_WORKERS_180S");
          throw new Error(`AVANTIQO_VIDEO_V37_EU_RO1_UNSCHEDULED_ZERO_WORKERS:${JSON.stringify({ selected_gpu: live.selected, cancelled })}`);
        }
      } else {
        zeroWorkerQueuedSince = null;
      }
      if (health.workers.unhealthy > 0) {
        const cancelled = await cancelExactJob(CINEMA_ID, jobId, credential.key, "EU_RO1_UNHEALTHY_WORKER");
        throw new Error(`AVANTIQO_VIDEO_V37_EU_RO1_UNHEALTHY_WORKER:${JSON.stringify(cancelled)}`);
      }
      await sleep(POLL_MS);
    }
    if (!completed) {
      const cancelled = await cancelExactJob(CINEMA_ID, jobId, credential.key, "EU_RO1_PROBE_STATUS_TIMEOUT");
      throw new Error(`AVANTIQO_VIDEO_V37_STATUS_TIMEOUT:${JSON.stringify({ latest_status: latestStatus?.status || null, observations, cancelled })}`);
    }
  } catch (error) {
    failure = error;
    const status = text(latestStatus?.status).toUpperCase();
    if (jobId && !["COMPLETED", "FAILED", "CANCELLED", "CANCELED", "TIMED_OUT"].includes(status)) {
      const cancelled = await cancelExactJob(CINEMA_ID, jobId, credential.key, "V37_FAILURE_CLEANUP");
      console.log(`AVANTIQO_VIDEO_V37_FAILURE_CANCEL=${JSON.stringify(cancelled)}`);
    }
  } finally {
    if (placementPinned) {
      try {
        await rest(`/endpoints/${CINEMA_ID}`, managementKey, {
          method: "PATCH",
          body: { dataCenterIds: originalDataCenters, gpuTypeIds: originalGpuPool },
        });
        const restored = await rest(`/endpoints/${CINEMA_ID}?includeTemplate=false&includeWorkers=true`, managementKey);
        if (!sameSet(normalizeStringList(restored.dataCenterIds), originalDataCenters)) throw new Error(`AVANTIQO_VIDEO_V37_RESTORE_DC_VERIFY_FAILED:${normalizeStringList(restored.dataCenterIds).join("|")}`);
        if (!sameSet(normalizeStringList(restored.gpuTypeIds), originalGpuPool)) throw new Error(`AVANTIQO_VIDEO_V37_RESTORE_GPU_VERIFY_FAILED:${normalizeStringList(restored.gpuTypeIds).join("|")}`);
        if (!sameSet(endpointVolumeIds(restored), originalVolumes)) throw new Error("AVANTIQO_VIDEO_V37_RESTORE_VOLUME_BINDING_CHANGED");
        if (finite(restored.workersMin, -1) !== 0 || finite(restored.workersMax, -1) !== 1) throw new Error(`AVANTIQO_VIDEO_V37_RESTORE_SAFE_LEASE_CAPACITY_CHANGED:${finite(restored.workersMin)}/${finite(restored.workersMax)}`);
        console.log("AVANTIQO_VIDEO_V37_PLACEMENT_RESTORED=true");
      } catch (restoreError) {
        if (!failure) failure = restoreError;
        else failure = new Error(`${redact(failure.message)};RESTORE_FAILURE:${redact(restoreError.message)}`);
      }
    }
  }
  if (failure) throw failure;

  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    endpoint_id: CINEMA_ID,
    queue_credential_source: credential.source,
    selected_eu_ro1_gpu: live.selected,
    live_eu_ro1_candidates: live.candidates,
    worker_placement_proof: result.euObservation,
    worker_placement_observations: observations,
    probe_contract: PROBE_CONTRACT,
    runtime_revision: RUNTIME_REVISION,
    entrypoint_revision: ENTRYPOINT_REVISION,
    t2v: { model: T2V_MODEL, revision: result.verified.t2v.snapshot_revision, cache_ready: true },
    i2v: { model: I2V_MODEL, revision: result.verified.i2v.snapshot_revision, cache_ready: true },
    placement_restored_before_safe_lease_release: true,
    multivolume_binding_preserved: true,
    generation_requested: false,
    inference_performed: false,
    model_download_performed: false,
    storage_mutation_performed: false,
    direct_workers_max_write: false,
    production_web_deploy: false,
    secrets_printed: false,
  }, null, 2));
  console.log("AVANTIQO_VIDEO_EU_RO1_RUNTIME_PROOF_V37_CHILD=PASS");
}

if (Number(process.versions.node.split(".")[0]) < 24) throw new Error(`AVANTIQO_VIDEO_V37_NODE24_REQUIRED:${process.version}`);
const apply = process.argv.includes("--apply");
const leased = process.argv.includes("--leased");
if (!apply) {
  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    mode: "PLAN",
    safe_lease_contract: SAFE_LEASE_CONTRACT,
    safe_lease_lane: LANE,
    target_endpoint: CINEMA_NAME,
    target_datacenter: DESTINATION_DC,
    placement_strategy: "TEMPORARY_EU_RO1_DATACENTER_PLUS_LIVE_CERTIFIED_BLACKWELL_PIN_INSIDE_SAFE_LEASE",
    network_volume_ids_preserved: [SOURCE_VOLUME_ID, DESTINATION_VOLUME_ID],
    runtime_operation: "runtime_probe",
    generation_requested: false,
    inference_performed: false,
    model_download_performed: false,
    direct_workers_max_write: false,
    restore_placement_before_safe_lease_release: true,
    production_web_deploy: false,
    secrets_printed: false,
  }, null, 2));
  console.log("AVANTIQO_VIDEO_EU_RO1_RUNTIME_PROOF_V37_APPLIED=false");
  process.exit(0);
}
if (!yes(process.env[APPROVAL_ENV])) throw new Error(`${APPROVAL_ENV}=YES_REQUIRED`);
if (leased) {
  try {
    await runLeasedProof();
    process.exit(0);
  } catch (error) {
    console.log(`AVANTIQO_VIDEO_EU_RO1_RUNTIME_PROOF_V37_CHILD_FAILURE=${redact(error.message).slice(0, 1800)}`);
    process.exit(1);
  }
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const credential = await selectQueueKey(CINEMA_ID, managementKey);
const env = {
  ...process.env,
  AVANTIQO_RUNPOD_SAFE_LEASE_APPROVED: "YES",
  AVANTIQO_RUNPOD_SAFE_LEASE_TARGET_QUEUE_API_KEY: credential.key,
  AVANTIQO_RUNPOD_SAFE_LEASE_INERT_PEER_ISOLATION_LANE: LANE,
  AVANTIQO_RUNPOD_SAFE_LEASE_TARGET_AND_OPEN_HEALTH_LANE: LANE,
};
const child = spawnSync(
  process.execPath,
  [SAFE_LEASE, `--lane=${LANE}`, `--ttl-ms=${LEASE_TTL_MS}`, "--", process.execPath, process.argv[1], "--apply", "--leased"],
  { cwd: process.cwd(), env, stdio: "inherit" },
);
if (child.error) throw child.error;
if (child.status !== 0) {
  console.log(`AVANTIQO_VIDEO_EU_RO1_RUNTIME_PROOF_V37=FAIL`);
  console.log(`AVANTIQO_VIDEO_EU_RO1_RUNTIME_PROOF_V37_SAFE_LEASE_EXIT=${child.status}`);
  process.exit(child.status || 3);
}
console.log("AVANTIQO_VIDEO_EU_RO1_RUNTIME_PROOF_V37=PASS");
console.log("AVANTIQO_VIDEO_EU_RO1_RUNTIME_PROOF_V37_APPLIED=true");