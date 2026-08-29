import crypto from "node:crypto";

import {
  finite,
  podRest,
  podTerminal,
  text,
  videoPodCandidateSnapshot,
} from "../lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoPodRunpod.js";

const CONTRACT = "AVANTIQO_VIDEO_FLASHVSR_CPU_CACHE_FALLBACK_V1";
const APPROVAL = "AVANTIQO_VIDEO_FLASHVSR_CPU_CACHE_FALLBACK_APPROVED";
const DC = "EU-RO-1";
const VOLUME_ID = "t4erb6kxi1";
const VOLUME_NAME = "avantiqo-video-cache-eu-ro-1";
const MODEL = "JunhaoZhuang/FlashVSR-v1.1";
const REVISION = "a258bf2d58ac5a7d7193fb6ce4326aaff98ea6cb";
const POD_PREFIX = "avantiqo-video-flashvsr-cache-cpu-";
const HTTP_PORT = 8000;
const TIMEOUT_MS = 45 * 60 * 1000;
const POLL_MS = 10_000;
const MAX_COST_PER_HOUR = 0.5;

const FILES = Object.freeze([
  {
    name: "diffusion_pytorch_model_streaming_dmd.safetensors",
    bytes: 5_676_070_392,
    sha256: "bd28180edcf3446c028e32fc6b731a80bf7e4da2ab4caac3186b9499964d37be",
  },
  {
    name: "LQ_proj_in.ckpt",
    bytes: 575_694_948,
    sha256: "d6d011cdaaba6a52645086caa08fa04124e746f6ca568140a24007591142bfd2",
  },
  {
    name: "TCDecoder.ckpt",
    bytes: 189_018_333,
    sha256: "e224bdcf2f52745cbf4d393ff5374c2ba09e90285d5d19062d2bf63b915b6161",
  },
]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const approved = (value) => ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase());
const terminalNames = new Set(["EXITED", "TERMINATED", "DELETED", "STOPPED"]);

if (Number(process.versions.node.split(".")[0]) < 20) {
  throw new Error(`AVANTIQO_VIDEO_FLASHVSR_CPU_CACHE_NODE20_REQUIRED:${process.version}`);
}
if (!approved(process.env[APPROVAL])) throw new Error(`${APPROVAL}=YES_REQUIRED`);
if (!text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY)) {
  throw new Error("RUNPOD_MANAGEMENT_API_KEY_REQUIRED");
}

function podStatus(pod = {}) {
  return text(pod.status || pod.workerStatus || pod.runtimeStatus || pod.desiredStatus).toUpperCase();
}

function networkVolumeId(pod = {}) {
  return text(pod?.networkVolume?.id || pod?.networkVolumeId || pod?.network_volume_id);
}

async function deleteOwnedPod(podId) {
  if (!podId) return false;
  try {
    await podRest(`/pods/${encodeURIComponent(podId)}`, { method: "DELETE", timeoutMs: 60_000 });
  } catch (error) {
    const message = text(error?.message);
    if (!message.includes("HTTP_404")) throw error;
  }
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const current = await podRest(`/pods/${encodeURIComponent(podId)}?includeNetworkVolume=true`, { timeoutMs: 15_000 });
      if (podTerminal(current) || terminalNames.has(podStatus(current))) return true;
    } catch (error) {
      if (text(error?.message).includes("HTTP_404")) return true;
      throw error;
    }
    await sleep(3_000);
  }
  throw new Error(`${CONTRACT}_POD_DELETE_TIMEOUT:${podId}`);
}

async function cleanupStaleOwnedCpuPods() {
  const rows = await podRest("/pods?includeWorkers=true", { timeoutMs: 30_000 });
  const pods = Array.isArray(rows) ? rows : Array.isArray(rows?.pods) ? rows.pods : [];
  let cleaned = 0;
  for (const pod of pods) {
    if (!text(pod?.name).startsWith(POD_PREFIX)) continue;
    if (podTerminal(pod) || terminalNames.has(podStatus(pod))) continue;
    await deleteOwnedPod(text(pod.id));
    cleaned += 1;
  }
  return cleaned;
}

