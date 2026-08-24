import { writeFile } from "node:fs/promises";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_IMAGE_QUALITY_ECONOMICS_FINALIZER_V2";
const IMAGE_ENDPOINT_NAME = "avantiqo-image-v1";
const FOUNDATION_MODEL = "Qwen/Qwen-Image-2512";
const RUNTIME_REVISION = "AVANTIQO_IMAGE_QWEN_2512_QUALITY_V2";
const QUALITY_POLICY = "QWEN_IMAGE_2512_REALISM_IDENTITY_PHYSICS_V2";
const QUALITY_COMPILER_CONTRACT = "AVANTIQO_IMAGE_QUALITY_COMPILER_V2";
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
function list(value) {
  return Array.isArray(value) ? value : [];
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
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
function hourWindow(timestampMs) {
  const start = new Date(timestampMs);
  start.setUTCMinutes(0, 0, 0);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return { start_time: start.toISOString(), end_time: end.toISOString() };
}
function timestampFromStorageReference(reference) {
  const match = text(reference).match(/owned-media-local\/(\d{14})\//);
  if (!match) return null;
  const stamp = match[1];
  const iso = `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(8, 10)}:${stamp.slice(10, 12)}:${stamp.slice(12, 14)}.000Z`;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : null;
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
function endpointManagementWorkerIds(endpoint = {}) {
  return unique(list(endpoint.workers).map((worker) => worker?.id));
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
async function billingRead(endpointId, grouping, managementKey, window) {
  const url = new URL(`${REST_BASE}/billing/endpoints`);
  url.searchParams.set("endpointId", endpointId);
  url.searchParams.set("bucketSize", "hour");
  url.searchParams.set("grouping", grouping);
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

function validateJob(job, expectedJobId) {
  if (text(job?.id) && text(job.id) !== expectedJobId) {
    throw new Error("AVANTIQO_IMAGE_ECONOMICS_JOB_ID_MISMATCH");
  }
  if (text(job?.status).toUpperCase() !== "COMPLETED") {
    throw new Error(
      `AVANTIQO_IMAGE_ECONOMICS_JOB_NOT_COMPLETED:${text(job?.status) || "UNKNOWN"}`,
    );
  }
  const output = object(job?.output);
  const guidance = object(output?.generation_guidance);
  if (
    text(output.capability) !== "ai.image.generate" ||
    text(output.foundation_model) !== FOUNDATION_MODEL ||
    text(output.foundation_model_source) !== "runpod-cache" ||
    text(output.runtime_revision) !== RUNTIME_REVISION ||
    text(guidance.mode).toUpperCase() !== "TRUE_CFG" ||
    text(guidance.quality_policy) !== QUALITY_POLICY ||
    text(guidance.quality_compiler_contract) !== QUALITY_COMPILER_CONTRACT ||
    guidance.negative_prompt_supplied !== true ||
    finite(job.executionTime) == null ||
    finite(output.size_bytes, 0) <= 10_000 ||
    !text(output.storage_reference)
  ) {
    throw new Error("AVANTIQO_IMAGE_ECONOMICS_JOB_EVIDENCE_INVALID");
  }
  return output;
}

function billingWindow(output) {
  const explicitStart = text(arg("start-time") || process.env.AVANTIQO_IMAGE_BILLING_START_TIME);
  const explicitEnd = text(arg("end-time") || process.env.AVANTIQO_IMAGE_BILLING_END_TIME);
  if (Boolean(explicitStart) !== Boolean(explicitEnd)) {
    throw new Error("AVANTIQO_IMAGE_ECONOMICS_BILLING_WINDOW_OVERRIDE_REQUIRES_START_AND_END");
  }
  if (explicitStart && explicitEnd) {
    const startMs = Date.parse(explicitStart);
    const endMs = Date.parse(explicitEnd);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      throw new Error("AVANTIQO_IMAGE_ECONOMICS_BILLING_WINDOW_OVERRIDE_INVALID");
    }
    return {
      start_time: new Date(startMs).toISOString(),
      end_time: new Date(endMs).toISOString(),
      source: "EXPLICIT_OVERRIDE",
      evidence_timestamp: null,
    };
  }
  const evidenceMs = timestampFromStorageReference(output.storage_reference);
  if (evidenceMs == null) {
    throw new Error("AVANTIQO_IMAGE_ECONOMICS_STORAGE_TIMESTAMP_REQUIRED_FOR_DEFAULT_WINDOW");
  }
  return {
    ...hourWindow(evidenceMs),
    source: "STORAGE_FIXTURE_PREFIX_UTC_HOUR",
    evidence_timestamp: new Date(evidenceMs).toISOString(),
  };
}

function sanitizeBillingRows(records) {
  return list(records).map((row) => ({
    time: text(row?.time) || null,
    endpoint_id: text(row?.endpointId) || null,
    pod_id: text(row?.podId) || null,
    gpu_type_id: text(row?.gpuTypeId) || null,
    amount_usd: finite(row?.amount),
    time_billed_ms: finite(row?.timeBilledMs),
    disk_space_billed_gb: finite(row?.diskSpaceBilledGb),
  }));
}
function positiveBillingRows(rows) {
  return rows.filter(
    (row) => finite(row.time_billed_ms, 0) > 0 || finite(row.amount_usd, 0) > 0,
  );
}
function podCandidates(rows) {
  return unique(positiveBillingRows(rows).map((row) => row.pod_id));
}
function gpuCandidates(rows) {
  return unique(positiveBillingRows(rows).map((row) => row.gpu_type_id));
}
function correlateBillingPod({ rows, serverlessWorkerId, managementWorkerIds }) {
  const candidates = podCandidates(rows);
  if (serverlessWorkerId && candidates.includes(serverlessWorkerId)) {
    return {
      ready: true,
      pod_id: serverlessWorkerId,
      method: "DIRECT_SERVERLESS_WORKER_ID_ACTUALLY_PRESENT_AS_BILLING_POD_ID",
      candidates,
    };
  }
  if (candidates.length === 1) {
    return {
      ready: true,
      pod_id: candidates[0],
      method: "UNIQUE_ENDPOINT_BILLING_POD_IN_CERTIFICATION_HOUR",
      candidates,
    };
  }
  const managementMatches = unique(
    managementWorkerIds.filter((workerId) => candidates.includes(workerId)),
  );
  if (managementMatches.length === 1) {
    return {
      ready: true,
      pod_id: managementMatches[0],
      method: "UNIQUE_MANAGEMENT_WORKER_ID_PRESENT_AS_BILLING_POD_ID",
      candidates,
    };
  }
  return {
    ready: false,
    pod_id: null,
    method: candidates.length === 0
      ? "BILLING_POD_NOT_INGESTED"
      : "MULTIPLE_BILLING_PODS_CORRELATION_AMBIGUOUS",
    candidates,
  };
}
function attributedBilling(rows, podId) {
  if (!podId) return null;
  const exact = positiveBillingRows(rows).filter((row) => row.pod_id === podId);
  if (!exact.length) return null;
  const amountUsd = exact.reduce((sum, row) => sum + finite(row.amount_usd, 0), 0);
  const timeBilledMs = exact.reduce((sum, row) => sum + finite(row.time_billed_ms, 0), 0);
  const gpuTypeIds = unique(exact.map((row) => row.gpu_type_id));
  const effectiveHourlyUsd = timeBilledMs > 0
    ? amountUsd / (timeBilledMs / 3_600_000)
    : null;
  return {
    pod_id: podId,
    record_count: exact.length,
    amount_usd: Number(amountUsd.toFixed(8)),
    time_billed_ms: timeBilledMs,
    effective_hourly_usd: effectiveHourlyUsd == null
      ? null
      : Number(effectiveHourlyUsd.toFixed(6)),
    gpu_type_ids: gpuTypeIds,
    records: exact,
  };
}
async function waitForBilling(endpointId, managementKey, window, serverlessWorkerId, managementWorkerIds) {
  const deadline = Date.now() + BILLING_WAIT_MS;
  let attempt = 0;
  let latest = null;
  while (true) {
    attempt += 1;
    const [podRaw, gpuRaw] = await Promise.all([
      billingRead(endpointId, "podId", managementKey, window),
      billingRead(endpointId, "gpuTypeId", managementKey, window),
    ]);
    const podRows = sanitizeBillingRows(podRaw);
    const gpuRows = sanitizeBillingRows(gpuRaw);
    const correlation = correlateBillingPod({
      rows: podRows,
      serverlessWorkerId,
      managementWorkerIds,
    });
    latest = { attempt, podRows, gpuRows, correlation };
    if (correlation.ready || Date.now() >= deadline) return latest;
    console.log(
      `AVANTIQO_IMAGE_ECONOMICS_BILLING_WAIT attempt=${attempt} pod_records=${podRows.length} pod_candidates=${correlation.candidates.join("|") || "NONE"} method=${correlation.method}`,
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

console.log(`AVANTIQO_IMAGE_ECONOMICS_CONTRACT=${CONTRACT}`);
console.log(`AVANTIQO_IMAGE_ECONOMICS_JOB_ID=${jobId}`);
console.log("AVANTIQO_IMAGE_ECONOMICS_NEW_GENERATION=false");
console.log("AVANTIQO_IMAGE_ECONOMICS_RUNPOD_MUTATION=false");
console.log("AVANTIQO_IMAGE_ECONOMICS_STORAGE_MUTATION=false");
console.log("AVANTIQO_IMAGE_ECONOMICS_PRODUCTION_DEPLOY=false");
console.log("AVANTIQO_IMAGE_ECONOMICS_SERVERLESS_WORKER_ID_EQUALS_BILLING_POD_ID_ASSUMED=false");

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
if (finite(endpoint?.workersMin) !== 0 || finite(endpoint?.workersMax) !== 1) {
  throw new Error("AVANTIQO_IMAGE_ECONOMICS_ENDPOINT_SCALING_INVALID");
}
const output = validateJob(job, jobId);
const window = billingWindow(output);
const serverlessWorkerId = exactWorkerId(job) || null;
const managementWorkerIds = endpointManagementWorkerIds(endpoint);
const providerExecutionMs = finite(job.executionTime);
const generationMs = Math.round(Number(output.generation_seconds) * 1000);

console.log(`AVANTIQO_IMAGE_ECONOMICS_BILLING_WINDOW=${window.start_time}|${window.end_time}`);
console.log(`AVANTIQO_IMAGE_ECONOMICS_BILLING_WINDOW_SOURCE=${window.source}`);
console.log(`AVANTIQO_IMAGE_ECONOMICS_SERVERLESS_WORKER_ID=${serverlessWorkerId || "UNKNOWN"}`);

const billing = await waitForBilling(
  endpointId,
  managementKey,
  window,
  serverlessWorkerId,
  managementWorkerIds,
);
const attributed = attributedBilling(billing.podRows, billing.correlation.pod_id);
const globalGpuCandidates = gpuCandidates(billing.gpuRows);
let resolvedGpuTypeIds = attributed?.gpu_type_ids || [];
let gpuResolution = resolvedGpuTypeIds.length === 1
  ? "ATTRIBUTED_BILLING_POD_ROW"
  : null;
if (resolvedGpuTypeIds.length !== 1 && globalGpuCandidates.length === 1) {
  resolvedGpuTypeIds = globalGpuCandidates;
  gpuResolution = "UNIQUE_GPU_TYPE_IN_CERTIFICATION_HOUR";
}

const economicsReady = Boolean(
  billing.correlation.ready &&
  attributed &&
  attributed.amount_usd != null &&
  attributed.time_billed_ms > 0 &&
  attributed.effective_hourly_usd != null,
);
const exactGpuIdentityReady = resolvedGpuTypeIds.length === 1;
const jobExecutionProratedCostUsd = economicsReady
  ? Number(
      ((providerExecutionMs / 3_600_000) * attributed.effective_hourly_usd).toFixed(8),
    )
  : null;

const report = {
  success: true,
  contract: CONTRACT,
  activation_allowed: false,
  exact_generation_job_id: jobId,
  endpoint_id: endpointId,
  serverless_job_worker_id: serverlessWorkerId,
  serverless_worker_id_assumed_equal_billing_pod_id: false,
  endpoint_management_worker_ids: managementWorkerIds,
  foundation_model: FOUNDATION_MODEL,
  runtime_revision: RUNTIME_REVISION,
  quality_policy: QUALITY_POLICY,
  quality_compiler_contract: QUALITY_COMPILER_CONTRACT,
  provider_execution_ms: providerExecutionMs,
  generation_ms: generationMs,
  storage_reference: text(output.storage_reference),
  output_size_bytes: finite(output.size_bytes),
  billing_window: window,
  billing_query: {
    resource: "/billing/endpoints",
    bucket_size: "hour",
    groupings: ["podId", "gpuTypeId"],
    attempts: billing.attempt,
  },
  billing_correlation: {
    ready: billing.correlation.ready,
    method: billing.correlation.method,
    attributed_pod_id: billing.correlation.pod_id,
    pod_candidates: billing.correlation.candidates,
    gpu_candidates: globalGpuCandidates,
    pod_group_rows: billing.podRows,
    gpu_group_rows: billing.gpuRows,
  },
  attributed_billing: attributed,
  measured_gpu_economics: {
    evidence_ready: economicsReady,
    gpu_identity_evidence_ready: exactGpuIdentityReady,
    gpu_type_ids: resolvedGpuTypeIds,
    gpu_resolution: gpuResolution,
    billed_amount_usd: economicsReady ? attributed.amount_usd : null,
    time_billed_ms: economicsReady ? attributed.time_billed_ms : null,
    effective_hourly_usd: economicsReady ? attributed.effective_hourly_usd : null,
    job_execution_prorated_cost_usd: jobExecutionProratedCostUsd,
    conservative_provider_cost_ceiling_usd: economicsReady ? attributed.amount_usd : null,
    job_execution_cost_allocation_status: economicsReady
      ? "MEASURED_ATTRIBUTED_POD_RATE_PRORATED_TO_EXACT_JOB_EXECUTION_TIME"
      : "NOT_READY",
    note:
      "RunPod Serverless job workerId and billing podId are treated as separate namespaces. Billing is attributed only by direct observed equality, one unique endpoint billing pod in the certification hour, or one observed management-worker intersection. The exact-job cost is a proration of the attributed billed pod rate over the job execution time; production customer pricing is a separate certification gate.",
  },
  certification_gates: {
    runtime_execution: "PASS",
    storage_integrity: "PASS",
    true_cfg_quality_runtime: "PASS",
    quality_compiler_v2: "PASS",
    measured_gpu_economics: economicsReady
      ? "EVIDENCE_READY"
      : "BILLING_CORRELATION_UNRESOLVED_OR_NOT_INGESTED",
    exact_gpu_identity: exactGpuIdentityReady ? "EVIDENCE_READY" : "UNRESOLVED",
    human_visual_quality_review: "REQUIRED",
    production_pricing: "NOT_CERTIFIED",
  },
  new_generation_submitted: false,
  runpod_mutation_performed: false,
  storage_mutation_performed: false,
  production_deploy: false,
  next_action: economicsReady
    ? "HUMAN_VISUAL_REVIEW_EXISTING_OUTPUT"
    : "REVIEW_BILLING_CORRELATION_CANDIDATES_WITHOUT_NEW_GENERATION",
};

await writeFile(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`AVANTIQO_IMAGE_ECONOMICS_BILLING_POD_CANDIDATES=${billing.correlation.candidates.join("|") || "NONE"}`);
console.log(`AVANTIQO_IMAGE_ECONOMICS_ATTRIBUTION_METHOD=${billing.correlation.method}`);
console.log(`AVANTIQO_IMAGE_ECONOMICS_ATTRIBUTED_POD_ID=${billing.correlation.pod_id || "UNRESOLVED"}`);
console.log(`AVANTIQO_IMAGE_ECONOMICS_EVIDENCE_READY=${economicsReady}`);
console.log(`AVANTIQO_IMAGE_ECONOMICS_GPU_IDENTITY_READY=${exactGpuIdentityReady}`);
if (economicsReady) {
  console.log(`AVANTIQO_IMAGE_ECONOMICS_GPU_TYPES=${resolvedGpuTypeIds.join("|") || "UNRESOLVED"}`);
  console.log(`AVANTIQO_IMAGE_ECONOMICS_BILLED_USD=${attributed.amount_usd}`);
  console.log(`AVANTIQO_IMAGE_ECONOMICS_TIME_BILLED_MS=${attributed.time_billed_ms}`);
  console.log(`AVANTIQO_IMAGE_ECONOMICS_EFFECTIVE_HOURLY_USD=${attributed.effective_hourly_usd}`);
  console.log(`AVANTIQO_IMAGE_ECONOMICS_JOB_EXECUTION_PRORATED_USD=${jobExecutionProratedCostUsd}`);
}
console.log(`AVANTIQO_IMAGE_ECONOMICS_OUTPUT=${OUTPUT_PATH}`);
console.log("AVANTIQO_IMAGE_ECONOMICS_FINALIZER_COMPLETE=YES");
console.log(JSON.stringify(report, null, 2));
