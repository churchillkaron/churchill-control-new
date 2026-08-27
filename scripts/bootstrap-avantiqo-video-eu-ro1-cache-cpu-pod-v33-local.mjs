import { randomBytes } from "node:crypto";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_VIDEO_EU_RO1_CPU_CACHE_BOOTSTRAP_V33";
const APPROVAL_ENV = "AVANTIQO_VIDEO_EU_RO1_CPU_CACHE_BOOTSTRAP_APPROVED";
const CINEMA_ENDPOINT_ID = "r0bzqq9zoi92h7";
const IMAGE_ENDPOINT_ID = "m9ieryijbnq77q";
const SOURCE_VOLUME_ID = "7pcdebhpga";
const DESTINATION_VOLUME_ID = "t4erb6kxi1";
const DESTINATION_VOLUME_NAME = "avantiqo-video-cache-eu-ro-1";
const DESTINATION_DC = "EU-RO-1";
const POD_NAME = "avantiqo-video-eu-ro1-cache-bootstrap-v33";
const STATUS_PORT = 8000;
const POLL_MS = Math.max(10000, Number(process.env.AVANTIQO_VIDEO_V33_POLL_MS || 20000));
const MAX_WAIT_MS = Math.max(30 * 60 * 1000, Number(process.env.AVANTIQO_VIDEO_V33_MAX_WAIT_MS || 6 * 60 * 60 * 1000));
const MAX_CPU_COST_PER_HR = Math.max(0.01, Number(process.env.AVANTIQO_VIDEO_V33_MAX_CPU_COST_PER_HR || 0.50));

const text = (value) => String(value ?? "").trim();
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const approved = (value) => ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase());
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const list = (value) => Array.isArray(value) ? value : [];
const unique = (values) => [...new Set(values.map(text).filter(Boolean))];

