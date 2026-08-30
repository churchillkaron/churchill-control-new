import { randomBytes } from "node:crypto";

const CONTRACT = "AVANTIQO_INTELLIGENCE_FAST_POD_FALLBACK_V1";
const REST_BASE = "https://rest.runpod.io/v1";
const FAST_ENDPOINT_NAME = "avantiqo-intelligence-fast-v1";
const FAST_MODEL = "Qwen/Qwen3-30B-A3B-Instruct-2507";
const NETWORK_VOLUME_ID = "7obluigbr0";
const NETWORK_VOLUME_NAME = "avantiqo-shared-intelligence-code-cache";
const DATA_CENTER_ID = "US-CA-2";
const CACHE_ROOT = "/workspace/intelligence-fast-hf";
const VLLM_CACHE_ROOT = "/workspace/intelligence-fast-vllm-cache";
const VLLM_PORT = 8000;
const PUBLIC_IMAGE = "runpod/worker-v1-vllm@sha256:312102926800275ccc6c3c6a879008eee857798915efe1d637eb7d94bf4d6cb7";
const DEFAULT_STARTUP_TIMEOUT_MS = 7 * 60_000;
const DEFAULT_EXECUTION_TIMEOUT_MS = 10 * 60_000;
const DEFAULT_CLEANUP_TIMEOUT_MS = 3 * 60_000;
const DEFAULT_POLL_MS = 5000;
const DEFAULT_MAX_ESTIMATED_SPEND_USD = 0.35;
const TERMINAL = new Set(["EXITED", "STOPPED", "TERMINATED", "DELETED", "FAILED"]);
const COMPATIBLE_GPU = /(RTX PRO 6000 Blackwell Server Edition|H100|H200|B200)/i;

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function boundedMs(value, fallback, minimum, maximum) {
  const number = finite(value, fallback);
  return Math.max(minimum, Math.min(maximum, Math.floor(number)));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function managementKey() {
  const key = text(process.env.RUNPOD_MANAGEMENT_API_KEY) || text(process.env.RUNPOD_API_KEY);
  if (!key) throw new Error("AVANTIQO_INTELLIGENCE_FAST_POD_MANAGEMENT_KEY_REQUIRED");
  return key;
}

function redact(value) {
  return text(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/\bhf_[A-Za-z0-9]{8,}\b/g, "hf_[REDACTED]")
    .slice(0, 1200);
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
    cache: "no-store",
    signal: AbortSignal.timeout(options.timeoutMs || 30000),
  });
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = null;
  }
  if (!response.ok) {
    throw new Error(`AVANTIQO_INTELLIGENCE_FAST_POD_HTTP_${response.status}:${redact(body?.message || body?.error || raw)}`);
  }
  if (body === null) throw new Error("AVANTIQO_INTELLIGENCE_FAST_POD_RESPONSE_INVALID");
  return body;
}

function rest(pathname, key, options = {}) {
  return requestJson(`${REST_BASE}${pathname}`, key, options);
}

function rows(value, candidate) {
  if (Array.isArray(value)) return value;
  return list(value?.[candidate] || value?.data || value?.items || value?.results);
}

function active(row = {}) {
  const desired = text(row?.desiredStatus ?? row?.desired_status).toUpperCase();
  const status = text(row?.status ?? row?.runtimeStatus ?? row?.workerStatus).toUpperCase();
  if (desired) return !TERMINAL.has(desired);
  if (status) return !TERMINAL.has(status);
  return true;
}

function podVolumeId(pod = {}) {
  return text(pod?.networkVolume?.id || pod?.networkVolumeId);
}

