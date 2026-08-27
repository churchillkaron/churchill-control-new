import { spawnSync } from "node:child_process";

const CONTRACT = "AVANTIQO_VIDEO_WAN22_RUNTIME_PROBE_SAFE_LEASE_V19";
const SAFE_LEASE = "scripts/run-avantiqo-runpod-safe-lease-v2-local.mjs";
const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const APPROVAL_ENV = "AVANTIQO_VIDEO_WAN22_RUNTIME_PROBE_APPROVED";
const LANE = "cinema";
const LEASE_TTL_MS = 600_000;
const POLL_MS = 5_000;
const UNSCHEDULED_ZERO_WORKER_LIMIT_MS = 180_000;
const STATUS_LIMIT_MS = 420_000;
const T2V_MODEL = "Wan-AI/Wan2.2-T2V-A14B-Diffusers";
const I2V_MODEL = "Wan-AI/Wan2.2-I2V-A14B-Diffusers";
const I2V_REVISION = "596658fd9ca6b7b71d5057529bbf319ecbc61d74";
const PROBE_CONTRACT = "AVANTIQO_VIDEO_RUNTIME_PROBE_V1";

const text = (value) => String(value ?? "").trim();
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const approved = (value) => ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase());
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function redact(value) {
  return text(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]");
}

async function request(endpointId, pathname, key, options = {}) {
  const response = await fetch(`https://api.runpod.ai/v2/${encodeURIComponent(endpointId)}${pathname}`, {
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
  if (!response.ok) {
    throw new Error(`AVANTIQO_VIDEO_V19_HTTP_${response.status}:${redact(body?.error || body?.message || raw).slice(0, 700)}`);
  }
  return body ?? {};
}

function healthSummary(body = {}) {
  const jobs = body.jobs || {};
  const workers = body.workers || {};
  const normalizedWorkers = {
    idle: finite(workers.idle),
    initializing: finite(workers.initializing),
    ready: finite(workers.ready),
    running: finite(workers.running),
    throttled: finite(workers.throttled),
    unhealthy: finite(workers.unhealthy),
  };
  return {
    jobs: {
      in_queue: finite(jobs.inQueue ?? jobs.in_queue),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress),
    },
    workers: normalizedWorkers,
    worker_total: Object.values(normalizedWorkers).reduce((sum, value) => sum + value, 0),
  };
}

async function selectQueueKey(endpointId) {
  const candidates = [
    ["RUNPOD_AVANTIQO_VIDEO_API_KEY", text(process.env.RUNPOD_AVANTIQO_VIDEO_API_KEY)],
    ["RUNPOD_API_KEY", text(process.env.RUNPOD_API_KEY)],
    ["RUNPOD_MANAGEMENT_API_KEY", text(process.env.RUNPOD_MANAGEMENT_API_KEY)],
  ];
  const seen = new Set();
  for (const [source, key] of candidates) {
    if (!key || seen.has(key)) continue;
    seen.add(key);
    try {
      await request(endpointId, "/health", key);
      return { source, key };
    } catch {}
  }
  throw new Error("AVANTIQO_VIDEO_V19_QUEUE_CREDENTIAL_NOT_FOUND");
}

async function cancelExactJob(endpointId, jobId, key, reason) {
  if (!jobId) return { attempted: false, reason };
  try {
    const result = await request(endpointId, `/cancel/${encodeURIComponent(jobId)}`, key, { method: "POST" });
    return { attempted: true, success: true, reason, result_status: text(result?.status) || null };
  } catch (error) {
    return { attempted: true, success: false, reason, error: redact(error.message).slice(0, 500) };
  }
}

function validateProbe(output) {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    throw new Error("AVANTIQO_VIDEO_V19_PROBE_OUTPUT_INVALID");
  }
  if (text(output.probe_contract) !== PROBE_CONTRACT) {
    throw new Error(`AVANTIQO_VIDEO_V19_PROBE_CONTRACT_INVALID:${text(output.probe_contract)}`);
  }
  if (output.generation_requested !== false || output.inference_performed !== false || output.model_download_performed !== false || output.storage_mutation_performed !== false) {
    throw new Error("AVANTIQO_VIDEO_V19_PROBE_MUTATION_OR_INFERENCE_FORBIDDEN");
  }
  if (text(output.configured_text_to_video_foundation) !== T2V_MODEL || text(output.configured_image_to_video_foundation) !== I2V_MODEL) {
    throw new Error("AVANTIQO_VIDEO_V19_DEFAULT_FOUNDATION_MISMATCH");
  }
  if (output.text_to_video_default_foundation !== true || output.image_to_video_default_foundation !== true || output.require_cached_model !== true) {
    throw new Error("AVANTIQO_VIDEO_V19_DEFAULT_CACHE_ROUTING_NOT_ENFORCED");
  }
  const t2v = output.foundations?.text_to_video || {};
  const i2v = output.foundations?.image_to_video || {};
  for (const [label, foundation, model] of [
    ["T2V", t2v, T2V_MODEL],
    ["I2V", i2v, I2V_MODEL],
  ]) {
    if (text(foundation.model) !== model || foundation.cache_ready !== true || foundation.cache_path_present !== true || foundation.completion_marker_valid !== true || !text(foundation.snapshot_revision)) {
      throw new Error(`AVANTIQO_VIDEO_V19_${label}_CACHE_NOT_RUNTIME_READY:${JSON.stringify({ model: foundation.model || null, cache_ready: foundation.cache_ready === true, cache_path_present: foundation.cache_path_present === true, completion_marker_valid: foundation.completion_marker_valid === true, snapshot_revision: foundation.snapshot_revision || null })}`);
    }
  }
  if (text(i2v.snapshot_revision) !== I2V_REVISION) {
    throw new Error(`AVANTIQO_VIDEO_V19_I2V_REVISION_MISMATCH:expected=${I2V_REVISION}:actual=${text(i2v.snapshot_revision)}`);
  }
  return { t2v, i2v };
}

