import process from "node:process";

const CONTRACT = "AVANTIQO_CODE_EUR_IS1_CACHE_MIGRATION_V1";
const REST = "https://rest.runpod.io/v1";
const QUEUE = "https://api.runpod.ai/v2";
const ENDPOINT_ID = "r79dtnjnrilrlc";
const ENDPOINT_NAME = "avantiqo-code-v1";
const SOURCE_VOLUME_ID = "7obluigbr0";
const SOURCE_DC = "US-CA-2";
const TARGET_DC = "EUR-IS-1";
const TARGET_VOLUME_NAME = "avantiqo-code-cache-eur-is-1";
const TARGET_VOLUME_SIZE_GB = 160;
const MODEL_ID = "Qwen/Qwen3-Coder-30B-A3B-Instruct-FP8";
const CACHE_ROOT = "/runpod-volume/huggingface-cache/hub";
const MARKER = "/runpod-volume/avantiqo-code-cache-eur-is-1.json";
const CPU_POD_PREFIX = "avantiqo-code-cache-eur-is1-";
const POLL_MS = 5000;
const START_TIMEOUT_MS = 10 * 60_000;
const CACHE_TIMEOUT_MS = 45 * 60_000;

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
  if (allow404 && response.status === 404) return { __not_found: true };
  if (!response.ok) throw new Error(`${label}_HTTP_${response.status}:${text(body?.message || body?.error || body?.detail || raw).slice(0,900)}`);
  return body;
}

