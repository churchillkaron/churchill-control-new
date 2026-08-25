export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const CONTRACT = "AVANTIQO_VOICE_TTS_BLACKWELL_SMOKE_V1";
const ENGINE_CONTRACT = "AVANTIQO_VOICE_ENGINE_V1";
const TOKEN = "avq-voice-tts-blackwell-smoke-v1-20260825";
const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const BUCKET = "creative-assets";
const ENDPOINT_NAME = "avantiqo-voice-tts-v1";
const FOUNDATION_MODEL = "resemble-ai/chatterbox:multilingual-v3";
const REQUIRED_CUDA = "12.8";
const CERTIFIED_IMAGE = "ghcr.io/churchillkaron/avantiqo-voice-tts-worker@sha256:c9ce291cc27bb7de119cf1120a92dd6466962b6d79fd5728a1266a743bad1a06";
const CERTIFIED_IMAGE_DIGEST = "sha256:c9ce291cc27bb7de119cf1120a92dd6466962b6d79fd5728a1266a743bad1a06";
const BLACKWELL_GPU_TYPE_IDS = Object.freeze([
  "NVIDIA GeForce RTX 5090",
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
  "NVIDIA RTX PRO 6000 Blackwell Workstation Edition",
]);
const IDLE_TIMEOUT_SECONDS = 10;
const STORAGE_BASE = `platform-certification/owned-engines/voice-blackwell-tts-smoke-v1/${CERTIFIED_IMAGE_DIGEST.replace("sha256:", "")}`;
const LOCK_PATH = `${STORAGE_BASE}/lock.json`;
const RESULT_PATH = `${STORAGE_BASE}/result.json`;
const AUDIO_PATH = `${STORAGE_BASE}/audio.wav`;

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function finite(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store, private" },
  });
}

function redact(value) {
  let message = text(value);
  const secret = text(process.env.RUNPOD_API_KEY);
  if (secret) message = message.replaceAll(secret, "[REDACTED]");
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .slice(0, 900);
}

function safeError(error) {
  return redact(error?.message || error) || "UNKNOWN_VOICE_TTS_SMOKE_ERROR";
}

function sameList(left, right) {
  const a = [...left].map(text).filter(Boolean).sort();
  const b = [...right].map(text).filter(Boolean).sort();
  return JSON.stringify(a) === JSON.stringify(b);
}

function normalizeListResponse(value, candidateKeys = [], depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 4) return null;
  for (const key of [...candidateKeys, "data", "items", "results"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const normalized = normalizeListResponse(value[key], candidateKeys, depth + 1);
    if (normalized) return normalized;
  }
  return null;
}

function normalizeEnv(value) {
  return Object.fromEntries(
    Object.entries(object(value)).map(([key, child]) => [String(key), String(child ?? "")]),
  );
}

function healthSummary(body = {}) {
  const jobs = object(body.jobs);
  const workers = object(body.workers);
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

function safeEndpoint(endpoint = {}) {
  return {
    id: text(endpoint.id) || null,
    name: text(endpoint.name) || null,
    version: finite(endpoint.version),
    template_id: text(endpoint.templateId || endpoint.template?.id) || null,
    min_cuda_version: text(endpoint.minCudaVersion) || null,
    gpu_type_ids: list(endpoint.gpuTypeIds).map(text).filter(Boolean),
    workers_min: finite(endpoint.workersMin),
    workers_max: finite(endpoint.workersMax),
    idle_timeout_seconds: finite(endpoint.idleTimeout),
    workers: list(endpoint.workers).map((worker) => ({
      id: text(worker?.id) || null,
      status: text(worker?.status) || null,
      desired_status: text(worker?.desiredStatus ?? worker?.desired_status) || null,
      gpu_type_id: text(worker?.gpuTypeId ?? worker?.gpu_type_id) || null,
      image: text(worker?.imageName ?? worker?.image_name ?? worker?.image) || null,
    })),
  };
}

function safeTemplate(template = {}) {
  return {
    id: text(template.id) || null,
    name: text(template.name) || null,
    image_name: text(template.imageName) || null,
    registry_auth_configured: Boolean(text(template.containerRegistryAuthId)),
  };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(Math.max(1000, Number(options.timeoutMs || 30000))),
  });
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = redact(body?.message || body?.error || body?.detail || raw);
    throw new Error(`RUNPOD_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body || {};
}

async function rest(pathname, apiKey, options = {}) {
  return fetchJson(`${REST_BASE}${pathname}`, { ...options, apiKey });
}

async function queue(endpointId, pathname, apiKey, options = {}) {
  return fetchJson(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}${pathname}`, { ...options, apiKey });
}

