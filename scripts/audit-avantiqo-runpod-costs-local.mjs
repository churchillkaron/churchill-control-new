import { writeFile } from "node:fs/promises";

const REST_BASE = "https://rest.runpod.io/v1";
const CONTRACT = "AVANTIQO_RUNPOD_COST_AUDIT_V1";
const DEFAULT_LOOKBACK_HOURS = 72;
const BILLING_LAG_HOURS = 1;
const OUTPUT_PATH =
  process.env.AVANTIQO_RUNPOD_COST_AUDIT_OUTPUT ||
  "/tmp/avantiqo-runpod-cost-audit.json";

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

function round(value, digits = 8) {
  if (!Number.isFinite(Number(value))) return null;
  const scale = 10 ** digits;
  return Math.round(Number(value) * scale) / scale;
}

function clamp(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function unique(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function normalizeStringList(value) {
  if (Array.isArray(value)) return unique(value);
  return unique(text(value).split(","));
}

function closedBillingWindow() {
  const lookbackHours = clamp(
    process.env.AVANTIQO_RUNPOD_COST_AUDIT_LOOKBACK_HOURS,
    1,
    24 * 31,
    DEFAULT_LOOKBACK_HOURS,
  );
  const now = Date.now();
  const lagSafe = now - BILLING_LAG_HOURS * 60 * 60 * 1000;
  const endMs = Math.floor(lagSafe / 3_600_000) * 3_600_000;
  const startMs = endMs - lookbackHours * 3_600_000;
  return {
    start_time: new Date(startMs).toISOString(),
    end_time: new Date(endMs).toISOString(),
    lookback_hours: lookbackHours,
    billing_lag_hours: BILLING_LAG_HOURS,
    current_open_hour_excluded: true,
  };
}

async function requestJson(path, managementKey, query = {}) {
  const url = new URL(`${REST_BASE}${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value == null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${managementKey}`,
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
      `RUNPOD_COST_AUDIT_HTTP_${response.status}:${text(body?.message || body?.error || body?.detail || raw).slice(0, 1000)}`,
    );
  }
  return body;
}

function billingRows(body) {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.data)) return body.data;
  return [];
}

function sanitizeBillingRows(body) {
  return billingRows(body).map((row) => ({
    time: text(row?.time) || null,
    endpoint_id: text(row?.endpointId) || null,
    pod_id: text(row?.podId) || null,
    gpu_type_id: text(row?.gpuTypeId) || null,
    amount_usd: finite(row?.amount, 0),
    time_billed_ms: finite(row?.timeBilledMs, 0),
    disk_space_billed_gb: finite(row?.diskSpaceBilledGb),
  }));
}

function summarizeBilling(rows) {
  const usable = rows.filter(
    (row) => finite(row.amount_usd, 0) > 0 || finite(row.time_billed_ms, 0) > 0,
  );
  const amountUsd = usable.reduce((sum, row) => sum + finite(row.amount_usd, 0), 0);
  const timeBilledMs = usable.reduce((sum, row) => sum + finite(row.time_billed_ms, 0), 0);
  const billedHours = timeBilledMs / 3_600_000;
  return {
    record_count: usable.length,
    amount_usd: round(amountUsd),
    time_billed_ms: timeBilledMs,
    billed_hours: round(billedHours, 6),
    weighted_effective_usd_per_hour:
      billedHours > 0 ? round(amountUsd / billedHours, 6) : null,
  };
}

function summarizeBy(rows, key) {
  const groups = new Map();
  for (const row of rows) {
    const group = text(row?.[key]) || "UNRESOLVED";
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(row);
  }
  return [...groups.entries()]
    .map(([id, groupRows]) => ({ id, ...summarizeBilling(groupRows) }))
    .filter((item) => item.amount_usd > 0 || item.time_billed_ms > 0)
    .sort((a, b) => b.amount_usd - a.amount_usd);
}

