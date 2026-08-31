import process from "node:process";

const CONTRACT = "AVANTIQO_CODE_EUR_IS1_REBIND_V1";
const REST = "https://rest.runpod.io/v1";
const QUEUE = "https://api.runpod.ai/v2";
const GQL = "https://api.runpod.io/graphql";
const ENDPOINT_ID = "r79dtnjnrilrlc";
const ENDPOINT_NAME = "avantiqo-code-v1";
const SOURCE_VOLUME_ID = "7obluigbr0";
const SOURCE_DC = "US-CA-2";
const TARGET_DC = "EUR-IS-1";
const TARGET_VOLUME_NAME = "avantiqo-code-cache-eur-is-1";
const TARGET_GPU = "NVIDIA RTX PRO 6000 Blackwell Server Edition";
const IMMUTABLE_IMAGE = "ghcr.io/churchillkaron/avantiqo-code-worker@sha256:67248bddd07c98f02d7c31b17f5bc678f566a1617657608284daf763defc4463";

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const approved = (value) => ["YES","TRUE","1","APPROVED"].includes(text(value).toUpperCase());

function required(name, fallback = "") {
  const value = text(process.env[name] || fallback);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}
async function readJson(response, label) {
  const raw = await response.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = { message: raw }; }
  if (!response.ok) throw new Error(`${label}_HTTP_${response.status}:${text(body?.message || body?.error || body?.detail || raw).slice(0,900)}`);
  return body;
}
async function rest(pathname, key, options = {}) {
  return readJson(await fetch(`${REST}${pathname}`, {
    method: options.method || "GET",
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json", ...(options.body ? {"Content-Type":"application/json"} : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30000),
  }), `${CONTRACT}_REST`);
}
async function queueHealth(key) {
  return readJson(await fetch(`${QUEUE}/${ENDPOINT_ID}/health`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30000),
  }), `${CONTRACT}_QUEUE`);
}
function volumeIds(endpoint = {}) {
  return [...new Set([endpoint.networkVolumeId, ...list(endpoint.networkVolumeIds)].map(text).filter(Boolean))];
}
function dcIds(endpoint = {}) {
  if (Array.isArray(endpoint.dataCenterIds)) return endpoint.dataCenterIds.map(text).filter(Boolean);
  return text(endpoint.dataCenterIds).split(",").map((x) => x.trim()).filter(Boolean);
}
function gpuIds(endpoint = {}) { return list(endpoint.gpuTypeIds).map(text).filter(Boolean); }
function healthSummary(body = {}) {
  const jobs = body.jobs || {};
  const workers = body.workers || {};
  return {
    in_queue: finite(jobs.inQueue ?? jobs.in_queue,0),
    in_progress: finite(jobs.inProgress ?? jobs.in_progress,0),
    workers: Object.fromEntries(["idle","initializing","ready","running","throttled","unhealthy"].map((k)=>[k,finite(workers[k],0)])),
  };
}
function assertClean(endpoint, health, label) {
  const h = healthSummary(health);
  if (text(endpoint.id) !== ENDPOINT_ID || text(endpoint.name) !== ENDPOINT_NAME) throw new Error(`${label}_ENDPOINT_IDENTITY`);
  if (finite(endpoint.workersMin,-1) !== 0 || finite(endpoint.workersMax,-1) !== 0) throw new Error(`${label}_NOT_0_0`);
  if (h.in_queue || h.in_progress || Object.values(h.workers).some((v)=>v !== 0)) throw new Error(`${label}_NOT_IDLE:${JSON.stringify(h)}`);
}
function stable(endpoint = {}) {
  return {
    id: text(endpoint.id),
    name: text(endpoint.name),
    template_id: text(endpoint.templateId || endpoint.template?.id),
    workers_min: finite(endpoint.workersMin),
    workers_max: finite(endpoint.workersMax),
    idle_timeout: finite(endpoint.idleTimeout),
    scaler_type: text(endpoint.scalerType),
    scaler_value: finite(endpoint.scalerValue),
    compute_type: text(endpoint.computeType),
    gpu_count: finite(endpoint.gpuCount),
    flashboot: endpoint.flashboot === true || endpoint.flashBoot === true || text(endpoint.flashBootType).toUpperCase() === "FLASHBOOT",
    allowed_cuda_versions: list(endpoint.allowedCudaVersions),
    min_cuda_version: text(endpoint.minCudaVersion),
    execution_timeout_ms: finite(endpoint.executionTimeoutMs ?? endpoint.executionTimeout),
  };
}
function sameStable(a,b) { return JSON.stringify(stable(a)) === JSON.stringify(stable(b)); }
async function templates(key) {
  const raw = await rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", key);
  return Array.isArray(raw) ? raw : list(raw?.data || raw?.items || raw?.results || raw?.templates);
}
async function assertTargetStock(key) {
  const query = `query($input:GpuAvailabilityInput){dataCenters{id storageSupport gpuAvailability(input:$input){available stockStatus gpuTypeId gpuTypeDisplayName displayName}}}`;
  const response = await fetch(`${GQL}?api_key=${encodeURIComponent(key)}`, {
    method:"POST", headers:{Accept:"application/json","Content-Type":"application/json"},
    body:JSON.stringify({query,variables:{input:{gpuCount:1,minDisk:5,minMemoryInGb:80,secureCloud:true}}}),
    signal:AbortSignal.timeout(30000),
  });
  const body = await readJson(response, `${CONTRACT}_GQL`);
  const errors = list(body?.errors).map((e)=>text(e?.message)).filter(Boolean);
  if (errors.length) throw new Error(`${CONTRACT}_GQL_ERROR:${errors.join(" | ")}`);
  const dc = list(body?.data?.dataCenters).find((row)=>text(row.id)===TARGET_DC);
  if (!dc || dc.storageSupport !== true) throw new Error(`${CONTRACT}_TARGET_DC_STORAGE_REQUIRED`);
  const row = list(dc.gpuAvailability).find((gpu)=>text(gpu.gpuTypeId)===TARGET_GPU);
  const rank = ({HIGH:4,MEDIUM:3,LOW:2}[text(row?.stockStatus).toUpperCase()] || 0);
  if (row?.available !== true || rank < 3) throw new Error(`${CONTRACT}_TARGET_GPU_MEDIUM_OR_HIGH_REQUIRED:${text(row?.stockStatus)||"NONE"}`);
  return { stock_status:text(row.stockStatus).toUpperCase(), display_name:text(row.gpuTypeDisplayName || row.displayName) || TARGET_GPU };
}

