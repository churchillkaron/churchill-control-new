import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CONTRACT = "AVANTIQO_VIDEO_EU_RO1_RUNTIME_PROOF_V38";
const APPROVAL_ENV = "AVANTIQO_VIDEO_EU_RO1_RUNTIME_PROOF_V38_APPROVED";
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
const RESTORE_ATTEMPTS = 3;
const CHILD_DIAGNOSTICS_FILE = join(tmpdir(), "AVANTIQO_VIDEO_EU_RO1_RUNTIME_PROOF_V38_CHILD_LAST.log");
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
function stablePlacement(endpoint = {}) {
  return {
    data_center_ids: normalizeStringList(endpoint.dataCenterIds).sort(),
    gpu_type_ids: normalizeStringList(endpoint.gpuTypeIds).sort(),
    network_volume_ids: endpointVolumeIds(endpoint),
    workers_min: finite(endpoint.workersMin, null),
    workers_max: finite(endpoint.workersMax, null),
  };
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
  if (!response.ok) throw new Error(`AVANTIQO_VIDEO_V38_HTTP_${response.status}:${redact(body?.message || body?.error || body?.detail || raw).slice(0, 900)}`);
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
  throw new Error("AVANTIQO_VIDEO_V38_CINEMA_QUEUE_CREDENTIAL_NOT_FOUND");
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
    query AvantiqoVideoV38($input: GpuAvailabilityInput) {
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
    throw new Error(`AVANTIQO_VIDEO_V38_GRAPHQL_FAILED:${redact(list(body?.errors).map((entry) => entry?.message).filter(Boolean).join(" | ") || raw).slice(0, 900)}`);
  }
  const gpuMeta = new Map(list(body?.data?.gpuTypes).map((entry) => [text(entry?.id), entry]));
  const dc = list(body?.data?.dataCenters).find((entry) => text(entry?.id) === DESTINATION_DC);
  if (!dc || dc.storageSupport !== true) throw new Error("AVANTIQO_VIDEO_V38_EU_RO1_STORAGE_SUPPORT_REQUIRED");
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
  if (!candidates.length) throw new Error(`AVANTIQO_VIDEO_V38_NO_LIVE_EU_RO1_CERTIFIED_BLACKWELL:${allowedPool.join("|")}`);
  return { selected: candidates[0], candidates };
}
function validateProbe(output) {
  if (!output || typeof output !== "object" || Array.isArray(output)) throw new Error("AVANTIQO_VIDEO_V38_PROBE_OUTPUT_INVALID");
  if (text(output.probe_contract) !== PROBE_CONTRACT) throw new Error(`AVANTIQO_VIDEO_V38_PROBE_CONTRACT_INVALID:${text(output.probe_contract)}`);
  if (text(output.runtime_revision) !== RUNTIME_REVISION) throw new Error(`AVANTIQO_VIDEO_V38_RUNTIME_REVISION_INVALID:${text(output.runtime_revision)}`);
  if (text(output.entrypoint_revision) !== ENTRYPOINT_REVISION) throw new Error(`AVANTIQO_VIDEO_V38_ENTRYPOINT_REVISION_INVALID:${text(output.entrypoint_revision)}`);
  if (output.generation_requested !== false || output.inference_performed !== false || output.model_download_performed !== false || output.storage_mutation_performed !== false) {
    throw new Error("AVANTIQO_VIDEO_V38_PROBE_MUTATION_OR_INFERENCE_FORBIDDEN");
  }
  if (text(output.configured_text_to_video_foundation) !== T2V_MODEL || text(output.configured_image_to_video_foundation) !== I2V_MODEL || output.require_cached_model !== true) {
    throw new Error("AVANTIQO_VIDEO_V38_DEFAULT_FOUNDATION_CONTRACT_INVALID");
  }
  const t2v = output.foundations?.text_to_video || {};
  const i2v = output.foundations?.image_to_video || {};
  for (const [label, foundation, model, revision] of [
    ["T2V", t2v, T2V_MODEL, T2V_REVISION],
    ["I2V", i2v, I2V_MODEL, I2V_REVISION],
  ]) {
    if (text(foundation.model) !== model || foundation.cache_ready !== true || foundation.cache_path_present !== true || foundation.completion_marker_valid !== true || text(foundation.snapshot_revision) !== revision) {
      throw new Error(`AVANTIQO_VIDEO_V38_${label}_CACHE_INVALID:${JSON.stringify({ model: foundation.model || null, cache_ready: foundation.cache_ready === true, cache_path_present: foundation.cache_path_present === true, completion_marker_valid: foundation.completion_marker_valid === true, snapshot_revision: foundation.snapshot_revision || null, expected_revision: revision })}`);
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
async function restoreOriginalPlacement(managementKey, original) {
  const attempts = [];
  for (let attempt = 1; attempt <= RESTORE_ATTEMPTS; attempt += 1) {
    try {
      await rest(`/endpoints/${CINEMA_ID}`, managementKey, {
        method: "PATCH",
        body: {
          dataCenterIds: original.data_center_ids,
          gpuTypeIds: original.gpu_type_ids,
          networkVolumeIds: original.network_volume_ids,
        },
      });
      const restored = stablePlacement(await rest(`/endpoints/${CINEMA_ID}?includeTemplate=false&includeWorkers=false`, managementKey));
      if (!sameSet(restored.data_center_ids, original.data_center_ids)) throw new Error(`DC:${restored.data_center_ids.join("|")}`);
      if (!sameSet(restored.gpu_type_ids, original.gpu_type_ids)) throw new Error(`GPU:${restored.gpu_type_ids.join("|")}`);
      if (!sameSet(restored.network_volume_ids, original.network_volume_ids)) throw new Error(`VOLUME:${restored.network_volume_ids.join("|")}`);
      if (restored.workers_min !== 0 || restored.workers_max !== 1) throw new Error(`CAPACITY:${restored.workers_min}/${restored.workers_max}`);
      return { success: true, attempts: attempt, restored };
    } catch (error) {
      attempts.push({ attempt, error: redact(error.message).slice(0, 700) });
      if (attempt < RESTORE_ATTEMPTS) await sleep(1_500 * attempt);
    }
  }
  throw new Error(`AVANTIQO_VIDEO_V38_RESTORE_FAILED:${JSON.stringify(attempts)}`);
}
function extractDiagnostics(raw) {
  const lines = String(raw || "").split(/\r?\n/).filter(Boolean);
  const findLast = (marker) => [...lines].reverse().find((line) => line.includes(marker)) || null;
  return {
    child_failure: findLast("AVANTIQO_VIDEO_EU_RO1_RUNTIME_PROOF_V38_CHILD_FAILURE="),
    safe_lease_failure: findLast("AVANTIQO_RUNPOD_SAFE_LEASE_V2_FAILURE="),
    tail: lines.slice(-80).join("\n").slice(-14_000),
  };
}
async function runCapturedSafeLease(command, env) {
  await unlink(CHILD_DIAGNOSTICS_FILE).catch(() => {});
  return new Promise((resolve, reject) => {
    const log = createWriteStream(CHILD_DIAGNOSTICS_FILE, { flags: "w", mode: 0o600 });
    let closed = false;
    const child = spawn(command[0], command.slice(1), {
      cwd: process.cwd(),
      env,
      stdio: ["inherit", "pipe", "pipe"],
    });
    const write = (target, chunk) => {
      target.write(chunk);
      log.write(chunk);
    };
    child.stdout.on("data", (chunk) => write(process.stdout, chunk));
    child.stderr.on("data", (chunk) => write(process.stderr, chunk));
    child.on("error", (error) => {
      if (closed) return;
      closed = true;
      log.end(() => reject(error));
    });
    child.on("close", (code, signal) => {
      if (closed) return;
      closed = true;
      log.end(() => resolve({ code, signal }));
    });
  });
}

async function runLeasedProof() {
  if (!yes(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE) || text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT) !== SAFE_LEASE_CONTRACT || text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_LANE) !== LANE) {
    throw new Error("AVANTIQO_VIDEO_V38_VALID_CINEMA_SAFE_LEASE_REQUIRED");
  }
  const leasedEndpointId = text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID);
  if (leasedEndpointId !== CINEMA_ID) throw new Error(`AVANTIQO_VIDEO_V38_SAFE_LEASE_ENDPOINT_INVALID:${leasedEndpointId}`);

  const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
  const credential = await selectQueueKey(CINEMA_ID, managementKey);
  const beforeEndpoint = await rest(`/endpoints/${CINEMA_ID}?includeTemplate=false&includeWorkers=false`, managementKey);
  if (text(beforeEndpoint.id) !== CINEMA_ID || text(beforeEndpoint.name) !== CINEMA_NAME) throw new Error("AVANTIQO_VIDEO_V38_CINEMA_ID_OR_NAME_INVALID");
  const original = stablePlacement(beforeEndpoint);
  if (original.workers_min !== 0 || original.workers_max !== 1) throw new Error(`AVANTIQO_VIDEO_V38_SAFE_LEASE_NOT_OPEN_0_1:${original.workers_min}/${original.workers_max}`);
  if (!sameSet(original.network_volume_ids, [SOURCE_VOLUME_ID, DESTINATION_VOLUME_ID])) throw new Error(`AVANTIQO_VIDEO_V38_MULTIVOLUME_BINDING_INVALID:${original.network_volume_ids.join("|")}`);
  if (!original.gpu_type_ids.length || !original.gpu_type_ids.every((gpu) => CERTIFIED_BLACKWELL_POOL.includes(gpu))) throw new Error(`AVANTIQO_VIDEO_V38_ORIGINAL_GPU_POOL_INVALID:${original.gpu_type_ids.join("|")}`);

  const [sourceVolume, destinationVolume, live] = await Promise.all([
    rest(`/networkvolumes/${SOURCE_VOLUME_ID}`, managementKey),
    rest(`/networkvolumes/${DESTINATION_VOLUME_ID}`, managementKey),
    selectLiveEuBlackwell(managementKey, original.gpu_type_ids),
  ]);
  if (text(sourceVolume.dataCenterId) !== "US-NC-2") throw new Error(`AVANTIQO_VIDEO_V38_SOURCE_VOLUME_DC_INVALID:${text(sourceVolume.dataCenterId)}`);
  if (text(destinationVolume.dataCenterId) !== DESTINATION_DC) throw new Error(`AVANTIQO_VIDEO_V38_DESTINATION_VOLUME_DC_INVALID:${text(destinationVolume.dataCenterId)}`);

  const baselineHealth = healthSummary(await queue(CINEMA_ID, "/health", credential.key));
  if (baselineHealth.jobs.in_queue !== 0 || baselineHealth.jobs.in_progress !== 0 || baselineHealth.worker_total !== 0) {
    throw new Error(`AVANTIQO_VIDEO_V38_CINEMA_NOT_CLEAN_BEFORE_DETERMINISTIC_PIN:${JSON.stringify(baselineHealth)}`);
  }

  const targetPlacement = {
    dataCenterIds: [DESTINATION_DC],
    gpuTypeIds: [live.selected.gpu_type_id],
    networkVolumeIds: [DESTINATION_VOLUME_ID],
  };
  let placementMutationStarted = false;
  let pinnedPlacement = null;
  let jobId = "";
  let latestStatus = null;
  let result = null;
  let failure = null;
  let restore = null;
  try {
    placementMutationStarted = true;
    await rest(`/endpoints/${CINEMA_ID}`, managementKey, { method: "PATCH", body: targetPlacement });
    pinnedPlacement = stablePlacement(await rest(`/endpoints/${CINEMA_ID}?includeTemplate=false&includeWorkers=false`, managementKey));
    if (!sameSet(pinnedPlacement.data_center_ids, [DESTINATION_DC])) throw new Error(`AVANTIQO_VIDEO_V38_DC_PIN_VERIFY_FAILED:${pinnedPlacement.data_center_ids.join("|")}`);
    if (!sameSet(pinnedPlacement.gpu_type_ids, [live.selected.gpu_type_id])) throw new Error(`AVANTIQO_VIDEO_V38_GPU_PIN_VERIFY_FAILED:${pinnedPlacement.gpu_type_ids.join("|")}`);
    if (!sameSet(pinnedPlacement.network_volume_ids, [DESTINATION_VOLUME_ID])) throw new Error(`AVANTIQO_VIDEO_V38_EU_ONLY_VOLUME_PIN_VERIFY_FAILED:${pinnedPlacement.network_volume_ids.join("|")}`);
    if (pinnedPlacement.workers_min !== 0 || pinnedPlacement.workers_max !== 1) throw new Error(`AVANTIQO_VIDEO_V38_SAFE_LEASE_CAPACITY_CHANGED_DURING_PIN:${pinnedPlacement.workers_min}/${pinnedPlacement.workers_max}`);
    console.log(`AVANTIQO_VIDEO_V38_DETERMINISTIC_PLACEMENT=${JSON.stringify({ datacenter: DESTINATION_DC, gpu_type_id: live.selected.gpu_type_id, network_volume_ids: [DESTINATION_VOLUME_ID] })}`);

    const submitted = await queue(CINEMA_ID, "/run", credential.key, { method: "POST", body: { input: { operation: "runtime_probe" } } });
    jobId = text(submitted.id || submitted.jobId || submitted.job_id);
    if (!jobId) throw new Error("AVANTIQO_VIDEO_V38_JOB_ID_REQUIRED");
    console.log(`AVANTIQO_VIDEO_V38_RUNTIME_PROBE_SUBMITTED=${jobId}`);

    const started = Date.now();
    let zeroWorkerQueuedSince = null;
    while (Date.now() - started < STATUS_LIMIT_MS) {
      const [statusBody, healthBody] = await Promise.all([
        queue(CINEMA_ID, `/status/${encodeURIComponent(jobId)}`, credential.key),
        queue(CINEMA_ID, "/health", credential.key),
      ]);
      latestStatus = statusBody;
      const status = text(statusBody.status).toUpperCase();
      const health = healthSummary(healthBody);
      console.log(`AVANTIQO_VIDEO_V38_PROGRESS=${JSON.stringify({ elapsed_seconds: Math.floor((Date.now() - started) / 1000), status, health })}`);

      if (status === "COMPLETED") {
        const output = statusBody.output ?? statusBody.result;
        result = validateProbe(output);
        break;
      }
      if (["FAILED", "CANCELLED", "CANCELED", "TIMED_OUT"].includes(status)) {
        throw new Error(`AVANTIQO_VIDEO_V38_RUNTIME_PROBE_TERMINAL_${status}:${redact(statusBody.error || statusBody.output || statusBody.message).slice(0, 900)}`);
      }
      if (status === "IN_QUEUE" && health.worker_total === 0) {
        zeroWorkerQueuedSince ??= Date.now();
        if (Date.now() - zeroWorkerQueuedSince >= UNSCHEDULED_LIMIT_MS) {
          const cancelled = await cancelExactJob(CINEMA_ID, jobId, credential.key, "EU_RO1_IN_QUEUE_ZERO_WORKERS_180S");
          throw new Error(`AVANTIQO_VIDEO_V38_EU_RO1_UNSCHEDULED_ZERO_WORKERS:${JSON.stringify({ selected_gpu: live.selected, cancelled })}`);
        }
      } else {
        zeroWorkerQueuedSince = null;
      }
      if (health.workers.unhealthy > 0) {
        const cancelled = await cancelExactJob(CINEMA_ID, jobId, credential.key, "EU_RO1_UNHEALTHY_WORKER");
        throw new Error(`AVANTIQO_VIDEO_V38_EU_RO1_UNHEALTHY_WORKER:${JSON.stringify(cancelled)}`);
      }
      await sleep(POLL_MS);
    }
    if (!result) {
      const cancelled = await cancelExactJob(CINEMA_ID, jobId, credential.key, "EU_RO1_PROBE_STATUS_TIMEOUT");
      throw new Error(`AVANTIQO_VIDEO_V38_STATUS_TIMEOUT:${JSON.stringify({ latest_status: latestStatus?.status || null, cancelled })}`);
    }
  } catch (error) {
    failure = error;
    const status = text(latestStatus?.status).toUpperCase();
    if (jobId && !["COMPLETED", "FAILED", "CANCELLED", "CANCELED", "TIMED_OUT"].includes(status)) {
      const cancelled = await cancelExactJob(CINEMA_ID, jobId, credential.key, "V38_FAILURE_CLEANUP");
      console.log(`AVANTIQO_VIDEO_V38_FAILURE_CANCEL=${JSON.stringify(cancelled)}`);
    }
  } finally {
    if (placementMutationStarted) {
      try {
        restore = await restoreOriginalPlacement(managementKey, original);
        console.log(`AVANTIQO_VIDEO_V38_ORIGINAL_PLACEMENT_RESTORED=${JSON.stringify(restore)}`);
      } catch (restoreError) {
        restore = { success: false, error: redact(restoreError.message).slice(0, 1800) };
        if (!failure) failure = restoreError;
        else failure = new Error(`${redact(failure.message)};RESTORE_FAILURE:${redact(restoreError.message)}`);
      }
    }
  }
  if (failure) throw failure;
  if (!restore?.success) throw new Error("AVANTIQO_VIDEO_V38_RESTORE_SUCCESS_REQUIRED");

  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    endpoint_id: CINEMA_ID,
    queue_credential_source: credential.source,
    selected_eu_ro1_gpu: live.selected,
    live_eu_ro1_candidates: live.candidates,
    deterministic_runtime_placement_proof: {
      mechanism: "CONTROL_PLANE_SINGLE_DATACENTER_SINGLE_GPU_SINGLE_EU_RO1_VOLUME",
      pinned_before_runtime_probe: pinnedPlacement,
      worker_metadata_schema_dependency: false,
    },
    probe_contract: PROBE_CONTRACT,
    runtime_revision: RUNTIME_REVISION,
    entrypoint_revision: ENTRYPOINT_REVISION,
    t2v: { model: T2V_MODEL, revision: result.t2v.snapshot_revision, cache_ready: true },
    i2v: { model: I2V_MODEL, revision: result.i2v.snapshot_revision, cache_ready: true },
    original_multivolume_binding_restored_before_safe_lease_release: sameSet(restore.restored.network_volume_ids, [SOURCE_VOLUME_ID, DESTINATION_VOLUME_ID]),
    original_gpu_pool_restored_before_safe_lease_release: sameSet(restore.restored.gpu_type_ids, original.gpu_type_ids),
    original_datacenter_pool_restored_before_safe_lease_release: sameSet(restore.restored.data_center_ids, original.data_center_ids),
    generation_requested: false,
    inference_performed: false,
    model_download_performed: false,
    storage_mutation_performed: false,
    direct_workers_max_write: false,
    production_web_deploy: false,
    secrets_printed: false,
  }, null, 2));
  console.log("AVANTIQO_VIDEO_EU_RO1_RUNTIME_PROOF_V38_CHILD=PASS");
}