function sanitizeWorker(worker = {}) {
  const rawStatus = text(worker.status || worker.workerStatus || worker.runtimeStatus);
  const desiredStatus = text(worker.desiredStatus || worker.desired_status);
  return {
    id: text(worker.id) || null,
    desired_status: desiredStatus || null,
    status: rawStatus || null,
    last_status_change: text(worker.lastStatusChange) || null,
    cost_per_hour: finite(worker.costPerHr),
    adjusted_cost_per_hour: finite(worker.adjustedCostPerHr),
    gpu_display_name: text(worker.gpu?.displayName || worker.machine?.gpuDisplayName) || null,
    gpu_type_id: text(worker.machine?.gpuTypeId) || null,
  };
}

function endpointLooksAvantiqo(endpoint = {}) {
  const template = object(endpoint.template);
  const haystack = [
    endpoint.name,
    template.name,
    template.imageName,
    ...Object.keys(object(endpoint.env)),
    ...Object.keys(object(template.env)),
  ]
    .map((value) => text(value).toLowerCase())
    .join(" ");
  return haystack.includes("avantiqo");
}

function endpointRisk(endpoint = {}) {
  const workersMin = finite(endpoint.workersMin, 0);
  const workersMax = finite(endpoint.workersMax, 0);
  const idleTimeout = finite(endpoint.idleTimeout, 0);
  const gpuTypes = normalizeStringList(endpoint.gpuTypeIds);
  const flags = [];
  if (workersMin > 0) flags.push("ALWAYS_ON_MIN_WORKERS");
  if (workersMax > 1) flags.push("MULTIPLE_CONCURRENT_WORKERS_ALLOWED");
  if (idleTimeout > 300) flags.push("LONG_IDLE_WINDOW_OVER_5_MINUTES");
  else if (idleTimeout > 60) flags.push("IDLE_WINDOW_OVER_60_SECONDS");
  if (gpuTypes.some((gpu) => /\bB300\b|\bB200\b/i.test(gpu))) {
    flags.push("PREMIUM_B200_OR_B300_ALLOWED");
  }
  if (gpuTypes.some((gpu) => /\bH200\b|\bH100\b/i.test(gpu))) {
    flags.push("PREMIUM_H100_OR_H200_ALLOWED");
  }
  if (gpuTypes.some((gpu) => /RTX PRO 6000/i.test(gpu))) {
    flags.push("PREMIUM_RTX_PRO_6000_ALLOWED");
  }
  return {
    flags,
    high_risk: flags.some((flag) =>
      [
        "ALWAYS_ON_MIN_WORKERS",
        "MULTIPLE_CONCURRENT_WORKERS_ALLOWED",
        "PREMIUM_B200_OR_B300_ALLOWED",
      ].includes(flag),
    ),
  };
}

function sanitizeEndpoint(endpoint = {}) {
  const template = object(endpoint.template);
  const workers = list(endpoint.workers).map(sanitizeWorker);
  const activeWorkerHourly = workers
    .filter((worker) => text(worker.desired_status).toUpperCase() !== "EXITED")
    .reduce(
      (sum, worker) =>
        sum + finite(worker.adjusted_cost_per_hour ?? worker.cost_per_hour, 0),
      0,
    );
  const risk = endpointRisk(endpoint);
  return {
    id: text(endpoint.id) || null,
    name: text(endpoint.name) || null,
    compute_type: text(endpoint.computeType) || null,
    gpu_count: finite(endpoint.gpuCount),
    gpu_type_ids: normalizeStringList(endpoint.gpuTypeIds),
    data_center_ids: normalizeStringList(endpoint.dataCenterIds),
    network_volume_ids: unique([
      endpoint.networkVolumeId,
      ...normalizeStringList(endpoint.networkVolumeIds),
    ]),
    workers_min: finite(endpoint.workersMin),
    workers_max: finite(endpoint.workersMax),
    idle_timeout_seconds: finite(endpoint.idleTimeout),
    execution_timeout_ms: finite(endpoint.executionTimeoutMs),
    scaler_type: text(endpoint.scalerType) || null,
    scaler_value: finite(endpoint.scalerValue),
    flashboot: endpoint.flashboot === true || endpoint.flashBoot === true,
    template_id: text(endpoint.templateId || template.id) || null,
    template_name: text(template.name) || null,
    template_image_name: text(template.imageName) || null,
    workers,
    current_non_exited_worker_estimated_usd_per_hour: round(activeWorkerHourly, 6),
    risk,
  };
}

