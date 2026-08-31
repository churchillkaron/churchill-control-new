import { writeFile } from 'node:fs/promises';

const REST_BASE = 'https://rest.runpod.io/v1';
const key = String(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY || '').trim();
if (!key) throw new Error('RUNPOD_MANAGEMENT_API_KEY_REQUIRED');

const now = new Date();
const start = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
const iso = (d) => d.toISOString();
const num = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
const text = (v) => String(v ?? '').trim();
const arr = (v) => Array.isArray(v) ? v : [];

async function get(path, params = {}) {
  const url = new URL(`${REST_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    url.searchParams.set(k, String(v));
  }
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(30000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch {}
  if (!response.ok) {
    throw new Error(`RUNPOD_AUDIT_HTTP_${response.status}:${text(body?.message || body?.error || body?.detail || raw).slice(0, 500)}`);
  }
  return body;
}

function dayKey(value) {
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : 'unknown';
}

function summarizeBilling(rows, idKey) {
  const byDay = new Map();
  const byResource = new Map();
  let total = 0;
  let billedMs = 0;
  for (const row of arr(rows)) {
    const amount = num(row?.amount);
    total += amount;
    billedMs += num(row?.timeBilledMs);
    const day = dayKey(row?.time || row?.billedAt || row?.createdAt);
    byDay.set(day, (byDay.get(day) || 0) + amount);
    const id = text(row?.[idKey]) || 'unattributed';
    const prior = byResource.get(id) || { id, amount: 0, billed_hours: 0, gpu_types: new Set(), pod_ids: new Set() };
    prior.amount += amount;
    prior.billed_hours += num(row?.timeBilledMs) / 3600000;
    if (text(row?.gpuTypeId)) prior.gpu_types.add(text(row.gpuTypeId));
    if (text(row?.podId)) prior.pod_ids.add(text(row.podId));
    byResource.set(id, prior);
  }
  return {
    total_usd: Number(total.toFixed(4)),
    billed_hours: Number((billedMs / 3600000).toFixed(2)),
    by_day: [...byDay.entries()].map(([day, amount]) => ({ day, amount_usd: Number(amount.toFixed(4)) })).sort((a,b) => a.day.localeCompare(b.day)),
    top_resources: [...byResource.values()].map((r) => ({
      id: r.id,
      amount_usd: Number(r.amount.toFixed(4)),
      billed_hours: Number(r.billed_hours.toFixed(2)),
      gpu_types: [...r.gpu_types],
      pod_ids: [...r.pod_ids],
    })).sort((a,b) => b.amount_usd - a.amount_usd),
  };
}

const commonBillingParams = {
  bucketSize: 'day',
  startTime: iso(start),
  endTime: iso(now),
};

const [podsRaw, endpointsRaw, volumesRaw, podBillingRaw, endpointBillingRaw, volumeBillingRaw] = await Promise.all([
  get('/pods'),
  get('/endpoints', { includeWorkers: 'true', includeTemplate: 'false' }),
  get('/networkvolumes'),
  get('/billing/pods', commonBillingParams),
  get('/billing/endpoints', commonBillingParams),
  get('/billing/networkvolumes', commonBillingParams),
]);

const pods = arr(podsRaw).map((p) => ({
  id: text(p?.id) || null,
  name: text(p?.name) || null,
  desired_status: text(p?.desiredStatus) || null,
  last_started_at: text(p?.lastStartedAt) || null,
  gpu_type: text(p?.gpu?.displayName || p?.machine?.gpuTypeId || p?.machine?.gpuDisplayName) || null,
  gpu_count: num(p?.gpu?.count || p?.gpuCount),
  cost_per_hr_usd: num(p?.costPerHr || p?.adjustedCostPerHr || p?.machine?.costPerHr),
  adjusted_cost_per_hr_usd: num(p?.adjustedCostPerHr),
  endpoint_id: text(p?.endpointId) || null,
  network_volume_id: text(p?.networkVolume?.id || p?.networkVolumeId) || null,
}));

const endpoints = arr(endpointsRaw).map((e) => {
  const workers = arr(e?.workers).map((w) => ({
    id: text(w?.id) || null,
    desired_status: text(w?.desiredStatus) || null,
    last_started_at: text(w?.lastStartedAt) || null,
    gpu_type: text(w?.gpu?.displayName || w?.machine?.gpuTypeId || w?.machine?.gpuDisplayName) || null,
    adjusted_cost_per_hr_usd: num(w?.adjustedCostPerHr || w?.costPerHr || w?.machine?.costPerHr),
  }));
  return {
    id: text(e?.id) || null,
    name: text(e?.name) || null,
    workers_min: num(e?.workersMin),
    workers_max: num(e?.workersMax),
    idle_timeout_seconds: num(e?.idleTimeout),
    gpu_type_ids: arr(e?.gpuTypeIds).map(text).filter(Boolean),
    network_volume_ids: [...new Set([text(e?.networkVolumeId), ...arr(e?.networkVolumeIds).map(text)].filter(Boolean))],
    worker_count: workers.length,
    worker_hourly_usd: Number(workers.reduce((sum, w) => sum + num(w.adjusted_cost_per_hr_usd), 0).toFixed(4)),
    workers,
  };
});

const volumes = arr(volumesRaw).map((v) => ({
  id: text(v?.id) || null,
  name: text(v?.name) || null,
  data_center_id: text(v?.dataCenterId) || null,
  size_gb: num(v?.size),
  baseline_storage_daily_estimate_usd: Number((num(v?.size) * 0.07 / 30).toFixed(4)),
}));

const podBilling = summarizeBilling(podBillingRaw, 'podId');
const endpointBilling = summarizeBilling(endpointBillingRaw, 'endpointId');
const volumeBilling = summarizeBilling(volumeBillingRaw, 'networkVolumeId');

const endpointNameById = new Map(endpoints.map((e) => [e.id, e.name]));
const podNameById = new Map(pods.map((p) => [p.id, p.name]));
for (const item of endpointBilling.top_resources) item.name = endpointNameById.get(item.id) || null;
for (const item of podBilling.top_resources) item.name = podNameById.get(item.id) || null;

const currentRunningPods = pods.filter((p) => String(p.desired_status).toUpperCase() === 'RUNNING');
const currentServerlessWorkers = endpoints.flatMap((e) => e.workers.map((w) => ({ endpoint_id: e.id, endpoint_name: e.name, ...w })));
const alwaysOnEndpoints = endpoints.filter((e) => e.workers_min > 0);
const liveHourlyUsd = currentRunningPods.reduce((s, p) => s + num(p.adjusted_cost_per_hr_usd || p.cost_per_hr_usd), 0)
  + currentServerlessWorkers.reduce((s, w) => s + num(w.adjusted_cost_per_hr_usd), 0);

const report = {
  success: true,
  contract: 'AVANTIQO_RUNPOD_LIVE_SPEND_AUDIT_V1',
  read_only: true,
  production_deploy_performed: false,
  generated_at: iso(now),
  window_start: iso(start),
  current: {
    running_pods: currentRunningPods,
    serverless_workers: currentServerlessWorkers,
    always_on_endpoints: alwaysOnEndpoints,
    all_endpoints: endpoints,
    network_volumes: volumes,
    observed_live_compute_hourly_usd: Number(liveHourlyUsd.toFixed(4)),
    observed_live_compute_daily_usd_if_unchanged: Number((liveHourlyUsd * 24).toFixed(2)),
    baseline_network_volume_daily_estimate_usd: Number(volumes.reduce((s, v) => s + v.baseline_storage_daily_estimate_usd, 0).toFixed(4)),
  },
  billing: {
    pods: podBilling,
    serverless: endpointBilling,
    network_volumes: volumeBilling,
    combined_window_usd: Number((podBilling.total_usd + endpointBilling.total_usd + volumeBilling.total_usd).toFixed(4)),
  },
};

await writeFile('avantiqo-runpod-live-spend-audit.json', JSON.stringify(report, null, 2));
console.log(`AVANTIQO_RUNPOD_LIVE_SPEND_CURRENT_HOURLY_USD=${report.current.observed_live_compute_hourly_usd}`);
console.log(`AVANTIQO_RUNPOD_LIVE_SPEND_CURRENT_DAILY_IF_UNCHANGED_USD=${report.current.observed_live_compute_daily_usd_if_unchanged}`);
console.log(`AVANTIQO_RUNPOD_LIVE_SPEND_BILLING_WINDOW_USD=${report.billing.combined_window_usd}`);
console.log(`AVANTIQO_RUNPOD_LIVE_SPEND_ALWAYS_ON_ENDPOINTS=${alwaysOnEndpoints.length}`);
console.log(`AVANTIQO_RUNPOD_LIVE_SPEND_RUNNING_PODS=${currentRunningPods.length}`);
console.log(`AVANTIQO_RUNPOD_LIVE_SPEND_SERVERLESS_WORKERS=${currentServerlessWorkers.length}`);
console.log('AVANTIQO_RUNPOD_LIVE_SPEND_AUDIT=PASS');
console.log(JSON.stringify(report, null, 2));
