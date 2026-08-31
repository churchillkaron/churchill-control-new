import process from "node:process";

const CONTRACT = "AVANTIQO_CODE_AP_JP1_CACHE_BOOTSTRAP_V1";
const REST = "https://rest.runpod.io/v1";
const TARGET_DC = "AP-JP-1";
const TARGET_VOLUME_NAME = "avantiqo-code-cache-ap-jp-1";
const TARGET_VOLUME_SIZE_GB = 160;
const MODEL_ID = "Qwen/Qwen3-Coder-30B-A3B-Instruct-FP8";
const CACHE_ROOT = "/runpod-volume/huggingface-cache/hub";
const CPU_POD_PREFIX = "avantiqo-code-cache-ap-jp1-";
const POLL_MS = 5000;
const START_TIMEOUT_MS = 10 * 60_000;
const CACHE_TIMEOUT_MS = 45 * 60_000;

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const approved = (value) => ["YES", "TRUE", "1", "APPROVED"].includes(text(value).toUpperCase());

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

function rows(raw) {
  if (Array.isArray(raw)) return raw;
  return list(raw?.data || raw?.items || raw?.results || raw?.networkVolumes || raw?.volumes);
}

function bootstrapScript() {
  return String.raw`
import http.server, json, pathlib, subprocess, sys, threading, time
CACHE = pathlib.Path("${CACHE_ROOT}")
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
        DETAIL = {
            "success": True,
            "contract": "AVANTIQO_CODE_AP_JP1_CACHE_BOOTSTRAP_PAYLOAD_V1",
            "model": MODEL,
            "snapshot_path": str(root),
            "file_count": len(files),
            "bytes": size,
            "elapsed_seconds": round(time.time()-started,3),
            "inference_performed": False,
        }
        READY = True
    except Exception as exc:
        DETAIL = {"success":False,"error_type":type(exc).__name__,"error":str(exc)[:500]}

threading.Thread(target=run, daemon=True).start()

class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path != "/health":
            self.send_response(404); self.end_headers(); return
        body = json.dumps({"ready":READY, **DETAIL}).encode()
        self.send_response(200)
        self.send_header("Content-Type","application/json")
        self.send_header("Content-Length",str(len(body)))
        self.end_headers()
        self.wfile.write(body)
    def log_message(self,*args): return

http.server.ThreadingHTTPServer(("0.0.0.0",8000),H).serve_forever()
`;
}

async function deletePod(key, podId) {
  if (!podId) return true;
  try { await rest(`/pods/${encodeURIComponent(podId)}`, key, { method: "DELETE" }); } catch (error) {
    if (!text(error?.message).includes("HTTP_404")) throw error;
  }
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const current = await rest(`/pods/${encodeURIComponent(podId)}?includeNetworkVolume=true`, key, { allow404: true }).catch(() => ({__not_found:true}));
    if (current.__not_found) return true;
    const status = text(current.desiredStatus || current.status).toUpperCase();
    if (["EXITED","STOPPED","TERMINATED","DELETED"].includes(status)) return true;
    await sleep(3000);
  }
  return false;
}

if (!approved(process.env.AVANTIQO_CODE_AP_JP1_CACHE_BOOTSTRAP_APPROVED)) {
  throw new Error("AVANTIQO_CODE_AP_JP1_CACHE_BOOTSTRAP_APPROVED=YES_REQUIRED");
}
const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
if (!managementKey) throw new Error(`${CONTRACT}_RUNPOD_KEY_REQUIRED`);

let cpuPodId = null;
let createdVolume = false;
try {
  const volumes = rows(await rest("/networkvolumes", managementKey));
  const same = volumes.filter((row) => text(row?.name) === TARGET_VOLUME_NAME);
  const wrong = same.filter((row) => text(row?.dataCenterId ?? row?.data_center_id) !== TARGET_DC);
  if (wrong.length) throw new Error(`${CONTRACT}_TARGET_NAME_COLLISION`);
  if (same.length > 1) throw new Error(`${CONTRACT}_TARGET_VOLUME_DUPLICATE`);

  let volume = same[0] || null;
  if (!volume) {
    volume = await rest("/networkvolumes", managementKey, {
      method: "POST",
      body: { dataCenterId: TARGET_DC, name: TARGET_VOLUME_NAME, size: TARGET_VOLUME_SIZE_GB },
      timeoutMs: 60000,
    });
    createdVolume = true;
  }
  const volumeId = text(volume?.id);
  if (!volumeId) throw new Error(`${CONTRACT}_TARGET_VOLUME_ID_REQUIRED`);
  const verified = await rest(`/networkvolumes/${encodeURIComponent(volumeId)}`, managementKey);
  if (text(verified?.dataCenterId ?? verified?.data_center_id) !== TARGET_DC || finite(verified?.size ?? verified?.sizeGb,0) < TARGET_VOLUME_SIZE_GB) {
    throw new Error(`${CONTRACT}_TARGET_VOLUME_VERIFY_FAILED`);
  }

  const scriptB64 = Buffer.from(bootstrapScript(), "utf8").toString("base64");
  const created = await rest("/pods", managementKey, {
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
    const status = text(current?.desiredStatus || current?.status).toUpperCase();
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
        if (cache?.ready === true && cache?.success === true) break;
        if (cache?.success === false) throw new Error(`${CONTRACT}_CACHE_BOOTSTRAP_FAILED:${text(cache?.error_type)}:${text(cache?.error)}`);
      }
    } catch (error) {
      if (text(error?.message).startsWith(`${CONTRACT}_CACHE_BOOTSTRAP_FAILED`)) throw error;
    }
    await sleep(POLL_MS);
  }
  if (!cache || cache.ready !== true || cache.success !== true) throw new Error(`${CONTRACT}_CACHE_TIMEOUT`);
  if (text(cache.model) !== MODEL_ID || finite(cache.file_count,0) < 1 || finite(cache.bytes,0) < 10 * 1024 * 1024 * 1024) {
    throw new Error(`${CONTRACT}_CACHE_CONTENT_INVALID:${JSON.stringify({model:cache?.model,file_count:cache?.file_count,bytes:cache?.bytes})}`);
  }

  const deleted = await deletePod(managementKey, cpuPodId);
  if (!deleted) throw new Error(`${CONTRACT}_CPU_POD_DELETE_TIMEOUT`);
  cpuPodId = null;

  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    target_volume: {
      id: volumeId,
      name: TARGET_VOLUME_NAME,
      data_center_id: TARGET_DC,
      size_gb: finite(verified?.size ?? verified?.sizeGb),
    },
    target_volume_created: createdVolume,
    cache: {
      model: cache.model,
      file_count: cache.file_count,
      bytes: cache.bytes,
      elapsed_seconds: cache.elapsed_seconds,
    },
    cpu_pod_deleted: true,
    gpu_compute_used: false,
    inference_performed: false,
    endpoint_rebind_performed: false,
    production_deploy_performed: false,
    secrets_printed: false,
  }, null, 2));
  console.log(`${CONTRACT}=PASS`);
} finally {
  if (cpuPodId) await deletePod(managementKey, cpuPodId).catch(() => null);
}
