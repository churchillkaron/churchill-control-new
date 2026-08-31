import process from "node:process";

const CONTRACT = "AVANTIQO_IMAGE_160GB_STORAGE_MIGRATION_V1";
const REST = "https://rest.runpod.io/v1";
const QUEUE = "https://api.runpod.ai/v2";
const ENDPOINT_ID = "m9ieryijbnq77q";
const ENDPOINT_NAME = "avantiqo-image-v1";
const SOURCE_VOLUME_ID = "7pcdebhpga";
const SOURCE_VOLUME_NAME = "avantiqo-shared-image-video-cache";
const SOURCE_VOLUME_SIZE_GB = 400;
const TARGET_DC = "US-NC-2";
const TARGET_VOLUME_NAME = "avantiqo-image-cache-us-nc-2";
const TARGET_VOLUME_SIZE_GB = 160;
const MODEL_ID = "Tongyi-MAI/Z-Image";
const CACHE_ROOT = "/runpod-volume/huggingface-cache/hub";
const COMPLETION_MARKER = ".avantiqo-photoreal-cache-complete.json";
const COMPLETION_CONTRACT = "AVANTIQO_IMAGE_PHOTOREAL_CACHE_COMPLETION_V1";
const CPU_POD_PREFIX = "avantiqo-image-cache-160gb-";
const POLL_MS = 5000;
const START_TIMEOUT_MS = 10 * 60_000;
const CACHE_TIMEOUT_MS = 45 * 60_000;
const REQUIRED_FILES = [
  "model_index.json",
  "scheduler/scheduler_config.json",
  "text_encoder/config.json",
  "text_encoder/generation_config.json",
  "text_encoder/model.safetensors.index.json",
  "text_encoder/model-00001-of-00003.safetensors",
  "text_encoder/model-00002-of-00003.safetensors",
  "text_encoder/model-00003-of-00003.safetensors",
  "tokenizer/tokenizer_config.json",
  "tokenizer/tokenizer.json",
  "tokenizer/vocab.json",
  "tokenizer/merges.txt",
  "transformer/config.json",
  "transformer/diffusion_pytorch_model.safetensors.index.json",
  "transformer/diffusion_pytorch_model-00001-of-00002.safetensors",
  "transformer/diffusion_pytorch_model-00002-of-00002.safetensors",
  "vae/config.json",
  "vae/diffusion_pytorch_model.safetensors",
];

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const approved = (value) => ["YES", "TRUE", "1", "APPROVED"].includes(text(value).toUpperCase());

function required(name, fallback = "") {
  const value = text(process.env[name] || fallback);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

async function readJson(response, label, allow404 = false) {
  const raw = await response.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = { message: raw }; }
  if (allow404 && response.status === 404) return { __not_found: true, __status: 404 };
  if (!response.ok) throw new Error(`${label}_HTTP_${response.status}:${text(body?.message || body?.error || body?.detail || raw).slice(0, 900)}`);
  return body;
}

