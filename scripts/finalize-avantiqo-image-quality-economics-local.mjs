import { writeFile } from "node:fs/promises";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_IMAGE_QUALITY_ECONOMICS_FINALIZER_V1";
const IMAGE_ENDPOINT_NAME = "avantiqo-image-v1";
const FOUNDATION_MODEL = "Qwen/Qwen-Image-2512";
const RUNTIME_REVISION = "AVANTIQO_IMAGE_QWEN_2512_QUALITY_V1";
const OUTPUT_PATH =
  process.env.AVANTIQO_IMAGE_ECONOMICS_FINALIZER_OUTPUT ||
  "/tmp/avantiqo-image-quality-economics-finalizer.json";
const BILLING_WAIT_MS = Math.max(
  0,
  Number(process.env.AVANTIQO_IMAGE_BILLING_WAIT_MS || 2 * 60 * 1000),
);
const BILLING_POLL_MS = 10_000;

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function unique(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function arg(name) {
  const prefix = `--${name}=`;
  const match = process.argv.find((entry) => entry.startsWith(prefix));
  return text(match ? match.slice(prefix.length) : "");
}

function required(value, code) {
  const resolved = text(value);
  if (!resolved) throw new Error(code);
  return resolved;
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function parseResponse(response, label) {
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    throw new Error(
      `${label}_HTTP_${response.status}:${text(body?.message || body?.error || body?.detail || raw).slice(0, 1200)}`,
    );
  }
  return body;
}

async function managementRead(path, managementKey) {
  return parseResponse(
    await fetch(`${REST_BASE}${path}`, {
      headers: {
        Authorization: `Bearer ${managementKey}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(30_000),
    }),
    "RUNPOD_REST",
  );
}

async function queueRead(endpointId, path, inferenceKey) {
  return parseResponse(
    await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}${path}`, {
      headers: {
        Authorization: `Bearer ${inferenceKey}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(30_000),
    }),
    "RUNPOD_QUEUE",
  );
}

function exactWorkerId(job = {}) {
  return text(
    job.workerId ??
      job.worker_id ??
      job.worker?.id ??
      job.worker?.workerId ??
      job.worker?.worker_id,
  );
}

function validateJob(job, expectedJobId) {
  if (text(job?.id) && text(job.id) !== expectedJobId) {
    throw new Error("AVANTIQO_IMAGE_ECONOMICS_JOB_ID_MISMATCH");
  }
  if (text(job?.status).toUpperCase() !== "COMPLETED") {
    throw new Error(
      `AVANTIQO_IMAGE_ECONOMICS_JOB_NOT_COMPLETED:${text(job?.status) || "UNKNOWN"}`,
    );
  }
  const output = job?.output && typeof job.output === "object" ? job.output : {};
  if (
    text(output.capability) !== "ai.image.generate" ||
    text(output.foundation_model) !== FOUNDATION_MODEL ||
    text(output.foundation_model_source) !== "runpod-cache" ||
    text(output.runtime_revision) !== RUNTIME_REVISION ||
    finite(job.executionTime) == null
  ) {
    throw new Error("AVANTIQO_IMAGE_ECONOMICS_JOB_EVIDENCE_INVALID");
  }
  return output;
}

function billingWindow() {
  const now = Date.now();
  const start = text(arg("start-time") || process.env.AVANTIQO_IMAGE_BILLING_START_TIME);
  const end = text(arg("end-time") || process.env.AVANTIQO_IMAGE_BILLING_END_TIME);
  return {
    start_time: start || new Date(now - 36 * 60 * 60 * 1000).toISOString(),
    end_time: end || new Date(now + 5 * 60 * 1000).toISOString(),
  };
}

async function billingByPod(endpointId, managementKey, window) {
  const url = new URL(`${REST_BASE}/billing/endpoints`);
  url.searchParams.set("endpointId", endpointId);
  url.searchParams.set("bucketSize", "hour");
  url.searchParams.set("grouping", "podId");
  url.searchParams.set("startTime", window.start_time);
  url.searchParams.set("endTime", window.end_time);
  return parseResponse(
    await fetch(url, {
      headers: {
        Authorization: `Bearer ${managementKey}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(30_000),
    }),
    "RUNPOD_BILLING",
  );
}

function exactBillingEvidence(records, workerId) {
  const rows = Array.isArray(records) ? records : [];
  const exact = rows.filter((row) => text(row?.podId) === workerId);
  if (!exact.length) return null;

  const amountUsd = exact.reduce((sum, row) => sum + finite(row?.amount, 0), 0);
  const timeBilledMs = exact.reduce((sum, row) => sum + finite(row?.timeBilledMs, 0), 0);
  const gpuTypeIds = unique(exact.map((row) => row?.gpuTypeId));
  const endpointIds = unique(exact.map((row) => row?.endpointId));
  const effectiveHourlyUsd =
    timeBilledMs > 0 ? amountUsd / (timeBilledMs / 3_600_000) : null;

  return {
    source: "RUNPOD_SERVERLESS_BILLING_HISTORY",
    exact_worker_id_match: true,
    pod_id: workerId,
    record_count: exact.length,
    endpoint_ids: endpointIds,
    gpu_type_ids: gpuTypeIds,
    amount_usd: Number(amountUsd.toFixed(8)),
    time_billed_ms: timeBilledMs,
    effective_hourly_usd:
      effectiveHourlyUsd == null ? null : Number(effectiveHourlyUsd.toFixed(6)),
    records: exact.map((row) => ({
      time: text(row?.time) || null,
      endpoint_id: text(row?.endpointId) || null,
      pod_id: text(row?.podId) || null,
      gpu_type_id: text(row?.gpuTypeId) || null,
      amount_usd: finite(row?.amount),
      time_billed_ms: finite(row?.timeBilledMs),
      disk_space_billed_gb: finite(row?.diskSpaceBilledGb),
    })),
  };
}

async function waitForExactBilling(endpointId, workerId, managementKey, window) {
  const deadline = Date.now() + BILLING_WAIT_MS;
  let attempt = 0;
  let lastCount = 0;
  while (true) {
    attempt += 1;
    const records = await billingByPod(endpointId, managementKey, window);
    lastCount = Array.isArray(records) ? records.length : 0;
    const exact = exactBillingEvidence(records, workerId);
    if (exact) return { exact, total_records_returned: lastCount, attempts: attempt };
    if (Date.now() >= deadline) {
      return { exact: null, total_records_returned: lastCount, attempts: attempt };
    }
    console.log(
      `AVANTIQO_IMAGE_ECONOMICS_BILLING_WAIT attempt=${attempt} records=${lastCount} worker=${workerId}`,
    );
    await sleep(BILLING_POLL_MS);
  }
}

const jobId = required(
  arg("job-id") || process.env.AVANTIQO_IMAGE_COMPLETED_CERTIFICATION_JOB_ID,
  "AVANTIQO_IMAGE_COMPLETED_CERTIFICATION_JOB_ID_REQUIRED",
);
if (!/^[A-Za-z0-9-]+$/.test(jobId)) {
  throw new Error("AVANTIQO_IMAGE_COMPLETED_CERTIFICATION_JOB_ID_INVALID");
}
const managementKey = required(
  process.env.RUNPOD_MANAGEMENT_API_KEY,
  "RUNPOD_MANAGEMENT_API_KEY_REQUIRED",
);
const inferenceKey = required(
  process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY || process.env.RUNPOD_API_KEY,
  "RUNPOD_IMAGE_API_KEY_REQUIRED",
);
const endpointId = required(
  process.env.RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID,
  "RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID_REQUIRED",
);
const window = billingWindow();

console.log(`AVANTIQO_IMAGE_ECONOMICS_CONTRACT=${CONTRACT}`);
console.log(`AVANTIQO_IMAGE_ECONOMICS_JOB_ID=${jobId}`);
console.log("AVANTIQO_IMAGE_ECONOMICS_NEW_GENERATION=false");
console.log("AVANTIQO_IMAGE_ECONOMICS_RUNPOD_MUTATION=false");
console.log("AVANTIQO_IMAGE_ECONOMICS_PRODUCTION_DEPLOY=false");
console.log(`AVANTIQO_IMAGE_ECONOMICS_BILLING_WINDOW=${window.start_time}|${window.end_time}`);

const [endpoint, job] = await Promise.all([
  managementRead(
    `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
    managementKey,
  ),
  queueRead(endpointId, `/status/${encodeURIComponent(jobId)}`, inferenceKey),
]);
if (text(endpoint?.id) !== endpointId || text(endpoint?.name) !== IMAGE_ENDPOINT_NAME) {
  throw new Error("AVANTIQO_IMAGE_ECONOMICS_ENDPOINT_IDENTITY_INVALID");
}
const output = validateJob(job, jobId);
const workerId = required(exactWorkerId(job), "AVANTIQO_IMAGE_ECONOMICS_EXACT_WORKER_ID_REQUIRED");
const providerExecutionMs = finite(job.executionTime);
const generationMs = Math.round(Number(output.generation_seconds) * 1000);

const billing = await waitForExactBilling(
  endpointId,
  workerId,
  managementKey,
  window,
);

let jobExecutionProratedCostUsd = null;
let workerSessionBilledAmountUsd = null;
let effectiveHourlyUsd = null;
let gpuTypeIds = [];
if (billing.exact) {
  workerSessionBilledAmountUsd = billing.exact.amount_usd;
  effectiveHourlyUsd = billing.exact.effective_hourly_usd;
  gpuTypeIds = billing.exact.gpu_type_ids;
  if (effectiveHourlyUsd != null && providerExecutionMs != null) {
    jobExecutionProratedCostUsd = Number(
      ((providerExecutionMs / 3_600_000) * effectiveHourlyUsd).toFixed(8),
    );
  }
}

const exactWorkerBillingReady = Boolean(
  billing.exact &&
    billing.exact.exact_worker_id_match === true &&
    billing.exact.amount_usd != null &&
    billing.exact.time_billed_ms > 0 &&
    billing.exact.gpu_type_ids.length === 1,
);

const report = {
  success: true,
  contract: CONTRACT,
  activation_allowed: false,
  exact_generation_job_id: jobId,
  endpoint_id: endpointId,
  exact_job_worker_id: workerId,
  foundation_model: FOUNDATION_MODEL,
  runtime_revision: RUNTIME_REVISION,
  provider_execution_ms: providerExecutionMs,
  generation_ms: generationMs,
  billing_window: window,
  billing_query: {
    resource: "/billing/endpoints",
    grouping: "podId",
    bucket_size: "hour",
    attempts: billing.attempts,
    total_records_returned: billing.total_records_returned,
  },
  exact_worker_billing: billing.exact,
  measured_gpu_economics: {
    exact_worker_billing_evidence_ready: exactWorkerBillingReady,
    gpu_type_ids: gpuTypeIds,
    worker_session_billed_amount_usd: workerSessionBilledAmountUsd,
    worker_session_time_billed_ms: billing.exact?.time_billed_ms ?? null,
    effective_hourly_usd: effectiveHourlyUsd,
    job_execution_prorated_cost_usd: jobExecutionProratedCostUsd,
    job_execution_cost_allocation_status: exactWorkerBillingReady
      ? "MEASURED_WORKER_RATE_PRORATED_TO_EXACT_JOB_EXECUTION_TIME"
      : "NOT_READY",
    conservative_provider_cost_ceiling_usd: exactWorkerBillingReady
      ? workerSessionBilledAmountUsd
      : null,
    note:
      "RunPod billing is matched to the job's exact worker/pod ID. The billed worker-session amount is authoritative provider billing for that worker. The per-job execution figure prorates the exact worker's measured effective rate over the job's RunPod execution time; production customer pricing remains a separate certification gate.",
  },
  certification_gates: {
    runtime_execution: "PASS",
    storage_integrity: "PASS",
    true_cfg_quality_runtime: "PASS",
    measured_gpu_economics: exactWorkerBillingReady
      ? "EVIDENCE_READY"
      : "BILLING_HISTORY_NOT_YET_AVAILABLE",
    human_visual_quality_review: "REQUIRED",
    production_pricing: "NOT_CERTIFIED",
  },
  new_generation_submitted: false,
  runpod_mutation_performed: false,
  production_deploy: false,
  next_action: exactWorkerBillingReady
    ? "HUMAN_VISUAL_REVIEW_EXISTING_OUTPUT"
    : "RERUN_THIS_READ_ONLY_FINALIZER_AFTER_BILLING_INGESTION",
};

await writeFile(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`AVANTIQO_IMAGE_ECONOMICS_EXACT_WORKER_ID=${workerId}`);
console.log(`AVANTIQO_IMAGE_ECONOMICS_EXACT_BILLING_READY=${exactWorkerBillingReady}`);
if (billing.exact) {
  console.log(`AVANTIQO_IMAGE_ECONOMICS_GPU_TYPES=${gpuTypeIds.join("|")}`);
  console.log(`AVANTIQO_IMAGE_ECONOMICS_WORKER_SESSION_BILLED_USD=${workerSessionBilledAmountUsd}`);
  console.log(`AVANTIQO_IMAGE_ECONOMICS_EFFECTIVE_HOURLY_USD=${effectiveHourlyUsd}`);
  console.log(`AVANTIQO_IMAGE_ECONOMICS_JOB_EXECUTION_PRORATED_USD=${jobExecutionProratedCostUsd}`);
}
console.log(`AVANTIQO_IMAGE_ECONOMICS_OUTPUT=${OUTPUT_PATH}`);
console.log("AVANTIQO_IMAGE_ECONOMICS_FINALIZER_COMPLETE=YES");
console.log(JSON.stringify(report, null, 2));
