import crypto from "node:crypto";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const CODE_AI_WORKER_SESSION_CONTRACT =
  "AVANTIQO_CODE_AI_WORKER_SESSION_V2";

const MEMORY_TABLE = "intelligence_memories";
const MEMORY_SCOPE = "code_ai_worker_session";
const MEMORY_KEY = "code_ai_worker_session:v2:shared";
const MEMORY_SOURCE = "code_ai_worker_session_runtime";
const ENDPOINT_ID = "r79dtnjnrilrlc";
const ENDPOINT_NAME = "avantiqo-code-v1";
const NETWORK_VOLUME_ID = "7obluigbr0";
const NETWORK_VOLUME_NAME = "avantiqo-shared-intelligence-code-cache";
const DATA_CENTER_ID = "US-CA-2";
const IMAGE =
  "ghcr.io/churchillkaron/avantiqo-code-pod@sha256:1b6ac20925085104ac00c09dde3073e32e5934543bd16b9a346b2dca3fa7bb27";
const REST = "https://rest.runpod.io/v1";
const POD_HTTP_CONTRACT = "AVANTIQO_CODE_POD_HTTP_V3";
const POD_ENGINE_CONTRACT = "AVANTIQO_CODE_ENGINE_V1";
const POD_ENGINE_MODEL = "avantiqo-code-v1";
const POD_ENGINE_WARMUP_CAPABILITY = "ai.code.debug";
const POD_ENGINE_WARMUP_SUBMIT_PATH = "/v3/generations";
const POD_ENGINE_WARMUP_STATUS_PATH = "/v3/generations/{job_id}";
const GPU_TYPE_IDS = Object.freeze([
  "NVIDIA H100 80GB HBM3",
  "NVIDIA H200",
  "NVIDIA B200",
]);
const ALLOWED_CUDA_VERSIONS = Object.freeze(["12.8", "12.9", "13.0"]);
const DEFAULT_IDLE_MS = 10 * 60 * 1000;
const MAX_IDLE_MS = 30 * 60 * 1000;
const STARTING_STALE_MS = 2 * 60 * 1000;
const HEALTH_TIMEOUT_MS = 2500;
const POD_CONTROL_TIMEOUT_MS = 30_000;
const CLAIM_ATTEMPTS = 4;
const DELETE_VERIFY_ATTEMPTS = 6;
const DELETE_VERIFY_DELAY_MS = 1500;
const TERMINAL_POD = new Set(["EXITED", "STOPPED", "TERMINATED", "DELETED"]);