function redact(value) {
  return text(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/([?&](?:token|key|api_key|apikey|sig|signature)=)[^&\s]+/gi, "$1[REDACTED]");
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

async function rest(pathname, key, options = {}) {
  const response = await fetch(`${REST_BASE}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch {}
  if (!response.ok && !(options.allow404 && response.status === 404)) {
    throw new Error(`AVANTIQO_VIDEO_V33_REST_${response.status}:${redact(body?.message || body?.error || raw).slice(0, 1000)}`);
  }
  if (options.allow404 && response.status === 404) return { __not_found: true };
  return body ?? {};
}

async function queueHealth(endpointId, key) {
  const response = await fetch(`${QUEUE_BASE}/${endpointId}/health`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(20000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch {}
  if (!response.ok) throw new Error(`AVANTIQO_VIDEO_V33_QUEUE_${endpointId}_${response.status}:${redact(raw).slice(0, 500)}`);
  const jobs = body?.jobs || {};
  const workers = body?.workers || {};
  const queue = finite(jobs.inQueue ?? jobs.in_queue, 0);
  const progress = finite(jobs.inProgress ?? jobs.in_progress, 0);
  const workerTotal = ["idle", "initializing", "ready", "running", "throttled", "unhealthy"]
    .reduce((sum, name) => sum + finite(workers[name], 0), 0);
  return { queue, progress, workerTotal, unhealthy: finite(workers.unhealthy, 0) };
}

function endpointVolumeIds(endpoint = {}) {
  return unique([endpoint.networkVolumeId, ...list(endpoint.networkVolumeIds)]);
}

function assertQuiescent(health, label) {
  if (health.queue !== 0 || health.progress !== 0 || health.workerTotal !== 0 || health.unhealthy !== 0) {
    throw new Error(`AVANTIQO_VIDEO_V33_${label}_NOT_QUIESCENT:${JSON.stringify(health)}`);
  }
}

function bootstrapPython() {
  return String.raw`
import json
import os
import shutil
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

STATUS_TOKEN = os.environ["AVANTIQO_VIDEO_V33_STATUS_TOKEN"]
CACHE_ROOT = Path("/runpod-volume/huggingface-cache/hub")
COMPLETION_CONTRACT = "AVANTIQO_VIDEO_WAN22_CACHE_COMPLETION_V1"
MODELS = [
    {
        "label": "T2V",
        "model": "Wan-AI/Wan2.2-T2V-A14B-Diffusers",
        "revision": "5be7df9619b54f4e2667b2755bc6a756675b5cd7",
        "file_count": 49,
        "bytes": 126200628126,
    },
    {
        "label": "I2V",
        "model": "Wan-AI/Wan2.2-I2V-A14B-Diffusers",
        "revision": "596658fd9ca6b7b71d5057529bbf319ecbc61d74",
        "file_count": 50,
        "bytes": 126204155463,
    },
]

state_lock = threading.Lock()
state = {
    "contract": "AVANTIQO_VIDEO_EU_RO1_CPU_CACHE_BOOTSTRAP_V33",
    "status": "STARTING",
    "phase": "BOOTSTRAP",
    "current_model": None,
    "models": [],
    "gpu_used": False,
    "source_volume_mutated": False,
    "destination_volume_mutated": True,
    "secrets_printed": False,
}

def update(**kwargs):
    with state_lock:
        state.update(kwargs)

def snapshot():
    with state_lock:
        return dict(state)

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        return
    def do_GET(self):
        if self.path != "/status" or self.headers.get("x-avantiqo-status-token") != STATUS_TOKEN:
            self.send_response(404)
            self.end_headers()
            return
        payload = json.dumps(snapshot(), separators=(",", ":")).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

def model_root(model):
    return CACHE_ROOT / ("models--" + model.replace("/", "--"))

def marker_payload(spec):
    return {
        "contract": COMPLETION_CONTRACT,
        "target_model": spec["model"],
        "snapshot_revision": spec["revision"],
        "snapshot_download_completed": True,
    }

def marker_valid(path, spec):
    try:
        parsed = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return False
    return parsed == marker_payload(spec)

def verify_snapshot(spec, manifest):
    root = model_root(spec["model"])
    snapshot_dir = root / "snapshots" / spec["revision"]
    if not snapshot_dir.is_dir() or not (snapshot_dir / "model_index.json").is_file():
        raise RuntimeError("SNAPSHOT_OR_MODEL_INDEX_MISSING:" + spec["label"])
    verified = 0
    for entry in manifest:
        path = snapshot_dir / entry["name"]
        if not path.exists():
            raise RuntimeError("FILE_MISSING:" + spec["label"] + ":" + entry["name"])
        actual = path.stat().st_size
        if actual != entry["size"]:
            raise RuntimeError("FILE_SIZE_INVALID:" + spec["label"] + ":" + entry["name"] + ":" + str(actual))
        verified += actual
    if verified != spec["bytes"]:
        raise RuntimeError("VERIFIED_BYTES_INVALID:" + spec["label"] + ":" + str(verified))
    return verified

def run():
    try:
        update(status="RUNNING", phase="INSTALLING_DEPENDENCIES")
        subprocess.check_call(
            [sys.executable, "-m", "pip", "install", "--quiet", "huggingface_hub>=0.34,<1"],
            stdout=subprocess.DEVNULL,
        )
        os.environ.setdefault("HF_HUB_DISABLE_XET", "1")
        from huggingface_hub import HfApi, snapshot_download
        api = HfApi(token=os.environ.get("HF_TOKEN") or None)
        CACHE_ROOT.mkdir(parents=True, exist_ok=True)
        completed = []

        for spec in MODELS:
            update(phase="VERIFYING_REMOTE_MANIFEST", current_model=spec["label"])
            info = api.model_info(repo_id=spec["model"], revision=spec["revision"], files_metadata=True)
            resolved = str(info.sha or "").strip()
            if resolved != spec["revision"]:
                raise RuntimeError("REMOTE_REVISION_INVALID:" + spec["label"] + ":" + resolved)
            manifest = []
            for sibling in info.siblings or []:
                name = str(getattr(sibling, "rfilename", "") or "").strip()
                if not name:
                    continue
                size = getattr(sibling, "size", None)
                if size is None:
                    raise RuntimeError("REMOTE_SIZE_MISSING:" + spec["label"] + ":" + name)
                manifest.append({"name": name, "size": int(size)})
            manifest.sort(key=lambda item: item["name"])
            if len(manifest) != spec["file_count"]:
                raise RuntimeError("REMOTE_FILE_COUNT_INVALID:" + spec["label"] + ":" + str(len(manifest)))
            remote_bytes = sum(item["size"] for item in manifest)
            if remote_bytes != spec["bytes"]:
                raise RuntimeError("REMOTE_BYTES_INVALID:" + spec["label"] + ":" + str(remote_bytes))

            root = model_root(spec["model"])
            snapshot_dir = root / "snapshots" / spec["revision"]
            marker = snapshot_dir / ".avantiqo-video-cache-complete.json"
            ref = root / "refs" / "main"

            if marker_valid(marker, spec):
                verified = verify_snapshot(spec, manifest)
                completed.append({"label": spec["label"], "revision": spec["revision"], "bytes": verified, "already_complete": True})
                update(models=list(completed))
                continue

            update(phase="CLEANING_INCOMPLETE_DESTINATION_SNAPSHOT", current_model=spec["label"])
            try:
                marker.unlink(missing_ok=True)
            except Exception:
                pass
            try:
                ref.unlink(missing_ok=True)
            except Exception:
                pass
            if snapshot_dir.exists():
                shutil.rmtree(snapshot_dir)

            update(phase="DOWNLOADING_DIRECT_TO_EU_RO1_VOLUME", current_model=spec["label"])
            downloaded = snapshot_download(
                repo_id=spec["model"],
                revision=spec["revision"],
                cache_dir=str(CACHE_ROOT),
                token=os.environ.get("HF_TOKEN") or None,
                local_files_only=False,
                max_workers=4,
                etag_timeout=60,
            )
            downloaded_path = Path(downloaded)
            if downloaded_path.name != spec["revision"]:
                raise RuntimeError("DOWNLOADED_REVISION_INVALID:" + spec["label"] + ":" + downloaded_path.name)

            update(phase="VERIFYING_DESTINATION_SNAPSHOT", current_model=spec["label"])
            verified = verify_snapshot(spec, manifest)
            ref.parent.mkdir(parents=True, exist_ok=True)
            ref.write_text(spec["revision"], encoding="utf-8")
            temporary = marker.with_name(marker.name + ".tmp")
            temporary.write_text(json.dumps(marker_payload(spec), separators=(",", ":"), sort_keys=True), encoding="utf-8")
            temporary.replace(marker)
            if not marker_valid(marker, spec):
                raise RuntimeError("COMPLETION_MARKER_VERIFY_FAILED:" + spec["label"])
            completed.append({"label": spec["label"], "revision": spec["revision"], "bytes": verified, "already_complete": False})
            update(models=list(completed))

        update(status="COMPLETE", phase="COMPLETE", current_model=None, models=list(completed))
    except Exception as exc:
        update(status="FAILED", phase="FAILED", error_type=type(exc).__name__, error=str(exc)[:1200])

threading.Thread(target=run, daemon=True).start()
ThreadingHTTPServer(("0.0.0.0", 8000), Handler).serve_forever()
`;
}

async function proxyStatus(podId, token) {
  try {
    const response = await fetch(`https://${podId}-${STATUS_PORT}.proxy.runpod.net/status`, {
      headers: { "x-avantiqo-status-token": token, Accept: "application/json" },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

if (Number(process.versions.node.split(".")[0]) < 24) throw new Error(`AVANTIQO_VIDEO_V33_NODE24_REQUIRED:${process.version}`);
const apply = process.argv.includes("--apply");
if (apply && !approved(process.env[APPROVAL_ENV])) throw new Error(`${APPROVAL_ENV}=YES_REQUIRED`);

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const videoQueueKey = text(process.env.RUNPOD_AVANTIQO_VIDEO_API_KEY || process.env.RUNPOD_API_KEY || managementKey);
const imageQueueKey = text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY || process.env.RUNPOD_API_KEY || managementKey);

const [cinema, image, destinationVolume, pods] = await Promise.all([
  rest(`/endpoints/${CINEMA_ENDPOINT_ID}?includeTemplate=false&includeWorkers=true`, managementKey),
  rest(`/endpoints/${IMAGE_ENDPOINT_ID}?includeTemplate=false&includeWorkers=true`, managementKey),
  rest(`/networkvolumes/${DESTINATION_VOLUME_ID}`, managementKey),
  rest("/pods", managementKey),
]);

if (finite(cinema.workersMin ?? cinema.workers_min, -1) !== 0 || finite(cinema.workersMax ?? cinema.workers_max, -1) !== 0) {
  throw new Error(`AVANTIQO_VIDEO_V33_CINEMA_NOT_RESTING_0_0:min=${cinema.workersMin}:max=${cinema.workersMax}`);
}
const cinemaVolumes = endpointVolumeIds(cinema);
if (!cinemaVolumes.includes(SOURCE_VOLUME_ID) || cinemaVolumes.includes(DESTINATION_VOLUME_ID)) {
  throw new Error(`AVANTIQO_VIDEO_V33_CINEMA_VOLUME_BASELINE_INVALID:${JSON.stringify(cinemaVolumes)}`);
}
if (text(destinationVolume.id) !== DESTINATION_VOLUME_ID || text(destinationVolume.name) !== DESTINATION_VOLUME_NAME || text(destinationVolume.dataCenterId) !== DESTINATION_DC || finite(destinationVolume.size ?? destinationVolume.sizeGb, 0) < 400) {
  throw new Error(`AVANTIQO_VIDEO_V33_DESTINATION_VOLUME_INVALID:${JSON.stringify({id:destinationVolume.id,name:destinationVolume.name,dataCenterId:destinationVolume.dataCenterId,size:destinationVolume.size})}`);
}
assertQuiescent(await queueHealth(CINEMA_ENDPOINT_ID, videoQueueKey), "CINEMA");
assertQuiescent(await queueHealth(IMAGE_ENDPOINT_ID, imageQueueKey), "IMAGE");

const activeBootstrapPods = list(pods).filter((pod) => text(pod.name) === POD_NAME && text(pod.desiredStatus) !== "TERMINATED");
if (activeBootstrapPods.length) throw new Error(`AVANTIQO_VIDEO_V33_EXISTING_BOOTSTRAP_POD_REQUIRES_CLEANUP:${activeBootstrapPods.map((pod) => text(pod.id)).join(",")}`);

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  destination_volume: { id: DESTINATION_VOLUME_ID, name: DESTINATION_VOLUME_NAME, data_center_id: DESTINATION_DC, size_gb: finite(destinationVolume.size ?? destinationVolume.sizeGb, null) },
  compute: { type: "CPU", vcpu_count: 2, cpu_flavor_priority: "availability", max_cost_per_hour_usd: MAX_CPU_COST_PER_HR },
  transfer_path: "HUGGING_FACE_TO_EU_RO1_CPU_POD_TO_MOUNTED_NETWORK_VOLUME",
  mac_data_relay: false,
  source_volume_mutation: false,
  incomplete_destination_snapshot_cleanup_only: true,
  completion_markers_published_after_exact_manifest_verification: true,
  cinema_endpoint_mutation: false,
  image_endpoint_mutation: false,
  runpod_serverless_job_submitted: false,
  gpu_compute_used: false,
  temporary_cpu_pod_terminated_after_run: true,
  secrets_printed: false,
}, null, 2));