async function runLeasedProbe() {
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE).toUpperCase() !== "YES" || text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT) !== SAFE_LEASE_CONTRACT || text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_LANE) !== LANE) {
    throw new Error("AVANTIQO_VIDEO_V19_VALID_CINEMA_SAFE_LEASE_REQUIRED");
  }
  const endpointId = text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID);
  if (!endpointId) throw new Error("AVANTIQO_VIDEO_V19_LEASE_ENDPOINT_ID_REQUIRED");
  const credential = await selectQueueKey(endpointId);
  const initial = healthSummary(await request(endpointId, "/health", credential.key));
  if (initial.jobs.in_queue !== 0 || initial.jobs.in_progress !== 0 || initial.workers.unhealthy !== 0) {
    throw new Error(`AVANTIQO_VIDEO_V19_CINEMA_NOT_CLEAN_BEFORE_PROBE:${JSON.stringify(initial)}`);
  }

  const submitted = await request(endpointId, "/run", credential.key, {
    method: "POST",
    body: { input: { operation: "runtime_probe" } },
  });
  const jobId = text(submitted.id || submitted.jobId || submitted.job_id);
  if (!jobId) throw new Error("AVANTIQO_VIDEO_V19_JOB_ID_REQUIRED");
  console.log(`AVANTIQO_VIDEO_V19_RUNTIME_PROBE_SUBMITTED=${jobId}`);

  const started = Date.now();
  let zeroWorkerQueuedSince = null;
  let latestStatus = null;
  let latestHealth = initial;
  try {
    while (Date.now() - started < STATUS_LIMIT_MS) {
      latestStatus = await request(endpointId, `/status/${encodeURIComponent(jobId)}`, credential.key);
      const status = text(latestStatus.status).toUpperCase();
      latestHealth = healthSummary(await request(endpointId, "/health", credential.key));
      console.log(`AVANTIQO_VIDEO_V19_PROGRESS=${JSON.stringify({ elapsed_seconds: Math.floor((Date.now() - started) / 1000), status, health: latestHealth })}`);

      if (status === "COMPLETED") {
        const output = latestStatus.output ?? latestStatus.result;
        const verified = validateProbe(output);
        console.log(JSON.stringify({
          success: true,
          contract: CONTRACT,
          endpoint_id: endpointId,
          queue_credential_source: credential.source,
          job_id: jobId,
          probe_contract: PROBE_CONTRACT,
          t2v: {
            model: verified.t2v.model,
            cache_ready: verified.t2v.cache_ready,
            completion_marker_valid: verified.t2v.completion_marker_valid,
            snapshot_revision: verified.t2v.snapshot_revision,
          },
          i2v: {
            model: verified.i2v.model,
            cache_ready: verified.i2v.cache_ready,
            completion_marker_valid: verified.i2v.completion_marker_valid,
            snapshot_revision: verified.i2v.snapshot_revision,
          },
          generation_requested: false,
          inference_performed: false,
          model_download_performed: false,
          storage_mutation_performed: false,
          direct_workers_max_write: false,
          production_web_deploy: false,
          secrets_printed: false,
        }, null, 2));
        console.log("AVANTIQO_VIDEO_WAN22_RUNTIME_PROBE_SAFE_LEASE_V19_CHILD=PASS");
        return;
      }
      if (["FAILED", "CANCELLED", "CANCELED", "TIMED_OUT"].includes(status)) {
        throw new Error(`AVANTIQO_VIDEO_V19_RUNTIME_PROBE_TERMINAL_${status}:${redact(latestStatus.error || latestStatus.output || latestStatus.message).slice(0, 900)}`);
      }
      if (status === "IN_QUEUE" && latestHealth.worker_total === 0) {
        zeroWorkerQueuedSince ??= Date.now();
        if (Date.now() - zeroWorkerQueuedSince >= UNSCHEDULED_ZERO_WORKER_LIMIT_MS) {
          const cancelled = await cancelExactJob(endpointId, jobId, credential.key, "IN_QUEUE_ZERO_WORKERS_180S");
          throw new Error(`AVANTIQO_VIDEO_V19_UNSCHEDULED_ZERO_WORKERS:${JSON.stringify(cancelled)}`);
        }
      } else {
        zeroWorkerQueuedSince = null;
      }
      if (latestHealth.workers.unhealthy > 0) {
        const cancelled = await cancelExactJob(endpointId, jobId, credential.key, "UNHEALTHY_WORKER");
        throw new Error(`AVANTIQO_VIDEO_V19_UNHEALTHY_WORKER:${JSON.stringify(cancelled)}`);
      }
      await sleep(POLL_MS);
    }
    const cancelled = await cancelExactJob(endpointId, jobId, credential.key, "PROBE_STATUS_TIMEOUT");
    throw new Error(`AVANTIQO_VIDEO_V19_STATUS_TIMEOUT:${JSON.stringify({ latest_status: latestStatus?.status || null, latest_health: latestHealth, cancelled })}`);
  } catch (error) {
    const status = text(latestStatus?.status).toUpperCase();
    if (!["COMPLETED", "FAILED", "CANCELLED", "CANCELED", "TIMED_OUT"].includes(status)) {
      const cancelled = await cancelExactJob(endpointId, jobId, credential.key, "V19_FAILURE_CLEANUP");
      console.log(`AVANTIQO_VIDEO_V19_FAILURE_CANCEL=${JSON.stringify(cancelled)}`);
    }
    throw error;
  }
}