function unique(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function startupTimeoutMs() {
  return boundedMs(
    process.env.AVANTIQO_INTELLIGENCE_FAST_POD_STARTUP_TIMEOUT_MS,
    DEFAULT_STARTUP_TIMEOUT_MS,
    60_000,
    12 * 60_000,
  );
}

function executionTimeoutMs() {
  return boundedMs(
    process.env.AVANTIQO_INTELLIGENCE_FAST_POD_EXECUTION_TIMEOUT_MS,
    DEFAULT_EXECUTION_TIMEOUT_MS,
    60_000,
    15 * 60_000,
  );
}

function cleanupTimeoutMs() {
  return boundedMs(
    process.env.AVANTIQO_INTELLIGENCE_FAST_POD_CLEANUP_TIMEOUT_MS,
    DEFAULT_CLEANUP_TIMEOUT_MS,
    30_000,
    5 * 60_000,
  );
}

function maxEstimatedSpendUsd() {
  return Math.max(
    0.05,
    Math.min(
      1,
      finite(
        process.env.AVANTIQO_INTELLIGENCE_FAST_POD_MAX_ESTIMATED_SPEND_USD,
        DEFAULT_MAX_ESTIMATED_SPEND_USD,
      ),
    ),
  );
}

function modelStartCommand() {
  return [
    `mkdir -p ${CACHE_ROOT} ${VLLM_CACHE_ROOT}`,
    `export HF_HOME=${CACHE_ROOT}`,
    `export HUGGINGFACE_HUB_CACHE=${CACHE_ROOT}/hub`,
    `export VLLM_CACHE_ROOT=${VLLM_CACHE_ROOT}`,
    "export SAFETENSORS_LOAD_STRATEGY=prefetch",
    `exec python3 -m vllm.entrypoints.openai.api_server --model ${FAST_MODEL} --served-model-name ${FAST_MODEL} --host 0.0.0.0 --port ${VLLM_PORT} --trust-remote-code --enable-auto-tool-choice --tool-call-parser hermes --max-model-len 32768 --gpu-memory-utilization 0.90`,
  ].join("; ");
}

async function resolveBaseline(key, ownedPodName) {
  const [endpointsRaw, podsRaw, volumesRaw] = await Promise.all([
    rest("/endpoints?includeTemplate=false&includeWorkers=true", key),
    rest("/pods?computeType=GPU&includeMachine=true&includeNetworkVolume=true", key),
    rest("/networkvolumes", key),
  ]);
  const endpoints = rows(endpointsRaw, "endpoints");
  const matches = endpoints.filter((row) => text(row?.name) === FAST_ENDPOINT_NAME);
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_INTELLIGENCE_FAST_POD_ENDPOINT_RESOLUTION_FAILED:${matches.length}`);
  }
  const endpoint = matches[0];
  if (finite(endpoint?.workersMin, -1) !== 0 || finite(endpoint?.workersMax, -1) !== 0) {
    throw new Error("AVANTIQO_INTELLIGENCE_FAST_POD_SERVERLESS_MUST_BE_PARKED_0_0");
  }
  if (list(endpoint?.workers).some(active)) {
    throw new Error("AVANTIQO_INTELLIGENCE_FAST_POD_SERVERLESS_WORKER_ACTIVE");
  }

  const volumes = rows(volumesRaw, "networkVolumes");
  const volume = volumes.find((row) => text(row?.id) === NETWORK_VOLUME_ID);
  if (
    !volume ||
    text(volume?.name) !== NETWORK_VOLUME_NAME ||
    text(volume?.dataCenterId ?? volume?.data_center_id) !== DATA_CENTER_ID
  ) {
    throw new Error("AVANTIQO_INTELLIGENCE_FAST_POD_SHARED_VOLUME_CONTRACT_MISMATCH");
  }

  const conflictingPods = rows(podsRaw, "pods").filter((pod) =>
    active(pod) &&
    podVolumeId(pod) === NETWORK_VOLUME_ID &&
    text(pod?.name) !== ownedPodName
  );
  if (conflictingPods.length) {
    throw new Error(`AVANTIQO_INTELLIGENCE_FAST_POD_SHARED_VOLUME_BUSY:${conflictingPods.length}`);
  }

  const gpuTypeIds = unique(list(endpoint?.gpuTypeIds)).filter((id) => COMPATIBLE_GPU.test(id));
  if (!gpuTypeIds.length) {
    throw new Error("AVANTIQO_INTELLIGENCE_FAST_POD_COMPATIBLE_GPU_REQUIRED");
  }

  return {
    endpoint_id: text(endpoint?.id),
    gpu_type_ids: gpuTypeIds,
    allowed_cuda_versions: unique(list(endpoint?.allowedCudaVersions)),
  };
}

async function createPod(key, ownedPodName, baseline) {
  const body = {
    name: ownedPodName,
    imageName: PUBLIC_IMAGE,
    cloudType: "SECURE",
    computeType: "GPU",
    gpuCount: 1,
    gpuTypeIds: baseline.gpu_type_ids,
    gpuTypePriority: "availability",
    allowedCudaVersions: baseline.allowed_cuda_versions,
    dataCenterIds: [DATA_CENTER_ID],
    dataCenterPriority: "availability",
    containerDiskInGb: 50,
    dockerEntrypoint: ["bash", "-lc"],
    dockerStartCmd: [modelStartCommand()],
    env: {
      MODEL_NAME: FAST_MODEL,
      SERVED_MODEL_NAME: FAST_MODEL,
      HF_HOME: CACHE_ROOT,
      HUGGINGFACE_HUB_CACHE: `${CACHE_ROOT}/hub`,
      VLLM_CACHE_ROOT,
      SAFETENSORS_LOAD_STRATEGY: "prefetch",
      ENABLE_AUTO_TOOL_CHOICE: "true",
      TOOL_CALL_PARSER: "hermes",
    },
    ports: [`${VLLM_PORT}/http`],
    supportPublicIp: true,
    interruptible: false,
    locked: false,
    networkVolumeId: NETWORK_VOLUME_ID,
    volumeMountPath: "/workspace",
  };
  const created = await rest("/pods", key, {
    method: "POST",
    body,
    timeoutMs: 60000,
  });
  const podId = text(created?.id || created?.pod?.id || created?.data?.id);
  if (!podId) throw new Error("AVANTIQO_INTELLIGENCE_FAST_POD_ID_REQUIRED");
  return {
    id: podId,
    cost_per_hour: finite(created?.adjustedCostPerHr ?? created?.costPerHr, null),
  };
}

async function podState(key, podId) {
  return rest(`/pods/${encodeURIComponent(podId)}?includeMachine=true&includeNetworkVolume=true`, key);
}

async function fetchModels(podId, timeoutMs = 10000) {
  const response = await fetch(
    `https://${podId}-${VLLM_PORT}.proxy.runpod.net/v1/models`,
    {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    },
  );
  const raw = await response.text();
  if (!response.ok) return { ready: false, status: response.status, ids: [] };
  let body = null;
  try {
    body = JSON.parse(raw);
  } catch {
    body = null;
  }
  const ids = list(body?.data).map((row) => text(row?.id)).filter(Boolean);
  return { ready: ids.includes(FAST_MODEL), status: response.status, ids };
}

