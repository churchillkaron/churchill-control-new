const CONTRACT = "AVANTIQO_INTELLIGENCE_FAST_PUBLIC_VLLM_GPU_START_PROOF_V8";
const APPROVAL_ENV = "AVANTIQO_INTELLIGENCE_FAST_PUBLIC_VLLM_GPU_START_PROOF_V8_APPROVED";
const V7_APPROVAL_ENV = "AVANTIQO_INTELLIGENCE_FAST_PUBLIC_VLLM_GPU_START_PROOF_V7_APPROVED";
const V7_PATH = "./run-avantiqo-intelligence-fast-public-vllm-gpu-start-proof-v7-local.mjs";
const REST = "https://rest.runpod.io/v1";
const GRAPHQL = "https://api.runpod.io/graphql";
const QUEUE = "https://api.runpod.ai/v2";
const FAST_ENDPOINT_NAME = "avantiqo-intelligence-fast-v1";
const DATA_CENTER_ID = "US-CA-2";
const NETWORK_VOLUME_ID = "7obluigbr0";
const COMPATIBLE_GPU = /(RTX PRO 6000 Blackwell Server Edition|H100|H200|B200)/i;
const TERMINAL = new Set(["EXITED", "STOPPED", "TERMINATED", "DELETED", "FAILED"]);

const text = (v) => String(v ?? "").trim();
const list = (v) => Array.isArray(v) ? v : [];
const object = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
const finite = (v, fallback = null) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const yes = (v) => ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(v).toUpperCase());
const unique = (xs) => [...new Set(list(xs).map(text).filter(Boolean))];

function redact(v) {
  return text(v).slice(0, 2500)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/([?&](?:token|key|api_key|apikey|sig|signature)=)[^&\s]+/gi, "$1[REDACTED]");
}

async function readJson(response, code) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) throw new Error(`${code}_HTTP_${response.status}:${redact(body?.message || body?.error || body?.detail || raw)}`);
  return body ?? {};
}