async function rest(pathname, key, options = {}) {
  const response = await fetch(`${REST}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30000),
  });
  return readJson(response, `${CONTRACT}_REST`, options.allow404 === true);
}

async function queueHealth(key) {
  const response = await fetch(`${QUEUE}/${ENDPOINT_ID}/health`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30000),
  });
  return readJson(response, `${CONTRACT}_QUEUE`);
}

function rows(raw) {
  return Array.isArray(raw) ? raw : list(raw?.data || raw?.items || raw?.results || raw?.pods || raw?.endpoints || raw?.networkVolumes || raw?.volumes);
}

function endpointVolumeIds(endpoint = {}) {
  const ids = [];
  const legacy = text(endpoint.networkVolumeId);
  if (legacy) ids.push(legacy);
  for (const entry of list(endpoint.networkVolumeIds)) {
    const id = typeof entry === "string" ? text(entry) : text(entry?.networkVolumeId || entry?.id);
    if (id) ids.push(id);
  }
  return [...new Set(ids)];
}

function healthSummary(body = {}) {
  const jobs = body.jobs || {};
  const workers = body.workers || {};
  return {
    in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
    in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
    workers: Object.fromEntries(["idle", "initializing", "ready", "running", "throttled", "unhealthy"].map((key) => [key, finite(workers[key], 0)])),
  };
}

function assertIdle(endpoint, health, label) {
  const summary = healthSummary(health);
  if (text(endpoint.id) !== ENDPOINT_ID || text(endpoint.name) !== ENDPOINT_NAME) throw new Error(`${label}_ENDPOINT_IDENTITY`);
  if (finite(endpoint.workersMin, -1) !== 0 || finite(endpoint.workersMax, -1) !== 0) throw new Error(`${label}_ENDPOINT_NOT_0_0`);
  if (summary.in_queue || summary.in_progress || Object.values(summary.workers).some((value) => value !== 0)) {
    throw new Error(`${label}_ENDPOINT_ACTIVE:${JSON.stringify(summary)}`);
  }
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
    gpu_type_ids: list(endpoint.gpuTypeIds).map(text),
    data_center_ids: list(endpoint.dataCenterIds).map(text),
    flashboot: endpoint.flashboot === true || endpoint.flashBoot === true || text(endpoint.flashBootType).toUpperCase() === "FLASHBOOT",
    allowed_cuda_versions: list(endpoint.allowedCudaVersions),
    min_cuda_version: text(endpoint.minCudaVersion),
    execution_timeout_ms: finite(endpoint.executionTimeoutMs ?? endpoint.executionTimeout),
  };
}

function bootstrapScript() {
  const requiredFiles = JSON.stringify(REQUIRED_FILES);
  return String.raw`
import http.server, json, pathlib, subprocess, sys, threading, time
MODEL = ${JSON.stringify(MODEL_ID)}
CACHE = pathlib.Path(${JSON.stringify(CACHE_ROOT)})
MARKER = ${JSON.stringify(COMPLETION_MARKER)}
CONTRACT = ${JSON.stringify(COMPLETION_CONTRACT)}
REQUIRED = ${requiredFiles}
READY = False
DETAIL = {"phase":"boot"}

def run():
    global READY, DETAIL
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "--no-cache-dir", "huggingface_hub>=0.34,<1"])
        from huggingface_hub import snapshot_download
        started = time.time()
        snapshot = pathlib.Path(snapshot_download(repo_id=MODEL, cache_dir=str(CACHE)))
        missing = [rel for rel in REQUIRED if not (snapshot / rel).is_file()]
        if missing:
            raise RuntimeError("required_files_missing:" + ",".join(missing[:20]))
        marker_payload = {
            "contract": CONTRACT,
            "target_model": MODEL,
            "snapshot_revision": snapshot.name,
            "snapshot_download_completed": True,
            "required_file_count": len(REQUIRED),
        }
        marker_tmp = snapshot / (MARKER + ".tmp")
        marker_final = snapshot / MARKER
        marker_tmp.write_text(json.dumps(marker_payload, separators=(",", ":"), sort_keys=True), encoding="utf-8")
        marker_tmp.replace(marker_final)
        files = [p for p in snapshot.rglob("*") if p.is_file()]
        logical_bytes = sum(p.stat().st_size for p in files)
        DETAIL = {
            "success": True,
            "contract": "AVANTIQO_IMAGE_160GB_CACHE_BOOTSTRAP_V1",
            "model": MODEL,
            "snapshot_path": str(snapshot),
            "snapshot_revision": snapshot.name,
            "required_file_count": len(REQUIRED),
            "missing_required_file_count": 0,
            "completion_marker_written": True,
            "file_count": len(files),
            "logical_bytes": logical_bytes,
            "elapsed_seconds": round(time.time()-started, 3),
            "inference_performed": False,
        }
        READY = True
    except Exception as exc:
        DETAIL = {"success": False, "error_type": type(exc).__name__, "error": str(exc)[:800]}

threading.Thread(target=run, daemon=True).start()