async function readStorageJson(path) {
  try {
    const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(path);
    if (error || !data) return null;
    return JSON.parse(await data.text());
  } catch {
    return null;
  }
}

async function writeStorageJson(path, value, upsert = true) {
  const payload = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, payload, {
    contentType: "application/json",
    cacheControl: "0",
    upsert,
  });
  if (error) throw new Error(`VOICE_TTS_SMOKE_STORAGE_WRITE_FAILED:${error.message}`);
}

async function acquireLock() {
  const payload = {
    contract: CONTRACT,
    phase: "PRE_SUBMISSION",
    created_at: new Date().toISOString(),
    certified_image_digest: CERTIFIED_IMAGE_DIGEST,
    exactly_one_generation_allowed: true,
    generation_submitted: false,
    stt_submitted: false,
  };
  try {
    await writeStorageJson(LOCK_PATH, payload, false);
    return { acquired: true, lock: payload };
  } catch (error) {
    const existing = await readStorageJson(LOCK_PATH);
    if (existing) return { acquired: false, lock: existing };
    throw error;
  }
}

function templateUpdateBody(template, imageName) {
  const registryAuthId = text(template.containerRegistryAuthId);
  if (!registryAuthId) throw new Error("AVANTIQO_VOICE_TTS_GHCR_REGISTRY_AUTH_REQUIRED");
  const name = text(template.name);
  if (!name) throw new Error("AVANTIQO_VOICE_TTS_TEMPLATE_NAME_REQUIRED");
  return {
    containerDiskInGb: Math.max(1, finite(template.containerDiskInGb, 30)),
    containerRegistryAuthId: registryAuthId,
    dockerEntrypoint: list(template.dockerEntrypoint),
    dockerStartCmd: list(template.dockerStartCmd),
    env: normalizeEnv(template.env),
    imageName,
    isPublic: template.isPublic === true,
    name,
    ports: list(template.ports),
    readme: text(template.readme),
    volumeInGb: Math.max(0, finite(template.volumeInGb, 0)),
    volumeMountPath: text(template.volumeMountPath) || "/workspace",
  };
}

async function endpointBoundTemplates(apiKey) {
  const raw = await rest(
    "/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false",
    apiKey,
  );
  const templates = normalizeListResponse(raw, ["templates"]);
  if (!templates) throw new Error("RUNPOD_TEMPLATE_LIST_INVALID");
  return templates;
}

async function allEndpoints(apiKey) {
  const raw = await rest("/endpoints?includeTemplate=true&includeWorkers=true", apiKey);
  const endpoints = normalizeListResponse(raw, ["endpoints", "serverlessEndpoints"]);
  if (!endpoints) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");
  return endpoints;
}