async function waitForModel(key, pod, startedAt) {
  const deadline = startedAt + startupTimeoutMs();
  let observedCostPerHour = pod.cost_per_hour;
  while (Date.now() < deadline) {
    const state = await podState(key, pod.id);
    const desired = text(state?.desiredStatus ?? state?.desired_status).toUpperCase();
    const status = text(state?.status ?? state?.runtimeStatus).toUpperCase();
    if (TERMINAL.has(desired) || TERMINAL.has(status)) {
      throw new Error(`AVANTIQO_INTELLIGENCE_FAST_POD_TERMINAL:${desired || status}`);
    }
    observedCostPerHour = finite(
      state?.adjustedCostPerHr ?? state?.costPerHr ?? state?.machine?.costPerHr,
      observedCostPerHour,
    );
    const elapsedMs = Date.now() - startedAt;
    const estimatedSpend = observedCostPerHour === null
      ? null
      : observedCostPerHour * elapsedMs / 3_600_000;
    if (estimatedSpend !== null && estimatedSpend >= maxEstimatedSpendUsd()) {
      throw new Error(
        `AVANTIQO_INTELLIGENCE_FAST_POD_STARTUP_SPEND_LIMIT:${estimatedSpend.toFixed(4)}`,
      );
    }
    try {
      const models = await fetchModels(pod.id);
      if (models.ready) {
        return {
          base_url: `https://${pod.id}-${VLLM_PORT}.proxy.runpod.net/v1`,
          cost_per_hour: observedCostPerHour,
          startup_ms: elapsedMs,
        };
      }
    } catch {
      // Proxy is expected to be unavailable during cold start.
    }
    await sleep(DEFAULT_POLL_MS);
  }
  throw new Error("AVANTIQO_INTELLIGENCE_FAST_POD_MODEL_READY_TIMEOUT");
}