const PYTHON = String.raw`
import hashlib
import http.server
import json
import os
import pathlib
import shutil
import time
import urllib.error
import urllib.request

CONTRACT = os.environ["AVANTIQO_FLASHVSR_CACHE_CONTRACT"]
MODEL = os.environ["AVANTIQO_FLASHVSR_MODEL"]
REVISION = os.environ["AVANTIQO_FLASHVSR_REVISION"]
TOKEN = os.environ["AVANTIQO_FLASHVSR_CACHE_PROBE_TOKEN"]
ROOT = pathlib.Path("/workspace/flashvsr/FlashVSR-v1.1")
ROOT.mkdir(parents=True, exist_ok=True)
FILES = json.loads(os.environ["AVANTIQO_FLASHVSR_FILES_JSON"])
MARKER = ROOT / ".avantiqo-flashvsr-v11-complete.json"


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb", buffering=8 * 1024 * 1024) as f:
        while True:
            chunk = f.read(8 * 1024 * 1024)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def valid(path, meta):
    return path.is_file() and path.stat().st_size == int(meta["bytes"]) and sha256_file(path) == meta["sha256"]


def download(meta):
    name = meta["name"]
    target = ROOT / name
    if valid(target, meta):
        return {"file": name, "bytes": int(meta["bytes"]), "sha256": meta["sha256"], "action": "SKIPPED"}
    target.unlink(missing_ok=True)
    part = ROOT / (name + ".part")
    url = f"https://huggingface.co/{MODEL}/resolve/{REVISION}/{name}?download=true"
    for attempt in range(1, 7):
        start = part.stat().st_size if part.exists() else 0
        headers = {"User-Agent": "Avantiqo-FlashVSR-CPU-Cache/1"}
        if start > 0:
            headers["Range"] = f"bytes={start}-"
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=120) as response:
                code = int(getattr(response, "status", 200) or 200)
                append = start > 0 and code == 206
                mode = "ab" if append else "wb"
                if start > 0 and not append:
                    start = 0
                with open(part, mode, buffering=8 * 1024 * 1024) as out:
                    while True:
                        chunk = response.read(8 * 1024 * 1024)
                        if not chunk:
                            break
                        out.write(chunk)
            if part.stat().st_size == int(meta["bytes"]):
                digest = sha256_file(part)
                if digest != meta["sha256"]:
                    raise RuntimeError(f"SHA256_MISMATCH:{name}:{digest}")
                os.replace(part, target)
                return {"file": name, "bytes": int(meta["bytes"]), "sha256": meta["sha256"], "action": "DOWNLOADED"}
            if part.stat().st_size > int(meta["bytes"]):
                part.unlink(missing_ok=True)
                raise RuntimeError(f"SIZE_OVERFLOW:{name}")
        except Exception:
            if attempt >= 6:
                raise
            time.sleep(min(30, attempt * 5))
    raise RuntimeError(f"DOWNLOAD_FAILED:{name}")


state = {
    "success": False,
    "contract": CONTRACT,
    "model": MODEL,
    "revision": REVISION,
    "gpu_compute_used": False,
    "video_inference_performed": False,
    "production_deploy_performed": False,
    "secrets_printed": False,
}
try:
    results = [download(meta) for meta in FILES]
    marker = {
        **state,
        "success": True,
        "weights_preloaded": True,
        "files": [{"file": row["file"], "bytes": row["bytes"], "sha256": row["sha256"]} for row in results],
    }
    MARKER.write_text(json.dumps(marker, separators=(",", ":")), encoding="utf-8")
    state = {**marker, "results": results}
except Exception as exc:
    state = {**state, "error_code": str(exc).split(":", 1)[0][:160]}


class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path != "/status" or self.headers.get("Authorization", "") != f"Bearer {TOKEN}":
            self.send_response(404)
            self.end_headers()
            return
        body = json.dumps(state, separators=(",", ":")).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
    def log_message(self, fmt, *args):
        return

http.server.ThreadingHTTPServer(("0.0.0.0", 8000), Handler).serve_forever()
`;