if (!approved(process.env.AVANTIQO_CODE_EUR_IS1_REBIND_APPROVED)) throw new Error("AVANTIQO_CODE_EUR_IS1_REBIND_APPROVED=YES_REQUIRED");
const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
const runtimeKey = text(process.env.RUNPOD_AVANTIQO_CODE_API_KEY || process.env.RUNPOD_API_KEY || managementKey);
if (!runtimeKey) throw new Error("RUNPOD_CODE_RUNTIME_KEY_REQUIRED");

const [before, beforeHealth, volumesRaw, templateRows, stock] = await Promise.all([
  rest(`/endpoints/${ENDPOINT_ID}?includeTemplate=true&includeWorkers=true`, managementKey),
  queueHealth(runtimeKey),
  rest("/networkvolumes", managementKey),
  templates(managementKey),
  assertTargetStock(managementKey),
]);
assertClean(before,beforeHealth,`${CONTRACT}_BEFORE`);
if (!volumeIds(before).includes(SOURCE_VOLUME_ID)) throw new Error(`${CONTRACT}_SOURCE_VOLUME_NOT_BOUND`);
const volumes = Array.isArray(volumesRaw) ? volumesRaw : list(volumesRaw?.data || volumesRaw?.items || volumesRaw?.results);
const source = volumes.find((v)=>text(v.id)===SOURCE_VOLUME_ID);
if (!source || text(source.dataCenterId ?? source.data_center_id)!==SOURCE_DC) throw new Error(`${CONTRACT}_SOURCE_VOLUME_INVALID`);
const matches = volumes.filter((v)=>text(v.name)===TARGET_VOLUME_NAME && text(v.dataCenterId ?? v.data_center_id)===TARGET_DC);
if (matches.length !== 1) throw new Error(`${CONTRACT}_TARGET_VOLUME_RESOLUTION:${matches.length}`);
const target = matches[0];
const targetVolumeId = text(target.id);
if (!targetVolumeId || finite(target.size ?? target.sizeGb,0) < 100) throw new Error(`${CONTRACT}_TARGET_VOLUME_INVALID`);
const templateId = text(before.templateId || before.template?.id);
const template = templateRows.find((row)=>text(row.id)===templateId);
if (!template || text(template.imageName)!==IMMUTABLE_IMAGE) throw new Error(`${CONTRACT}_IMMUTABLE_IMAGE_REQUIRED:${text(template?.imageName)}`);
if (!stable(before).flashboot) throw new Error(`${CONTRACT}_FLASHBOOT_REQUIRED`);
const originalPlacement = { dataCenterIds: dcIds(before), gpuTypeIds: gpuIds(before), networkVolumeIds: volumeIds(before) };