function sanitizeVolumes(volumes) {
  return list(volumes).map((volume) => ({
    id: text(volume?.id) || null,
    name: text(volume?.name) || null,
    size_gb: finite(volume?.size),
    data_center_id: text(volume?.dataCenterId) || null,
  }));
}

function sanitizeNetworkVolumeBilling(body) {
  return billingRows(body).map((row) => ({
    time: text(row?.time) || null,
    amount_usd: finite(row?.amount, 0),
    disk_space_billed_gb: finite(row?.diskSpaceBilledGb),
    high_performance_storage_amount_usd: finite(row?.highPerformanceStorageAmount, 0),
    high_performance_storage_disk_space_billed_gb: finite(
      row?.highPerformanceStorageDiskSpaceBilledGb,
    ),
  }));
}

function summarizeNetworkVolumeBilling(rows) {
  return {
    record_count: rows.length,
    amount_usd: round(rows.reduce((sum, row) => sum + finite(row.amount_usd, 0), 0)),
    high_performance_storage_amount_usd: round(
      rows.reduce(
        (sum, row) => sum + finite(row.high_performance_storage_amount_usd, 0),
        0,
      ),
    ),
  };
}

async function endpointBilling(endpointId, managementKey, window) {
  const common = {
    endpointId,
    bucketSize: "hour",
    startTime: window.start_time,
    endTime: window.end_time,
  };
  const [gpuBody, podBody] = await Promise.all([
    requestJson("/billing/endpoints", managementKey, {
      ...common,
      grouping: "gpuTypeId",
    }),
    requestJson("/billing/endpoints", managementKey, {
      ...common,
      grouping: "podId",
    }),
  ]);
  const gpuRows = sanitizeBillingRows(gpuBody);
  const podRows = sanitizeBillingRows(podBody);
  return {
    summary: summarizeBilling(gpuRows),
    by_gpu: summarizeBy(gpuRows, "gpu_type_id"),
    by_billing_pod: summarizeBy(podRows, "pod_id"),
    gpu_rows: gpuRows,
    pod_rows: podRows,
  };
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const window = closedBillingWindow();

console.log(`AVANTIQO_RUNPOD_COST_AUDIT_CONTRACT=${CONTRACT}`);
console.log(`AVANTIQO_RUNPOD_COST_AUDIT_WINDOW=${window.start_time}|${window.end_time}`);
console.log(`AVANTIQO_RUNPOD_COST_AUDIT_LOOKBACK_HOURS=${window.lookback_hours}`);
console.log(`AVANTIQO_RUNPOD_COST_AUDIT_BILLING_LAG_HOURS=${window.billing_lag_hours}`);
console.log("AVANTIQO_RUNPOD_COST_AUDIT_READ_ONLY=true");
console.log("AVANTIQO_RUNPOD_COST_AUDIT_GENERATION_SUBMITTED=false");
console.log("AVANTIQO_RUNPOD_COST_AUDIT_CACHE_OPERATION_SUBMITTED=false");
console.log("AVANTIQO_RUNPOD_COST_AUDIT_ENDPOINT_MUTATION=false");
console.log("AVANTIQO_RUNPOD_COST_AUDIT_PRODUCTION_DEPLOY=false");
console.log("AVANTIQO_RUNPOD_COST_AUDIT_SECRETS_PRINTED=false");

const [endpointBody, volumeBody, accountEndpointBody, accountGpuBody, storageBody, podComputeBody] =
  await Promise.all([
    requestJson("/endpoints", managementKey, {
      includeTemplate: "true",
      includeWorkers: "true",
    }),
    requestJson("/networkvolumes", managementKey),
    requestJson("/billing/endpoints", managementKey, {
      bucketSize: "hour",
      grouping: "endpointId",
      startTime: window.start_time,
      endTime: window.end_time,
    }),
    requestJson("/billing/endpoints", managementKey, {
      bucketSize: "hour",
      grouping: "gpuTypeId",
      startTime: window.start_time,
      endTime: window.end_time,
    }),
    requestJson("/billing/networkvolumes", managementKey, {
      bucketSize: "day",
      startTime: window.start_time,
      endTime: window.end_time,
    }),
    requestJson("/billing/pods", managementKey, {
      bucketSize: "hour",
      grouping: "gpuTypeId",
      startTime: window.start_time,
      endTime: window.end_time,
    }),
  ]);

if (!Array.isArray(endpointBody)) {
  throw new Error("AVANTIQO_RUNPOD_COST_AUDIT_ENDPOINT_LIST_INVALID");
}

const allEndpoints = endpointBody.map(sanitizeEndpoint);
const avantiqoEndpoints = endpointBody
  .filter(endpointLooksAvantiqo)
  .map(sanitizeEndpoint)
  .sort((a, b) => text(a.name).localeCompare(text(b.name)));
const endpointNamesById = new Map(allEndpoints.map((endpoint) => [endpoint.id, endpoint.name]));
const accountEndpointRows = sanitizeBillingRows(accountEndpointBody);
const accountGpuRows = sanitizeBillingRows(accountGpuBody);
const accountServerlessSummary = summarizeBilling(accountEndpointRows);
const accountStorageRows = sanitizeNetworkVolumeBilling(storageBody);
const accountStorageSummary = summarizeNetworkVolumeBilling(accountStorageRows);
const accountPodRows = sanitizeBillingRows(podComputeBody);
const accountPodSummary = summarizeBilling(accountPodRows);

const endpointReports = [];
for (const endpoint of avantiqoEndpoints) {
  const billing = await endpointBilling(endpoint.id, managementKey, window);
  endpointReports.push({ ...endpoint, billing });
  console.log(
    [
      "AVANTIQO_RUNPOD_ENDPOINT_COST",
      `name=${endpoint.name}`,
      `id=${endpoint.id}`,
      `usd=${billing.summary.amount_usd}`,
      `billed_hours=${billing.summary.billed_hours}`,
      `workers_min=${endpoint.workers_min}`,
      `workers_max=${endpoint.workers_max}`,
      `idle_timeout_seconds=${endpoint.idle_timeout_seconds}`,
      `gpu_pool=${endpoint.gpu_type_ids.join("|") || "NONE"}`,
      `risk=${endpoint.risk.flags.join("|") || "NONE"}`,
    ].join(" "),
  );
}

endpointReports.sort((a, b) => b.billing.summary.amount_usd - a.billing.summary.amount_usd);

const avantiqoEndpointIds = new Set(endpointReports.map((endpoint) => endpoint.id));
const avantiqoAccountRows = accountEndpointRows.filter((row) => avantiqoEndpointIds.has(row.endpoint_id));
const nonAvantiqoAccountRows = accountEndpointRows.filter(
  (row) => !avantiqoEndpointIds.has(row.endpoint_id),
);
const avantiqoServerlessSummary = summarizeBilling(avantiqoAccountRows);
const nonAvantiqoServerlessSummary = summarizeBilling(nonAvantiqoAccountRows);

const accountByEndpoint = summarizeBy(accountEndpointRows, "endpoint_id").map((item) => ({
  ...item,
  endpoint_name: endpointNamesById.get(item.id) || null,
  avantiqo_endpoint: avantiqoEndpointIds.has(item.id),
}));
const accountByGpu = summarizeBy(accountGpuRows, "gpu_type_id");
const topOffenders = endpointReports.slice(0, 10).map((endpoint) => ({
  endpoint_id: endpoint.id,
  endpoint_name: endpoint.name,
  amount_usd: endpoint.billing.summary.amount_usd,
  billed_hours: endpoint.billing.summary.billed_hours,
  weighted_effective_usd_per_hour:
    endpoint.billing.summary.weighted_effective_usd_per_hour,
  gpu_types_billed: endpoint.billing.by_gpu.map((row) => row.id),
  gpu_pool_configured: endpoint.gpu_type_ids,
  workers_min: endpoint.workers_min,
  workers_max: endpoint.workers_max,
  idle_timeout_seconds: endpoint.idle_timeout_seconds,
  risk_flags: endpoint.risk.flags,
}));

const report = {
  success: true,
  contract: CONTRACT,
  generated_at: new Date().toISOString(),
  billing_window: window,
  safety: {
    read_only: true,
    runpod_get_requests_only: true,
    generation_submitted: false,
    cache_operation_submitted: false,
    endpoint_mutation_performed: false,
    volume_mutation_performed: false,
    production_deploy: false,
    secrets_in_output: false,
  },
  inventory: {
    account_endpoint_count: allEndpoints.length,
    avantiqo_endpoint_count: endpointReports.length,
    network_volumes: sanitizeVolumes(volumeBody),
  },
  account_costs: {
    serverless: accountServerlessSummary,
    serverless_by_endpoint: accountByEndpoint,
    serverless_by_gpu: accountByGpu,
    network_volume_storage: accountStorageSummary,
    network_volume_storage_rows: accountStorageRows,
    pod_compute: accountPodSummary,
    pod_compute_by_gpu: summarizeBy(accountPodRows, "gpu_type_id"),
  },
  attribution: {
    avantiqo_serverless: avantiqoServerlessSummary,
    non_avantiqo_or_unmatched_serverless: nonAvantiqoServerlessSummary,
    account_serverless_minus_avantiqo_usd: round(
      accountServerlessSummary.amount_usd - avantiqoServerlessSummary.amount_usd,
    ),
    account_serverless_crosscheck_pass:
      Math.abs(
        accountServerlessSummary.amount_usd -
          avantiqoServerlessSummary.amount_usd -
          nonAvantiqoServerlessSummary.amount_usd,
      ) < 0.000001,
  },
  top_avantiqo_cost_offenders: topOffenders,
  endpoints: endpointReports,
  immediate_cost_risks: endpointReports
    .filter((endpoint) => endpoint.risk.flags.length)
    .map((endpoint) => ({
      endpoint_id: endpoint.id,
      endpoint_name: endpoint.name,
      amount_usd: endpoint.billing.summary.amount_usd,
      risk_flags: endpoint.risk.flags,
      workers_min: endpoint.workers_min,
      workers_max: endpoint.workers_max,
      idle_timeout_seconds: endpoint.idle_timeout_seconds,
      gpu_type_ids: endpoint.gpu_type_ids,
    })),
  next_action: "REVIEW_TOP_OFFENDERS_THEN_APPLY_ENDPOINT_SPECIFIC_COST_GUARDS",
};

await writeFile(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(`AVANTIQO_RUNPOD_COST_AUDIT_ACCOUNT_SERVERLESS_USD=${accountServerlessSummary.amount_usd}`);
console.log(`AVANTIQO_RUNPOD_COST_AUDIT_AVANTIQO_SERVERLESS_USD=${avantiqoServerlessSummary.amount_usd}`);
console.log(`AVANTIQO_RUNPOD_COST_AUDIT_OTHER_SERVERLESS_USD=${nonAvantiqoServerlessSummary.amount_usd}`);
console.log(`AVANTIQO_RUNPOD_COST_AUDIT_NETWORK_STORAGE_USD=${accountStorageSummary.amount_usd}`);
console.log(`AVANTIQO_RUNPOD_COST_AUDIT_POD_COMPUTE_USD=${accountPodSummary.amount_usd}`);
console.log(`AVANTIQO_RUNPOD_COST_AUDIT_TOP_OFFENDERS=${topOffenders.map((item) => `${item.endpoint_name}:${item.amount_usd}`).join("|") || "NONE"}`);
console.log(`AVANTIQO_RUNPOD_COST_AUDIT_OUTPUT=${OUTPUT_PATH}`);
console.log("AVANTIQO_RUNPOD_COST_AUDIT_COMPLETE=YES");
