import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const REST_BASE = "https://rest.runpod.io/v1";
const CONTRACT = "AVANTIQO_RUNPOD_BILLING_SYNC_V1";
const TABLE = "provider_supplier_billing_events";
const text = (value) => String(value ?? "").trim();
const list = (value) => (Array.isArray(value) ? value : []);
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function shell(name, args, code) {
  const result = spawnSync(name, args, { cwd: process.cwd(), encoding: "utf8", env: process.env });
  if (result.status !== 0) throw new Error(`${code}:${text(result.stderr || result.stdout).slice(0, 700)}`);
  return text(result.stdout);
}

function validateCurrentMain() {
  shell("git", ["fetch", "origin", "main"], "AVANTIQO_RUNPOD_BILLING_GIT_FETCH_FAILED");
  const branch = shell("git", ["branch", "--show-current"], "AVANTIQO_RUNPOD_BILLING_GIT_BRANCH_FAILED");
  if (branch !== "main") throw new Error(`AVANTIQO_RUNPOD_BILLING_MAIN_REQUIRED:${branch || "DETACHED"}`);
  const head = shell("git", ["rev-parse", "HEAD"], "AVANTIQO_RUNPOD_BILLING_GIT_HEAD_FAILED");
  const remote = shell("git", ["rev-parse", "origin/main"], "AVANTIQO_RUNPOD_BILLING_GIT_REMOTE_FAILED");
  if (head !== remote) throw new Error(`AVANTIQO_RUNPOD_BILLING_LOCAL_MAIN_NOT_CURRENT:${head}:${remote}`);
  return head;
}

async function getJson(url, token, code) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) throw new Error(`${code}_HTTP_${response.status}:${text(body?.message || body?.error || body?.detail || raw).slice(0, 1000)}`);
  return body ?? [];
}