let mutationStarted = false;
try {
  const [fresh, freshHealth, freshStock] = await Promise.all([
    rest(`/endpoints/${ENDPOINT_ID}?includeTemplate=true&includeWorkers=true`, managementKey),
    queueHealth(runtimeKey),
    assertTargetStock(managementKey),
  ]);
  assertClean(fresh,freshHealth,`${CONTRACT}_PREWRITE`);
  if (!sameStable(before,fresh) || JSON.stringify(originalPlacement)!==JSON.stringify({dataCenterIds:dcIds(fresh),gpuTypeIds:gpuIds(fresh),networkVolumeIds:volumeIds(fresh)})) {
    throw new Error(`${CONTRACT}_CONCURRENT_ENDPOINT_CHANGE`);
  }
  mutationStarted = true;
  await rest(`/endpoints/${ENDPOINT_ID}`, managementKey, {
    method:"PATCH",
    body:{ dataCenterIds:[TARGET_DC], gpuTypeIds:[TARGET_GPU], networkVolumeIds:[targetVolumeId] },
  });
  await sleep(1200);
  const [after, afterHealth, afterTemplates] = await Promise.all([
    rest(`/endpoints/${ENDPOINT_ID}?includeTemplate=true&includeWorkers=true`, managementKey),
    queueHealth(runtimeKey),
    templates(managementKey),
  ]);
  assertClean(after,afterHealth,`${CONTRACT}_AFTER`);
  if (!sameStable(before,after)) throw new Error(`${CONTRACT}_UNRELATED_ENDPOINT_FIELD_CHANGED`);
  if (JSON.stringify(dcIds(after))!==JSON.stringify([TARGET_DC])) throw new Error(`${CONTRACT}_DC_VERIFY_FAILED:${JSON.stringify(dcIds(after))}`);
  if (JSON.stringify(gpuIds(after))!==JSON.stringify([TARGET_GPU])) throw new Error(`${CONTRACT}_GPU_VERIFY_FAILED:${JSON.stringify(gpuIds(after))}`);
  if (JSON.stringify(volumeIds(after))!==JSON.stringify([targetVolumeId])) throw new Error(`${CONTRACT}_VOLUME_VERIFY_FAILED:${JSON.stringify(volumeIds(after))}`);
  const afterTemplate = afterTemplates.find((row)=>text(row.id)===templateId);
  if (!afterTemplate || text(afterTemplate.imageName)!==IMMUTABLE_IMAGE) throw new Error(`${CONTRACT}_IMAGE_CHANGED`);
  console.log(JSON.stringify({
    success:true,
    contract:CONTRACT,
    target:{data_center_id:TARGET_DC,gpu_type_id:TARGET_GPU,gpu_stock:freshStock.stock_status,network_volume_id:targetVolumeId,network_volume_name:TARGET_VOLUME_NAME},
    immutable_image:IMMUTABLE_IMAGE,
    endpoint_configuration_preserved:true,
    workers_min:0,
    workers_max:0,
    flashboot_preserved:true,
    source_volume_preserved_unmodified:true,
    provider_job_submitted:false,
    inference_performed:false,
    wallet_mutation_performed:false,
    production_deploy_performed:false,
    secrets_printed:false,
  },null,2));
} catch (error) {
  if (mutationStarted) {
    try {
      await rest(`/endpoints/${ENDPOINT_ID}`, managementKey, {method:"PATCH",body:originalPlacement});
      await sleep(1000);
    } catch {}
  }
  throw error;
}