if (Number(process.versions.node.split(".")[0]) < 24) {
  throw new Error(`AVANTIQO_VIDEO_V19_NODE24_REQUIRED:${process.version}`);
}

const apply = process.argv.includes("--apply");
const leased = process.argv.includes("--leased");

if (!apply) {
  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    mode: "PLAN",
    target: "avantiqo-cinema-v1",
    safe_lease_contract: SAFE_LEASE_CONTRACT,
    safe_lease_lane: LANE,
    lease_ttl_ms: LEASE_TTL_MS,
    operation: "runtime_probe",
    validates_runtime_mount_for: [T2V_MODEL, I2V_MODEL],
    expected_i2v_revision: I2V_REVISION,
    generation_requested: false,
    inference_performed: false,
    model_download_performed: false,
    storage_mutation_performed: false,
    direct_workers_max_write: false,
    exact_job_cancel_on_unscheduled_zero_workers: true,
    production_web_deploy: false,
    secrets_printed: false,
  }, null, 2));
  console.log("AVANTIQO_VIDEO_WAN22_RUNTIME_PROBE_SAFE_LEASE_V19_APPLIED=false");
  process.exit(0);
}

if (!approved(process.env[APPROVAL_ENV])) throw new Error(`${APPROVAL_ENV}=YES_REQUIRED`);

if (leased) {
  await runLeasedProbe();
  process.exit(0);
}

const env = {
  ...process.env,
  AVANTIQO_RUNPOD_SAFE_LEASE_APPROVED: "YES",
};
const child = spawnSync(
  process.execPath,
  [SAFE_LEASE, `--lane=${LANE}`, `--ttl-ms=${LEASE_TTL_MS}`, "--", process.execPath, process.argv[1], "--apply", "--leased"],
  { cwd: process.cwd(), env, stdio: "inherit" },
);
if (child.error) throw child.error;
if (child.status !== 0) throw new Error(`AVANTIQO_VIDEO_V19_SAFE_LEASE_FAILED:exit=${child.status}`);
console.log("AVANTIQO_VIDEO_WAN22_RUNTIME_PROBE_SAFE_LEASE_V19_APPLIED=true");
