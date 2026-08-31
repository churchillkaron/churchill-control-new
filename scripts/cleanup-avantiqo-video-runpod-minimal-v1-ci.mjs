const REST = "https://rest.runpod.io/v1";
const KEEP_ENDPOINT = Object.freeze({ id: "xmey8y2hofexyp", name: "avantiqo-cinema-production-v1" });
const KEEP_VOLUME = Object.freeze({ id: "t4erb6kxi1", name: "avantiqo-video-cache-eu-ro-1" });

const text = (v) => String(v ?? "").trim();
const list = (v) => Array.isArray(v) ? v : [];
const terminal = new Set(["EXITED", "TERMINATED", "DELETED", "STOPPED"]);

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

function key() {
  const value = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
  if (!value) throw new Error("RUNPOD_MANAGEMENT_API_KEY_REQUIRED");
  return value;
}

async function rest(path, options = {}) {
  const response = await fetch(`${REST}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key()}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    const error = new Error(`RUNPOD_VIDEO_MINIMAL_HTTP_${response.status}:${text(body?.message || body?.error || body?.detail || raw).slice(0,700)}`);
    error.httpStatus = response.status;
    throw error;
  }
  return body;
}

function isVideoName(value) {
  const s = text(value).toLowerCase();
  return s.includes("video") || s.includes("cinema") || s.includes("ltx");
}
function volumeIds(row = {}) {
  return [...new Set([
    text(row.networkVolumeId ?? row.network_volume_id),
    ...list(row.networkVolumeIds ?? row.network_volume_ids).map((v) => text(typeof v === "string" ? v : v?.id ?? v?.networkVolumeId ?? v?.network_volume_id)),
  ].filter(Boolean))];
}
function activeWorkers(endpoint = {}) {
  return list(endpoint.workers).filter((w) => {
    const status = text(w.status ?? w.workerStatus ?? w.runtimeStatus ?? w.desiredStatus).toUpperCase();
    return status ? !terminal.has(status) : true;
  });
}
function activePod(pod = {}) {
  const status = text(pod.status ?? pod.runtimeStatus ?? pod.desiredStatus).toUpperCase();
  return status ? !terminal.has(status) : true;
}
function templateId(endpoint = {}) {
  return text(endpoint.templateId || endpoint.template?.id);
}

console.log("AVANTIQO_VIDEO_MINIMAL_CLEANUP_GENERATION_SUBMITTED=false");
console.log("AVANTIQO_VIDEO_MINIMAL_CLEANUP_PRODUCTION_DEPLOY=false");

let [rawEndpoints, rawTemplates, rawVolumes, rawPods] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true"),
  rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false"),
  rest("/networkvolumes"),
  rest("/pods"),
]);
let endpoints = normalizeRows(rawEndpoints, ["endpoints", "serverlessEndpoints"]);
let templates = normalizeRows(rawTemplates, ["templates"]);
let volumes = normalizeRows(rawVolumes, ["networkVolumes", "networkvolumes"]);
let pods = normalizeRows(rawPods, ["pods"]);

const keep = endpoints.find((e) => text(e.id) === KEEP_ENDPOINT.id && text(e.name) === KEEP_ENDPOINT.name);
if (!keep) throw new Error("AVANTIQO_VIDEO_MINIMAL_KEEP_ENDPOINT_MISSING");
if (activeWorkers(keep).length) throw new Error("AVANTIQO_VIDEO_MINIMAL_KEEP_ENDPOINT_ACTIVE_WORKER");
if (Number(keep.workersMin ?? keep.workers_min) !== 0 || Number(keep.workersMax ?? keep.workers_max) !== 0) {
  throw new Error("AVANTIQO_VIDEO_MINIMAL_KEEP_ENDPOINT_NOT_ZERO_ZERO");
}
if (JSON.stringify(volumeIds(keep)) !== JSON.stringify([KEEP_VOLUME.id])) {
  throw new Error(`AVANTIQO_VIDEO_MINIMAL_KEEP_ENDPOINT_VOLUME_INVALID:${JSON.stringify(volumeIds(keep))}`);
}
const keepTemplateId = templateId(keep);
if (!keepTemplateId) throw new Error("AVANTIQO_VIDEO_MINIMAL_KEEP_TEMPLATE_ID_MISSING");

for (const pod of pods.filter((p) => isVideoName(p?.name) && activePod(p))) {
  const id = text(pod.id);
  if (!id) continue;
  await rest(`/pods/${encodeURIComponent(id)}`, { method: "DELETE" });
  console.log(`AVANTIQO_VIDEO_MINIMAL_DELETED_ACTIVE_POD=${text(pod.name) || id}`);
}

for (const endpoint of endpoints.filter((e) => isVideoName(e?.name) && text(e.id) !== KEEP_ENDPOINT.id)) {
  if (activeWorkers(endpoint).length) throw new Error(`AVANTIQO_VIDEO_MINIMAL_EXTRA_ENDPOINT_ACTIVE:${text(endpoint.name)}`);
  await rest(`/endpoints/${encodeURIComponent(text(endpoint.id))}`, { method: "DELETE" });
  console.log(`AVANTIQO_VIDEO_MINIMAL_DELETED_ENDPOINT=${text(endpoint.name)}`);
}

rawEndpoints = await rest("/endpoints?includeTemplate=true&includeWorkers=true");
endpoints = normalizeRows(rawEndpoints, ["endpoints", "serverlessEndpoints"]);
const referencedTemplateIds = new Set(endpoints.map(templateId).filter(Boolean));

for (const template of templates.filter((t) => {
  const image = text(t.imageName || t.image_name);
  return isVideoName(t?.name) || isVideoName(image);
})) {
  const id = text(template.id);
  if (!id || id === keepTemplateId || referencedTemplateIds.has(id)) continue;
  await rest(`/templates/${encodeURIComponent(id)}`, { method: "DELETE" });
  console.log(`AVANTIQO_VIDEO_MINIMAL_DELETED_TEMPLATE=${text(template.name) || id}`);
}

rawEndpoints = await rest("/endpoints?includeTemplate=true&includeWorkers=true");
rawTemplates = await rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false");
rawVolumes = await rest("/networkvolumes");
rawPods = await rest("/pods");
endpoints = normalizeRows(rawEndpoints, ["endpoints", "serverlessEndpoints"]);
templates = normalizeRows(rawTemplates, ["templates"]);
volumes = normalizeRows(rawVolumes, ["networkVolumes", "networkvolumes"]);
pods = normalizeRows(rawPods, ["pods"]);

const finalVideoEndpoints = endpoints.filter((e) => isVideoName(e?.name));
if (finalVideoEndpoints.length !== 1 || text(finalVideoEndpoints[0].id) !== KEEP_ENDPOINT.id) {
  throw new Error(`AVANTIQO_VIDEO_MINIMAL_ENDPOINT_VERIFY_FAILED:${finalVideoEndpoints.map((e) => text(e.name)).join(",")}`);
}
const finalKeep = finalVideoEndpoints[0];
if (activeWorkers(finalKeep).length || Number(finalKeep.workersMin ?? finalKeep.workers_min) !== 0 || Number(finalKeep.workersMax ?? finalKeep.workers_max) !== 0) {
  throw new Error("AVANTIQO_VIDEO_MINIMAL_ZERO_GPU_VERIFY_FAILED");
}
const finalVideoPods = pods.filter((p) => isVideoName(p?.name) && activePod(p));
if (finalVideoPods.length) throw new Error(`AVANTIQO_VIDEO_MINIMAL_ACTIVE_PODS_REMAIN:${finalVideoPods.length}`);

const finalVideoVolumes = volumes.filter((v) => isVideoName(v?.name));
const keepVolume = finalVideoVolumes.find((v) => text(v.id) === KEEP_VOLUME.id && text(v.name) === KEEP_VOLUME.name);
if (!keepVolume) throw new Error("AVANTIQO_VIDEO_MINIMAL_KEEP_VOLUME_MISSING");

const extraVideoVolumes = finalVideoVolumes.filter((v) => text(v.id) !== KEEP_VOLUME.id).map((v) => {
  const id = text(v.id);
  const refs = endpoints.filter((e) => volumeIds(e).includes(id)).map((e) => text(e.name));
  return { id, name: text(v.name), endpoint_refs: refs };
});
const videoOnlyExtraVolumes = extraVideoVolumes.filter((v) => v.endpoint_refs.length === 0 || v.endpoint_refs.some(isVideoName));
if (videoOnlyExtraVolumes.length) {
  throw new Error(`AVANTIQO_VIDEO_MINIMAL_EXTRA_VIDEO_VOLUME_REMAINS:${JSON.stringify(videoOnlyExtraVolumes)}`);
}

const finalVideoTemplates = templates.filter((t) => isVideoName(t?.name) || isVideoName(t?.imageName || t?.image_name));
const unreferencedVideoTemplates = finalVideoTemplates.filter((t) => {
  const id = text(t.id);
  return id !== keepTemplateId && !new Set(endpoints.map(templateId).filter(Boolean)).has(id);
});
if (unreferencedVideoTemplates.length) {
  throw new Error(`AVANTIQO_VIDEO_MINIMAL_UNUSED_TEMPLATE_REMAINS:${unreferencedVideoTemplates.map((t) => text(t.name)).join(",")}`);
}

console.log(`AVANTIQO_VIDEO_MINIMAL_RETAINED_ENDPOINT=${KEEP_ENDPOINT.name}`);
console.log(`AVANTIQO_VIDEO_MINIMAL_RETAINED_VOLUME=${KEEP_VOLUME.name}`);
console.log(`AVANTIQO_VIDEO_MINIMAL_RETAINED_TEMPLATE_ID=${keepTemplateId}`);
console.log(`AVANTIQO_VIDEO_MINIMAL_ACTIVE_PODS=${finalVideoPods.length}`);
console.log(`AVANTIQO_VIDEO_MINIMAL_ACTIVE_WORKERS=${activeWorkers(finalKeep).length}`);
console.log(`AVANTIQO_VIDEO_MINIMAL_NONVIDEO_SHARED_VOLUMES_SKIPPED=${JSON.stringify(extraVideoVolumes.filter((v) => v.endpoint_refs.length && v.endpoint_refs.every((name) => !isVideoName(name))))}`);
console.log("AVANTIQO_VIDEO_MINIMAL_CLEANUP=PASS");
