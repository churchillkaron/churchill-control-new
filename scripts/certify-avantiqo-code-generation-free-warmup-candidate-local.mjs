import crypto from "node:crypto";

const CONTRACT = "AVANTIQO_CODE_GENERATION_FREE_WARMUP_CANDIDATE_V1";
const APPROVAL = "AVANTIQO_CODE_GENERATION_FREE_WARMUP_CANDIDATE_APPROVED";
const IMAGE = "ghcr.io/churchillkaron/avantiqo-code-pod@sha256:764bcb2ce3636adc68ada7ce2a51d41de995e5e0d54e543b41044d76e5686535";
const NETWORK_VOLUME_ID = "7obluigbr0";
const DATA_CENTER_ID = "US-CA-2";
const POD_HTTP_CONTRACT = "AVANTIQO_CODE_POD_HTTP_V3";
const GPU_TYPE_IDS = [
  "NVIDIA H100 80GB HBM3",
  "NVIDIA H200",
  "NVIDIA B200",
];
const ALLOWED_CUDA_VERSIONS = ["12.8", "12.9", "13.0"];
const REST = "https://rest.runpod.io/v1";
const READY_TIMEOUT_MS = 12 * 60_000;
const POLL_MS = 5_000;
const TRANSIENT_WARMUP_POLL_HTTP_STATUSES = new Set([404, 502, 503, 504]);
const MAX_CONSECUTIVE_TRANSIENT_WARMUP_POLLS = 12;

const text = (value) => String(value ?? "").trim();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

if (text(process.env[APPROVAL]).toUpperCase() !== "YES") {
  throw new Error(`${CONTRACT}_APPROVAL_REQUIRED`);
}
if (text(process.env.NODE_ENV).toLowerCase() !== "development") {
  throw new Error(`${CONTRACT}_DEVELOPMENT_ENV_REQUIRED`);
}

const managementKey = text(
  process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY,
);
if (!managementKey) throw new Error(`${CONTRACT}_RUNPOD_MANAGEMENT_KEY_REQUIRED`);

const token = crypto.randomBytes(32).toString("hex");
const name = `avantiqo-code-warmup-proof-${Date.now()}`;
let podId = null;
let podBaseUrl = null;
let deletionVerified = false;

async function rest(pathname, options = {}) {
  const response = await fetch(`${REST}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${managementKey}`,
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
    throw new Error(`${CONTRACT}_RUNPOD_HTTP_${response.status}:${text(body?.message || body?.error || raw).slice(0, 700)}`);
  }
  return body || {};
}

async function podRequest(pathname, options = {}) {
  if (!podBaseUrl) throw new Error(`${CONTRACT}_POD_BASE_URL_REQUIRED`);
  const response = await fetch(`${podBaseUrl}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeout_ms || 30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (
    options.allowTransientStatus === true &&
    TRANSIENT_WARMUP_POLL_HTTP_STATUSES.has(response.status)
  ) {
    return {
      transient_http_status: response.status,
      transient_detail: text(body?.detail || body?.error_message || raw).slice(0, 700) || null,
    };
  }
  if (!response.ok) {
    throw new Error(`${CONTRACT}_POD_HTTP_${response.status}:${text(body?.detail || body?.error_message || raw).slice(0, 700)}`);
  }
  if (
    body?.contract !== POD_HTTP_CONTRACT ||
    body?.transport !== "pod-http" ||
    body?.raw_reasoning_persisted !== false
  ) {
    throw new Error(`${CONTRACT}_POD_CONTRACT_INVALID`);
  }
  return body;
}

async function waitForHealth() {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${podBaseUrl}/health`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(5000),
      });
      const body = await response.json().catch(() => null);
      if (
        response.ok &&
        body?.success === true &&
        body?.contract === POD_HTTP_CONTRACT &&
        body?.transport === "pod-http" &&
        body?.cached_model_found === true &&
        body?.raw_reasoning_persisted === false
      ) return body;
    } catch {}
    await sleep(POLL_MS);
  }
  throw new Error(`${CONTRACT}_POD_HEALTH_TIMEOUT`);
}

