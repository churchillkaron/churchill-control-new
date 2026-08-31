const REST = "https://rest.runpod.io/v1";
const OLD_ENDPOINT = Object.freeze({ id: "r0bzqq9zoi92h7", name: "avantiqo-cinema-v1" });
const KEEP_ENDPOINT = Object.freeze({ id: "xmey8y2hofexyp", name: "avantiqo-cinema-production-v1" });
const OLD_VOLUME = Object.freeze({ id: "7pcdebhpga", name: "avantiqo-shared-image-video-cache" });
const KEEP_VOLUME = Object.freeze({ id: "t4erb6kxi1", name: "avantiqo-video-cache-eu-ro-1" });

const text = (v) => String(v ?? "").trim();
const list = (v) => Array.isArray(v) ? v : [];

function requiredKey() {
  const key = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
  if (!key) throw new Error("RUNPOD_MANAGEMENT_API_KEY_REQUIRED");
  return key;
}

async function rest(path, options = {}) {
  const response = await fetch(`${REST}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${requiredKey()}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    const err = new Error(`RUNPOD_CINEMA_CLEANUP_HTTP_${response.status}:${text(body?.message || body?.error || body?.detail || raw).slice(0,800)}`);
    err.httpStatus = response.status;
    throw err;
  }
  return body;
}

function volumeIds(endpoint = {}) {
  return [...new Set([
    text(endpoint.networkVolumeId ?? endpoint.network_volume_id),
    ...list(endpoint.networkVolumeIds ?? endpoint.network_volume_ids).map((v) => text(typeof v === "string" ? v : v?.id ?? v?.networkVolumeId ?? v?.network_volume_id)),
  ].filter(Boolean))];
}
function activeWorkers(endpoint = {}) {
  const terminal = new Set(["EXITED", "TERMINATED", "DELETED", "STOPPED"]);
  return list(endpoint.workers).filter((w) => !terminal.has(text(w.status ?? w.workerStatus ?? w.runtimeStatus ?? w.desiredStatus).toUpperCase()));
}

console.log("AVANTIQO_CINEMA_RESOURCE_CLEANUP_GENERATION_SUBMITTED=false");
console.log("AVANTIQO_CINEMA_RESOURCE_CLEANUP_PRODUCTION_DEPLOY=false");

const [oldEndpoint, keepEndpoint, rawVolumes, rawPods] = await Promise.all([
  rest(`/endpoints/${OLD_ENDPOINT.id}?includeTemplate=true&includeWorkers=true`),
  rest(`/endpoints/${KEEP_ENDPOINT.id}?includeTemplate=true&includeWorkers=true`),
  rest("/networkvolumes"),
  rest("/pods"),
]);

if (text(oldEndpoint?.id) !== OLD_ENDPOINT.id || text(oldEndpoint?.name) !== OLD_ENDPOINT.name) throw new Error("OLD_ENDPOINT_IDENTITY_MISMATCH");
if (text(keepEndpoint?.id) !== KEEP_ENDPOINT.id || text(keepEndpoint?.name) !== KEEP_ENDPOINT.name) throw new Error("KEEP_ENDPOINT_IDENTITY_MISMATCH");
if (activeWorkers(oldEndpoint).length || activeWorkers(keepEndpoint).length) throw new Error("CINEMA_ACTIVE_WORKER_PRESENT");

const volumes = Array.isArray(rawVolumes) ? rawVolumes : (rawVolumes?.networkVolumes || rawVolumes?.data || []);
const oldVolume = volumes.find((v) => text(v?.id) === OLD_VOLUME.id);
const keepVolume = volumes.find((v) => text(v?.id) === KEEP_VOLUME.id);
if (!oldVolume || text(oldVolume?.name) !== OLD_VOLUME.name) throw new Error("OLD_VOLUME_IDENTITY_MISMATCH");
if (!keepVolume || text(keepVolume?.name) !== KEEP_VOLUME.name) throw new Error("KEEP_VOLUME_IDENTITY_MISMATCH");

const pods = Array.isArray(rawPods) ? rawPods : (rawPods?.pods || rawPods?.data || []);
const activeOldVolumePods = pods.filter((p) => {
  const id = text(p?.networkVolume?.id ?? p?.networkVolumeId ?? p?.network_volume_id);
  const status = text(p?.status ?? p?.runtimeStatus ?? p?.desiredStatus).toUpperCase();
  return id === OLD_VOLUME.id && !["EXITED", "TERMINATED", "DELETED", "STOPPED"].includes(status);
});
if (activeOldVolumePods.length) throw new Error(`OLD_VOLUME_ACTIVE_PODS:${activeOldVolumePods.length}`);

const keepIds = volumeIds(keepEndpoint);
if (!keepIds.includes(KEEP_VOLUME.id)) throw new Error("KEEP_ENDPOINT_MISSING_EU_VOLUME");
if (keepIds.includes(OLD_VOLUME.id)) {
  await rest(`/endpoints/${KEEP_ENDPOINT.id}`, {
    method: "PATCH",
    body: { networkVolumeIds: [KEEP_VOLUME.id] },
  });
  const verified = await rest(`/endpoints/${KEEP_ENDPOINT.id}?includeTemplate=true&includeWorkers=true`);
  const ids = volumeIds(verified);
  if (!ids.includes(KEEP_VOLUME.id) || ids.includes(OLD_VOLUME.id)) throw new Error("KEEP_ENDPOINT_VOLUME_DETACH_VERIFY_FAILED");
  console.log("AVANTIQO_CINEMA_PRODUCTION_US_VOLUME_DETACHED=PASS");
}

await rest(`/endpoints/${OLD_ENDPOINT.id}`, { method: "DELETE" });
try {
  await rest(`/endpoints/${OLD_ENDPOINT.id}`);
  throw new Error("OLD_ENDPOINT_STILL_EXISTS");
} catch (error) {
  if (Number(error?.httpStatus) !== 404) throw error;
}
console.log(`AVANTIQO_CINEMA_OBSOLETE_ENDPOINT_DELETED=${OLD_ENDPOINT.name}`);

await rest(`/networkvolumes/${OLD_VOLUME.id}`, { method: "DELETE" });
const afterVolumesRaw = await rest("/networkvolumes");
const afterVolumes = Array.isArray(afterVolumesRaw) ? afterVolumesRaw : (afterVolumesRaw?.networkVolumes || afterVolumesRaw?.data || []);
if (afterVolumes.some((v) => text(v?.id) === OLD_VOLUME.id)) throw new Error("OLD_VOLUME_STILL_EXISTS");
if (!afterVolumes.some((v) => text(v?.id) === KEEP_VOLUME.id && text(v?.name) === KEEP_VOLUME.name)) throw new Error("KEEP_VOLUME_MISSING_AFTER_CLEANUP");
console.log(`AVANTIQO_CINEMA_OBSOLETE_VOLUME_DELETED=${OLD_VOLUME.name}`);
console.log(`AVANTIQO_CINEMA_RETAINED_ENDPOINT=${KEEP_ENDPOINT.name}`);
console.log(`AVANTIQO_CINEMA_RETAINED_VOLUME=${KEEP_VOLUME.name}`);
console.log("AVANTIQO_CINEMA_RESOURCE_CLEANUP=PASS");