async function rest(pathname, key, options = {}) {
  return readJson(await fetch(`${REST}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30000),
  }), `${CONTRACT}_REST`, options.allow404 === true);
}

async function health(key) {
  return readJson(await fetch(`${QUEUE}/${ENDPOINT_ID}/health`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30000),
  }), `${CONTRACT}_QUEUE`);
}

function endpointVolumeIds(endpoint = {}) {
  return [...new Set([endpoint.networkVolumeId, ...list(endpoint.networkVolumeIds)].map(text).filter(Boolean))];
}
function activeHealth(body = {}) {
  const jobs = body.jobs || {};
  const workers = body.workers || {};
  return {
    in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
    in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
    workers: ["idle","initializing","ready","running","throttled","unhealthy"].reduce((sum,key) => sum + Math.max(0, finite(workers[key],0)), 0),
  };
}
function assertClean(endpoint, queue, label) {
  const live = activeHealth(queue);
  if (text(endpoint.id) !== ENDPOINT_ID || text(endpoint.name) !== ENDPOINT_NAME) throw new Error(`${label}_ENDPOINT_IDENTITY`);
  if (finite(endpoint.workersMin,-1) !== 0 || finite(endpoint.workersMax,-1) !== 0) throw new Error(`${label}_ENDPOINT_NOT_0_0`);
  if (live.in_queue || live.in_progress || live.workers) throw new Error(`${label}_ENDPOINT_NOT_IDLE:${JSON.stringify(live)}`);
  if (!endpointVolumeIds(endpoint).includes(SOURCE_VOLUME_ID)) throw new Error(`${label}_SOURCE_VOLUME_NOT_BOUND`);
}

function bootstrapScript() {
  return String.raw`
import http.server, json, os, pathlib, subprocess, sys, time
ROOT = pathlib.Path("/runpod-volume")
CACHE = pathlib.Path("${CACHE_ROOT}")
MARKER = pathlib.Path("${MARKER}")
MODEL = "${MODEL_ID}"
READY = False
DETAIL = {"phase":"boot"}

def run():
    global READY, DETAIL
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "--no-cache-dir", "huggingface_hub>=0.34,<1"])
        from huggingface_hub import snapshot_download
        started = time.time()
        path = snapshot_download(repo_id=MODEL, cache_dir=str(CACHE))
        root = pathlib.Path(path)
        files = [p for p in root.rglob("*") if p.is_file()]
        size = sum(p.stat().st_size for p in files)
        payload = {
            "success": True,
            "contract": "AVANTIQO_CODE_EUR_IS1_CACHE_BOOTSTRAP_V1",
            "model": MODEL,
            "snapshot_path": str(root),
            "file_count": len(files),
            "bytes": size,
            "elapsed_seconds": round(time.time()-started,3),
            "inference_performed": False,
        }
        MARKER.write_text(json.dumps(payload), encoding="utf-8")
        DETAIL = payload
        READY = True
    except Exception as exc:
        DETAIL = {"success":False,"error_type":type(exc).__name__,"error":str(exc)[:500]}

import threading
threading.Thread(target=run, daemon=True).start()

class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path != "/health":
            self.send_response(404); self.end_headers(); return
        body = json.dumps({"ready":READY, **DETAIL}).encode()
        self.send_response(200); self.send_header("Content-Type","application/json"); self.send_header("Content-Length",str(len(body))); self.end_headers(); self.wfile.write(body)
    def log_message(self,*args): return

http.server.ThreadingHTTPServer(("0.0.0.0",8000),H).serve_forever()
`;
}

async function deletePod(key, podId) {
  if (!podId) return;
  try { await rest(`/pods/${encodeURIComponent(podId)}`, key, { method: "DELETE" }); } catch (error) {
    if (!text(error?.message).includes("HTTP_404")) throw error;
  }
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const current = await rest(`/pods/${encodeURIComponent(podId)}?includeNetworkVolume=true`, key, { allow404: true }).catch(() => ({__not_found:true}));
    if (current.__not_found) return;
    const status = text(current.desiredStatus || current.status).toUpperCase();
    if (["EXITED","STOPPED","TERMINATED","DELETED"].includes(status)) return;
    await sleep(3000);
  }
  throw new Error(`${CONTRACT}_CPU_POD_DELETE_TIMEOUT`);
}

if (!approved(process.env.AVANTIQO_CODE_EUR_IS1_CACHE_MIGRATION_APPROVED)) throw new Error("AVANTIQO_CODE_EUR_IS1_CACHE_MIGRATION_APPROVED=YES_REQUIRED");
const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
const runtimeKey = text(process.env.RUNPOD_AVANTIQO_CODE_API_KEY || process.env.RUNPOD_API_KEY || managementKey);
if (!runtimeKey) throw new Error("RUNPOD_CODE_RUNTIME_KEY_REQUIRED");

let cpuPodId = null;
let createdVolume = false;
let targetVolume = null;
try {
  const [endpoint, queue, volumesRaw] = await Promise.all([
    rest(`/endpoints/${ENDPOINT_ID}?includeTemplate=true&includeWorkers=true`, managementKey),
    health(runtimeKey),
    rest("/networkvolumes", managementKey),
  ]);
  assertClean(endpoint, queue, `${CONTRACT}_BEFORE`);
  const volumes = Array.isArray(volumesRaw) ? volumesRaw : list(volumesRaw?.data || volumesRaw?.items || volumesRaw?.results);
  const source = volumes.find((row) => text(row.id) === SOURCE_VOLUME_ID);
  if (!source || text(source.dataCenterId ?? source.data_center_id) !== SOURCE_DC) throw new Error(`${CONTRACT}_SOURCE_VOLUME_INVALID`);
  const same = volumes.filter((row) => text(row.name) === TARGET_VOLUME_NAME);
  const wrong = same.filter((row) => text(row.dataCenterId ?? row.data_center_id) !== TARGET_DC);
  if (wrong.length) throw new Error(`${CONTRACT}_TARGET_NAME_COLLISION`);
  if (same.length > 1) throw new Error(`${CONTRACT}_TARGET_VOLUME_DUPLICATE`);
  targetVolume = same[0] || null;
  if (!targetVolume) {
    targetVolume = await rest("/networkvolumes", managementKey, {
      method: "POST",
      body: { dataCenterId: TARGET_DC, name: TARGET_VOLUME_NAME, size: TARGET_VOLUME_SIZE_GB },
      timeoutMs: 60000,
    });
    createdVolume = true;
  }
  const volumeId = text(targetVolume.id);
  if (!volumeId) throw new Error(`${CONTRACT}_TARGET_VOLUME_ID_REQUIRED`);
  const verifiedVolume = await rest(`/networkvolumes/${encodeURIComponent(volumeId)}`, managementKey);
  if (text(verifiedVolume.dataCenterId ?? verifiedVolume.data_center_id) !== TARGET_DC || finite(verifiedVolume.size ?? verifiedVolume.sizeGb,0) < TARGET_VOLUME_SIZE_GB) {
    throw new Error(`${CONTRACT}_TARGET_VOLUME_VERIFY_FAILED`);
  }

  const podName = `${CPU_POD_PREFIX}${Date.now().toString(36)}`;
  const scriptB64 = Buffer.from(bootstrapScript(), "utf8").toString("base64");
  const created = await rest("/pods", managementKey, {
    method: "POST",
    timeoutMs: 60000,
    body: {
      name: podName,
      imageName: "python:3.11-slim",
      cloudType: "SECURE",
      computeType: "CPU",
      cpuFlavorIds: ["cpu3c"],
      cpuFlavorPriority: "custom",
      dataCenterIds: [TARGET_DC],
      dataCenterPriority: "custom",
      vcpuCount: 2,
      containerDiskInGb: 5,
      networkVolumeId: volumeId,
      volumeMountPath: "/runpod-volume",
      globalNetworking: true,
      supportPublicIp: false,
      ports: ["8000/http"],
      dockerEntrypoint: ["python", "-c"],
      dockerStartCmd: ["import base64,os;exec(compile(base64.b64decode(os.environ['AVANTIQO_CODE_CACHE_BOOTSTRAP_B64']),'<code-cache-bootstrap>','exec'))"],
      env: { AVANTIQO_CODE_CACHE_BOOTSTRAP_B64: scriptB64 },
    },
  });
  cpuPodId = text(created?.id || created?.pod?.id || created?.data?.id);
  if (!cpuPodId) throw new Error(`${CONTRACT}_CPU_POD_ID_REQUIRED`);

  const base = `https://${cpuPodId}-8000.proxy.runpod.net`;
  const startDeadline = Date.now() + START_TIMEOUT_MS;
  let reachable = false;
  while (Date.now() < startDeadline) {
    try {
      const response = await fetch(`${base}/health`, { signal: AbortSignal.timeout(15000), headers: { Accept: "application/json" } });
      if (response.ok) { reachable = true; await response.arrayBuffer(); break; }
    } catch {}
    const current = await rest(`/pods/${encodeURIComponent(cpuPodId)}?includeNetworkVolume=true`, managementKey, { allow404: true }).catch(() => ({}));
    const status = text(current.desiredStatus || current.status).toUpperCase();
    if (["EXITED","STOPPED","TERMINATED","DELETED"].includes(status)) throw new Error(`${CONTRACT}_CPU_POD_TERMINAL:${status}`);
    await sleep(POLL_MS);
  }
  if (!reachable) throw new Error(`${CONTRACT}_CPU_POD_START_TIMEOUT`);

  const cacheDeadline = Date.now() + CACHE_TIMEOUT_MS;
  let cache = null;
  while (Date.now() < cacheDeadline) {
    try {
      const response = await fetch(`${base}/health`, { signal: AbortSignal.timeout(15000), headers: { Accept: "application/json" } });
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
  if (text(cache.model) !== MODEL_ID || finite(cache.file_count,0) < 1 || finite(cache.bytes,0) < 10 * 1024 * 1024 * 1024) {
    throw new Error(`${CONTRACT}_CACHE_CONTENT_INVALID:${JSON.stringify({model:cache.model,file_count:cache.file_count,bytes:cache.bytes})}`);
  }

  await deletePod(managementKey, cpuPodId);
  cpuPodId = null;
  const [afterEndpoint, afterQueue] = await Promise.all([
    rest(`/endpoints/${ENDPOINT_ID}?includeTemplate=true&includeWorkers=true`, managementKey),
    health(runtimeKey),
  ]);
  assertClean(afterEndpoint, afterQueue, `${CONTRACT}_AFTER`);
  if (endpointVolumeIds(afterEndpoint).includes(volumeId)) throw new Error(`${CONTRACT}_TARGET_VOLUME_MUST_NOT_BE_BOUND_YET`);

  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    target_volume: { id: volumeId, name: TARGET_VOLUME_NAME, data_center_id: TARGET_DC, size_gb: finite(verifiedVolume.size ?? verifiedVolume.sizeGb) },
    target_volume_created: createdVolume,
    source_volume_preserved: true,
    source_endpoint_preserved_0_0: true,
    cache: { model: cache.model, file_count: cache.file_count, bytes: cache.bytes, elapsed_seconds: cache.elapsed_seconds },
    cpu_pod_deleted: true,
    gpu_compute_used: false,
    inference_performed: false,
    endpoint_rebind_performed: false,
    wallet_mutation_performed: false,
    production_deploy_performed: false,
    secrets_printed: false,
  }, null, 2));
} finally {
  if (cpuPodId) await deletePod(managementKey, cpuPodId).catch(() => null);
}
