const CONTRACT = "AVANTIQO_INTELLIGENCE_FAST_PUBLIC_VLLM_GPU_START_PROOF_V8";
const APPROVAL_ENV = "AVANTIQO_INTELLIGENCE_FAST_PUBLIC_VLLM_GPU_START_PROOF_V8_APPROVED";
const V7_APPROVAL_ENV = "AVANTIQO_INTELLIGENCE_FAST_PUBLIC_VLLM_GPU_START_PROOF_V7_APPROVED";
const V7_PATH = "./run-avantiqo-intelligence-fast-public-vllm-gpu-start-proof-v7-local.mjs";
const REST = "https://rest.runpod.io/v1";
const GRAPHQL = "https://api.runpod.io/graphql";
const FAST_ENDPOINT_NAME = "avantiqo-intelligence-fast-v1";
const DATA_CENTER_ID = "US-CA-2";
const NETWORK_VOLUME_ID = "7obluigbr0";
const COMPATIBLE_GPU = /(RTX PRO 6000 Blackwell Server Edition|H100|H200|B200)/i;

const text = (v) => String(v ?? "").trim();
const list = (v) => Array.isArray(v) ? v : [];
const object = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
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

async function endpointContract(managementKey) {
  const raw = await rest("/endpoints?includeTemplate=false&includeWorkers=true", managementKey);
  const matches = rows(raw, "endpoints").filter((row) => text(row?.name) === FAST_ENDPOINT_NAME);
  if (matches.length !== 1) throw new Error(`${CONTRACT}_FAST_ENDPOINT_RESOLUTION_FAILED:${matches.length}`);
  const endpoint = matches[0];
  const gpuTypeIds = unique(endpoint?.gpuTypeIds).filter((id) => COMPATIBLE_GPU.test(id));
  if (!gpuTypeIds.length) throw new Error(`${CONTRACT}_COMPATIBLE_GPU_POOL_REQUIRED`);
  return { endpoint, gpuTypeIds };
}

async function stockSnapshot(gpuTypeIds, managementKey) {
  const results = [];
  for (const gpuTypeId of gpuTypeIds) {
    const safeId = gpuTypeId.replace(/[\\"\n\r]/g, "");
    const data = await graphql(`query { gpuTypes(input: { id: "${safeId}" }) { id displayName lowestPrice(input: { gpuCount: 1, secureCloud: true }) { stockStatus uninterruptablePrice availableGpuCounts } } }`, managementKey);
    const row = list(data?.gpuTypes)[0] || {};
    const price = object(row?.lowestPrice);
    const stockStatus = text(price?.stockStatus) || "Unknown";
    const counts = list(price?.availableGpuCounts).map((value) => Number(value)).filter(Number.isFinite);
    results.push({
      id: text(row?.id) || gpuTypeId,
      display_name: text(row?.displayName) || null,
      stock_status: stockStatus,
      one_gpu_available_globally: counts.includes(1),
      available_gpu_counts: counts,
      uninterruptable_price_per_hour: Number.isFinite(Number(price?.uninterruptablePrice)) ? Number(price.uninterruptablePrice) : null,
    });
  }
  return results;
}

const apply = process.argv.includes("--apply");
if (apply && !yes(process.env[APPROVAL_ENV])) throw new Error(`${APPROVAL_ENV}=YES_REQUIRED`);
const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
if (!managementKey) throw new Error(`${CONTRACT}_RUNPOD_MANAGEMENT_CREDENTIAL_REQUIRED`);

const { gpuTypeIds } = await endpointContract(managementKey);
const stock = await stockSnapshot(gpuTypeIds, managementKey);
const viable = stock
  .filter((row) => row.one_gpu_available_globally && text(row.stock_status).toUpperCase() !== "NONE")
  .map((row) => row.id);

console.log(JSON.stringify({
  success: viable.length > 0,
  contract: CONTRACT,
  mode: apply ? "APPLY_PREFLIGHT" : "PLAN",
  endpoint_name: FAST_ENDPOINT_NAME,
  data_center_id: DATA_CENTER_ID,
  network_volume_id: NETWORK_VOLUME_ID,
  endpoint_compatible_gpu_type_ids: gpuTypeIds,
  global_stock_snapshot: stock,
  globally_viable_gpu_type_ids: viable,
  gpu_type_priority: "availability",
  data_center_priority: "availability",
  note: "Global stock is a preflight signal only; final allocation must still succeed in US-CA-2 because the shared network volume is pinned there.",
  qwen_loaded: false,
  vllm_server_started: false,
  completion_request_performed: false,
  token_generation_performed: false,
  inference_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));

if (!viable.length) {
  console.log(`${CONTRACT}=NO_GLOBAL_COMPATIBLE_STOCK`);
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
