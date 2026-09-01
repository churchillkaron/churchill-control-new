const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const ENDPOINT_ID = "xmey8y2hofexyp";

const text = (v) => String(v ?? "").trim();
const list = (v) => Array.isArray(v) ? v : [];
const finite = (v) => Number.isFinite(Number(v)) ? Number(v) : null;
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
  const v = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
  if (!v) throw new Error("RUNPOD_MANAGEMENT_API_KEY_REQUIRED");
  return v;
}
async function rest(path) {
  const r = await fetch(`${REST_BASE}${path}`, { headers: { Authorization: `Bearer ${apiKey()}`, Accept: "application/json" }, signal: AbortSignal.timeout(30000) });
  const raw = await r.text();
  let body = null; try { body = raw ? JSON.parse(raw) : null; } catch {}
  if (!r.ok) throw new Error(`RUNPOD_RESOURCE_AUDIT_HTTP_${r.status}:${text(body?.message || body?.error || raw).slice(0,500)}`);
  return body;
}
async function queueHealth() {
  const key = text(process.env.RUNPOD_AVANTIQO_VIDEO_API_KEY || process.env.RUNPOD_API_KEY || process.env.RUNPOD_MANAGEMENT_API_KEY);
  if (!key) return { unavailable: "NO_QUEUE_KEY" };
  const r = await fetch(`${QUEUE_BASE}/${ENDPOINT_ID}/health`, { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" }, signal: AbortSignal.timeout(30000) });
  const raw = await r.text();
  let body = null; try { body = raw ? JSON.parse(raw) : null; } catch {}
  return r.ok ? body : { http_status: r.status, detail: text(body?.error || body?.message || raw).slice(0,300) };
}
function safeWorker(w = {}) {
  const machine = w.machine && typeof w.machine === "object" ? w.machine : {};
  return {
    id: text(w.id || w.workerId) || null,
    desired_status: text(w.desiredStatus || w.desired_status).toUpperCase() || null,
    status: text(w.status || w.workerStatus || w.runtimeStatus).toUpperCase() || null,
    gpu_type_id: text(w.gpuTypeId || w.gpu?.displayName || w.gpu?.id || machine.gpuTypeId || machine.gpuType?.id || machine.gpuDisplayName) || null,
    data_center_id: text(w.dataCenterId || machine.dataCenterId || machine.dataCenter?.id) || null,
    cost_per_hr: finite(w.costPerHr ?? w.cost_per_hr),
    error: text(w.error || w.lastError || w.errorMessage || w.message || w.reason || w.terminationReason || w.exitReason).slice(0,500) || null,
    runtime_error: text(w.runtimeError || w.runtime_error || w.containerError || w.container_error).slice(0,500) || null,
    machine_id: text(machine.id || w.machineId) || null,
    machine_gpu: text(machine.gpuTypeId || machine.gpuType?.id || machine.gpuDisplayName) || null,
    created_at: text(w.createdAt || w.created_at) || null,
    started_at: text(w.startedAt || w.started_at) || null,
    exited_at: text(w.exitedAt || w.exited_at || w.terminatedAt || w.terminated_at) || null,
  };
}
async function anonymousGhcrPull(image) {
  const m = text(image).match(/^ghcr\.io\/(.+)@(sha256:[a-f0-9]{64})$/i);
  if (!m) return { valid_ref: false };
  const repository = m[1]; const digest = m[2].toLowerCase();
  const u = new URL("https://ghcr.io/token");
  u.searchParams.set("service", "ghcr.io");
  u.searchParams.set("scope", `repository:${repository}:pull`);
  const tr = await fetch(u, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(30000) });
  const tb = await tr.json().catch(() => ({}));
  const token = text(tb.token || tb.access_token);
  if (!tr.ok || !token) return { valid_ref: true, public_pull: false, token_status: tr.status };
  const mr = await fetch(`https://ghcr.io/v2/${repository}/manifests/${digest}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.oci.image.manifest.v1+json, application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.v2+json" }, signal: AbortSignal.timeout(30000) });
  const returned = text(mr.headers.get("docker-content-digest")).toLowerCase();
  await mr.arrayBuffer();
  return { valid_ref: true, public_pull: mr.ok && (!returned || returned === digest), token_status: tr.status, manifest_status: mr.status, digest_matches: !returned || returned === digest };
}

const endpoint = await rest(`/endpoints/${ENDPOINT_ID}?includeTemplate=true&includeWorkers=true`);
const templateId = text(endpoint.templateId || endpoint.template?.id);
const template = await rest(`/templates/${templateId}`);
const image = text(template.imageName || template.image_name);
const health = await queueHealth();
const workers = list(endpoint.workers).map(safeWorker);
const result = {
  contract: "AVANTIQO_VIDEO_SERVERLESS_STARTUP_DIAGNOSTIC_V1",
  mutation_performed: false,
  generation_submitted: false,
  endpoint: {
    id: text(endpoint.id), name: text(endpoint.name), template_id: templateId,
    workers_min: finite(endpoint.workersMin), workers_max: finite(endpoint.workersMax),
    gpu_type_ids: list(endpoint.gpuTypeIds || endpoint.gpuIds).map(text).filter(Boolean),
    min_cuda_version: text(endpoint.minCudaVersion) || null,
    allowed_cuda_versions: list(endpoint.allowedCudaVersions).map(text),
    flashboot: endpoint.flashboot ?? endpoint.flashBoot ?? null,
    model_references: list(endpoint.modelReferences).map(text),
  },
  template: { image_name: image, container_disk_gb: finite(template.containerDiskInGb), hf_token_present: Boolean(text(template.env?.HF_TOKEN)) },
  anonymous_image_pull: await anonymousGhcrPull(image),
  queue_health: health,
  workers,
};
console.log("AVANTIQO_VIDEO_SERVERLESS_STARTUP_DIAGNOSTIC=PASS");
console.log(`AVANTIQO_VIDEO_SERVERLESS_STARTUP_DIAGNOSTIC_RESULT=${JSON.stringify(result)}`);
