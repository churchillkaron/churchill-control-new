import { readFile } from "node:fs/promises";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_VOICE_TTS_RUNPOD_CUDA_REPAIR_V1";
const IMAGE_EVIDENCE_PATH = "audits/results/avantiqo-voice-worker-images.json";
const ENDPOINT_NAME = "avantiqo-voice-tts-v1";
const REQUIRED_MIN_CUDA_VERSION = "12.4";

function text(value) {
  return String(value ?? "").trim();
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

async function readJson(response, errorPrefix) {
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 600);
    throw new Error(`${errorPrefix}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body || {};
}

async function rest(pathname, credential, options = {}) {
  const response = await fetch(`${REST_BASE}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${credential}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  return readJson(response, "RUNPOD_VOICE_TTS_CUDA_REPAIR_MANAGEMENT");
}

async function queue(pathname, credential, options = {}) {
  const response = await fetch(`${QUEUE_BASE}/${encodeURIComponent(options.endpointId)}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${credential}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  return readJson(response, "RUNPOD_VOICE_TTS_CUDA_REPAIR_QUEUE");
}

function safeHealth(body = {}) {
  const jobs = object(body.jobs);
  const workers = object(body.workers);
  return {
    jobs: {
      completed: finite(jobs.completed) ?? 0,
      failed: finite(jobs.failed) ?? 0,
      in_progress: finite(jobs.inProgress ?? jobs.in_progress) ?? 0,
      in_queue: finite(jobs.inQueue ?? jobs.in_queue) ?? 0,
      retried: finite(jobs.retried) ?? 0,
    },
    workers: {
      idle: finite(workers.idle) ?? 0,
      initializing: finite(workers.initializing) ?? 0,
      ready: finite(workers.ready) ?? 0,
      running: finite(workers.running) ?? 0,
      throttled: finite(workers.throttled) ?? 0,
      unhealthy: finite(workers.unhealthy) ?? 0,
    },
  };
}

function safeEndpoint(endpoint = {}) {
  return {
    id: text(endpoint.id) || null,
    name: text(endpoint.name) || null,
    template_id: text(endpoint.templateId || endpoint.template?.id) || null,
    template_image: text(endpoint.template?.imageName) || null,
    min_cuda_version: text(endpoint.minCudaVersion) || null,
    gpu_type_ids: Array.isArray(endpoint.gpuTypeIds)
      ? endpoint.gpuTypeIds.map(text).filter(Boolean)
      : [],
    workers_min: finite(endpoint.workersMin),
    workers_max: finite(endpoint.workersMax),
    flashboot: endpoint.flashboot === true,
  };
}

async function expectedImage() {
  const parsed = JSON.parse(await readFile(IMAGE_EVIDENCE_PATH, "utf8"));
  if (
    parsed?.success !== true ||
    parsed?.contract !== "AVANTIQO_VOICE_WORKER_IMAGES_RESULT_V1" ||
    parsed?.tts?.success !== true ||
    parsed?.tts?.source_sha_matches_trigger !== true ||
    parsed?.tts?.import_smoke_passed_by_docker_build !== true ||
    text(parsed?.tts?.cuda_runtime_expected) !== REQUIRED_MIN_CUDA_VERSION
  ) {
    throw new Error("AVANTIQO_VOICE_TTS_IMMUTABLE_IMAGE_EVIDENCE_INVALID");
  }
  const image = text(parsed?.tts?.immutable_image_reference);
  if (!/^ghcr\.io\/.+@sha256:[a-f0-9]{64}$/i.test(image)) {
    throw new Error("AVANTIQO_VOICE_TTS_IMMUTABLE_IMAGE_REFERENCE_INVALID");
  }
  return image;
}

const apply = process.argv.includes("--apply");
const approved =
  text(process.env.AVANTIQO_VOICE_TTS_RUNPOD_CUDA_REPAIR_APPROVED).toUpperCase() === "YES";
if (apply && !approved) {
  throw new Error("AVANTIQO_VOICE_TTS_RUNPOD_CUDA_REPAIR_APPROVED=YES_REQUIRED");
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const endpointId = required("RUNPOD_AVANTIQO_VOICE_TTS_ENDPOINT_ID");
const immutableImage = await expectedImage();

let endpoint = await rest(
  `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
  managementKey,
);
if (text(endpoint.id) !== endpointId || text(endpoint.name) !== ENDPOINT_NAME) {
  throw new Error("AVANTIQO_VOICE_TTS_ENDPOINT_BINDING_MISMATCH");
}
const templateImage = text(endpoint?.template?.imageName);
if (templateImage !== immutableImage) {
  throw new Error("AVANTIQO_VOICE_TTS_ENDPOINT_IMMUTABLE_IMAGE_MISMATCH");
}
if (!text(endpoint?.template?.containerRegistryAuthId)) {
  throw new Error("AVANTIQO_VOICE_TTS_ENDPOINT_REGISTRY_AUTH_REQUIRED");
}

let health = safeHealth(
  await queue("/health", managementKey, {
    endpointId,
  }),
);

const plan = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  endpoint: safeEndpoint(endpoint),
  immutable_image_verified: true,
  required_min_cuda_version: REQUIRED_MIN_CUDA_VERSION,
  min_cuda_repair_required: text(endpoint.minCudaVersion) !== REQUIRED_MIN_CUDA_VERSION,
  health_before: health,
  stale_queue_detected: health.jobs.in_queue > 0,
  mutation_performed: false,
  queue_purged: false,
  queue_removed_count: 0,
  endpoint_cuda_updated: false,
  generation_submitted: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_in_output: false,
};

if (!apply) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

if (
  health.jobs.in_progress > 0 ||
  health.workers.running > 0 ||
  health.workers.throttled > 0
) {
  throw new Error(
    `AVANTIQO_VOICE_TTS_ACTIVE_EXECUTION_BLOCKS_REPAIR:in_progress=${health.jobs.in_progress}:running=${health.workers.running}:throttled=${health.workers.throttled}`,
  );
}

if (health.jobs.in_queue > 0) {
  const purge = await queue("/purge-queue", managementKey, {
    endpointId,
    method: "POST",
  });
  plan.queue_purged = true;
  plan.queue_removed_count = finite(purge?.removed) ?? health.jobs.in_queue;
  plan.mutation_performed = true;

  health = safeHealth(
    await queue("/health", managementKey, {
      endpointId,
    }),
  );
  if (health.jobs.in_queue !== 0 || health.jobs.in_progress !== 0) {
    throw new Error(
      `AVANTIQO_VOICE_TTS_QUEUE_NOT_DRAINED_AFTER_PURGE:in_queue=${health.jobs.in_queue}:in_progress=${health.jobs.in_progress}`,
    );
  }
}

if (text(endpoint.minCudaVersion) !== REQUIRED_MIN_CUDA_VERSION) {
  await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
    method: "PATCH",
    body: {
      minCudaVersion: REQUIRED_MIN_CUDA_VERSION,
    },
  });
  plan.endpoint_cuda_updated = true;
  plan.mutation_performed = true;
}