async function inspectWarmupContinuity(transientStatus, transientDetail) {
  let healthEvidence = {
    http_status: null,
    contract_valid: false,
    engine_loaded: false,
    jobs_queued: null,
    jobs_running: null,
    error_type: null,
  };
  try {
    const response = await fetch(`${podBaseUrl}/health`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    const body = await response.json().catch(() => null);
    healthEvidence = {
      http_status: response.status,
      contract_valid: Boolean(
        response.ok &&
        body?.success === true &&
        body?.contract === POD_HTTP_CONTRACT &&
        body?.transport === "pod-http" &&
        body?.raw_reasoning_persisted === false
      ),
      engine_loaded: body?.engine_loaded === true,
      jobs_queued: Number.isFinite(Number(body?.jobs_queued)) ? Number(body.jobs_queued) : null,
      jobs_running: Number.isFinite(Number(body?.jobs_running)) ? Number(body.jobs_running) : null,
      error_type: null,
    };
  } catch (error) {
    healthEvidence.error_type = text(error?.name || error?.message).slice(0, 120) || "UNKNOWN";
  }

  let podEvidence = {
    present: null,
    desired_status: null,
    status: null,
    runtime_status: null,
    error_type: null,
  };
  try {
    const pod = await rest(`/pods/${encodeURIComponent(podId)}`, {
      allow404: true,
      timeout_ms: 15_000,
    });
    podEvidence = {
      present: Boolean(pod),
      desired_status: text(pod?.desiredStatus || pod?.desired_status) || null,
      status: text(pod?.status) || null,
      runtime_status: text(pod?.runtimeStatus || pod?.runtime_status) || null,
      error_type: null,
    };
  } catch (error) {
    podEvidence.error_type = text(error?.name || error?.message).slice(0, 120) || "UNKNOWN";
  }

  console.log(JSON.stringify({
    event: "AVANTIQO_CODE_WARMUP_CANDIDATE_POLL_CONTINUITY",
    contract: CONTRACT,
    transient_http_status: transientStatus,
    transient_detail: transientDetail || null,
    health: healthEvidence,
    pod: podEvidence,
    customer_inference_performed: false,
    reasoning_calls_used: 0,
    wallet_mutation_performed: false,
    production_deploy_performed: false,
    secrets_printed: false,
  }));

  return { health: healthEvidence, pod: podEvidence };
}

async function waitForWarmup(jobId) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let consecutiveTransientPolls = 0;
  let lastContinuity = null;

  while (Date.now() < deadline) {
    await sleep(POLL_MS);
    const body = await podRequest(`/v3/generations/${encodeURIComponent(jobId)}`, {
      allowTransientStatus: true,
    });
    if (body?.transient_http_status) {
      consecutiveTransientPolls += 1;
      if (
        consecutiveTransientPolls === 1 ||
        consecutiveTransientPolls % 3 === 0 ||
        consecutiveTransientPolls >= MAX_CONSECUTIVE_TRANSIENT_WARMUP_POLLS
      ) {
        lastContinuity = await inspectWarmupContinuity(
          body.transient_http_status,
          body.transient_detail,
        );
      }
      if (consecutiveTransientPolls >= MAX_CONSECUTIVE_TRANSIENT_WARMUP_POLLS) {
        throw new Error(
          `${CONTRACT}_WARMUP_STATUS_CONTINUITY_LOST:` +
          `http=${body.transient_http_status}:` +
          `health_contract_valid=${lastContinuity?.health?.contract_valid === true}:` +
          `health_engine_loaded=${lastContinuity?.health?.engine_loaded === true}:` +
          `pod_present=${lastContinuity?.pod?.present === true}`,
        );
      }
      continue;
    }

    consecutiveTransientPolls = 0;
    const status = text(body.status).toUpperCase();
    if (status === "FAILED") {
      throw new Error(`${CONTRACT}_WARMUP_FAILED:${text(body.error_type || body.error_message) || "UNKNOWN"}`);
    }
    if (status === "SUCCEEDED") return body;
  }
  throw new Error(`${CONTRACT}_WARMUP_TIMEOUT`);
}

