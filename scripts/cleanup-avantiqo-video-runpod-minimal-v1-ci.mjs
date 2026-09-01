const REST = "https://rest.runpod.io/v1";
const KEEP_ENDPOINT = Object.freeze({ id: "xmey8y2hofexyp", name: "avantiqo-cinema-production-v1" });
const KEEP_TEMPLATE_ID = "l84730vvj0";
const EXPECTED_MODEL_REVISION = "e8dc69fd26150afbfa20351f6bc9ac384257f9fd";
const terminal = new Set(["EXITED", "TERMINATED", "DELETED", "STOPPED"]);

const text = (v) => String(v ?? "").trim();
const list = (v) => Array.isArray(v) ? v : [];

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

function apiKey() {
  const value = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
  if (!value) throw new Error("RUNPOD_MANAGEMENT_API_KEY_REQUIRED");
  return value;
}

async function rest(path, options = {}) {
  const response = await fetch(`${REST}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
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
    throw new Error(`RUNPOD_VIDEO_MINIMAL_HTTP_${response.status}:${text(body?.message || body?.error || body?.detail || raw).slice(0,700)}`);
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

function templateId(endpoint = {}) {
  return text(endpoint.templateId || endpoint.template?.id);
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

async function snapshot() {
  const [rawEndpoints, rawTemplates, rawVolumes, rawPods] = await Promise.all([
    rest("/endpoints?includeTemplate=true&includeWorkers=true"),
    rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false"),
    rest("/networkvolumes"),
    rest("/pods"),
  ]);
  return {
    endpoints: normalizeRows(rawEndpoints, ["endpoints", "serverlessEndpoints"]),
    templates: normalizeRows(rawTemplates, ["templates"]),
    volumes: normalizeRows(rawVolumes, ["networkVolumes", "networkvolumes"]),
    pods: normalizeRows(rawPods, ["pods"]),
  };
}

function assertCanonical(state) {
  const keep = state.endpoints.find((e) => text(e.id) === KEEP_ENDPOINT.id && text(e.name) === KEEP_ENDPOINT.name);
  if (!keep) throw new Error("AVANTIQO_VIDEO_GLOBAL_KEEP_ENDPOINT_MISSING");
  if (templateId(keep) !== KEEP_TEMPLATE_ID) throw new Error(`AVANTIQO_VIDEO_GLOBAL_TEMPLATE_INVALID:${templateId(keep)}`);
  if (activeWorkers(keep).length !== 0) throw new Error("AVANTIQO_VIDEO_GLOBAL_ACTIVE_WORKER_PRESENT");
  if (Number(keep.workersMin ?? keep.workers_min) !== 0 || Number(keep.workersMax ?? keep.workers_max) !== 1) {
    throw new Error(`AVANTIQO_VIDEO_GLOBAL_SCALING_INVALID:${keep.workersMin}:${keep.workersMax}`);
  }
  if (Number(keep.idleTimeout ?? keep.idle_timeout) !== 5) throw new Error(`AVANTIQO_VIDEO_GLOBAL_IDLE_TIMEOUT_INVALID:${keep.idleTimeout}`);
  if (volumeIds(keep).length !== 0) throw new Error(`AVANTIQO_VIDEO_GLOBAL_VOLUME_STILL_ATTACHED:${JSON.stringify(volumeIds(keep))}`);
  const dcs = list(keep.dataCenterIds ?? keep.data_center_ids).filter(Boolean);
  if (dcs.length !== 0) throw new Error(`AVANTIQO_VIDEO_GLOBAL_DATACENTER_PIN_REMAINS:${JSON.stringify(dcs)}`);
  const refs = list(keep.modelReferences ?? keep.model_references).map(text);
  if (refs.length && !refs.some((v) => v.includes(EXPECTED_MODEL_REVISION))) {
    throw new Error(`AVANTIQO_VIDEO_GLOBAL_MODEL_REFERENCE_INVALID:${JSON.stringify(refs)}`);
  }
  return keep;
}

console.log("AVANTIQO_VIDEO_GLOBAL_CLEANUP_GPU_STARTED=false");
console.log("AVANTIQO_VIDEO_GLOBAL_CLEANUP_GENERATION_SUBMITTED=false");
console.log("AVANTIQO_VIDEO_GLOBAL_CLEANUP_PRODUCTION_DEPLOY=false");

let state = await snapshot();
const keep = assertCanonical(state);
console.log(`AVANTIQO_VIDEO_GLOBAL_CLEANUP_CANONICAL_TEMPLATE=${templateId(keep)}`);

// Serverless migration no longer uses Pods. Delete only clearly Video-owned active Pods.
for (const pod of state.pods.filter((p) => isVideoName(p?.name) && activePod(p))) {
  const id = text(pod.id);
  if (!id) continue;
  await rest(`/pods/${encodeURIComponent(id)}`, { method: "DELETE" });
  console.log(`AVANTIQO_VIDEO_GLOBAL_CLEANUP_DELETED_ACTIVE_VIDEO_POD=${text(pod.name) || id}`);
}

// Keep exactly one Video endpoint. Never delete an endpoint while it has an active worker.
for (const endpoint of state.endpoints.filter((e) => isVideoName(e?.name) && text(e.id) !== KEEP_ENDPOINT.id)) {
  const id = text(endpoint.id);
  if (!id) continue;
  if (activeWorkers(endpoint).length) throw new Error(`AVANTIQO_VIDEO_GLOBAL_EXTRA_ENDPOINT_ACTIVE:${text(endpoint.name) || id}`);
  await rest(`/endpoints/${encodeURIComponent(id)}`, { method: "DELETE" });
  console.log(`AVANTIQO_VIDEO_GLOBAL_CLEANUP_DELETED_ENDPOINT=${text(endpoint.name) || id}`);
}

state = await snapshot();
assertCanonical(state);
const referencedTemplateIds = new Set(state.endpoints.map(templateId).filter(Boolean));

// Remove unbound Video templates, preserving the one canonical template and anything referenced by a non-Video endpoint.
for (const template of state.templates.filter((t) => isVideoName(t?.name) || isVideoName(t?.imageName || t?.image_name))) {
  const id = text(template.id);
  if (!id || id === KEEP_TEMPLATE_ID || referencedTemplateIds.has(id)) continue;
  await rest(`/templates/${encodeURIComponent(id)}`, { method: "DELETE" });
  console.log(`AVANTIQO_VIDEO_GLOBAL_CLEANUP_DELETED_TEMPLATE=${text(template.name) || id}`);
}

state = await snapshot();
assertCanonical(state);

// Global cached-model Serverless needs no persistent Video network volume.
// Delete a Video-owned volume only after proving it is unreferenced by every endpoint, template and active pod.
for (const volume of state.volumes.filter((v) => isVideoName(v?.name))) {
  const id = text(volume.id);
  if (!id) continue;
  const endpointRefs = state.endpoints.filter((e) => volumeIds(e).includes(id)).map((e) => text(e.name) || text(e.id));
  const templateRefs = state.templates.filter((t) => volumeIds(t).includes(id)).map((t) => text(t.name) || text(t.id));
  const podRefs = state.pods.filter((p) => activePod(p) && volumeIds(p).includes(id)).map((p) => text(p.name) || text(p.id));
  if (endpointRefs.length || templateRefs.length || podRefs.length) {
    console.log(`AVANTIQO_VIDEO_GLOBAL_CLEANUP_VOLUME_SKIPPED_REFERENCED=${JSON.stringify({ id, name: text(volume.name), endpointRefs, templateRefs, podRefs })}`);
    continue;
  }
  await rest(`/networkvolumes/${encodeURIComponent(id)}`, { method: "DELETE" });
  console.log(`AVANTIQO_VIDEO_GLOBAL_CLEANUP_DELETED_VOLUME=${text(volume.name) || id}`);
}

const finalState = await snapshot();
const finalKeep = assertCanonical(finalState);
const finalVideoEndpoints = finalState.endpoints.filter((e) => isVideoName(e?.name));
if (finalVideoEndpoints.length !== 1 || text(finalVideoEndpoints[0].id) !== KEEP_ENDPOINT.id) {
  throw new Error(`AVANTIQO_VIDEO_GLOBAL_ENDPOINT_VERIFY_FAILED:${JSON.stringify(finalVideoEndpoints.map((e) => ({ id: text(e.id), name: text(e.name) })))}`);
}
const finalVideoPods = finalState.pods.filter((p) => isVideoName(p?.name) && activePod(p));
if (finalVideoPods.length) throw new Error(`AVANTIQO_VIDEO_GLOBAL_ACTIVE_VIDEO_PODS_REMAIN:${finalVideoPods.length}`);
const finalReferencedTemplateIds = new Set(finalState.endpoints.map(templateId).filter(Boolean));
const unusedVideoTemplates = finalState.templates.filter((t) => {
  const id = text(t.id);
  return id && id !== KEEP_TEMPLATE_ID && !finalReferencedTemplateIds.has(id) && (isVideoName(t?.name) || isVideoName(t?.imageName || t?.image_name));
});
if (unusedVideoTemplates.length) throw new Error(`AVANTIQO_VIDEO_GLOBAL_UNUSED_TEMPLATE_REMAINS:${unusedVideoTemplates.map((t) => text(t.name) || text(t.id)).join(",")}`);

const referencedVideoVolumes = finalState.volumes.filter((v) => isVideoName(v?.name)).map((v) => {
  const id = text(v.id);
  return {
    id,
    name: text(v.name),
    endpointRefs: finalState.endpoints.filter((e) => volumeIds(e).includes(id)).map((e) => text(e.name) || text(e.id)),
    templateRefs: finalState.templates.filter((t) => volumeIds(t).includes(id)).map((t) => text(t.name) || text(t.id)),
    podRefs: finalState.pods.filter((p) => activePod(p) && volumeIds(p).includes(id)).map((p) => text(p.name) || text(p.id)),
  };
});
const unreferencedVideoVolumes = referencedVideoVolumes.filter((v) => !v.endpointRefs.length && !v.templateRefs.length && !v.podRefs.length);
if (unreferencedVideoVolumes.length) throw new Error(`AVANTIQO_VIDEO_GLOBAL_UNUSED_VOLUME_REMAINS:${JSON.stringify(unreferencedVideoVolumes)}`);

console.log(`AVANTIQO_VIDEO_GLOBAL_RETAINED_ENDPOINT=${KEEP_ENDPOINT.name}`);
console.log(`AVANTIQO_VIDEO_GLOBAL_RETAINED_TEMPLATE_ID=${templateId(finalKeep)}`);
console.log(`AVANTIQO_VIDEO_GLOBAL_WORKERS_MIN=${Number(finalKeep.workersMin ?? finalKeep.workers_min)}`);
console.log(`AVANTIQO_VIDEO_GLOBAL_WORKERS_MAX=${Number(finalKeep.workersMax ?? finalKeep.workers_max)}`);
console.log(`AVANTIQO_VIDEO_GLOBAL_ACTIVE_WORKERS=${activeWorkers(finalKeep).length}`);
console.log(`AVANTIQO_VIDEO_GLOBAL_ACTIVE_VIDEO_PODS=${finalVideoPods.length}`);
console.log(`AVANTIQO_VIDEO_GLOBAL_REMAINING_VIDEO_VOLUMES=${JSON.stringify(referencedVideoVolumes)}`);
console.log("AVANTIQO_VIDEO_GLOBAL_CLEANUP=PASS");