endpoint = await rest(
  `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
  managementKey,
);
if (text(endpoint.minCudaVersion) !== REQUIRED_MIN_CUDA_VERSION) {
  throw new Error(
    `AVANTIQO_VOICE_TTS_MIN_CUDA_VERIFY_FAILED:actual=${text(endpoint.minCudaVersion) || "MISSING"}:expected=${REQUIRED_MIN_CUDA_VERSION}`,
  );
}
if (text(endpoint?.template?.imageName) !== immutableImage) {
  throw new Error("AVANTIQO_VOICE_TTS_IMMUTABLE_IMAGE_CHANGED_DURING_REPAIR");
}

const healthAfter = safeHealth(
  await queue("/health", managementKey, {
    endpointId,
  }),
);
if (healthAfter.jobs.in_queue !== 0 || healthAfter.jobs.in_progress !== 0) {
  throw new Error(
    `AVANTIQO_VOICE_TTS_REPAIR_FINAL_QUEUE_NOT_EMPTY:in_queue=${healthAfter.jobs.in_queue}:in_progress=${healthAfter.jobs.in_progress}`,
  );
}

console.log(JSON.stringify({
  ...plan,
  success: true,
  mode: "APPLY",
  endpoint: safeEndpoint(endpoint),
  health_after: healthAfter,
  next_action: "RUN_ONE_CONTROLLED_VOICE_TTS_SMOKE",
}, null, 2));