async function rest(path, key) {
  const response = await fetch(`${REST}${path}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  return readJson(response, `${CONTRACT}_REST`);
}

async function queueHealth(endpointId, queueKey) {
  const response = await fetch(`${QUEUE}/${encodeURIComponent(endpointId)}/health`, {
    headers: { Authorization: `Bearer ${queueKey}`, Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  const body = await readJson(response, `${CONTRACT}_QUEUE_HEALTH`);
  const jobs = object(body?.jobs);
  return {
    in_queue: Math.max(0, finite(jobs?.inQueue ?? jobs?.in_queue, 0)),
    in_progress: Math.max(0, finite(jobs?.inProgress ?? jobs?.in_progress, 0)),
  };
}

async function graphql(query, key) {
  const response = await fetch(`${GRAPHQL}?api_key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(20_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) throw new Error(`${CONTRACT}_GRAPHQL_HTTP_${response.status}:${redact(raw)}`);
  if (list(body?.errors).length) throw new Error(`${CONTRACT}_GRAPHQL_ERROR:${redact(list(body.errors).map((row) => row?.message).filter(Boolean).join(" | "))}`);
  return object(body?.data);
}

function rows(v, key) {
  if (Array.isArray(v)) return v;
  return list(v?.[key] || v?.data || v?.items || v?.results);
}

function activeWorker(row = {}) {
  const desired = text(row?.desiredStatus ?? row?.desired_status).toUpperCase();
  const status = text(row?.status ?? row?.workerStatus ?? row?.runtimeStatus).toUpperCase();
  if (desired && !TERMINAL.has(desired)) return true;
  if (status && !TERMINAL.has(status)) return true;
  return !desired && !status;
}

async function endpointContract(managementKey, queueKey) {
  const raw = await rest("/endpoints?includeTemplate=false&includeWorkers=true", managementKey);
  const matches = rows(raw, "endpoints").filter((row) => text(row?.name) === FAST_ENDPOINT_NAME);
  if (matches.length !== 1) throw new Error(`${CONTRACT}_FAST_ENDPOINT_RESOLUTION_FAILED:${matches.length}`);
  const endpoint = matches[0];
  const endpointId = text(endpoint?.id);
  if (!endpointId) throw new Error(`${CONTRACT}_FAST_ENDPOINT_ID_REQUIRED`);
  const gpuTypeIds = unique(endpoint?.gpuTypeIds).filter((id) => COMPATIBLE_GPU.test(id));
  if (!gpuTypeIds.length) throw new Error(`${CONTRACT}_COMPATIBLE_GPU_POOL_REQUIRED`);
  const health = await queueHealth(endpointId, queueKey);
  const workersMin = Math.max(0, finite(endpoint?.workersMin, 0));
  const workersMax = Math.max(0, finite(endpoint?.workersMax, 0));
  const activeWorkers = list(endpoint?.workers).filter(activeWorker).length;
  const fastClean = workersMin === 0 && workersMax === 0 && activeWorkers === 0 && health.in_queue === 0 && health.in_progress === 0;
  return {
    endpoint,
    endpointId,
    gpuTypeIds,
    allowedCudaVersions: unique(endpoint?.allowedCudaVersions),
    state: {
      workers_min: workersMin,
      workers_max: workersMax,
      active_workers: activeWorkers,
      queue_in_queue: health.in_queue,
      queue_in_progress: health.in_progress,
      clean_0_0_empty: fastClean,
    },
  };
}

async function stockSnapshot(gpuTypeIds, allowedCudaVersions, managementKey) {
  const results = [];
  const cudaClause = allowedCudaVersions.length
    ? `, allowedCudaVersions: [${allowedCudaVersions.map((value) => `"${value.replace(/[\\"\n\r]/g, "")}"`).join(", ")}]`
    : "";
  for (const gpuTypeId of gpuTypeIds) {
    const safeId = gpuTypeId.replace(/[\\"\n\r]/g, "");
    const data = await graphql(`query { gpuTypes(input: { id: "${safeId}" }) { id displayName lowestPrice(input: { gpuCount: 1, secureCloud: true, dataCenterId: "${DATA_CENTER_ID}", supportPublicIp: true${cudaClause} }) { stockStatus uninterruptablePrice availableGpuCounts } } }`, managementKey);
    const row = list(data?.gpuTypes)[0] || {};
    const price = object(row?.lowestPrice);
    const stockStatus = text(price?.stockStatus) || "Unknown";
    const normalized = stockStatus.toUpperCase();
    const counts = list(price?.availableGpuCounts).map((value) => Number(value)).filter(Number.isFinite);
    const hourly = finite(price?.uninterruptablePrice, null);
    const viable = !["NONE", "UNKNOWN", ""].includes(normalized) && hourly !== null;
    results.push({
      id: text(row?.id) || gpuTypeId,
      display_name: text(row?.displayName) || null,
      data_center_id: DATA_CENTER_ID,
      stock_status: stockStatus,
      exact_dc_one_gpu_viable: viable,
      available_gpu_counts_diagnostic_only: counts,
      uninterruptable_price_per_hour: hourly,
    });
  }
  return results;
}

const apply = process.argv.includes("--apply");
if (apply && !yes(process.env[APPROVAL_ENV])) throw new Error(`${APPROVAL_ENV}=YES_REQUIRED`);
const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
if (!managementKey) throw new Error(`${CONTRACT}_RUNPOD_MANAGEMENT_CREDENTIAL_REQUIRED`);
const queueKey = text(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_FAST_API_KEY);
if (!queueKey) throw new Error(`${CONTRACT}_RUNPOD_FAST_QUEUE_CREDENTIAL_REQUIRED`);

const contract = await endpointContract(managementKey, queueKey);
const stock = await stockSnapshot(contract.gpuTypeIds, contract.allowedCudaVersions, managementKey);
const viable = stock.filter((row) => row.exact_dc_one_gpu_viable).map((row) => row.id);
const fastClean = contract.state.clean_0_0_empty === true;
const success = fastClean && viable.length > 0;

console.log(JSON.stringify({
  success,
  contract: CONTRACT,
  mode: apply ? "APPLY_PREFLIGHT" : "PLAN",
  endpoint_name: FAST_ENDPOINT_NAME,
  endpoint_id_present: Boolean(contract.endpointId),
  fast_state: contract.state,
  data_center_id: DATA_CENTER_ID,
  network_volume_id: NETWORK_VOLUME_ID,
  endpoint_compatible_gpu_type_ids: contract.gpuTypeIds,
  allowed_cuda_versions: contract.allowedCudaVersions,
  exact_data_center_stock_snapshot: stock,
  exact_data_center_viable_gpu_type_ids: viable,
  gpu_type_priority: "availability",
  data_center_priority: "availability",
  stock_rule: "RunPod stockStatus for exact US-CA-2 one-GPU Secure Cloud query; availableGpuCounts is diagnostic only.",
  qwen_loaded: false,
  vllm_server_started: false,
  completion_request_performed: false,
  token_generation_performed: false,
  inference_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));

if (!fastClean) {
  console.log(`${CONTRACT}=FAST_BUSY_NO_MUTATION`);
  process.exitCode = 3;
} else if (!viable.length) {
  console.log(`${CONTRACT}=NO_EXACT_DC_COMPATIBLE_STOCK`);
  process.exitCode = 2;
} else if (!apply) {
  console.log(`${CONTRACT}=PLAN_READY`);
} else {
  const originalFetch = globalThis.fetch.bind(globalThis);
  const previousApproval = process.env[V7_APPROVAL_ENV];
  let rewritePerformed = false;

  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : text(input?.url);
    const method = text(init?.method || "GET").toUpperCase() || "GET";
    if (url === `${REST}/pods` && method === "POST") {
      const liveContract = await endpointContract(managementKey, queueKey);
      if (!liveContract.state.clean_0_0_empty) throw new Error(`${CONTRACT}_FAST_BECAME_BUSY_BEFORE_POD_CREATE`);
      let body = null;
      try { body = JSON.parse(text(init?.body) || "{}"); } catch { body = null; }
      if (!body || typeof body !== "object") throw new Error(`${CONTRACT}_POD_CREATE_BODY_REQUIRED`);
      body.gpuTypeIds = viable;
      body.gpuTypePriority = "availability";
      body.dataCenterIds = [DATA_CENTER_ID];
      body.dataCenterPriority = "availability";
      rewritePerformed = true;
      console.log(JSON.stringify({
        event: "AVANTIQO_INTELLIGENCE_FAST_V8_CAPACITY_REWRITE",
        gpu_type_ids: viable,
        gpu_type_priority: "availability",
        data_center_ids: [DATA_CENTER_ID],
        data_center_priority: "availability",
        fast_clean_reverified: true,
        qwen_loaded: false,
        vllm_server_started: false,
        inference_performed: false,
        secrets_printed: false,
      }));
      return originalFetch(input, { ...init, body: JSON.stringify(body) });
    }
    return originalFetch(input, init);
  };

  process.env[V7_APPROVAL_ENV] = "YES";
  try {
    await import(V7_PATH);
    if (!rewritePerformed) throw new Error(`${CONTRACT}_CAPACITY_REWRITE_NOT_PERFORMED`);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousApproval === undefined) delete process.env[V7_APPROVAL_ENV];
    else process.env[V7_APPROVAL_ENV] = previousApproval;
  }
}
