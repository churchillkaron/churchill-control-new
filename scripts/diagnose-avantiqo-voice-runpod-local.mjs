import { readFile } from "node:fs/promises";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_VOICE_RUNPOD_DIAGNOSTIC_V2";
const IMAGE_EVIDENCE_PATH = "audits/results/avantiqo-voice-worker-images.json";

function text(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function list(value) {
  return Array.isArray(value) ? value : [];
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
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 500);
    throw new Error(`${errorPrefix}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body || {};
}

async function managementRead(pathname, managementKey, errorPrefix) {
  const response = await fetch(`${REST_BASE}${pathname}`, {
    headers: {
      Authorization: `Bearer ${managementKey}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });
  return readJson(response, errorPrefix);
}

async function optionalManagementRead(pathname, managementKey, errorPrefix) {
  try {
    return {
      ok: true,
      body: await managementRead(pathname, managementKey, errorPrefix),
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      body: null,
      error: text(error?.message || error).slice(0, 500),
    };
  }
}

async function readManagementEndpoint(endpointId, managementKey) {
  const endpoint = await managementRead(
    `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
    managementKey,
    "RUNPOD_VOICE_DIAGNOSTIC_MANAGEMENT",
  );
  if (text(endpoint?.id) !== endpointId) {
    throw new Error("RUNPOD_VOICE_DIAGNOSTIC_ENDPOINT_ID_MISMATCH");
  }
  return endpoint;
}

async function optionalQueueRead(endpointId, path, apiKey) {
  try {
    const response = await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}${path}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(30_000),
    });
    const body = await readJson(response, "RUNPOD_VOICE_DIAGNOSTIC_QUEUE");
    return { ok: true, body, error: null };
  } catch (error) {
    return { ok: false, body: null, error: text(error?.message || error).slice(0, 500) };
  }
}

async function imageEvidence() {
  const raw = await readFile(IMAGE_EVIDENCE_PATH, "utf8");
  const parsed = JSON.parse(raw);
  if (parsed?.success !== true || parsed?.contract !== "AVANTIQO_VOICE_WORKER_IMAGES_RESULT_V1") {
    throw new Error("AVANTIQO_VOICE_DIAGNOSTIC_IMAGE_EVIDENCE_INVALID");
  }
  const stt = text(parsed?.stt?.immutable_image_reference);
  const tts = text(parsed?.tts?.immutable_image_reference);
  if (!/^ghcr\.io\/.+@sha256:[a-f0-9]{64}$/i.test(stt)) {
    throw new Error("AVANTIQO_VOICE_DIAGNOSTIC_STT_IMAGE_EVIDENCE_INVALID");
  }
  if (!/^ghcr\.io\/.+@sha256:[a-f0-9]{64}$/i.test(tts)) {
    throw new Error("AVANTIQO_VOICE_DIAGNOSTIC_TTS_IMAGE_EVIDENCE_INVALID");
  }
  return { stt, tts };
}

function safeWorker(worker = {}) {
  return {
    id_present: Boolean(text(worker.id)),
    desired_status: upper(worker.desiredStatus ?? worker.desired_status) || null,
    status: upper(worker.status ?? worker.workerStatus ?? worker.runtimeStatus) || null,
    gpu: text(worker.gpu?.displayName || worker.machine?.gpuDisplayName) || null,
    last_status_change: text(worker.lastStatusChange) || null,
    cost_per_hour: finite(worker.costPerHr),
    available_field_names: Object.keys(object(worker)).sort(),
  };
}

function safeEndpoint(endpoint = {}) {
  const workers = list(endpoint.workers).map(safeWorker);
  return {
    id: text(endpoint.id) || null,
    name: text(endpoint.name) || null,
    template_id: text(endpoint.templateId || endpoint.template?.id) || null,
    template_name: text(endpoint.template?.name) || null,
    template_image: text(endpoint.template?.imageName) || null,
    compute_type: text(endpoint.computeType) || null,
    gpu_count: finite(endpoint.gpuCount),
    gpu_type_ids: list(endpoint.gpuTypeIds).map(text).filter(Boolean),
    data_center_ids: list(endpoint.dataCenterIds).map(text).filter(Boolean),
    workers_min: finite(endpoint.workersMin),
    workers_max: finite(endpoint.workersMax),
    idle_timeout_seconds: finite(endpoint.idleTimeout),
    execution_timeout_ms: finite(endpoint.executionTimeoutMs),
    scaler_type: text(endpoint.scalerType) || null,
    scaler_value: finite(endpoint.scalerValue),
    flashboot: endpoint.flashboot === true,
    workers,
    worker_count: workers.length,
    exited_worker_count: workers.filter((worker) => worker.desired_status === "EXITED").length,
    non_exited_worker_count: workers.filter((worker) => worker.desired_status !== "EXITED").length,
    initializing_worker_count: workers.filter((worker) => worker.status === "INITIALIZING").length,
    running_worker_count: workers.filter((worker) => worker.status === "RUNNING").length,
    unhealthy_worker_count: workers.filter((worker) => worker.status === "UNHEALTHY").length,
  };
}

function safeTemplate(template = {}) {
  return {
    id: text(template.id) || null,
    name: text(template.name) || null,
    image_name: text(template.imageName) || null,
    registry_auth_configured: Boolean(text(template.containerRegistryAuthId)),
    docker_entrypoint: list(template.dockerEntrypoint).map(text),
    docker_start_cmd: list(template.dockerStartCmd).map(text),
    container_disk_gb: finite(template.containerDiskInGb),
    volume_gb: finite(template.volumeInGb),
    volume_mount_path: text(template.volumeMountPath) || null,
    env_keys: Object.keys(object(template.env)).sort(),
  };
}

function safePod(pod = {}, expectedImage = "", expectedTemplateId = "") {
  const image = text(pod.image || pod.imageName);
  const templateId = text(pod.templateId);
  return {
    found: Boolean(text(pod.id)),
    desired_status: upper(pod.desiredStatus) || null,
    endpoint_id_present: Boolean(text(pod.endpointId || pod.aiApiId)),
    image: image || null,
    image_matches_expected_immutable: Boolean(image) && image === expectedImage,
    template_id: templateId || null,
    template_matches_endpoint: Boolean(templateId) && templateId === expectedTemplateId,
    registry_auth_configured: Boolean(text(pod.containerRegistryAuthId)),
    docker_entrypoint: list(pod.dockerEntrypoint).map(text),
    docker_start_cmd: list(pod.dockerStartCmd).map(text),
    container_disk_gb: finite(pod.containerDiskInGb),
    gpu: text(pod.gpu?.displayName || pod.machine?.gpuDisplayName) || null,
    gpu_type_id: text(pod.machine?.gpuTypeId || pod.machine?.gpuType?.id) || null,
    data_center_id: text(pod.machine?.dataCenterId) || null,
    memory_gb: finite(pod.memoryInGb),
    vcpu_count: finite(pod.vcpuCount),
    interruptible: pod.interruptible === true,
    last_started_at: text(pod.lastStartedAt) || null,
    last_status_change: text(pod.lastStatusChange) || null,
    env_keys: Object.keys(object(pod.env)).sort(),
    available_field_names: Object.keys(object(pod)).sort(),
  };
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

async function inspectWorkers(endpointRaw, managementKey, expectedImage) {
  const expectedTemplateId = text(endpointRaw?.templateId || endpointRaw?.template?.id);
  const rawWorkers = list(endpointRaw?.workers).slice(-5);
  const reads = await Promise.all(
    rawWorkers.map((worker) => {
      const workerId = text(worker?.id);
      if (!workerId) return Promise.resolve({ ok: false, body: null, error: "WORKER_ID_MISSING" });
      return optionalManagementRead(
        `/pods/${encodeURIComponent(workerId)}`,
        managementKey,
        "RUNPOD_VOICE_DIAGNOSTIC_WORKER_POD",
      );
    }),
  );
  return reads.map((read) => ({
    read_ok: read.ok,
    error: read.error,
    pod: read.ok ? safePod(read.body, expectedImage, expectedTemplateId) : null,
  }));
}

function diagnosis(endpoint, template, workers, health, job, expectedImage) {
  const jobStatus = upper(job?.status);
  const initializing =
    endpoint.initializing_worker_count > 0 ||
    (health ? health.workers.initializing > 0 : false);
  const unhealthy =
    endpoint.unhealthy_worker_count > 0 ||
    (health ? health.workers.unhealthy > 0 : false);
  const exited = endpoint.exited_worker_count;
  const workerPods = workers.map((entry) => entry.pod).filter(Boolean);
  const imageMismatch = workerPods.some(
    (pod) => pod.image && pod.image_matches_expected_immutable === false,
  );
  const templateMismatch = workerPods.some(
    (pod) => pod.template_id && pod.template_matches_endpoint === false,
  );
  const registryMissing =
    template.registry_auth_configured === false ||
    workerPods.some((pod) => pod.registry_auth_configured === false);

  let blocker = null;
  if (imageMismatch) {
    blocker = "WORKER_IMAGE_MISMATCH";
  } else if (templateMismatch) {
    blocker = "WORKER_TEMPLATE_MISMATCH";
  } else if (registryMissing) {
    blocker = "WORKER_REGISTRY_AUTH_NOT_BOUND";
  } else if (jobStatus === "IN_QUEUE" && exited >= 2 && initializing) {
    blocker = "WORKER_STARTUP_RETRY_LOOP";
  } else if (jobStatus === "IN_QUEUE" && unhealthy) {
    blocker = "WORKER_UNHEALTHY_DURING_STARTUP";
  } else if (jobStatus === "IN_QUEUE" && initializing) {
    blocker = "WORKER_COLD_START_IN_PROGRESS";
  } else if (jobStatus === "IN_QUEUE") {
    blocker = "JOB_QUEUED_WORKER_STATE_INCONCLUSIVE";
  } else if (["FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(jobStatus)) {
    blocker = `JOB_${jobStatus}`;
  }

  return {
    blocker,
    queue_accepted: Boolean(jobStatus),
    job_status: jobStatus || null,
    expected_immutable_image_present: Boolean(expectedImage),
    template_image_matches_expected: Boolean(template.image_name) && template.image_name === expectedImage,
    worker_image_mismatch_observed: imageMismatch,
    worker_template_mismatch_observed: templateMismatch,
    worker_registry_auth_missing_observed: registryMissing,
    exited_worker_count: exited,
    worker_initialization_observed: initializing,
    worker_unhealthy_observed: unhealthy,
    startup_retry_loop_observed: jobStatus === "IN_QUEUE" && exited >= 2 && initializing,
    safe_to_submit_duplicate_job: false,
    next_evidence_if_unresolved: "RUNPOD_ENDPOINT_LOGS",
  };
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const inferenceKey = managementKey;
const ttsEndpointId = required("RUNPOD_AVANTIQO_VOICE_TTS_ENDPOINT_ID");
const sttEndpointId = required("RUNPOD_AVANTIQO_VOICE_STT_ENDPOINT_ID");
const jobId = text(process.env.AVANTIQO_VOICE_SMOKE_JOB_ID);
const evidence = await imageEvidence();

const [ttsEndpointRaw, sttEndpointRaw, ttsHealthRead, sttHealthRead, jobRead] = await Promise.all([
  readManagementEndpoint(ttsEndpointId, managementKey),
  readManagementEndpoint(sttEndpointId, managementKey),
  optionalQueueRead(ttsEndpointId, "/health", inferenceKey),
  optionalQueueRead(sttEndpointId, "/health", inferenceKey),
  jobId
    ? optionalQueueRead(ttsEndpointId, `/status/${encodeURIComponent(jobId)}`, inferenceKey)
    : Promise.resolve({ ok: false, body: null, error: "JOB_ID_NOT_SUPPLIED" }),
]);

const ttsTemplateId = text(ttsEndpointRaw?.templateId || ttsEndpointRaw?.template?.id);
const sttTemplateId = text(sttEndpointRaw?.templateId || sttEndpointRaw?.template?.id);
const [ttsTemplateRead, sttTemplateRead, ttsWorkerReads, sttWorkerReads] = await Promise.all([
  ttsTemplateId
    ? optionalManagementRead(
        `/templates/${encodeURIComponent(ttsTemplateId)}`,
        managementKey,
        "RUNPOD_VOICE_DIAGNOSTIC_TTS_TEMPLATE",
      )
    : Promise.resolve({ ok: false, body: null, error: "TTS_TEMPLATE_ID_MISSING" }),
  sttTemplateId
    ? optionalManagementRead(
        `/templates/${encodeURIComponent(sttTemplateId)}`,
        managementKey,
        "RUNPOD_VOICE_DIAGNOSTIC_STT_TEMPLATE",
      )
    : Promise.resolve({ ok: false, body: null, error: "STT_TEMPLATE_ID_MISSING" }),
  inspectWorkers(ttsEndpointRaw, managementKey, evidence.tts),
  inspectWorkers(sttEndpointRaw, managementKey, evidence.stt),
]);

const ttsEndpoint = safeEndpoint(ttsEndpointRaw);
const sttEndpoint = safeEndpoint(sttEndpointRaw);
const ttsTemplate = safeTemplate(ttsTemplateRead.ok ? ttsTemplateRead.body : ttsEndpointRaw.template || {});
const sttTemplate = safeTemplate(sttTemplateRead.ok ? sttTemplateRead.body : sttEndpointRaw.template || {});
const ttsHealth = ttsHealthRead.ok ? safeHealth(ttsHealthRead.body) : null;
const sttHealth = sttHealthRead.ok ? safeHealth(sttHealthRead.body) : null;
const job = jobRead.ok ? jobRead.body : null;

const result = {
  success: true,
  contract: CONTRACT,
  read_only: true,
  mutation_performed: false,
  generation_submitted: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  inference_credential_source: "RUNPOD_MANAGEMENT_API_KEY",
  immutable_worker_evidence_verified: true,
  tts: {
    expected_immutable_image: evidence.tts,
    endpoint: ttsEndpoint,
    template: ttsTemplate,
    template_read: { ok: ttsTemplateRead.ok, error: ttsTemplateRead.error },
    worker_pods: ttsWorkerReads,
    health: ttsHealth,
    health_read: { ok: ttsHealthRead.ok, error: ttsHealthRead.error },
    job_id_supplied: Boolean(jobId),
    job: job
      ? {
          id_present: Boolean(text(job.id)),
          status: upper(job.status) || null,
          delay_time_ms: finite(job.delayTime),
          execution_time_ms: finite(job.executionTime),
          error_present: Boolean(text(job.error || job.message)),
          error: text(job.error || job.message).slice(0, 500) || null,
        }
      : null,
    diagnosis: diagnosis(ttsEndpoint, ttsTemplate, ttsWorkerReads, ttsHealth, job, evidence.tts),
  },
  stt: {
    expected_immutable_image: evidence.stt,
    endpoint: sttEndpoint,
    template: sttTemplate,
    template_read: { ok: sttTemplateRead.ok, error: sttTemplateRead.error },
    worker_pods: sttWorkerReads,
    health: sttHealth,
    health_read: { ok: sttHealthRead.ok, error: sttHealthRead.error },
  },
  secrets_in_output: false,
};

console.log(JSON.stringify(result, null, 2));