class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path != "/health":
            self.send_response(404); self.end_headers(); return
        body = json.dumps({"ready": READY, **DETAIL}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
    def log_message(self, *args): return

http.server.ThreadingHTTPServer(("0.0.0.0", 8000), H).serve_forever()
`;
}

async function deletePod(key, podId) {
  if (!podId) return;
  const response = await fetch(`${REST}/pods/${encodeURIComponent(podId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok && response.status !== 404) {
    const raw = await response.text();
    throw new Error(`${CONTRACT}_CPU_POD_DELETE_HTTP_${response.status}:${raw.slice(0, 400)}`);
  }
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const current = await rest(`/pods/${encodeURIComponent(podId)}?includeNetworkVolume=true`, key, { allow404: true }).catch(() => ({ __not_found: true }));
    if (current.__not_found) return;
    const status = text(current.desiredStatus || current.status).toUpperCase();
    if (["EXITED", "STOPPED", "TERMINATED", "DELETED"].includes(status)) return;
    await sleep(3000);
  }
  throw new Error(`${CONTRACT}_CPU_POD_DELETE_TIMEOUT`);
}

async function deleteVolume(key, volumeId) {
  const response = await fetch(`${REST}/networkvolumes/${encodeURIComponent(volumeId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok && response.status !== 404) {
    const raw = await response.text();
    throw new Error(`${CONTRACT}_VOLUME_DELETE_HTTP_${response.status}:${raw.slice(0, 500)}`);
  }
}

if (!approved(process.env.AVANTIQO_IMAGE_160GB_STORAGE_MIGRATION_APPROVED)) {
  throw new Error("AVANTIQO_IMAGE_160GB_STORAGE_MIGRATION_APPROVED=YES_REQUIRED");
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
const runtimeKey = text(process.env.RUNPOD_API_KEY || managementKey);
if (!runtimeKey) throw new Error("RUNPOD_IMAGE_RUNTIME_KEY_REQUIRED");

let cpuPodId = null;
let createdTargetVolume = false;
let targetVolumeId = null;
let rebindVerified = false;
let sourceDeleted = false;
let beforeStable = null;

try {
  const [before, beforeHealth, volumesRaw] = await Promise.all([
    rest(`/endpoints/${ENDPOINT_ID}?includeTemplate=true&includeWorkers=true`, managementKey),
    queueHealth(runtimeKey),
    rest("/networkvolumes", managementKey),
  ]);
  assertIdle(before, beforeHealth, `${CONTRACT}_BEFORE`);
  beforeStable = stable(before);
  const beforeVolumes = endpointVolumeIds(before);
  if (JSON.stringify(beforeVolumes) !== JSON.stringify([SOURCE_VOLUME_ID])) throw new Error(`${CONTRACT}_SOURCE_BINDING_INVALID:${JSON.stringify(beforeVolumes)}`);

  const volumes = rows(volumesRaw);
  const source = volumes.find((volume) => text(volume.id) === SOURCE_VOLUME_ID);
  if (!source) throw new Error(`${CONTRACT}_SOURCE_VOLUME_NOT_FOUND`);
  if (text(source.name) !== SOURCE_VOLUME_NAME || finite(source.size ?? source.sizeGb, -1) !== SOURCE_VOLUME_SIZE_GB || text(source.dataCenterId ?? source.data_center_id) !== TARGET_DC) {
    throw new Error(`${CONTRACT}_SOURCE_VOLUME_IDENTITY_MISMATCH`);
  }

  const sameName = volumes.filter((volume) => text(volume.name) === TARGET_VOLUME_NAME);
  const invalidSameName = sameName.filter((volume) => text(volume.dataCenterId ?? volume.data_center_id) !== TARGET_DC || finite(volume.size ?? volume.sizeGb, -1) !== TARGET_VOLUME_SIZE_GB);
  if (invalidSameName.length) throw new Error(`${CONTRACT}_TARGET_VOLUME_NAME_COLLISION`);
  if (sameName.length > 1) throw new Error(`${CONTRACT}_TARGET_VOLUME_DUPLICATE`);

  let target = sameName[0] || null;
  if (!target) {
    target = await rest("/networkvolumes", managementKey, {
      method: "POST",
      timeoutMs: 60000,
      body: { dataCenterId: TARGET_DC, name: TARGET_VOLUME_NAME, size: TARGET_VOLUME_SIZE_GB },
    });
    createdTargetVolume = true;
  }
  targetVolumeId = text(target?.id || target?.data?.id);
  if (!targetVolumeId) throw new Error(`${CONTRACT}_TARGET_VOLUME_ID_REQUIRED`);

  const verifiedTarget = await rest(`/networkvolumes/${encodeURIComponent(targetVolumeId)}`, managementKey);
  if (text(verifiedTarget.name) !== TARGET_VOLUME_NAME || text(verifiedTarget.dataCenterId ?? verifiedTarget.data_center_id) !== TARGET_DC || finite(verifiedTarget.size ?? verifiedTarget.sizeGb, -1) !== TARGET_VOLUME_SIZE_GB) {
    throw new Error(`${CONTRACT}_TARGET_VOLUME_VERIFY_FAILED`);
  }

  const scriptB64 = Buffer.from(bootstrapScript(), "utf8").toString("base64");
  const createdPod = await rest("/pods", managementKey, {
    method: "POST",
    timeoutMs: 60000,
    body: {
      name: `${CPU_POD_PREFIX}${Date.now().toString(36)}`,
      imageName: "python:3.11-slim",
      cloudType: "SECURE",
      computeType: "CPU",
      cpuFlavorIds: ["cpu3c"],
      cpuFlavorPriority: "custom",
      dataCenterIds: [TARGET_DC],
      dataCenterPriority: "custom",
      vcpuCount: 2,
      containerDiskInGb: 5,
      networkVolumeId: targetVolumeId,
      volumeMountPath: "/runpod-volume",
      globalNetworking: true,
      supportPublicIp: false,
      ports: ["8000/http"],
      dockerEntrypoint: ["python", "-c"],
      dockerStartCmd: ["import base64,os;exec(compile(base64.b64decode(os.environ['AVANTIQO_IMAGE_CACHE_BOOTSTRAP_B64']),'<image-cache-bootstrap>','exec'))"],
      env: {
        AVANTIQO_IMAGE_CACHE_BOOTSTRAP_B64: scriptB64,
        HF_HUB_DISABLE_XET: "1",
        HF_XET_RECONSTRUCT_WRITE_SEQUENTIALLY: "1",
        HF_XET_NUM_CONCURRENT_RANGE_GETS: "1",
        HF_HUB_DOWNLOAD_TIMEOUT: "600",
        HF_HUB_ETAG_TIMEOUT: "60",
      },
    },
  });
  cpuPodId = text(createdPod?.id || createdPod?.pod?.id || createdPod?.data?.id);
  if (!cpuPodId) throw new Error(`${CONTRACT}_CPU_POD_ID_REQUIRED`);

  const proxyBase = `https://${cpuPodId}-8000.proxy.runpod.net`;
  const startDeadline = Date.now() + START_TIMEOUT_MS;
  let reachable = false;
  while (Date.now() < startDeadline) {
    try {
      const response = await fetch(`${proxyBase}/health`, { signal: AbortSignal.timeout(15000), headers: { Accept: "application/json" } });
      if (response.ok) { reachable = true; await response.arrayBuffer(); break; }
    } catch {}
    const current = await rest(`/pods/${encodeURIComponent(cpuPodId)}?includeNetworkVolume=true`, managementKey, { allow404: true }).catch(() => ({}));
    const status = text(current.desiredStatus || current.status).toUpperCase();
    if (["EXITED", "STOPPED", "TERMINATED", "DELETED"].includes(status)) throw new Error(`${CONTRACT}_CPU_POD_TERMINAL:${status}`);
    await sleep(POLL_MS);
  }
  if (!reachable) throw new Error(`${CONTRACT}_CPU_POD_START_TIMEOUT`);

  const cacheDeadline = Date.now() + CACHE_TIMEOUT_MS;
  let cache = null;
  while (Date.now() < cacheDeadline) {
    try {
      const response = await fetch(`${proxyBase}/health`, { signal: AbortSignal.timeout(15000), headers: { Accept: "application/json" } });
      if (response.ok) {
        cache = await response.json();
        if (cache.ready === true && cache.success === true) break;
        if (cache.success === false) throw new Error(`${CONTRACT}_CACHE_BOOTSTRAP_FAILED:${text(cache.error_type)}:${text(cache.error)}`);
      }
    } catch (error) {
      if (text(error?.message).startsWith(`${CONTRACT}_CACHE_BOOTSTRAP_FAILED`)) throw error;
    }
    await sleep(POLL_MS);
  }
  if (!cache || cache.ready !== true || cache.success !== true) throw new Error(`${CONTRACT}_CACHE_TIMEOUT`);
  if (text(cache.model) !== MODEL_ID || finite(cache.missing_required_file_count, -1) !== 0 || cache.completion_marker_written !== true || finite(cache.required_file_count, 0) !== REQUIRED_FILES.length) {
    throw new Error(`${CONTRACT}_CACHE_CONTENT_INVALID:${JSON.stringify(cache)}`);
  }

  await deletePod(managementKey, cpuPodId);
  cpuPodId = null;

  const [prewrite, prewriteHealth, prewriteVolumesRaw, prewritePodsRaw] = await Promise.all([
    rest(`/endpoints/${ENDPOINT_ID}?includeTemplate=true&includeWorkers=true`, managementKey),
    queueHealth(runtimeKey),
    rest("/networkvolumes", managementKey),
    rest("/pods?includeNetworkVolume=true", managementKey),
  ]);
  assertIdle(prewrite, prewriteHealth, `${CONTRACT}_PREWRITE`);
  if (JSON.stringify(stable(prewrite)) !== JSON.stringify(beforeStable)) throw new Error(`${CONTRACT}_CONCURRENT_ENDPOINT_CHANGE`);
  if (JSON.stringify(endpointVolumeIds(prewrite)) !== JSON.stringify([SOURCE_VOLUME_ID])) throw new Error(`${CONTRACT}_SOURCE_BINDING_CHANGED`);
  const prewritePods = rows(prewritePodsRaw);
  if (prewritePods.some((pod) => text(pod?.networkVolume?.id || pod?.networkVolumeId) === SOURCE_VOLUME_ID)) throw new Error(`${CONTRACT}_SOURCE_VOLUME_HAS_PODS`);
  const prewriteVolumes = rows(prewriteVolumesRaw);
  if (!prewriteVolumes.some((volume) => text(volume.id) === targetVolumeId)) throw new Error(`${CONTRACT}_TARGET_VOLUME_DISAPPEARED`);

  await rest(`/endpoints/${ENDPOINT_ID}`, managementKey, {
    method: "PATCH",
    body: { networkVolumeId: targetVolumeId, networkVolumeIds: [targetVolumeId] },
  });
  await sleep(1200);

  const [after, afterHealth, allEndpointsRaw, allPodsRaw, targetAfter] = await Promise.all([
    rest(`/endpoints/${ENDPOINT_ID}?includeTemplate=true&includeWorkers=true`, managementKey),
    queueHealth(runtimeKey),
    rest("/endpoints?includeWorkers=true", managementKey),
    rest("/pods?includeNetworkVolume=true", managementKey),
    rest(`/networkvolumes/${encodeURIComponent(targetVolumeId)}`, managementKey),
  ]);
  assertIdle(after, afterHealth, `${CONTRACT}_AFTER`);
  if (JSON.stringify(stable(after)) !== JSON.stringify(beforeStable)) throw new Error(`${CONTRACT}_UNRELATED_ENDPOINT_FIELD_CHANGED`);
  if (JSON.stringify(endpointVolumeIds(after)) !== JSON.stringify([targetVolumeId])) throw new Error(`${CONTRACT}_TARGET_BINDING_VERIFY_FAILED:${JSON.stringify(endpointVolumeIds(after))}`);
  if (text(targetAfter.name) !== TARGET_VOLUME_NAME || finite(targetAfter.size ?? targetAfter.sizeGb, -1) !== TARGET_VOLUME_SIZE_GB || text(targetAfter.dataCenterId ?? targetAfter.data_center_id) !== TARGET_DC) throw new Error(`${CONTRACT}_TARGET_VOLUME_POSTWRITE_INVALID`);
  rebindVerified = true;

  const allEndpoints = rows(allEndpointsRaw);
  const sourceConsumers = allEndpoints.filter((endpoint) => endpointVolumeIds(endpoint).includes(SOURCE_VOLUME_ID));
  if (sourceConsumers.length) throw new Error(`${CONTRACT}_SOURCE_VOLUME_STILL_BOUND:${sourceConsumers.map((endpoint) => `${text(endpoint.name)}:${text(endpoint.id)}`).join(",")}`);
  const allPods = rows(allPodsRaw);
  const sourcePods = allPods.filter((pod) => text(pod?.networkVolume?.id || pod?.networkVolumeId) === SOURCE_VOLUME_ID);
  if (sourcePods.length) throw new Error(`${CONTRACT}_SOURCE_VOLUME_STILL_ATTACHED:${sourcePods.map((pod) => text(pod.id)).join(",")}`);

  const sourceFresh = await rest(`/networkvolumes/${encodeURIComponent(SOURCE_VOLUME_ID)}`, managementKey);
  if (text(sourceFresh.name) !== SOURCE_VOLUME_NAME || finite(sourceFresh.size ?? sourceFresh.sizeGb, -1) !== SOURCE_VOLUME_SIZE_GB || text(sourceFresh.dataCenterId ?? sourceFresh.data_center_id) !== TARGET_DC) {
    throw new Error(`${CONTRACT}_SOURCE_VOLUME_PREFINAL_IDENTITY_MISMATCH`);
  }

  await deleteVolume(managementKey, SOURCE_VOLUME_ID);
  const sourceVerify = await rest(`/networkvolumes/${encodeURIComponent(SOURCE_VOLUME_ID)}`, managementKey, { allow404: true });
  if (!sourceVerify.__not_found) throw new Error(`${CONTRACT}_SOURCE_VOLUME_DELETE_NOT_VERIFIED`);
  sourceDeleted = true;

  const volumesAfterRaw = await rest("/networkvolumes", managementKey);
  const volumesAfter = rows(volumesAfterRaw);
  const imageTargetRows = volumesAfter.filter((volume) => text(volume.name) === TARGET_VOLUME_NAME);
  if (imageTargetRows.length !== 1 || text(imageTargetRows[0].id) !== targetVolumeId || finite(imageTargetRows[0].size ?? imageTargetRows[0].sizeGb, -1) !== TARGET_VOLUME_SIZE_GB) {
    throw new Error(`${CONTRACT}_FINAL_TARGET_VOLUME_INVALID`);
  }

  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    endpoint_id: ENDPOINT_ID,
    endpoint_name: ENDPOINT_NAME,
    target_volume: { id: targetVolumeId, name: TARGET_VOLUME_NAME, size_gb: TARGET_VOLUME_SIZE_GB, data_center_id: TARGET_DC },
    source_volume_deleted: { id: SOURCE_VOLUME_ID, name: SOURCE_VOLUME_NAME, size_gb: SOURCE_VOLUME_SIZE_GB },
    persistent_storage_reduction_gb: SOURCE_VOLUME_SIZE_GB - TARGET_VOLUME_SIZE_GB,
    cached_model: MODEL_ID,
    cache_required_files_verified: REQUIRED_FILES.length,
    cache_completion_marker_written: true,
    cpu_seed_pod_deleted: true,
    workers_min: 0,
    workers_max: 0,
    gpu_compute_used: false,
    inference_performed: false,
    wallet_mutation_performed: false,
    production_deploy_performed: false,
    video_resources_mutated: false,
    secrets_printed: false,
  }, null, 2));
} catch (error) {
  if (cpuPodId) await deletePod(managementKey, cpuPodId).catch(() => null);

  if (!rebindVerified && targetVolumeId && createdTargetVolume) {
    try {
      const endpointsRaw = await rest("/endpoints?includeWorkers=true", managementKey);
      const podsRaw = await rest("/pods?includeNetworkVolume=true", managementKey);
      const consumers = rows(endpointsRaw).filter((endpoint) => endpointVolumeIds(endpoint).includes(targetVolumeId));
      const attachments = rows(podsRaw).filter((pod) => text(pod?.networkVolume?.id || pod?.networkVolumeId) === targetVolumeId);
      if (!consumers.length && !attachments.length) await deleteVolume(managementKey, targetVolumeId);
    } catch {}
  }

  if (rebindVerified && !sourceDeleted) {
    console.error(`${CONTRACT}_NOTICE=IMAGE_REBOUND_TO_160GB_TARGET_BUT_OLD_VOLUME_WAS_NOT_DELETED`);
  }
  throw error;
}