if (!apply) {
  console.log("AVANTIQO_VIDEO_EU_RO1_CPU_CACHE_BOOTSTRAP_V33_APPLIED=false");
  process.exit(0);
}

const statusToken = randomBytes(24).toString("hex");
const podEnv = {
  AVANTIQO_VIDEO_V33_STATUS_TOKEN: statusToken,
  HF_HUB_DISABLE_XET: "1",
};
const hfToken = text(process.env.HF_TOKEN || process.env.HUGGING_FACE_HUB_TOKEN);
if (hfToken) podEnv.HF_TOKEN = hfToken;

let podId = null;
let finalStatus = null;
let createdCostPerHr = null;
try {
  const created = await rest("/pods", managementKey, {
    method: "POST",
    timeoutMs: 60000,
    body: {
      name: POD_NAME,
      cloudType: "SECURE",
      computeType: "CPU",
      cpuFlavorIds: ["cpu3c", "cpu3g", "cpu3m", "cpu5c", "cpu5g", "cpu5m"],
      cpuFlavorPriority: "availability",
      vcpuCount: 2,
      containerDiskInGb: 10,
      imageName: "python:3.11-slim",
      networkVolumeId: DESTINATION_VOLUME_ID,
      volumeMountPath: "/runpod-volume",
      ports: [`${STATUS_PORT}/http`],
      supportPublicIp: true,
      dockerEntrypoint: [],
      dockerStartCmd: ["python", "-u", "-c", bootstrapPython()],
      env: podEnv,
      interruptible: false,
      locked: false,
    },
  });
  podId = text(created.id);
  if (!podId) throw new Error("AVANTIQO_VIDEO_V33_CREATED_POD_ID_REQUIRED");
  createdCostPerHr = finite(created.adjustedCostPerHr ?? created.costPerHr, null);
  if (createdCostPerHr == null) throw new Error("AVANTIQO_VIDEO_V33_CREATED_POD_COST_REQUIRED");
  if (createdCostPerHr > MAX_CPU_COST_PER_HR) {
    throw new Error(`AVANTIQO_VIDEO_V33_CPU_COST_CAP_EXCEEDED:actual=${createdCostPerHr}:max=${MAX_CPU_COST_PER_HR}`);
  }
  console.log(`AVANTIQO_VIDEO_V33_CPU_POD_CREATED=true id=${podId} cpu_flavor=${text(created.cpuFlavorId) || "pending"} cost_per_hour=${createdCostPerHr}`);

  const started = Date.now();
  let lastPhase = "";
  while (Date.now() - started < MAX_WAIT_MS) {
    const status = await proxyStatus(podId, statusToken);
    if (status) {
      const phase = text(status.phase);
      if (phase && phase !== lastPhase) {
        lastPhase = phase;
        console.log(`AVANTIQO_VIDEO_V33_PROGRESS=phase=${phase}:model=${text(status.current_model) || "none"}`);
      }
      if (status.status === "FAILED") throw new Error(`AVANTIQO_VIDEO_V33_REMOTE_FAILED:${text(status.error_type)}:${text(status.error)}`);
      if (status.status === "COMPLETE") {
        finalStatus = status;
        break;
      }
    }
    const pod = await rest(`/pods/${podId}`, managementKey, { allow404: true });
    if (pod.__not_found) throw new Error("AVANTIQO_VIDEO_V33_POD_DISAPPEARED_BEFORE_COMPLETION");
    if (["EXITED", "TERMINATED"].includes(text(pod.desiredStatus)) && !finalStatus) {
      throw new Error(`AVANTIQO_VIDEO_V33_POD_EXITED_EARLY:${text(pod.desiredStatus)}`);
    }
    await sleep(POLL_MS);
  }
  if (!finalStatus) throw new Error(`AVANTIQO_VIDEO_V33_TIMEOUT:${MAX_WAIT_MS}`);

  const models = list(finalStatus.models);
  const t2v = models.find((entry) => text(entry.label) === "T2V");
  const i2v = models.find((entry) => text(entry.label) === "I2V");
  if (!t2v || !i2v || finite(t2v.bytes, 0) !== 126200628126 || finite(i2v.bytes, 0) !== 126204155463) {
    throw new Error(`AVANTIQO_VIDEO_V33_FINAL_MODEL_EVIDENCE_INVALID:${JSON.stringify(models)}`);
  }
} finally {
  if (podId) {
    try {
      await rest(`/pods/${podId}`, managementKey, { method: "DELETE", timeoutMs: 60000, allow404: true });
      console.log(`AVANTIQO_VIDEO_V33_CPU_POD_TERMINATED=true id=${podId}`);
    } catch (error) {
      console.error(`AVANTIQO_VIDEO_V33_CPU_POD_TERMINATION_FAILED=${redact(error?.message || error)}`);
      throw error;
    }
  }
}

