const REST_BASE = "https://rest.runpod.io/v1";
const CONTRACT = "AVANTIQO_RUNPOD_PREMIUM_GPU_COST_AUDIT_V1";
const LOOKBACK_HOURS = Math.max(
  1,
  Math.min(24 * 31, Number(process.env.AVANTIQO_RUNPOD_GPU_AUDIT_LOOKBACK_HOURS || 72)),
);
const BILLING_LAG_HOURS = 1;

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function round(value, digits = 8) {
  const scale = 10 ** digits;
  return Math.round(Number(value || 0) * scale) / scale;
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function unique(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function closedWindow() {
  const lagSafe = Date.now() - BILLING_LAG_HOURS * 3_600_000;
  const endMs = Math.floor(lagSafe / 3_600_000) * 3_600_000;
  const startMs = endMs - LOOKBACK_HOURS * 3_600_000;
  return {
    startTime: new Date(startMs).toISOString(),
    endTime: new Date(endMs).toISOString(),
  };
}

async function getJson(path, key, query = {}) {
  const url = new URL(`${REST_BASE}${path}`);
  for (const [name, value] of Object.entries(query)) {
    if (value == null || value === "") continue;
    url.searchParams.set(name, String(value));
  }
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    throw new Error(
      `AVANTIQO_RUNPOD_GPU_AUDIT_HTTP_${response.status}:${text(body?.message || body?.error || body?.detail || raw).slice(0, 1000)}`,
    );
  }
  return body;
}

function rows(body) {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.data)) return body.data;
  return [];
}

function endpointLooksAvantiqo(endpoint = {}) {
  const template = endpoint.template && typeof endpoint.template === "object"
    ? endpoint.template
    : {};
  const haystack = [
    endpoint.name,
    template.name,
    template.imageName,
  ]
    .map((value) => text(value).toLowerCase())
    .join(" ");
  return haystack.includes("avantiqo");
}

function summarizeGpuRows(body) {
  const grouped = new Map();
  for (const row of rows(body)) {
    const gpu = text(row?.gpuTypeId) || "UNRESOLVED";
    const current = grouped.get(gpu) || {
      gpu_type_id: gpu,
      amount_usd: 0,
      time_billed_ms: 0,
      record_count: 0,
    };
    current.amount_usd += finite(row?.amount, 0);
    current.time_billed_ms += finite(row?.timeBilledMs, 0);
    current.record_count += 1;
    grouped.set(gpu, current);
  }
  return [...grouped.values()]
    .map((item) => ({
      ...item,
      amount_usd: round(item.amount_usd),
      billed_hours: round(item.time_billed_ms / 3_600_000, 6),
      effective_usd_per_hour:
        item.time_billed_ms > 0
          ? round(item.amount_usd / (item.time_billed_ms / 3_600_000), 6)
          : null,
    }))
    .filter((item) => item.amount_usd > 0 || item.time_billed_ms > 0)
    .sort((a, b) => b.amount_usd - a.amount_usd);
}