const snapshot = await videoPodCandidateSnapshot();
if (text(snapshot.volume?.id) !== VOLUME_ID || text(snapshot.volume?.name) !== VOLUME_NAME) {
  throw new Error(`${CONTRACT}_VIDEO_VOLUME_INVALID`);
}
if (text(snapshot.volume?.dataCenterId || snapshot.volume?.data_center_id) !== DC) {
  throw new Error(`${CONTRACT}_VIDEO_VOLUME_DC_INVALID`);
}

const staleCpuPodsCleaned = await cleanupStaleOwnedCpuPods();

const rawPods = await podRest("/pods?includeWorkers=true", { timeoutMs: 30_000 });
const pods = Array.isArray(rawPods) ? rawPods : Array.isArray(rawPods?.pods) ? rawPods.pods : [];
const conflicting = pods.filter((pod) => {
  if (podTerminal(pod) || terminalNames.has(podStatus(pod))) return false;
  if (text(pod?.name).startsWith(POD_PREFIX)) return false;
  return networkVolumeId(pod) === VOLUME_ID;
});
if (conflicting.length) {
  throw new Error(`${CONTRACT}_VIDEO_VOLUME_BUSY:${conflicting.length}`);
}

const probeToken = crypto.randomBytes(24).toString("hex");
const owner = crypto.randomBytes(8).toString("hex");
let podId = null;
let created = null;
let result = null;
let deleted = false;
const startedAt = Date.now();

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: "APPLY",
  data_center_id: DC,
  volume_id: VOLUME_ID,
  volume_name: VOLUME_NAME,
  model: MODEL,
  revision: REVISION,
  required_weight_files: FILES.length,
  transfer_mode: "RUNPOD_CPU_POD_ATTACHED_VOLUME",
  s3_credentials_required: false,
  compute_type: "CPU",
  cpu_flavor: "cpu3c",
  gpu_attached: false,
  gpu_compute_used: false,
  video_inference_performed: false,
  production_deploy_performed: false,
  stale_owned_cpu_pods_cleaned: staleCpuPodsCleaned,
  secrets_printed: false,
}, null, 2));