async function deleteVerified() {
  if (!podId) return true;
  await rest(`/pods/${encodeURIComponent(podId)}`, {
    method: "DELETE",
    allow404: true,
  }).catch((error) => {
    if (!text(error?.message).includes("404")) throw error;
  });
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const pod = await rest(`/pods/${encodeURIComponent(podId)}`, {
      allow404: true,
      timeout_ms: 15_000,
    });
    if (!pod) return true;
    const status = text(pod?.desiredStatus || pod?.status).toUpperCase();
    if (["EXITED", "STOPPED", "TERMINATED", "DELETED"].includes(status)) return true;
    await sleep(1500);
  }
  return false;
}

console.log(JSON.stringify({
  event: "AVANTIQO_CODE_WARMUP_CANDIDATE_START",
  contract: CONTRACT,
  image_digest: IMAGE.split("@")[1],
  customer_inference_performed: false,
  reasoning_calls_used: 0,
  wallet_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
}));

try {
  const created = await rest("/pods", {
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
      name,
      networkVolumeId: NETWORK_VOLUME_ID,
      ports: ["8000/http"],
      supportPublicIp: true,
      volumeMountPath: "/workspace",
    },
  });
  podId = text(created?.id);
  if (!podId) throw new Error(`${CONTRACT}_POD_ID_REQUIRED`);
  podBaseUrl = `https://${podId}-8000.proxy.runpod.net`;

  const healthBefore = await waitForHealth();
  if (healthBefore.engine_loaded === true) {
    throw new Error(`${CONTRACT}_EXPECTED_COLD_ENGINE_BEFORE_WARMUP`);
  }

  const jobId = `warmup-proof-${crypto.randomUUID()}`;
  const accepted = await podRequest("/v3/generations", {
    method: "POST",
    body: {
      id: jobId,
      input: {
        contract: "AVANTIQO_CODE_ENGINE_V1",
        capability: "ai.code.debug",
        model: "avantiqo-code-v1",
        instruction: "Infrastructure engine warmup only. No customer generation.",
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
        usage_id: `warmup-proof-${crypto.randomUUID()}`,
      },
    },
  });
  if (text(accepted.job_id) !== jobId || accepted.proxy_timeout_safe !== true) {
    throw new Error(`${CONTRACT}_WARMUP_ACCEPTANCE_INVALID`);
  }

  const completed = await waitForWarmup(jobId);
  const output = completed?.output || {};
  if (
    output.status !== "engine_ready" ||
    output.engine_loaded !== true ||
    output.inference_performed !== false ||
    output.generation_performed !== false ||
    output.customer_work !== false ||
    output.reasoning_call_consumed !== false ||
    output.wallet_mutation_performed !== false ||
    output.raw_reasoning_persisted !== false
  ) {
    throw new Error(`${CONTRACT}_GENERATION_FREE_EVIDENCE_INVALID`);
  }

  const healthAfter = await waitForHealth();
  if (healthAfter.engine_loaded !== true) {
    throw new Error(`${CONTRACT}_ENGINE_NOT_LOADED_AFTER_WARMUP`);
  }

  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    image_digest: IMAGE.split("@")[1],
    pod_http_contract: POD_HTTP_CONTRACT,
    cached_model_found: healthAfter.cached_model_found === true,
    engine_loaded_before_warmup: false,
    engine_loaded_after_warmup: true,
    generation_performed: false,
    customer_inference_performed: false,
    reasoning_calls_used: 0,
    wallet_mutation_performed: false,
    source_mutation_performed: false,
    github_write_performed: false,
    production_deploy_performed: false,
    secrets_printed: false,
  }, null, 2));
} finally {
  try {
    deletionVerified = await deleteVerified();
  } catch (error) {
    console.error(`${CONTRACT}_CLEANUP_ERROR=${text(error?.message || error).slice(0, 500)}`);
  }
  console.log(`${CONTRACT}_POD_DELETE_VERIFIED=${deletionVerified}`);
  console.log(`${CONTRACT}_TERMINAL_REMAINS_OPEN=true`);
  if (podId && !deletionVerified) process.exitCode = 2;
}
