import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import {
  groupCacheVolumes,
  sharedVolumeGroup,
  sharedVolumePolicySummary,
} from "./lib/avantiqo-runpod-shared-volumes.mjs";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_IMAGE_QUALITY_CERTIFICATION_FINALIZER_V1";
const IMAGE_ENDPOINT_NAME = "avantiqo-image-v1";
const ENGINE_CONTRACT = "AVANTIQO_IMAGE_ENGINE_V1";
const FOUNDATION_MODEL = "Qwen/Qwen-Image-2512";
const RUNTIME_REVISION = "AVANTIQO_IMAGE_QWEN_2512_QUALITY_V1";
const QUALITY_POLICY = "QWEN_IMAGE_2512_REALISM_V1";
const BUCKET = "creative-assets";
const STORAGE_PREFIX = `storage://${BUCKET}/`;
const GROUP = sharedVolumeGroup("IMAGE_VIDEO");
const OUTPUT_PATH =
  process.env.AVANTIQO_IMAGE_CERTIFICATION_FINALIZER_OUTPUT ||
  "/tmp/avantiqo-image-quality-certification-finalizer.json";

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function list(value) {
  if (Array.isArray(value)) return value;
  return [];
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

function endpointVolumeIds(endpoint = {}) {
  const extra = Array.isArray(endpoint.networkVolumeIds)
    ? endpoint.networkVolumeIds
    : text(endpoint.networkVolumeIds)
      ? text(endpoint.networkVolumeIds).split(",")
      : [];
  return unique([endpoint.networkVolumeId, ...extra]);
}

function healthCounters(body = {}) {
  const jobs = body?.jobs && typeof body.jobs === "object" ? body.jobs : {};
  const workers = body?.workers && typeof body.workers === "object" ? body.workers : {};
  return {
    jobs: {
      in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
      completed: finite(jobs.completed, 0),
      failed: finite(jobs.failed, 0),
      retried: finite(jobs.retried, 0),
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

function safeWorker(worker = {}) {
  return {
    id: text(worker.id) || null,
    desired_status: text(worker.desiredStatus ?? worker.desired_status).toUpperCase() || null,
    status: text(worker.status ?? worker.workerStatus ?? worker.runtimeStatus).toUpperCase() || null,
    gpu: text(worker.gpu?.displayName || worker.machine?.gpuDisplayName) || null,
    cost_per_hour_usd: finite(worker.costPerHr),
    last_status_change: text(worker.lastStatusChange) || null,
  };
}

function safePod(pod = {}) {
  return {
    id: text(pod.id) || null,
    desired_status: text(pod.desiredStatus).toUpperCase() || null,
    gpu: text(pod.gpu?.displayName || pod.machine?.gpuDisplayName) || null,
    gpu_type_id: text(pod.machine?.gpuTypeId || pod.machine?.gpuType?.id) || null,
    data_center_id: text(pod.machine?.dataCenterId) || null,
    cost_per_hour_usd: finite(pod.costPerHr),
    last_started_at: text(pod.lastStartedAt) || null,
    last_status_change: text(pod.lastStatusChange) || null,
  };
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

async function rest(path, key) {
  return parseResponse(
    await fetch(`${REST_BASE}${path}`, {
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(30_000),
    }),
    "RUNPOD_REST",
  );
}

async function queue(endpointId, path, key) {
  return parseResponse(
    await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}${path}`, {
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(30_000),
    }),
    "RUNPOD_QUEUE",
  );
}

function resolveEndpoint(endpoints, configuredId) {
  const matches = configuredId
    ? endpoints.filter((endpoint) => text(endpoint?.id) === configuredId)
    : endpoints.filter((endpoint) => text(endpoint?.name) === IMAGE_ENDPOINT_NAME);
  if (matches.length !== 1 || text(matches[0]?.name) !== IMAGE_ENDPOINT_NAME) {
    throw new Error(`AVANTIQO_IMAGE_FINALIZER_ENDPOINT_RESOLUTION_FAILED:matches=${matches.length}`);
  }
  return matches[0];
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

function validateCompletedJob(job, expectedJobId) {
  if (text(job?.id) && text(job.id) !== expectedJobId) {
    throw new Error("AVANTIQO_IMAGE_FINALIZER_JOB_ID_MISMATCH");
  }
  if (text(job?.status).toUpperCase() !== "COMPLETED") {
    throw new Error(`AVANTIQO_IMAGE_FINALIZER_JOB_NOT_COMPLETED:${text(job?.status) || "UNKNOWN"}`);
  }
  const output = job?.output && typeof job.output === "object" ? job.output : {};
  const guidance =
    output?.generation_guidance && typeof output.generation_guidance === "object"
      ? output.generation_guidance
      : {};
  if (
    text(output.capability) !== "ai.image.generate" ||
    text(output.foundation_model) !== FOUNDATION_MODEL ||
    text(output.foundation_model_source) !== "runpod-cache" ||
    text(output.runtime_revision) !== RUNTIME_REVISION ||
    Number(output.width) !== 1328 ||
    Number(output.height) !== 1328 ||
    finite(output.size_bytes, 0) <= 10_000 ||
    text(guidance.mode).toUpperCase() !== "TRUE_CFG" ||
    Number(guidance.scale) !== 4 ||
    guidance.negative_prompt_supplied !== true ||
    guidance.negative_prompt_has_content !== true ||
    text(guidance.quality_policy) !== QUALITY_POLICY
  ) {
    throw new Error("AVANTIQO_IMAGE_FINALIZER_COMPLETED_JOB_EVIDENCE_INVALID");
  }
  return output;
}

async function optionalPod(workerId, managementKey) {
  if (!workerId) return null;
  try {
    return await rest(`/pods/${encodeURIComponent(workerId)}`, managementKey);
  } catch (error) {
    console.log(
      `AVANTIQO_IMAGE_FINALIZER_POD_LOOKUP_UNAVAILABLE=${text(error?.message || error).slice(0, 500)}`,
    );
    return null;
  }
}

function executionEconomics({ job, output, worker, pod, resolution }) {
  const providerExecutionMs = finite(job?.executionTime);
  const generationMs = finite(output?.generation_seconds) != null
    ? Math.round(Number(output.generation_seconds) * 1000)
    : null;
  const executionMs = providerExecutionMs ?? generationMs;
  const executionTimeSource = providerExecutionMs != null
    ? "RUNPOD_JOB_EXECUTION_TIME"
    : generationMs != null
      ? "WORKER_OUTPUT_GENERATION_SECONDS"
      : null;
  const costPerHour = finite(worker?.cost_per_hour_usd) ?? finite(pod?.cost_per_hour_usd);
  const executionCostUsd =
    executionMs != null && costPerHour != null
      ? (executionMs / 3_600_000) * costPerHour
      : null;
  const exactWorker = resolution === "EXACT_JOB_WORKER_ID";
  return {
    worker_resolution: resolution,
    exact_worker_attribution: exactWorker,
    gpu: pod?.gpu || pod?.gpu_type_id || worker?.gpu || null,
    data_center_id: pod?.data_center_id || null,
    cost_per_hour_usd: costPerHour,
    provider_execution_ms: providerExecutionMs,
    generation_ms: generationMs,
    costing_execution_ms: executionMs,
    execution_time_source: executionTimeSource,
    execution_cost_usd: executionCostUsd == null ? null : Number(executionCostUsd.toFixed(6)),
    economics_evidence_ready:
      exactWorker && executionMs != null && costPerHour != null && executionCostUsd != null,
    note:
      "Execution cost is derived from measured job execution time and the RunPod worker hourly rate; final customer pricing remains a separate certification decision.",
  };
}

const jobId = required(
  arg("job-id") || process.env.AVANTIQO_IMAGE_COMPLETED_CERTIFICATION_JOB_ID,
  "AVANTIQO_IMAGE_COMPLETED_CERTIFICATION_JOB_ID_REQUIRED",
);
if (!/^[A-Za-z0-9-]+$/.test(jobId)) {
  throw new Error("AVANTIQO_IMAGE_COMPLETED_CERTIFICATION_JOB_ID_INVALID");
}
const storageReferenceInput = text(
  arg("storage-reference") || process.env.AVANTIQO_IMAGE_CERTIFICATION_STORAGE_REFERENCE,
);
const managementKey = required(
  process.env.RUNPOD_MANAGEMENT_API_KEY,
  "RUNPOD_MANAGEMENT_API_KEY_REQUIRED",
);
const inferenceKey = required(
  process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY || process.env.RUNPOD_API_KEY,
  "RUNPOD_IMAGE_API_KEY_REQUIRED",
);
const supabaseUrl = required(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  "NEXT_PUBLIC_SUPABASE_URL_REQUIRED",
);
const serviceRoleKey = required(
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  "SUPABASE_SERVICE_ROLE_KEY_REQUIRED",
);

console.log(`AVANTIQO_IMAGE_CERTIFICATION_FINALIZER_CONTRACT=${CONTRACT}`);
console.log(`AVANTIQO_IMAGE_CERTIFICATION_FINALIZER_JOB_ID=${jobId}`);
console.log("AVANTIQO_IMAGE_CERTIFICATION_FINALIZER_NEW_GENERATION=false");
console.log("AVANTIQO_IMAGE_CERTIFICATION_FINALIZER_RUNPOD_MUTATION=false");
console.log("AVANTIQO_IMAGE_CERTIFICATION_FINALIZER_STORAGE_MUTATION=false");
console.log("AVANTIQO_IMAGE_CERTIFICATION_FINALIZER_PRODUCTION_DEPLOY=false");
console.log("AVANTIQO_IMAGE_CERTIFICATION_FINALIZER_SECRETS_PRINTED=false");

const [endpoints, volumes] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  rest("/networkvolumes", managementKey),
]);
if (!Array.isArray(endpoints) || !Array.isArray(volumes)) {
  throw new Error("AVANTIQO_IMAGE_FINALIZER_RUNPOD_LIST_INVALID");
}
const endpoint = resolveEndpoint(
  endpoints,
  text(process.env.RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID),
);
const endpointId = text(endpoint.id);
const imageVolumes = groupCacheVolumes(volumes, GROUP);
const canonical = imageVolumes.find(
  (volume) => text(volume?.name) === GROUP.canonical_name,
);
if (!canonical || imageVolumes.length !== 1) {
  throw new Error(
    `AVANTIQO_IMAGE_FINALIZER_IMAGE_VIDEO_VOLUME_NOT_CONVERGED:count=${imageVolumes.length}`,
  );
}
if (
  endpointVolumeIds(endpoint).length !== 1 ||
  endpointVolumeIds(endpoint)[0] !== text(canonical.id)
) {
  throw new Error("AVANTIQO_IMAGE_FINALIZER_CANONICAL_VOLUME_BINDING_REQUIRED");
}

const [job, healthRaw] = await Promise.all([
  queue(endpointId, `/status/${encodeURIComponent(jobId)}`, inferenceKey),
  queue(endpointId, "/health", inferenceKey),
]);
const output = validateCompletedJob(job, jobId);
const health = healthCounters(healthRaw);
if (health.workers.unhealthy > 0) {
  throw new Error(`AVANTIQO_IMAGE_FINALIZER_UNHEALTHY_WORKER:${health.workers.unhealthy}`);
}

const workers = list(endpoint.workers).map(safeWorker).filter((worker) => worker.id);
const jobWorkerId = exactWorkerId(job);
let selectedWorker = null;
let workerResolution = "UNRESOLVED";
if (jobWorkerId) {
  selectedWorker = workers.find((worker) => worker.id === jobWorkerId) || null;
  workerResolution = "EXACT_JOB_WORKER_ID";
} else {
  const liveWorkers = workers.filter(
    (worker) => worker.desired_status !== "EXITED" && worker.cost_per_hour_usd != null,
  );
  if (liveWorkers.length === 1) {
    selectedWorker = liveWorkers[0];
    workerResolution = "SOLE_CURRENT_ENDPOINT_WORKER_INFERENCE";
  }
}
const selectedWorkerId = jobWorkerId || selectedWorker?.id || null;
const podRaw = await optionalPod(selectedWorkerId, managementKey);
const pod = podRaw ? safePod(podRaw) : null;
const economics = executionEconomics({
  job,
  output,
  worker: selectedWorker,
  pod,
  resolution: workerResolution,
});

const storageReference = required(
  storageReferenceInput || output.storage_reference,
  "AVANTIQO_IMAGE_CERTIFICATION_STORAGE_REFERENCE_REQUIRED",
);
if (storageReference !== text(output.storage_reference)) {
  throw new Error("AVANTIQO_IMAGE_FINALIZER_STORAGE_REFERENCE_MISMATCH");
}
if (!storageReference.startsWith(STORAGE_PREFIX)) {
  throw new Error("AVANTIQO_IMAGE_FINALIZER_STORAGE_REFERENCE_INVALID");
}
const storagePath = storageReference.slice(STORAGE_PREFIX.length);
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: stored, error: downloadError } = await supabase.storage
  .from(BUCKET)
  .download(storagePath);
if (downloadError || !stored) {
  throw new Error(
    `AVANTIQO_IMAGE_FINALIZER_STORED_OUTPUT_READ_FAILED:${downloadError?.message || "NO_DATA"}`,
  );
}
const bytes = Buffer.from(await stored.arrayBuffer());
if (bytes.length !== Number(output.size_bytes)) {
  throw new Error(
    `AVANTIQO_IMAGE_FINALIZER_STORED_OUTPUT_SIZE_MISMATCH:stored=${bytes.length}:job=${Number(output.size_bytes)}`,
  );
}
const sha256 = createHash("sha256").update(bytes).digest("hex");
const { data: signed, error: signError } = await supabase.storage
  .from(BUCKET)
  .createSignedUrl(storagePath, 3600);
if (signError || !signed?.signedUrl) {
  throw new Error(
    `AVANTIQO_IMAGE_FINALIZER_REVIEW_URL_FAILED:${signError?.message || "NO_SIGNED_URL"}`,
  );
}

const report = {
  success: true,
  contract: CONTRACT,
  activation_allowed: false,
  runtime_certification_passed: true,
  exact_generation_job_id: jobId,
  endpoint_id: endpointId,
  foundation_model: FOUNDATION_MODEL,
  runtime_revision: RUNTIME_REVISION,
  canonical_volume: {
    id: text(canonical.id),
    name: text(canonical.name),
    data_center_id: text(canonical.dataCenterId),
  },
  endpoint_gpu_pool: list(endpoint.gpuTypeIds).map(text).filter(Boolean),
  final_health: health,
  job: {
    status: text(job.status).toUpperCase(),
    delay_ms: finite(job.delayTime),
    execution_ms: finite(job.executionTime),
    available_field_names: Object.keys(job || {}).sort(),
    output: {
      status: text(output.status),
      capability: text(output.capability),
      foundation_model: text(output.foundation_model),
      foundation_model_source: text(output.foundation_model_source),
      runtime_revision: text(output.runtime_revision),
      generation_seconds: finite(output.generation_seconds),
      width: finite(output.width),
      height: finite(output.height),
      size_bytes: finite(output.size_bytes),
      generation_guidance: output.generation_guidance || null,
      storage_reference: storageReference,
    },
  },
  worker_evidence: {
    job_worker_id: jobWorkerId || null,
    resolution: workerResolution,
    selected_worker: selectedWorker,
    pod,
    endpoint_workers: workers,
  },
  economics,
  stored_output: {
    storage_reference: storageReference,
    verified_size_bytes: bytes.length,
    sha256,
    review_url_expires_seconds: 3600,
  },
  shared_policy: sharedVolumePolicySummary(volumes),
  certification_gates: {
    runtime_execution: "PASS",
    storage_integrity: "PASS",
    true_cfg_quality_runtime: "PASS",
    measured_gpu_economics:
      economics.economics_evidence_ready === true ? "EVIDENCE_READY" : "NEEDS_EXACT_WORKER_ATTRIBUTION",
    human_visual_quality_review: "REQUIRED",
    production_pricing: "NOT_CERTIFIED",
  },
  new_generation_submitted: false,
  runpod_mutation_performed: false,
  storage_mutation_performed: false,
  production_deploy: false,
  next_action: "OPEN_EXISTING_OUTPUT_AND_RECORD_HUMAN_VISUAL_REVIEW",
};

await writeFile(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`AVANTIQO_IMAGE_CERTIFICATION_REVIEW_URL=${signed.signedUrl}`);
console.log(`AVANTIQO_IMAGE_CERTIFICATION_ECONOMICS=${JSON.stringify(economics)}`);
console.log(`AVANTIQO_IMAGE_CERTIFICATION_FINALIZER_OUTPUT=${OUTPUT_PATH}`);
console.log("AVANTIQO_IMAGE_CERTIFICATION_FINALIZER_COMPLETE=YES");
console.log(JSON.stringify(report, null, 2));