function premiumGpu(gpu) {
  return /\bB200\b|\bB300\b|\bH100\b|\bH200\b|RTX PRO 6000/i.test(text(gpu));
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const window = closedWindow();

console.log(`AVANTIQO_RUNPOD_GPU_AUDIT_CONTRACT=${CONTRACT}`);
console.log(`AVANTIQO_RUNPOD_GPU_AUDIT_WINDOW=${window.startTime}|${window.endTime}`);
console.log("AVANTIQO_RUNPOD_GPU_AUDIT_READ_ONLY=true");
console.log("AVANTIQO_RUNPOD_GPU_AUDIT_GENERATION=false");
console.log("AVANTIQO_RUNPOD_GPU_AUDIT_CACHE_OPERATION=false");
console.log("AVANTIQO_RUNPOD_GPU_AUDIT_ENDPOINT_MUTATION=false");
console.log("AVANTIQO_RUNPOD_GPU_AUDIT_PRODUCTION_DEPLOY=false");

const endpoints = await getJson(
  "/endpoints",
  managementKey,
  { includeTemplate: "true", includeWorkers: "true" },
);
if (!Array.isArray(endpoints)) {
  throw new Error("AVANTIQO_RUNPOD_GPU_AUDIT_ENDPOINT_LIST_INVALID");
}

const avantiqoEndpoints = endpoints
  .filter(endpointLooksAvantiqo)
  .sort((a, b) => text(a.name).localeCompare(text(b.name)));

const report = [];
for (const endpoint of avantiqoEndpoints) {
  const endpointId = text(endpoint.id);
  if (!endpointId) continue;
  const billing = await getJson("/billing/endpoints", managementKey, {
    endpointId,
    bucketSize: "hour",
    grouping: "gpuTypeId",
    startTime: window.startTime,
    endTime: window.endTime,
  });
  const byGpu = summarizeGpuRows(billing);
  const totalUsd = round(byGpu.reduce((sum, item) => sum + item.amount_usd, 0));
  const totalHours = round(byGpu.reduce((sum, item) => sum + item.billed_hours, 0), 6);
  const premium = byGpu.filter((item) => premiumGpu(item.gpu_type_id));
  const configuredPool = unique(list(endpoint.gpuTypeIds));

  report.push({
    endpoint_id: endpointId,
    endpoint_name: text(endpoint.name),
    configured_gpu_pool: configuredPool,
    workers_min: finite(endpoint.workersMin, null),
    workers_max: finite(endpoint.workersMax, null),
    idle_timeout_seconds: finite(endpoint.idleTimeout, null),
    total_usd: totalUsd,
    billed_hours: totalHours,
    by_gpu: byGpu,
    premium_gpu_spend: premium,
    b200_billed: byGpu.some((item) => /\bB200\b/i.test(item.gpu_type_id)),
    h100_or_h200_billed: byGpu.some((item) => /\bH100\b|\bH200\b/i.test(item.gpu_type_id)),
    rtx_pro_6000_billed: byGpu.some((item) => /RTX PRO 6000/i.test(item.gpu_type_id)),
  });

  for (const item of byGpu) {
    console.log(
      `AVANTIQO_RUNPOD_GPU_COST endpoint=${text(endpoint.name)} gpu=${item.gpu_type_id.replaceAll(" ", "_")} usd=${item.amount_usd} billed_hours=${item.billed_hours} effective_usd_per_hour=${item.effective_usd_per_hour ?? "UNKNOWN"}`,
    );
  }
}

const image = report.find((item) => item.endpoint_name === "avantiqo-image-v1") || null;
const code = report.find((item) => item.endpoint_name === "avantiqo-code-v1") || null;

console.log(
  `AVANTIQO_RUNPOD_GPU_AUDIT_IMAGE_B200_BILLED=${image?.b200_billed === true ? "YES" : "NO"}`,
);
console.log(
  `AVANTIQO_RUNPOD_GPU_AUDIT_CODE_B200_BILLED=${code?.b200_billed === true ? "YES" : "NO"}`,
);
console.log(
  `AVANTIQO_RUNPOD_GPU_AUDIT_IMAGE_POOL=${image?.configured_gpu_pool.join("|") || "NOT_FOUND"}`,
);
console.log(
  `AVANTIQO_RUNPOD_GPU_AUDIT_CODE_POOL=${code?.configured_gpu_pool.join("|") || "NOT_FOUND"}`,
);
console.log("AVANTIQO_RUNPOD_GPU_AUDIT_COMPLETE=YES");
console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  billing_window: window,
  endpoint_count: report.length,
  endpoints: report,
  safety: {
    read_only: true,
    generation_submitted: false,
    cache_operation_submitted: false,
    endpoint_mutation: false,
    production_deploy: false,
  },
}, null, 2));