const finalCinema = await rest(`/endpoints/${CINEMA_ENDPOINT_ID}?includeTemplate=false&includeWorkers=true`, managementKey);
if (finite(finalCinema.workersMin ?? finalCinema.workers_min, -1) !== 0 || finite(finalCinema.workersMax ?? finalCinema.workers_max, -1) !== 0) {
  throw new Error("AVANTIQO_VIDEO_V33_FINAL_CINEMA_NOT_RESTING_0_0");
}
if (!endpointVolumeIds(finalCinema).includes(SOURCE_VOLUME_ID) || endpointVolumeIds(finalCinema).includes(DESTINATION_VOLUME_ID)) {
  throw new Error("AVANTIQO_VIDEO_V33_FINAL_CINEMA_BINDING_CHANGED");
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  destination_volume_id: DESTINATION_VOLUME_ID,
  destination_data_center_id: DESTINATION_DC,
  cpu_cost_per_hour: createdCostPerHr,
  t2v: finalStatus.models.find((entry) => entry.label === "T2V"),
  i2v: finalStatus.models.find((entry) => entry.label === "I2V"),
  mac_data_relay: false,
  source_volume_mutation: false,
  temporary_cpu_pod_terminated: true,
  cinema_still_resting_0_0: true,
  cinema_endpoint_mutation: false,
  runpod_serverless_job_submitted: false,
  gpu_compute_used: false,
  production_web_deploy: false,
  secrets_printed: false,
}, null, 2));
console.log("AVANTIQO_VIDEO_EU_RO1_CPU_CACHE_BOOTSTRAP_V33=PASS");
console.log("AVANTIQO_VIDEO_EU_RO1_CPU_CACHE_BOOTSTRAP_V33_APPLIED=true");