async function ownedPods(key, ownedPodName) {
  const raw = await rest("/pods?computeType=GPU&includeMachine=true&includeNetworkVolume=true", key);
  return rows(raw, "pods").filter((pod) => text(pod?.name) === ownedPodName);
}

async function cleanupOwnedPod(key, ownedPodName) {
  const deadline = Date.now() + cleanupTimeoutMs();
  let deletePerformed = false;
  while (Date.now() < deadline) {
    const pods = await ownedPods(key, ownedPodName).catch(() => []);
    if (!pods.length) {
      return { delete_performed: deletePerformed, delete_verified: true };
    }
    for (const pod of pods) {
      const id = text(pod?.id);
      if (!id) continue;
      try {
        await rest(`/pods/${encodeURIComponent(id)}`, key, { method: "DELETE" });
        deletePerformed = true;
      } catch {
        // Retry until cleanup deadline.
      }
    }
    await sleep(3000);
  }
  const remaining = await ownedPods(key, ownedPodName).catch(() => []);
  if (!remaining.length) return { delete_performed: deletePerformed, delete_verified: true };
  throw new Error(`AVANTIQO_INTELLIGENCE_FAST_POD_DELETE_NOT_VERIFIED:${remaining.length}`);
}

export function isAvantiqoIntelligenceFastUnscheduledError(error) {
  return /^AVANTIQO_INTELLIGENCE_FAST_WORKER_NOT_SCHEDULED_WITHIN_\d+_MS$/i.test(
    text(error?.message || error),
  );
}

export async function withOwnedIntelligenceFastPodFallback({ execute } = {}) {
  if (typeof execute !== "function") {
    throw new Error("AVANTIQO_INTELLIGENCE_FAST_POD_EXECUTOR_REQUIRED");
  }
  const key = managementKey();
  const ownedPodName = `avantiqo-intelligence-fast-runtime-${randomBytes(6).toString("hex")}`;
  const baseline = await resolveBaseline(key, ownedPodName);
  const startedAt = Date.now();
  let executionError = null;
  let pod = null;
  let ready = null;
  let cleanup = null;

  try {
    pod = await createPod(key, ownedPodName, baseline);
    ready = await waitForModel(key, pod, startedAt);
    return await Promise.race([
      execute({
        intelligence_fast_pod_fallback_contract: CONTRACT,
        intelligence_fast_pod_base_url: ready.base_url,
        intelligence_fast_pod_model: FAST_MODEL,
        intelligence_fast_pod_id: pod.id,
        intelligence_fast_pod_startup_ms: ready.startup_ms,
        intelligence_fast_pod_cost_per_hour: ready.cost_per_hour,
        intelligence_request_lease_mode: "EPHEMERAL_FAST_POD_FALLBACK",
      }),
      new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error("AVANTIQO_INTELLIGENCE_FAST_POD_EXECUTION_TIMEOUT")),
          executionTimeoutMs(),
        );
      }),
    ]);
  } catch (error) {
    executionError = error;
    throw error;
  } finally {
    try {
      cleanup = await cleanupOwnedPod(key, ownedPodName);
    } catch (cleanupError) {
      if (!executionError) throw cleanupError;
    }
    void cleanup;
  }
}

export const OwnedIntelligenceFastPodFallbackRuntime = Object.freeze({
  contract: CONTRACT,
  model: FAST_MODEL,
  endpointName: FAST_ENDPOINT_NAME,
  networkVolumeId: NETWORK_VOLUME_ID,
  dataCenterId: DATA_CENTER_ID,
  isUnscheduledError: isAvantiqoIntelligenceFastUnscheduledError,
  withFallback: withOwnedIntelligenceFastPodFallback,
});

export default OwnedIntelligenceFastPodFallbackRuntime;