async function resolveEndpoint(apiKey) {
  const configuredId = text(process.env.RUNPOD_AVANTIQO_VOICE_TTS_ENDPOINT_ID);
  if (configuredId) {
    const endpoint = await rest(
      `/endpoints/${encodeURIComponent(configuredId)}?includeTemplate=true&includeWorkers=true`,
      apiKey,
    );
    if (text(endpoint.id) !== configuredId || text(endpoint.name) !== ENDPOINT_NAME) {
      throw new Error("AVANTIQO_VOICE_TTS_ENDPOINT_BINDING_MISMATCH");
    }
    return endpoint;
  }
  const endpoints = await allEndpoints(apiKey);
  const matches = endpoints.filter((endpoint) => text(endpoint?.name) === ENDPOINT_NAME);
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_VOICE_TTS_ENDPOINT_RESOLUTION_FAILED:matches=${matches.length}`);
  }
  return rest(
    `/endpoints/${encodeURIComponent(text(matches[0].id))}?includeTemplate=true&includeWorkers=true`,
    apiKey,
  );
}

async function resolveTemplate(endpoint, apiKey) {
  const templateId = text(endpoint?.templateId || endpoint?.template?.id);
  if (!templateId) throw new Error("AVANTIQO_VOICE_TTS_TEMPLATE_ID_REQUIRED");
  const templates = await endpointBoundTemplates(apiKey);
  const matches = templates.filter((template) => text(template?.id) === templateId);
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_VOICE_TTS_TEMPLATE_RESOLUTION_FAILED:matches=${matches.length}`);
  }
  return matches[0];
}

async function assertTemplateExclusive(endpoint, apiKey) {
  const templateId = text(endpoint?.templateId || endpoint?.template?.id);
  const endpoints = await allEndpoints(apiKey);
  const consumers = endpoints.filter(
    (candidate) => text(candidate?.templateId || candidate?.template?.id) === templateId,
  );
  if (consumers.length !== 1 || text(consumers[0]?.id) !== text(endpoint.id)) {
    throw new Error(`AVANTIQO_VOICE_TTS_SHARED_TEMPLATE_BLOCKED:consumers=${consumers.length}`);
  }
}

function assertQuiescent(health) {
  if (
    health.jobs.in_queue > 0 ||
    health.jobs.in_progress > 0 ||
    health.workers.running > 0 ||
    health.workers.throttled > 0
  ) {
    throw new Error(`AVANTIQO_VOICE_TTS_ENDPOINT_NOT_QUIESCENT:${JSON.stringify(health)}`);
  }
}

function drained(endpoint) {
  const workers = list(endpoint?.workers);
  return workers.length === 0 || workers.every(
    (worker) => text(worker?.desiredStatus ?? worker?.desired_status).toUpperCase() === "EXITED",
  );
}

