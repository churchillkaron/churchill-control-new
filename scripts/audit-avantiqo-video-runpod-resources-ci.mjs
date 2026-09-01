const REST_BASE = "https://rest.runpod.io/v1";
const OLD_VOLUME_ID = "7pcdebhpga";

function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value : []; }
function finite(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function normalizeRows(value, keys = [], depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 4) return [];
  for (const key of [...keys, "data", "items", "results"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const nested = normalizeRows(value[key], keys, depth + 1);
    if (nested.length || Array.isArray(value[key])) return nested;
  }
  return [];
}
function unique(values) { return [...new Set(values.map(text).filter(Boolean))]; }
function volumeIds(row = {}) {
  return unique([
    row.networkVolumeId,
    row.network_volume_id,
    ...(Array.isArray(row.networkVolumeIds) ? row.networkVolumeIds.map((v) => typeof v === "string" ? v : v?.id || v?.networkVolumeId) : []),
    ...(Array.isArray(row.network_volume_ids) ? row.network_volume_ids.map((v) => typeof v === "string" ? v : v?.id || v?.networkVolumeId) : []),
  ]);
}
function relevantName(name) {
  const value = text(name).toLowerCase();
  return value.includes("video") || value.includes("cinema") || value.includes("ltx");
}
function workerSummary(worker = {}) {
  return {
    id: text(worker.id || worker.workerId) || null,
    desired_status: text(worker.desiredStatus || worker.desired_status).toUpperCase() || null,
    status: text(worker.status || worker.workerStatus || worker.runtimeStatus).toUpperCase() || null,
    gpu_type_id: text(worker.gpuTypeId || worker.gpu?.displayName || worker.gpu?.id || worker.machine?.gpuTypeId || worker.machine?.gpuType?.id || worker.machine?.gpuDisplayName) || null,
    data_center_id: text(worker.dataCenterId || worker.machine?.dataCenterId || worker.machine?.dataCenter?.id) || null,
    cost_per_hr: finite(worker.costPerHr ?? worker.cost_per_hr),
  };
}
async function rest(path) {
  const key = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
  if (!key) throw new Error("RUNPOD_MANAGEMENT_API_KEY_REQUIRED");
  const response = await fetch(`${REST_BASE}${path}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) throw new Error(`RUNPOD_RESOURCE_AUDIT_HTTP_${response.status}:${text(body?.message || body?.error || raw).slice(0,500)}`);
  return body;
}

const [rawEndpoints, rawTemplates, rawVolumes, rawPods] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true"),
  rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false"),
  rest("/networkvolumes"),
  rest("/pods"),
]);
const endpoints = normalizeRows(rawEndpoints, ["endpoints", "serverlessEndpoints"]);
const templates = normalizeRows(rawTemplates, ["templates"]);
const volumes = normalizeRows(rawVolumes, ["networkVolumes", "networkvolumes"]);
const pods = normalizeRows(rawPods, ["pods"]);

const endpointRows = endpoints.map((row) => {
  const workers = list(row.workers).map(workerSummary);
  const activeWorkers = workers.filter((w) => !["EXITED","TERMINATED","DELETED","STOPPED"].includes(text(w.status).toUpperCase()));
  return {
    id: text(row.id),
    name: text(row.name),
    template_id: text(row.templateId || row.template?.id),
    network_volume_ids: volumeIds(row),
    workers_min: finite(row.workersMin ?? row.workers_min),
    workers_max: finite(row.workersMax ?? row.workers_max),
    active_workers: activeWorkers.length,
    active_worker_details: activeWorkers,
  };
});
const relevantEndpoints = endpointRows.filter((row) => relevantName(row.name));
const oldVolumeReferences = endpointRows.filter((row) => row.network_volume_ids.includes(OLD_VOLUME_ID));
const relevantTemplates = templates.filter((row) => relevantName(row?.name) || relevantName(row?.imageName || row?.image_name)).map((row) => ({
  id: text(row.id),
  name: text(row.name),
  image_name: text(row.imageName || row.image_name),
}));
const relevantVolumes = volumes.filter((row) => relevantName(row?.name)).map((row) => {
  const id = text(row.id);
  const endpointNames = endpointRows.filter((e) => e.network_volume_ids.includes(id)).map((e) => e.name);
  const podNames = pods.filter((p) => text(p?.networkVolume?.id || p?.networkVolumeId || p?.network_volume_id) === id).map((p) => text(p.name)).filter(Boolean);
  return {
    id,
    name: text(row.name),
    size_gb: finite(row.size ?? row.sizeGb ?? row.sizeInGb),
    data_center_id: text(row.dataCenterId || row.data_center_id),
    endpoint_names: endpointNames,
    pod_names: podNames,
  };
});
const relevantPods = pods.filter((row) => relevantName(row?.name)).map((row) => ({
  id: text(row.id),
  name: text(row.name),
  status: text(row.status || row.runtimeStatus || row.desiredStatus),
  gpu_type_id: text(row?.machine?.gpuTypeId || row?.machine?.gpuType?.id || row?.gpuTypeId || row?.gpu_type_id),
  network_volume_id: text(row?.networkVolume?.id || row?.networkVolumeId || row?.network_volume_id),
}));

const inventory = {
  contract: "AVANTIQO_VIDEO_RUNPOD_RESOURCE_AUDIT_V3",
  mutation_performed: false,
  generation_submitted: false,
  production_deploy_performed: false,
  endpoints: relevantEndpoints,
  old_volume_references: oldVolumeReferences,
  templates: relevantTemplates,
  volumes: relevantVolumes,
  pods: relevantPods,
};
console.log("AVANTIQO_VIDEO_RUNPOD_RESOURCE_AUDIT=PASS");
console.log(`AVANTIQO_VIDEO_RUNPOD_RESOURCE_INVENTORY=${JSON.stringify(inventory)}`);