if (Number(process.versions.node.split(".")[0]) < 24) throw new Error(`AVANTIQO_VIDEO_V38_NODE24_REQUIRED:${process.version}`);
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
    placement_strategy: "TEMPORARY_EU_RO1_ONLY_VOLUME_PLUS_LIVE_CERTIFIED_BLACKWELL_PIN_INSIDE_SAFE_LEASE",
    temporary_network_volume_ids: [DESTINATION_VOLUME_ID],
    original_network_volume_ids_required: [SOURCE_VOLUME_ID, DESTINATION_VOLUME_ID],
    runtime_operation: "runtime_probe",
    exact_t2v_revision_required: T2V_REVISION,
    exact_i2v_revision_required: I2V_REVISION,
    worker_metadata_schema_dependency: false,
    child_diagnostics_file: CHILD_DIAGNOSTICS_FILE,
    child_diagnostics_streamed_live_and_persisted: true,
    generation_requested: false,
    inference_performed: false,
    model_download_performed: false,
    direct_workers_max_write: false,
    restore_original_placement_before_safe_lease_release: true,
    production_web_deploy: false,
    secrets_printed: false,
  }, null, 2));
  console.log("AVANTIQO_VIDEO_EU_RO1_RUNTIME_PROOF_V38_APPLIED=false");
  process.exit(0);
}
if (!yes(process.env[APPROVAL_ENV])) throw new Error(`${APPROVAL_ENV}=YES_REQUIRED`);
if (leased) {
  try {
    await runLeasedProof();
    process.exit(0);
  } catch (error) {
    console.log(`AVANTIQO_VIDEO_EU_RO1_RUNTIME_PROOF_V38_CHILD_FAILURE=${redact(error.message).slice(0, 2400)}`);
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
const child = await runCapturedSafeLease(
  [process.execPath, SAFE_LEASE, `--lane=${LANE}`, `--ttl-ms=${LEASE_TTL_MS}`, "--", process.execPath, process.argv[1], "--apply", "--leased"],
  env,
);
if (child.signal || child.code !== 0) {
  const raw = await readFile(CHILD_DIAGNOSTICS_FILE, "utf8").catch(() => "");
  const diagnostics = extractDiagnostics(raw);
  console.log(`AVANTIQO_VIDEO_EU_RO1_RUNTIME_PROOF_V38=FAIL`);
  console.log(`AVANTIQO_VIDEO_EU_RO1_RUNTIME_PROOF_V38_SAFE_LEASE_EXIT=${child.code ?? "SIGNAL"}`);
  console.log(`AVANTIQO_VIDEO_EU_RO1_RUNTIME_PROOF_V38_SAFE_LEASE_SIGNAL=${child.signal || "NONE"}`);
  console.log(`AVANTIQO_VIDEO_EU_RO1_RUNTIME_PROOF_V38_DIAGNOSTICS_FILE=${CHILD_DIAGNOSTICS_FILE}`);
  console.log(`AVANTIQO_VIDEO_EU_RO1_RUNTIME_PROOF_V38_CHILD_DIAGNOSTIC=${redact(diagnostics.child_failure || diagnostics.safe_lease_failure || "NO_EXPLICIT_FAILURE_LINE")}`);
  console.log(`AVANTIQO_VIDEO_EU_RO1_RUNTIME_PROOF_V38_DIAGNOSTIC_TAIL=${JSON.stringify(redact(diagnostics.tail))}`);
  process.exit(child.code || 3);
}
console.log(`AVANTIQO_VIDEO_EU_RO1_RUNTIME_PROOF_V38_DIAGNOSTICS_FILE=${CHILD_DIAGNOSTICS_FILE}`);
console.log("AVANTIQO_VIDEO_EU_RO1_RUNTIME_PROOF_V38=PASS");
console.log("AVANTIQO_VIDEO_EU_RO1_RUNTIME_PROOF_V38_APPLIED=true");