async function waitForDrain(endpointId, apiKey) {
  const deadline = Date.now() + 90000;
  let endpoint = null;
  while (Date.now() < deadline) {
    endpoint = await rest(
      `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
      apiKey,
    );
    if (drained(endpoint)) return endpoint;
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
  throw new Error(`AVANTIQO_VOICE_TTS_WORKER_DRAIN_TIMEOUT:${safeEndpoint(endpoint).workers.length}`);
}

async function currentState(apiKey) {
  const endpoint = await resolveEndpoint(apiKey);
  const template = await resolveTemplate(endpoint, apiKey);
  const health = healthSummary(await queue(text(endpoint.id), "/health", apiKey));
  return { endpoint, template, health };
}

function preparedState(state) {
  return Boolean(
    text(state.template?.imageName) === CERTIFIED_IMAGE &&
    text(state.endpoint?.minCudaVersion) === REQUIRED_CUDA &&
    sameList(list(state.endpoint?.gpuTypeIds), BLACKWELL_GPU_TYPE_IDS) &&
    finite(state.endpoint?.workersMin, -1) === 0 &&
    finite(state.endpoint?.workersMax, -1) === 1 &&
    finite(state.endpoint?.idleTimeout, -1) === IDLE_TIMEOUT_SECONDS
  );
}

async function prepare(apiKey) {
  let state = await currentState(apiKey);
  await assertTemplateExclusive(state.endpoint, apiKey);
  assertQuiescent(state.health);

  const endpointId = text(state.endpoint.id);
  await rest(`/endpoints/${encodeURIComponent(endpointId)}`, apiKey, {
    method: "PATCH",
    body: {
      workersMin: 0,
      workersMax: 0,
      minCudaVersion: REQUIRED_CUDA,
      gpuTypeIds: BLACKWELL_GPU_TYPE_IDS,
      idleTimeout: IDLE_TIMEOUT_SECONDS,
    },
  });
  await waitForDrain(endpointId, apiKey);

  state = await currentState(apiKey);
  await assertTemplateExclusive(state.endpoint, apiKey);
  assertQuiescent(state.health);
  if (text(state.template.imageName) !== CERTIFIED_IMAGE) {
    await rest(`/templates/${encodeURIComponent(text(state.template.id))}/update`, apiKey, {
      method: "POST",
      body: templateUpdateBody(state.template, CERTIFIED_IMAGE),
    });
  }

  await rest(`/endpoints/${encodeURIComponent(endpointId)}`, apiKey, {
    method: "PATCH",
    body: {
      workersMin: 0,
      workersMax: 1,
      minCudaVersion: REQUIRED_CUDA,
      gpuTypeIds: BLACKWELL_GPU_TYPE_IDS,
      idleTimeout: IDLE_TIMEOUT_SECONDS,
    },
  });

  state = await currentState(apiKey);
  await assertTemplateExclusive(state.endpoint, apiKey);
  assertQuiescent(state.health);
  if (!preparedState(state)) {
    throw new Error("AVANTIQO_VOICE_TTS_BLACKWELL_PREPARE_VERIFY_FAILED");
  }

  return {
    success: true,
    contract: CONTRACT,
    action: "prepare",
    endpoint: safeEndpoint(state.endpoint),
    template: safeTemplate(state.template),
    health: state.health,
    certified_image: CERTIFIED_IMAGE,
    certified_image_digest: CERTIFIED_IMAGE_DIGEST,
    blackwell_sm120_compiled: true,
    required_cuda: REQUIRED_CUDA,
    required_gpu_type_ids: BLACKWELL_GPU_TYPE_IDS,
    generation_submitted: false,
    stt_submitted: false,
    production_deploy_performed: false,
    pricing_activation_performed: false,
    provider_selection_changed: false,
    secrets_exported: false,
  };
}

async function submitOne(apiKey) {
  const existingResult = await readStorageJson(RESULT_PATH);
  if (existingResult) {
    return { success: true, cached: true, result: existingResult };
  }
  const existingLock = await readStorageJson(LOCK_PATH);
  if (existingLock) {
    return {
      success: true,
      cached: true,
      contract: CONTRACT,
      lock: existingLock,
      exactly_one_generation_submitted: existingLock.generation_submitted === true,
      stt_submitted: false,
    };
  }

  const state = await currentState(apiKey);
  await assertTemplateExclusive(state.endpoint, apiKey);
  assertQuiescent(state.health);
  if (!preparedState(state)) {
    throw new Error("AVANTIQO_VOICE_TTS_BLACKWELL_PREPARE_REQUIRED");
  }

  const lockAttempt = await acquireLock();
  if (!lockAttempt.acquired) {
    return { success: true, cached: true, contract: CONTRACT, lock: lockAttempt.lock };
  }

  const endpointId = text(state.endpoint.id);
  let body;
  try {
    body = await queue(endpointId, "/run", apiKey, {
      method: "POST",
      timeoutMs: 15000,
      body: {
        input: {
          contract: ENGINE_CONTRACT,
          capability: "ai.text.to.speech",
          foundation_model: FOUNDATION_MODEL,
          organization_id: "benchmark-only",
          usage_id: `voice-tts-blackwell-smoke-${Date.now()}`,
          workload: {
            text: "Avantiqo voice generator is working and ready.",
            language: "en",
            voice: null,
            response_format: "wav",
          },
        },
      },
    });
  } catch (error) {
    await writeStorageJson(LOCK_PATH, {
      ...lockAttempt.lock,
      phase: "SUBMISSION_FAILED_OR_AMBIGUOUS",
      updated_at: new Date().toISOString(),
      error: safeError(error),
      generation_submitted: false,
      retry_allowed: false,
    });
    throw error;
  }

  const jobId = text(body.id);
  if (!jobId) {
    await writeStorageJson(LOCK_PATH, {
      ...lockAttempt.lock,
      phase: "SUBMISSION_RESPONSE_INVALID",
      updated_at: new Date().toISOString(),
      generation_submitted: true,
      retry_allowed: false,
    });
    throw new Error("RUNPOD_JOB_ID_REQUIRED");
  }

  const lock = {
    ...lockAttempt.lock,
    phase: "SUBMITTED",
    updated_at: new Date().toISOString(),
    endpoint_id: endpointId,
    endpoint_name: ENDPOINT_NAME,
    job_id: jobId,
    generation_submitted: true,
    exactly_one_generation_submitted: true,
    stt_submitted: false,
    retry_allowed: false,
    certified_image: CERTIFIED_IMAGE,
    required_cuda: REQUIRED_CUDA,
    required_gpu_type_ids: BLACKWELL_GPU_TYPE_IDS,
  };
  await writeStorageJson(LOCK_PATH, lock);

  return {
    success: true,
    cached: false,
    contract: CONTRACT,
    status: "SUBMITTED",
    job_id: jobId,
    exactly_one_generation_submitted: true,
    stt_submitted: false,
    production_deploy_performed: false,
    pricing_activation_performed: false,
    provider_selection_changed: false,
    secrets_exported: false,
  };
}

async function readStatus(apiKey) {
  const existingResult = await readStorageJson(RESULT_PATH);
  if (existingResult) return { success: true, cached: true, result: existingResult };

  const lock = await readStorageJson(LOCK_PATH);
  if (!lock) {
    return { success: true, cached: false, contract: CONTRACT, status: "NOT_SUBMITTED" };
  }
  const jobId = text(lock.job_id);
  const endpointId = text(lock.endpoint_id);
  if (!jobId || !endpointId) {
    return {
      success: false,
      contract: CONTRACT,
      status: text(lock.phase) || "LOCKED_WITHOUT_JOB_ID",
      lock,
      retry_allowed: false,
    };
  }

  const body = await queue(endpointId, `/status/${encodeURIComponent(jobId)}`, apiKey);
  const status = text(body.status).toUpperCase() || "UNKNOWN";
  if (!["COMPLETED", "FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(status)) {
    return {
      success: true,
      cached: false,
      contract: CONTRACT,
      status,
      job_id: jobId,
      exactly_one_generation_submitted: true,
      stt_submitted: false,
    };
  }

  if (status !== "COMPLETED") {
    const result = {
      success: false,
      contract: CONTRACT,
      completed_at: new Date().toISOString(),
      status,
      job_id: jobId,
      error: redact(body?.error || body?.message) || null,
      exactly_one_generation_submitted: true,
      stt_submitted: false,
      retry_allowed: false,
      production_deploy_performed: false,
      pricing_activation_performed: false,
      provider_selection_changed: false,
      secrets_exported: false,
    };
    await writeStorageJson(RESULT_PATH, result);
    return { success: true, cached: false, result };
  }

  const output = object(body.output);
  const audio = Buffer.from(text(output.audio_base64), "base64");
  const wavHeader = audio.subarray(0, 4).toString("ascii");
  const outputContract = text(output.contract || output.engine_contract);
  const capability = text(output.capability);
  const foundationModel = text(output.foundation_model) || FOUNDATION_MODEL;
  const passed =
    audio.length > 1000 &&
    wavHeader === "RIFF" &&
    text(output.format).toLowerCase() === "wav" &&
    capability === "ai.text.to.speech" &&
    foundationModel === FOUNDATION_MODEL &&
    output.voice_cloning_used === false &&
    output.raw_reasoning_persisted === false &&
    (!outputContract || outputContract === ENGINE_CONTRACT);

  const { error: audioError } = await supabaseAdmin.storage.from(BUCKET).upload(AUDIO_PATH, audio, {
    contentType: "audio/wav",
    cacheControl: "3600",
    upsert: true,
  });
  if (audioError) throw new Error(`VOICE_TTS_SMOKE_AUDIO_WRITE_FAILED:${audioError.message}`);
  const { data: signed, error: signedError } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(AUDIO_PATH, 86400);
  if (signedError) throw new Error(`VOICE_TTS_SMOKE_AUDIO_SIGN_FAILED:${signedError.message}`);

  const finalState = await currentState(apiKey);
  const endpointPrepared = preparedState(finalState);
  const result = {
    success: passed && endpointPrepared,
    contract: CONTRACT,
    completed_at: new Date().toISOString(),
    status,
    job_id: jobId,
    exactly_one_generation_submitted: true,
    stt_submitted: false,
    engine_contract: outputContract || ENGINE_CONTRACT,
    capability: capability || null,
    foundation_model: foundationModel,
    model: text(output.model) || null,
    format: text(output.format).toLowerCase() || null,
    audio_bytes: audio.length,
    wav_header: wavHeader,
    sample_rate: finite(output.sample_rate),
    worker_generation_seconds: finite(output.generation_seconds),
    voice_profile: text(output.voice_profile) || null,
    voice_cloning_used: output.voice_cloning_used === true,
    raw_reasoning_persisted: output.raw_reasoning_persisted === true,
    audio_url: signed?.signedUrl || null,
    certified_image: CERTIFIED_IMAGE,
    certified_image_digest: CERTIFIED_IMAGE_DIGEST,
    blackwell_sm120_compiled: true,
    required_cuda: REQUIRED_CUDA,
    required_gpu_type_ids: BLACKWELL_GPU_TYPE_IDS,
    endpoint_blackwell_restricted: endpointPrepared,
    endpoint: safeEndpoint(finalState.endpoint),
    template: safeTemplate(finalState.template),
    health_after: finalState.health,
    production_deploy_performed: false,
    pricing_activation_performed: false,
    provider_selection_changed: false,
    secrets_exported: false,
  };
  await writeStorageJson(RESULT_PATH, result);
  return { success: true, cached: false, result };
}

export async function GET(request) {
  const url = new URL(request.url);
  if (url.searchParams.get("token") !== TOKEN) return json({ success: false }, 404);

  const action = text(url.searchParams.get("action")) || "readiness";
  const apiKey = text(process.env.RUNPOD_API_KEY);
  if (action === "readiness") {
    return json({
      success: true,
      contract: CONTRACT,
      action,
      runpod_api_key_configured: Boolean(apiKey),
      endpoint_id_env_configured: Boolean(text(process.env.RUNPOD_AVANTIQO_VOICE_TTS_ENDPOINT_ID)),
      endpoint_name_resolution_supported: true,
      certified_image: CERTIFIED_IMAGE,
      certified_image_digest: CERTIFIED_IMAGE_DIGEST,
      blackwell_sm120_compiled: true,
      required_cuda: REQUIRED_CUDA,
      required_gpu_type_ids: BLACKWELL_GPU_TYPE_IDS,
      exactly_one_generation_allowed: true,
      stt_submitted: false,
      production_deploy_performed: false,
      pricing_activation_performed: false,
      provider_selection_changed: false,
      secrets_exported: false,
    });
  }

  if (!apiKey) {
    return json({
      success: false,
      contract: CONTRACT,
      status: "BLOCKED",
      blocker: "RUNPOD_API_KEY_NOT_CONFIGURED",
      generation_submitted: false,
      stt_submitted: false,
    }, 409);
  }

  try {
    if (action === "prepare") return json(await prepare(apiKey));
    if (action === "run") return json(await submitOne(apiKey));
    if (action === "status") return json(await readStatus(apiKey));
    if (action === "result") {
      return json({ success: true, contract: CONTRACT, result: await readStorageJson(RESULT_PATH) });
    }
    return json({ success: false, contract: CONTRACT, error: "ACTION_UNSUPPORTED" }, 400);
  } catch (error) {
    return json({
      success: false,
      contract: CONTRACT,
      action,
      error: safeError(error),
      exactly_one_generation_submitted: Boolean((await readStorageJson(LOCK_PATH))?.generation_submitted),
      stt_submitted: false,
      production_deploy_performed: false,
      pricing_activation_performed: false,
      provider_selection_changed: false,
      secrets_exported: false,
    }, 500);
  }
}