function text(value, maximum = 4000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function boundedIdleMs(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_IDLE_MS;
  return Math.max(60_000, Math.min(MAX_IDLE_MS, Math.trunc(parsed)));
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function controlOrganizationId() {
  return required("AVANTIQO_CODE_WORKER_CONTROL_ORGANIZATION_ID");
}

function managementKey() {
  return text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
}

function sessionSecret() {
  const secret = required("AVANTIQO_CODE_WORKER_SESSION_SECRET");
  if (secret.length < 32) {
    throw new Error("AVANTIQO_CODE_WORKER_SESSION_SECRET_MIN_32_CHARS_REQUIRED");
  }
  return secret;
}

function tokenForSession(sessionId) {
  return crypto
    .createHmac("sha256", sessionSecret())
    .update(`avantiqo-code-worker:${sessionId}`, "utf8")
    .digest("hex");
}

function sessionFromRow(row) {
  const session = object(object(row?.metadata).session);
  return Object.keys(session).length
    ? { ...session, row_id: row.id, row_updated_at: row.updated_at }
    : null;
}

function activeState(session) {
  return new Set(["STARTING", "READY", "CLEANUP_REQUIRED"]).has(
    text(session?.state).toUpperCase(),
  );
}

function reusableState(session) {
  return new Set(["STARTING", "READY"]).has(text(session?.state).toUpperCase());
}

function expired(session, nowMs = Date.now()) {
  const expiresAt = Date.parse(text(session?.expires_at));
  return !Number.isFinite(expiresAt) || expiresAt <= nowMs;
}

async function loadControlRow() {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,organization_id,memory_scope,memory_key,metadata,active,updated_at")
    .eq("organization_id", controlOrganizationId())
    .eq("memory_scope", MEMORY_SCOPE)
    .eq("memory_key", MEMORY_KEY)
    .eq("active", true)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

function memoryRecord(session, existing = null) {
  const now = new Date().toISOString();
  return {
    organization_id: controlOrganizationId(),
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: MEMORY_SCOPE,
    memory_key: MEMORY_KEY,
    memory_type: "fact",
    subject: "Code AI Shared Worker Session",
    content:
      "Server-owned Code worker control state. It is excluded from ordinary Intelligence recall and contains no Pod bearer token.",
    importance: 0.05,
    confidence: 1,
    source: MEMORY_SOURCE,
    active: true,
    metadata: {
      ...object(existing?.metadata),
      contract: CODE_AI_WORKER_SESSION_CONTRACT,
      session,
      ordinary_memory_recall: false,
      authorization_effect: "NONE",
      contains_worker_token: false,
    },
    updated_at: now,
  };
}

async function insertClaim(session) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .insert(memoryRecord(session))
    .select("id,metadata,updated_at")
    .maybeSingle();
  if (!result.error && result.data?.id) return result.data;
  if (result.error?.code === "23505") return null;
  if (result.error) throw result.error;
  return null;
}

async function compareAndSwap(row, session) {
  const update = memoryRecord(session, row);
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .update({
      content: update.content,
      metadata: update.metadata,
      updated_at: update.updated_at,
    })
    .eq("id", row.id)
    .eq("updated_at", row.updated_at)
    .select("id,metadata,updated_at")
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

async function rest(pathname, options = {}) {
  const key = managementKey();
  if (!key) throw new Error("RUNPOD_MANAGEMENT_API_KEY_REQUIRED");
  const response = await fetch(`${REST}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeout_ms || 30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (options.allow404 && response.status === 404) return null;
  if (!response.ok) {
    throw new Error(
      `CODE_AI_WORKER_SESSION_RUNPOD_HTTP_${response.status}:${text(body?.message || body?.error || raw, 700) || "UNKNOWN"}`,
    );
  }
  return body || {};
}

function podList(raw) {
  return Array.isArray(raw) ? raw : list(raw?.data || raw?.items || raw?.results || raw?.pods);
}

function podVolumeId(pod) {
  return text(pod?.networkVolume?.id || pod?.networkVolumeId);
}

function activePod(pod) {
  const desired = text(pod?.desiredStatus ?? pod?.desired_status).toUpperCase();
  const status = text(pod?.status ?? pod?.runtimeStatus).toUpperCase();
  return !TERMINAL_POD.has(desired || status);
}

async function assertNoForeignCodePod(sessionId = null) {
  const raw = await rest("/pods?computeType=GPU&includeMachine=true&includeNetworkVolume=true");
  const foreign = podList(raw).filter((pod) => {
    if (!activePod(pod)) return false;
    if (podVolumeId(pod) !== NETWORK_VOLUME_ID) return false;
    const name = text(pod?.name);
    if (sessionId && name === `avantiqo-code-session-${sessionId.slice(0, 8)}`) return false;
    return true;
  });
  if (foreign.length) throw new Error("CODE_AI_WORKER_SESSION_SHARED_VOLUME_BUSY");
}

async function createPod(session) {
  await assertNoForeignCodePod(session.session_id);
  const token = tokenForSession(session.session_id);
  const body = await rest("/pods", {
    method: "POST",
    timeout_ms: 60_000,
    body: {
      allowedCudaVersions: ALLOWED_CUDA_VERSIONS,
      cloudType: "SECURE",
      computeType: "GPU",
      containerDiskInGb: 50,
      dataCenterIds: [DATA_CENTER_ID],
      dataCenterPriority: "availability",
      env: { AVANTIQO_CODE_POD_TOKEN: token },
      gpuCount: 1,
      gpuTypeIds: GPU_TYPE_IDS,
      gpuTypePriority: "availability",
      imageName: IMAGE,
      interruptible: false,
      locked: false,
      name: `avantiqo-code-session-${session.session_id.slice(0, 8)}`,
      networkVolumeId: NETWORK_VOLUME_ID,
      ports: ["8000/http"],
      supportPublicIp: true,
      volumeMountPath: "/workspace",
    },
  });
  const podId = text(body?.id);
  if (!podId) throw new Error("CODE_AI_WORKER_SESSION_POD_ID_REQUIRED");
  return {
    pod_id: podId,
    pod_base_url: `https://${podId}-8000.proxy.runpod.net`,
  };
}

async function verifyPodDeleted(podId) {
  if (!text(podId)) return true;
  for (let attempt = 0; attempt < DELETE_VERIFY_ATTEMPTS; attempt += 1) {
    const pod = await rest(`/pods/${encodeURIComponent(text(podId))}`, {
      allow404: true,
      timeout_ms: 15_000,
    });
    if (!pod) return true;
    if (TERMINAL_POD.has(text(pod?.desiredStatus ?? pod?.status).toUpperCase())) return true;
    if (attempt < DELETE_VERIFY_ATTEMPTS - 1) await sleep(DELETE_VERIFY_DELAY_MS);
  }
  return false;
}

async function deletePodVerified(podId) {
  if (!text(podId)) return { deleted: true, pod_id: null };
  await rest(`/pods/${encodeURIComponent(text(podId))}`, {
    method: "DELETE",
    allow404: true,
  });
  if (!(await verifyPodDeleted(podId))) {
    throw new Error(`CODE_AI_WORKER_SESSION_POD_DELETE_NOT_VERIFIED:${text(podId)}`);
  }
  return { deleted: true, pod_id: text(podId) };
}

async function podHttp(session, pathname, options = {}) {
  const baseUrl = text(session?.pod_base_url).replace(/\/+$/, "");
  if (!baseUrl) throw new Error("CODE_AI_WORKER_SESSION_POD_BASE_URL_REQUIRED");
  const token = tokenForSession(session.session_id);
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeout_ms || POD_CONTROL_TIMEOUT_MS),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (options.allow404 && response.status === 404) {
    return { missing: true, status_code: 404, body };
  }
  if (options.allow409 && response.status === 409) {
    return { conflict: true, status_code: 409, body };
  }
  if (!response.ok) {
    throw new Error(
      `CODE_AI_WORKER_SESSION_POD_HTTP_${response.status}:${text(body?.detail || body?.error_message || body?.message || raw, 700) || "UNKNOWN"}`,
    );
  }
  if (
    body?.contract !== POD_HTTP_CONTRACT ||
    body?.transport !== "pod-http" ||
    body?.raw_reasoning_persisted !== false
  ) {
    throw new Error("CODE_AI_WORKER_SESSION_POD_HTTP_CONTRACT_INVALID");
  }
  return { status_code: response.status, body };
}

async function health(session) {
  const baseUrl = text(session?.pod_base_url);
  if (!baseUrl) {
    return {
      ready: false,
      transport_ready: false,
      engine_loaded: false,
      reason: "POD_URL_PENDING",
    };
  }
  try {
    const response = await fetch(`${baseUrl}/health`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    if (!response.ok) {
      return {
        ready: false,
        transport_ready: false,
        engine_loaded: false,
        reason: `HTTP_${response.status}`,
      };
    }
    const body = await response.json().catch(() => null);
    const transportReady = Boolean(
      body?.success === true &&
      body?.contract === POD_HTTP_CONTRACT &&
      body?.transport === "pod-http" &&
      body?.cached_model_found === true &&
      body?.async_jobs_enabled === true &&
      body?.async_submit_path === POD_ENGINE_WARMUP_SUBMIT_PATH &&
      body?.async_status_path_template === POD_ENGINE_WARMUP_STATUS_PATH &&
      body?.raw_reasoning_persisted === false,
    );
    const engineLoaded = transportReady && body?.engine_loaded === true;
    return {
      ready: transportReady && engineLoaded,
      transport_ready: transportReady,
      engine_loaded: engineLoaded,
      cached_model_found: body?.cached_model_found === true,
      jobs_queued: Number(body?.jobs_queued || 0),
      jobs_running: Number(body?.jobs_running || 0),
      reason: transportReady
        ? (engineLoaded ? null : "MODEL_ENGINE_NOT_LOADED")
        : "HEALTH_CONTRACT_NOT_READY",
    };
  } catch (error) {
    return {
      ready: false,
      transport_ready: false,
      engine_loaded: false,
      reason: text(error?.name || error?.message, 120) || "HEALTH_PENDING",
    };
  }
}

function engineWarmupJobId(session) {
  return `worker-warmup-${text(session?.session_id, 120)}`;
}

function engineWarmupUsageId(session) {
  return `worker-warmup-${text(session?.session_id, 120)}`;
}

async function submitEngineWarmup(session) {
  const jobId = engineWarmupJobId(session);
  const result = await podHttp(session, POD_ENGINE_WARMUP_SUBMIT_PATH, {
    method: "POST",
    allow404: true,
    allow409: true,
    body: {
      id: jobId,
      input: {
        contract: POD_ENGINE_CONTRACT,
        capability: POD_ENGINE_WARMUP_CAPABILITY,
        model: POD_ENGINE_MODEL,
        instruction: "Return exactly READY and nothing else.",
        structured_specification: {
          infrastructure_warmup: true,
          customer_work: false,
          authorization_effect: "NONE",
          wallet_mutation_performed: false,
          service_runtime_provider_execution_performed: false,
          reasoning_call_consumed: false,
          raw_reasoning_persisted: false,
        },
        organization_id: "benchmark-only",
        usage_id: engineWarmupUsageId(session),
      },
    },
  });
  if (result.missing) {
    return {
      job_id: null,
      status: "ROUTE_PENDING",
      already_submitted: false,
      route_pending: true,
    };
  }
  if (result.conflict) {
    return {
      job_id: jobId,
      status: "EXISTING",
      already_submitted: true,
      route_pending: false,
    };
  }
  const acceptedId = text(result.body?.job_id);
  if (!acceptedId || acceptedId !== jobId) {
    throw new Error("CODE_AI_WORKER_SESSION_ENGINE_WARMUP_JOB_ID_INVALID");
  }
  return {
    job_id: acceptedId,
    status: text(result.body?.status, 80).toUpperCase() || "QUEUED",
    already_submitted: false,
    route_pending: false,
  };
}

async function engineWarmupStatus(session, jobId) {
  const result = await podHttp(
    session,
    POD_ENGINE_WARMUP_STATUS_PATH.replace("{job_id}", encodeURIComponent(jobId)),
    { allow404: true },
  );
  if (result.missing) return { status: "MISSING" };
  const body = object(result.body);
  return {
    status: text(body.status, 80).toUpperCase() || "UNKNOWN",
    error_type: text(body.error_type, 200) || null,
    output_status: text(body?.output?.status, 200).toLowerCase() || null,
  };
}

function warmingResult(session, readiness, reason) {
  return {
    contract: CODE_AI_WORKER_SESSION_CONTRACT,
    ready: false,
    state: session.state,
    session_id: session.session_id,
    pod_id_present: Boolean(session.pod_id),
    warming: true,
    reason,
    transport_ready: readiness?.transport_ready === true,
    cached_model_found: readiness?.cached_model_found === true,
    engine_loaded: readiness?.engine_loaded === true,
    engine_warmup_job_present: Boolean(session.engine_warmup_job_id),
    engine_warmup_status: text(session.engine_warmup_status, 80) || null,
    reasoning_call_consumed_by_warmup: false,
    wallet_mutation_performed_by_warmup: false,
    expires_at: session.expires_at,
    idle_ms: session.idle_ms,
    contains_worker_token: false,
  };
}

function newSession(idleMs) {
  const now = new Date();
  return {
    contract: CODE_AI_WORKER_SESSION_CONTRACT,
    session_id: crypto.randomUUID(),
    owner_request_id: crypto.randomUUID(),
    endpoint_id: ENDPOINT_ID,
    endpoint_name: ENDPOINT_NAME,
    network_volume_id: NETWORK_VOLUME_ID,
    network_volume_name: NETWORK_VOLUME_NAME,
    image_digest: IMAGE.split("@")[1],
    state: "STARTING",
    pod_id: null,
    pod_base_url: null,
    engine_ready: false,
    engine_warmup_job_id: null,
    engine_warmup_status: null,
    engine_warmup_started_at: null,
    engine_warmup_completed_at: null,
    created_at: now.toISOString(),
    last_activity_at: now.toISOString(),
    expires_at: new Date(now.getTime() + idleMs).toISOString(),
    idle_ms: idleMs,
    contains_worker_token: false,
  };
}

async function claimSession(idleMs) {
  for (let attempt = 0; attempt < CLAIM_ATTEMPTS; attempt += 1) {
    const row = await loadControlRow();
    if (!row) {
      const session = newSession(idleMs);
      const inserted = await insertClaim(session);
      if (inserted) return { row: inserted, session, claimed: true };
      continue;
    }

    const current = sessionFromRow(row);
    if (current?.state === "CLEANUP_REQUIRED") {
      throw new Error("CODE_AI_WORKER_SESSION_CLEANUP_REQUIRED");
    }
    if (current && reusableState(current) && !expired(current)) {
      return { row, session: current, claimed: false };
    }
    if (current && activeState(current) && expired(current)) {
      throw new Error("CODE_AI_WORKER_SESSION_EXPIRED_REQUIRES_REAP");
    }

    const session = newSession(idleMs);
    const updated = await compareAndSwap(row, session);
    if (updated) return { row: updated, session, claimed: true };
  }
  throw new Error("CODE_AI_WORKER_SESSION_CLAIM_RETRY_EXHAUSTED");
}

async function updateSession(row, session) {
  const updated = await compareAndSwap(row, session);
  if (!updated) throw new Error("CODE_AI_WORKER_SESSION_STATE_RACE_RETRY_REQUIRED");
  return updated;
}

async function markCleanupRequired(row, session, reason) {
  const cleanup = {
    ...session,
    state: "CLEANUP_REQUIRED",
    cleanup_required_at: new Date().toISOString(),
    cleanup_reason: text(reason, 500) || "POD_DELETE_NOT_VERIFIED",
  };
  await updateSession(row, cleanup).catch(() => null);
  return cleanup;
}

async function expireSession(row, session, reason) {
  try {
    await deletePodVerified(session?.pod_id);
  } catch (error) {
    await markCleanupRequired(row, session, error?.message || error);
    throw error;
  }
  const expiredSession = {
    ...session,
    state: "EXPIRED",
    expired_at: new Date().toISOString(),
    release_reason: text(reason, 300) || "IDLE_EXPIRED",
    pod_id: null,
    pod_base_url: null,
    engine_ready: false,
  };
  await updateSession(row, expiredSession);
  return expiredSession;
}

async function ensureEngineWarmup(row, session, readiness, idleMs) {
  if (readiness.engine_loaded === true && !text(session.engine_warmup_job_id)) {
    return { row, session, readiness, ready: true };
  }

  let workingRow = row;
  let workingSession = session;
  let jobId = text(workingSession.engine_warmup_job_id, 200);

  if (!jobId) {
    const submitted = await submitEngineWarmup(workingSession);
    if (submitted.route_pending) {
      return {
        row: workingRow,
        session: workingSession,
        readiness,
        ready: false,
        reason: "MODEL_ENGINE_WARMUP_ROUTE_PENDING",
      };
    }
    const now = new Date();
    jobId = submitted.job_id;
    workingSession = {
      ...workingSession,
      state: "STARTING",
      engine_ready: false,
      engine_warmup_job_id: jobId,
      engine_warmup_status: submitted.status,
      engine_warmup_started_at:
        text(workingSession.engine_warmup_started_at) || now.toISOString(),
      last_activity_at: now.toISOString(),
      expires_at: new Date(now.getTime() + idleMs).toISOString(),
    };
    workingRow = await updateSession(workingRow, workingSession);
    workingSession = sessionFromRow(workingRow) || workingSession;
    return {
      row: workingRow,
      session: workingSession,
      readiness,
      ready: false,
      reason: "MODEL_ENGINE_WARMUP_STARTED",
    };
  }

  let status = await engineWarmupStatus(workingSession, jobId);
  if (status.status === "MISSING") {
    const submitted = await submitEngineWarmup(workingSession);
    if (submitted.route_pending) {
      return {
        row: workingRow,
        session: workingSession,
        readiness,
        ready: false,
        reason: "MODEL_ENGINE_WARMUP_ROUTE_PENDING",
      };
    }
    status = { status: submitted.status };
  }

  if (status.status === "FAILED") {
    await expireSession(workingRow, workingSession, "MODEL_ENGINE_WARMUP_FAILED");
    throw new Error(
      `CODE_AI_WORKER_SESSION_ENGINE_WARMUP_FAILED:${status.error_type || "UNKNOWN"}`,
    );
  }

  if (status.status === "SUCCEEDED") {
    const refreshedReadiness = await health(workingSession);
    if (
      status.output_status === "engine_load_failed" ||
      refreshedReadiness.engine_loaded !== true
    ) {
      await expireSession(workingRow, workingSession, "MODEL_ENGINE_WARMUP_ENGINE_NOT_LOADED");
      throw new Error("CODE_AI_WORKER_SESSION_ENGINE_WARMUP_ENGINE_NOT_LOADED");
    }
    const now = new Date();
    workingSession = {
      ...workingSession,
      engine_ready: true,
      engine_warmup_status: "SUCCEEDED",
      engine_warmup_completed_at:
        text(workingSession.engine_warmup_completed_at) || now.toISOString(),
      last_activity_at: now.toISOString(),
      expires_at: new Date(now.getTime() + idleMs).toISOString(),
      idle_ms: idleMs,
    };
    workingRow = await updateSession(workingRow, workingSession);
    workingSession = sessionFromRow(workingRow) || workingSession;
    return {
      row: workingRow,
      session: workingSession,
      readiness: refreshedReadiness,
      ready: true,
    };
  }

  const now = new Date();
  workingSession = {
    ...workingSession,
    state: "STARTING",
    engine_ready: false,
    engine_warmup_status: status.status,
    last_activity_at: now.toISOString(),
    expires_at: new Date(now.getTime() + idleMs).toISOString(),
    idle_ms: idleMs,
  };
  workingRow = await updateSession(workingRow, workingSession);
  workingSession = sessionFromRow(workingRow) || workingSession;
  return {
    row: workingRow,
    session: workingSession,
    readiness,
    ready: false,
    reason: `MODEL_ENGINE_WARMUP_${status.status || "PENDING"}`,
  };
}

export async function reapExpiredCodeAIWorkerSession() {
  const row = await loadControlRow();
  const session = sessionFromRow(row);
  if (!row || !session) return { reaped: false, session_state: null };
  const needsCleanup =
    session.state === "CLEANUP_REQUIRED" ||
    (reusableState(session) && expired(session));
  if (!needsCleanup) {
    return { reaped: false, session_state: session.state || null };
  }
  await expireSession(row, session, session.state === "CLEANUP_REQUIRED" ? "CLEANUP_RETRY" : "IDLE_EXPIRED");
  return { reaped: true, session_state: "EXPIRED" };
}

export async function ensureCodeAIWorkerSession({ idle_ms = DEFAULT_IDLE_MS } = {}) {
  const idleMs = boundedIdleMs(idle_ms);
  await reapExpiredCodeAIWorkerSession();
  const claim = await claimSession(idleMs);
  let { row, session } = claim;

  if (claim.claimed) {
    try {
      const pod = await createPod(session);
      session = {
        ...session,
        ...pod,
        last_activity_at: new Date().toISOString(),
      };
      row = await updateSession(row, session);
    } catch (error) {
      const failed = {
        ...session,
        state: "FAILED",
        failed_at: new Date().toISOString(),
        failure_reason: text(error?.message || error, 500),
      };
      await updateSession(row, failed).catch(() => null);
      throw error;
    }
  }

  if (
    session.state === "STARTING" &&
    !session.pod_id &&
    Date.now() - Date.parse(text(session.created_at)) > STARTING_STALE_MS
  ) {
    const stale = {
      ...session,
      state: "FAILED",
      failed_at: new Date().toISOString(),
      failure_reason: "CODE_AI_WORKER_SESSION_STARTING_STALE",
    };
    await updateSession(row, stale).catch(() => null);
    throw new Error("CODE_AI_WORKER_SESSION_STARTING_STALE");
  }

  const readiness = await health(session);
  if (!readiness.transport_ready) {
    return warmingResult(session, readiness, readiness.reason);
  }

  const warmed = await ensureEngineWarmup(row, session, readiness, idleMs);
  row = warmed.row;
  session = warmed.session;
  if (!warmed.ready) {
    return warmingResult(session, warmed.readiness || readiness, warmed.reason);
  }

  const finalReadiness = warmed.readiness || await health(session);
  if (finalReadiness.engine_loaded !== true) {
    return warmingResult(session, finalReadiness, "MODEL_ENGINE_HEALTH_NOT_READY");
  }

  const now = new Date();
  const readySession = {
    ...session,
    state: "READY",
    engine_ready: true,
    ready_at: text(session.ready_at) || now.toISOString(),
    last_activity_at: now.toISOString(),
    expires_at: new Date(now.getTime() + idleMs).toISOString(),
    idle_ms: idleMs,
  };
  row = await updateSession(row, readySession);
  session = sessionFromRow(row) || readySession;

  return {
    contract: CODE_AI_WORKER_SESSION_CONTRACT,
    ready: true,
    state: "READY",
    session_id: session.session_id,
    pod_id_present: true,
    warming: false,
    reason: null,
    transport_ready: true,
    cached_model_found: true,
    engine_loaded: true,
    engine_warmup_job_present: Boolean(session.engine_warmup_job_id),
    engine_warmup_status: text(session.engine_warmup_status, 80) || null,
    reasoning_call_consumed_by_warmup: false,
    wallet_mutation_performed_by_warmup: false,
    expires_at: session.expires_at,
    idle_ms: session.idle_ms,
    contains_worker_token: false,
  };
}

export async function resolveCodeAIWorkerSessionTransport() {
  const row = await loadControlRow();
  const session = sessionFromRow(row);
  if (
    !session ||
    session.state !== "READY" ||
    session.engine_ready !== true ||
    expired(session)
  ) return null;
  const readiness = await health(session);
  if (readiness.engine_loaded !== true) return null;
  const baseUrl = text(session.pod_base_url).replace(/\/+$/, "");
  if (!baseUrl) return null;
  return {
    contract: CODE_AI_WORKER_SESSION_CONTRACT,
    session_id: session.session_id,
    base_url: baseUrl,
    token: tokenForSession(session.session_id),
    expires_at: session.expires_at,
    engine_loaded: true,
  };
}

export const CodeAIWorkerSessionRuntime = Object.freeze({
  contract: CODE_AI_WORKER_SESSION_CONTRACT,
  default_idle_ms: DEFAULT_IDLE_MS,
  max_idle_ms: MAX_IDLE_MS,
  ensure: ensureCodeAIWorkerSession,
  resolveTransport: resolveCodeAIWorkerSessionTransport,
  reapExpired: reapExpiredCodeAIWorkerSession,
});

export default CodeAIWorkerSessionRuntime;