async function supabaseUpsert(rows) {
  if (!rows.length) return;
  const base = text(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = text(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!base || !key) throw new Error("SUPABASE_SERVICE_ROLE_CONFIGURATION_REQUIRED");
  const response = await fetch(`${base}/rest/v1/${TABLE}?on_conflict=charge_key`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    const raw = await response.text();
    throw new Error(`AVANTIQO_RUNPOD_BILLING_SUPABASE_UPSERT_FAILED:${response.status}:${text(raw).slice(0, 1000)}`);
  }
}

function digest(parts) {
  return createHash("sha256").update(parts.map((part) => text(part)).join("|")).digest("hex");
}

function safeRows(payload) {
  if (Array.isArray(payload)) return payload;
  return list(payload?.data || payload?.items || payload?.results);
}

function endpointMap(endpoints) {
  return new Map(endpoints.map((row) => [text(row?.id), text(row?.name) || null]).filter(([id]) => id));
}

function serverlessRow(row, names, bucket) {
  const endpointId = text(row?.endpointId) || null;
  const gpuTypeId = text(row?.gpuTypeId) || null;
  const time = text(row?.time);
  const instanceId = text(row?.instanceId || row?.podId) || null;
  return {
    provider_id: "runpod",
    billing_source: "RUNPOD_REST_V1",
    resource_type: "SERVERLESS",
    charge_key: digest(["runpod", "serverless", bucket, time, endpointId, gpuTypeId, instanceId]),
    provider_resource_id: instanceId || endpointId,
    endpoint_id: endpointId,
    endpoint_name: endpointId ? names.get(endpointId) || null : null,
    pod_id: instanceId,
    network_volume_id: null,
    gpu_type_id: gpuTypeId,
    data_center_id: null,
    billed_at: time,
    bucket_size: bucket,
    amount: finite(row?.amount, 0),
    currency: "USD",
    time_billed_ms: finite(row?.timeBilledMs, finite(row?.timeBilledSeconds, 0) * 1000),
    disk_space_billed_gb: finite(row?.diskSpaceBilledGb),
    metadata: { authoritative_supplier_charge: true, raw_grouping: "endpointId" },
    updated_at: new Date().toISOString(),
  };
}

function podRow(row, bucket) {
  const podId = text(row?.podId) || null;
  const gpuTypeId = text(row?.gpuTypeId) || null;
  const time = text(row?.time);
  return {
    provider_id: "runpod",
    billing_source: "RUNPOD_REST_V1",
    resource_type: "POD",
    charge_key: digest(["runpod", "pod", bucket, time, podId, gpuTypeId]),
    provider_resource_id: podId,
    endpoint_id: text(row?.endpointId) || null,
    endpoint_name: null,
    pod_id: podId,
    network_volume_id: null,
    gpu_type_id: gpuTypeId,
    data_center_id: null,
    billed_at: time,
    bucket_size: bucket,
    amount: finite(row?.amount, 0),
    currency: "USD",
    time_billed_ms: finite(row?.timeBilledMs, 0),
    disk_space_billed_gb: finite(row?.diskSpaceBilledGb),
    metadata: { authoritative_supplier_charge: true },
    updated_at: new Date().toISOString(),
  };
}

function volumeRow(row, volume, bucket) {
  const volumeId = text(volume?.id) || null;
  const time = text(row?.time);
  return {
    provider_id: "runpod",
    billing_source: "RUNPOD_REST_V1",
    resource_type: "NETWORK_VOLUME",
    charge_key: digest(["runpod", "network-volume", bucket, time, volumeId]),
    provider_resource_id: volumeId,
    endpoint_id: null,
    endpoint_name: null,
    pod_id: null,
    network_volume_id: volumeId,
    gpu_type_id: null,
    data_center_id: text(volume?.dataCenterId) || null,
    billed_at: time,
    bucket_size: bucket,
    amount: finite(row?.amount, 0),
    currency: "USD",
    time_billed_ms: null,
    disk_space_billed_gb: finite(row?.diskSpaceBilledGb),
    metadata: {
      authoritative_supplier_charge: true,
      volume_name: text(volume?.name) || null,
      high_performance_storage_amount: finite(row?.highPerformanceStorageAmount),
      high_performance_storage_disk_space_billed_gb: finite(row?.highPerformanceStorageDiskSpaceBilledGb),
    },
    updated_at: new Date().toISOString(),
  };
}

const mainCommit = validateCurrentMain();
const token = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
if (!token) throw new Error("RUNPOD_MANAGEMENT_OR_API_KEY_REQUIRED");
const bucket = text(process.env.AVANTIQO_RUNPOD_BILLING_BUCKET_SIZE || "hour").toLowerCase();
if (!["hour", "day", "week", "month", "year"].includes(bucket)) throw new Error(`AVANTIQO_RUNPOD_BILLING_BUCKET_INVALID:${bucket}`);

const [endpointPayload, serverlessPayload, podPayload, volumePayload] = await Promise.all([
  getJson(`${REST_BASE}/endpoints?includeTemplate=false&includeWorkers=false`, token, "AVANTIQO_RUNPOD_BILLING_ENDPOINTS"),
  getJson(`${REST_BASE}/billing/endpoints?bucketSize=${encodeURIComponent(bucket)}&grouping=endpointId`, token, "AVANTIQO_RUNPOD_BILLING_SERVERLESS"),
  getJson(`${REST_BASE}/billing/pods?bucketSize=${encodeURIComponent(bucket)}&grouping=podId`, token, "AVANTIQO_RUNPOD_BILLING_PODS"),
  getJson(`${REST_BASE}/networkvolumes`, token, "AVANTIQO_RUNPOD_BILLING_VOLUMES"),
]);

const endpoints = safeRows(endpointPayload);
const names = endpointMap(endpoints);
const volumes = safeRows(volumePayload);
const rows = [
  ...safeRows(serverlessPayload).map((row) => serverlessRow(row, names, bucket)),
  ...safeRows(podPayload).map((row) => podRow(row, bucket)),
];

for (const volume of volumes) {
  const volumeId = text(volume?.id);
  if (!volumeId) continue;
  const payload = await getJson(`${REST_BASE}/billing/networkvolumes?bucketSize=${encodeURIComponent(bucket)}&networkVolumeId=${encodeURIComponent(volumeId)}`, token, "AVANTIQO_RUNPOD_BILLING_NETWORK_VOLUME");
  rows.push(...safeRows(payload).map((row) => volumeRow(row, volume, bucket)));
}

const validRows = rows.filter((row) => row.billed_at && Number.isFinite(Number(row.amount)));
await supabaseUpsert(validRows);

const todayBangkok = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const todayRows = validRows.filter((row) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(row.billed_at)) === todayBangkok);
const grouped = new Map();
for (const row of todayRows) {
  const key = row.resource_type === "SERVERLESS" ? (row.endpoint_name || row.endpoint_id || "UNKNOWN_SERVERLESS") : row.resource_type === "POD" ? (row.pod_id || "UNKNOWN_POD") : (row.metadata?.volume_name || row.network_volume_id || "UNKNOWN_VOLUME");
  const current = grouped.get(key) || { resource: key, resource_type: row.resource_type, amount_usd: 0, billed_ms: 0, gpu_types: new Set() };
  current.amount_usd += finite(row.amount, 0);
  current.billed_ms += finite(row.time_billed_ms, 0);
  if (row.gpu_type_id) current.gpu_types.add(row.gpu_type_id);
  grouped.set(key, current);
}
const breakdown = [...grouped.values()].map((row) => ({ ...row, amount_usd: Number(row.amount_usd.toFixed(6)), billed_seconds: Number((row.billed_ms / 1000).toFixed(3)), gpu_types: [...row.gpu_types] })).sort((a, b) => b.amount_usd - a.amount_usd);
const todayTotal = Number(breakdown.reduce((sum, row) => sum + row.amount_usd, 0).toFixed(6));

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  main_commit: mainCommit,
  bucket_size: bucket,
  rows_ingested: validRows.length,
  bangkok_date: todayBangkok,
  today_total_usd: todayTotal,
  today_breakdown: breakdown,
  authoritative_runpod_billing: true,
  secrets_printed: false,
  production_deploy_performed: false,
}, null, 2));