try {
  created = await podRest("/pods", {
    method: "POST",
    timeoutMs: 60_000,
    body: {
      name: `${POD_PREFIX}${owner}`,
      imageName: "python:3.11-slim",
      cloudType: "SECURE",
      computeType: "CPU",
      cpuFlavorIds: ["cpu3c"],
      cpuFlavorPriority: "custom",
      dataCenterIds: [DC],
      dataCenterPriority: "custom",
      vcpuCount: 2,
      containerDiskInGb: 10,
      networkVolumeId: VOLUME_ID,
      volumeMountPath: "/workspace",
      globalNetworking: true,
      supportPublicIp: false,
      ports: [`${HTTP_PORT}/http`],
      dockerEntrypoint: ["python", "-c"],
      dockerStartCmd: [
        "import base64,os;exec(compile(base64.b64decode(os.environ['AVANTIQO_FLASHVSR_CPU_SCRIPT_B64']),'<avantiqo-flashvsr-cache>','exec'))",
      ],
      env: {
        AVANTIQO_FLASHVSR_CPU_SCRIPT_B64: Buffer.from(PYTHON, "utf8").toString("base64"),
        AVANTIQO_FLASHVSR_CACHE_CONTRACT: CONTRACT,
        AVANTIQO_FLASHVSR_MODEL: MODEL,
        AVANTIQO_FLASHVSR_REVISION: REVISION,
        AVANTIQO_FLASHVSR_FILES_JSON: JSON.stringify(FILES),
        AVANTIQO_FLASHVSR_CACHE_PROBE_TOKEN: probeToken,
      },
    },
  });
  podId = text(created?.id || created?.pod?.id || created?.data?.id);
  if (!podId) throw new Error(`${CONTRACT}_POD_ID_REQUIRED`);

  const cost = finite(created?.costPerHr ?? created?.adjustedCostPerHr, null);
  if (cost !== null && cost > MAX_COST_PER_HOUR) {
    throw new Error(`${CONTRACT}_CPU_COST_GUARD:${cost}`);
  }
  if (created?.gpu && finite(created?.gpu?.count, 0) > 0) {
    throw new Error(`${CONTRACT}_GPU_ATTACHED_FORBIDDEN`);
  }

  const proxyUrl = `https://${podId}-${HTTP_PORT}.proxy.runpod.net/status`;
  const deadline = Date.now() + TIMEOUT_MS;
  let poll = 0;
  while (Date.now() < deadline) {
    poll += 1;
    try {
      const response = await fetch(proxyUrl, {
        headers: { Authorization: `Bearer ${probeToken}` },
        signal: AbortSignal.timeout(20_000),
      });
      if (response.ok) {
        const body = await response.json();
        if (body?.contract !== CONTRACT) throw new Error(`${CONTRACT}_PROBE_CONTRACT_INVALID`);
        if (body?.success !== true) throw new Error(`${CONTRACT}_REMOTE_FAILED:${text(body?.error_code) || "UNKNOWN"}`);
        if (body?.revision !== REVISION || body?.weights_preloaded !== true) {
          throw new Error(`${CONTRACT}_REMOTE_REVISION_OR_MARKER_INVALID`);
        }
        if (body?.gpu_compute_used !== false || body?.video_inference_performed !== false) {
          throw new Error(`${CONTRACT}_GPU_OR_INFERENCE_FORBIDDEN`);
        }
        const rows = Array.isArray(body?.files) ? body.files : [];
        for (const expected of FILES) {
          const row = rows.find((entry) => text(entry?.file) === expected.name);
          if (!row || Number(row.bytes) !== expected.bytes || text(row.sha256) !== expected.sha256) {
            throw new Error(`${CONTRACT}_REMOTE_FILE_INVALID:${expected.name}`);
          }
        }
        result = body;
        break;
      }
    } catch (error) {
      if (text(error?.message).startsWith(CONTRACT)) throw error;
    }

    try {
      const current = await podRest(`/pods/${encodeURIComponent(podId)}?includeNetworkVolume=true`, { timeoutMs: 15_000 });
      if (current?.gpu && finite(current?.gpu?.count, 0) > 0) throw new Error(`${CONTRACT}_GPU_ATTACHED_FORBIDDEN`);
      if (podTerminal(current) || terminalNames.has(podStatus(current))) {
        throw new Error(`${CONTRACT}_CPU_POD_TERMINATED_BEFORE_MARKER:${podStatus(current) || "UNKNOWN"}`);
      }
    } catch (error) {
      if (text(error?.message).startsWith(CONTRACT)) throw error;
      if (text(error?.message).includes("HTTP_404")) throw new Error(`${CONTRACT}_CPU_POD_DISAPPEARED`);
    }

    if (poll % 6 === 0) {
      console.log(`AVANTIQO_VIDEO_FLASHVSR_CPU_CACHE_PROGRESS=${JSON.stringify({ poll, elapsed_seconds: Math.round((Date.now() - startedAt) / 1000), gpu_compute_used: false, video_inference_performed: false })}`);
    }
    await sleep(POLL_MS);
  }
  if (!result) throw new Error(`${CONTRACT}_TIMEOUT`);
} finally {
  if (podId) deleted = await deleteOwnedPod(podId);
}

if (!deleted) throw new Error(`${CONTRACT}_CPU_POD_DELETE_REQUIRED`);

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  model: MODEL,
  revision: REVISION,
  weights_preloaded: true,
  files: result.files,
  transfer_mode: "RUNPOD_CPU_POD_ATTACHED_VOLUME",
  s3_credentials_required: false,
  compute_type: "CPU",
  gpu_attached: false,
  gpu_compute_used: false,
  video_inference_performed: false,
  generation_submitted: false,
  cpu_pod_deleted: true,
  active_owned_cpu_pod_after: false,
  production_deploy_performed: false,
  secrets_printed: false,
  elapsed_seconds: Math.round((Date.now() - startedAt) / 1000),
}, null, 2));
console.log(`${CONTRACT}=PASS`);
