import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_VIDEO_WAN22_I2V_A14B_DIRECT_POD_CACHE_V10";
const IMAGE_LOCK_PATH = "audits/results/avantiqo-image-v9-certification-lock.json";
const VIDEO_EVIDENCE_PATH = "audits/results/avantiqo-video-worker-image.json";
const IMAGE_NAME = "avantiqo-image-v1";
const CINEMA_NAMES = new Set(["avantiqo-video-v1", "avantiqo-cinema-v1"]);
const VOLUME_ID = "7pcdebhpga";
const VOLUME_NAME = "avantiqo-shared-image-video-cache";
const VOLUME_DC = "US-NC-2";
const MIN_VOLUME_GB = 400;
const T2V_MODEL = "Wan-AI/Wan2.2-T2V-A14B-Diffusers";
const I2V_MODEL = "Wan-AI/Wan2.2-I2V-A14B-Diffusers";
const CACHE_ROOT = "/runpod-volume/huggingface-cache/hub";
const STATUS_ROOT = "/runpod-volume/avantiqo-cache-status";
const T2V_MARKER_NAME = "avantiqo-video-t2v-cache-marker.json";
const I2V_MARKER_NAME = "avantiqo-video-i2v-cache-marker.json";
const BOOTSTRAP_NAME_PREFIX = "avantiqo-video-i2v-cache-bootstrap";
const HTTP_PORT = 8000;
const POLL_MS = Math.max(10_000, Number(process.env.AVANTIQO_VIDEO_WAN22_I2V_POD_CACHE_POLL_MS || 20_000));
const MAX_WAIT_MS = Math.max(
  30 * 60 * 1000,
  Number(process.env.AVANTIQO_VIDEO_WAN22_I2V_POD_CACHE_WAIT_MS || 3 * 60 * 60 * 1000),
);
const ORIGINAL_EXECUTION_TIMEOUT_MS = 1_800_000;
const ORIGINAL_BLACKWELL_POOL = [
  "NVIDIA RTX PRO 6000 Blackwell Max-Q Workstation Edition",
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
  "NVIDIA RTX PRO 6000 Blackwell Workstation Edition",
].sort();
const VIDEO_OWNED_PATHS = [
  "services/avantiqo-video-engine",
  "scripts/cache-avantiqo-video-wan22-t2v-a14b-local.mjs",
  "scripts/cache-avantiqo-video-wan22-t2v-a14b-direct-pod-v9-local.mjs",
  "scripts/cache-avantiqo-video-wan22-i2v-a14b-direct-pod-v10-local.mjs",
  VIDEO_EVIDENCE_PATH,
  IMAGE_LOCK_PATH,
];

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const approved = (value) => ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase());
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const unique = (values) => [...new Set(values.map(text).filter(Boolean))].sort();

function redact(value) {
  return String(value ?? "")
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/([?&](?:token|key|api_key|apikey|sig|signature)=)[^&\s]+/gi, "$1[REDACTED]");
}

function shell(name, args, code) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`${code}:${redact(text(result.stderr || result.stdout)).slice(0, 1200)}`);
  }
  return text(result.stdout);
}

function requireScopedMain() {
  shell("git", ["fetch", "origin", "main"], "AVANTIQO_VIDEO_I2V_POD_CACHE_FETCH_MAIN_FAILED");
  const branch = shell("git", ["branch", "--show-current"], "AVANTIQO_VIDEO_I2V_POD_CACHE_BRANCH_READ_FAILED");
  if (branch !== "main") throw new Error(`AVANTIQO_VIDEO_I2V_POD_CACHE_MAIN_REQUIRED:${branch || "DETACHED"}`);
  const head = shell("git", ["rev-parse", "HEAD"], "AVANTIQO_VIDEO_I2V_POD_CACHE_HEAD_READ_FAILED");
  const remote = shell("git", ["rev-parse", "origin/main"], "AVANTIQO_VIDEO_I2V_POD_CACHE_REMOTE_READ_FAILED");
  const relation = shell(
    "git",
    ["rev-list", "--left-right", "--count", `${head}...${remote}`],
    "AVANTIQO_VIDEO_I2V_POD_CACHE_MAIN_RELATION_FAILED",
  ).split(/\s+/).map(Number);
  if (Number(relation[0] || 0) !== 0) {
    throw new Error(`AVANTIQO_VIDEO_I2V_POD_CACHE_MAIN_DIVERGED:head=${head}:origin=${remote}`);
  }
  if (head !== remote) {
    const changed = shell(
      "git",
      ["diff", "--name-only", head, remote, "--", ...VIDEO_OWNED_PATHS],
      "AVANTIQO_VIDEO_I2V_POD_CACHE_SCOPED_DIFF_FAILED",
    );
    if (changed) {
      throw new Error(`AVANTIQO_VIDEO_I2V_POD_CACHE_VIDEO_INPUTS_CHANGED_ON_MAIN:${changed.replace(/\n/g, ",")}`);
    }
    console.log(`AVANTIQO_VIDEO_I2V_POD_CACHE_UNRELATED_MAIN_MOVEMENT_TOLERATED=true head=${head} origin=${remote}`);
  }
  const dirty = shell(
    "git",
    ["status", "--porcelain", "--untracked-files=no", "--", ...VIDEO_OWNED_PATHS],
    "AVANTIQO_VIDEO_I2V_POD_CACHE_SOURCE_STATUS_FAILED",
  );
  if (dirty) throw new Error("AVANTIQO_VIDEO_I2V_POD_CACHE_VIDEO_OWNED_FILES_HAVE_LOCAL_CHANGES");
  return head;
}

function assertScopedInputsUnchangedFrom(startSha) {
  shell("git", ["fetch", "origin", "main"], "AVANTIQO_VIDEO_I2V_POD_CACHE_FINAL_FETCH_MAIN_FAILED");
  const remote = shell("git", ["rev-parse", "origin/main"], "AVANTIQO_VIDEO_I2V_POD_CACHE_FINAL_REMOTE_READ_FAILED");
  const changed = shell(
    "git",
    ["diff", "--name-only", startSha, remote, "--", ...VIDEO_OWNED_PATHS],
    "AVANTIQO_VIDEO_I2V_POD_CACHE_FINAL_SCOPED_DIFF_FAILED",
  );
  if (changed) {
    throw new Error(`AVANTIQO_VIDEO_I2V_POD_CACHE_INPUTS_CHANGED_DURING_RUN:${changed.replace(/\n/g, ",")}`);
  }
  return remote;
}

async function readJson(response, label, options = {}) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok && !(options.allow404 === true && response.status === 404)) {
    throw new Error(
      `${label}_HTTP_${response.status}:${redact(text(body?.message || body?.error || body?.detail || raw)).slice(0, 1200)}`,
    );
  }
  if (options.allow404 === true && response.status === 404) return { __not_found: true };
  return body ?? {};
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
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  return readJson(response, "AVANTIQO_VIDEO_I2V_POD_CACHE_REST", { allow404: options.allow404 });
}

async function queueRequest(endpointId, pathname, key) {
  const response = await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}${pathname}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  return readJson(response, "AVANTIQO_VIDEO_I2V_POD_CACHE_QUEUE");
}

async function queueCredentialWorks(endpointId, key) {
  if (!key) return false;
  try {
    const response = await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    await response.arrayBuffer();
    return response.ok;
  } catch {
    return false;
  }
}

async function selectQueueCredential(endpointId, candidates, label) {
  const seen = new Set();
  for (const candidate of candidates.filter(Boolean)) {
    if (!candidate.key || seen.has(candidate.key)) continue;
    seen.add(candidate.key);
    if (await queueCredentialWorks(endpointId, candidate.key)) return candidate;
  }
  throw new Error(`${label}_QUEUE_CREDENTIAL_NOT_FOUND`);
}

function normalizeList(value, keys = [], depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 4) return null;
  for (const key of [...keys, "data", "items", "results"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const found = normalizeList(value[key], keys, depth + 1);
    if (found) return found;
  }
  return null;
}

function endpointVolumeIds(endpoint = {}) {
  return unique([endpoint.networkVolumeId, ...list(endpoint.networkVolumeIds)]);
}

function sameSet(left, right) {
  const a = unique(left);
  const b = unique(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function safeEndpoint(endpoint = {}) {
  return {
    id: text(endpoint.id) || null,
    name: text(endpoint.name) || null,
    workers_min: finite(endpoint.workersMin),
    workers_max: finite(endpoint.workersMax),
    gpu_type_ids: unique(list(endpoint.gpuTypeIds)),
    network_volume_ids: endpointVolumeIds(endpoint),
    execution_timeout_ms: finite(endpoint.executionTimeoutMs ?? endpoint.executionTimeout),
  };
}

function healthSummary(body = {}) {
  const jobs = object(body.jobs);
  const workers = object(body.workers);
  return {
    jobs: {
      in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
      completed: finite(jobs.completed, 0),
      failed: finite(jobs.failed, 0),
      retried: finite(jobs.retried, 0),
    },
    workers: {
      idle: finite(workers.idle, 0),
      initializing: finite(workers.initializing, 0),
      ready: finite(workers.ready, 0),
      running: finite(workers.running, 0),
      throttled: finite(workers.throttled, 0),
      unhealthy: finite(workers.unhealthy, 0),
    },
  };
}

function assertSharedQuiescent(health, label) {
  if (
    health.jobs.in_queue !== 0 ||
    health.jobs.in_progress !== 0 ||
    health.workers.initializing !== 0 ||
    health.workers.running !== 0 ||
    health.workers.unhealthy !== 0
  ) {
    throw new Error(`${label}_NOT_QUIESCENT:${JSON.stringify(health)}`);
  }
}

function resolveEndpoint(endpoints, configuredId, names, label) {
  const matches = configuredId
    ? endpoints.filter((entry) => text(entry.id) === configuredId && names.has(text(entry.name)))
    : endpoints.filter((entry) => names.has(text(entry.name)));
  if (matches.length !== 1) throw new Error(`${label}_ENDPOINT_RESOLUTION_FAILED:${matches.length}`);
  return matches[0];
}

function validateImageLock(lock) {
  if (
    lock?.success !== true ||
    lock?.production_certified !== true ||
    text(lock?.status) !== "PRODUCTION_CERTIFIED_NOT_DEPLOYED" ||
    text(lock?.generation_default?.foundation_model) !== "Tongyi-MAI/Z-Image" ||
    lock?.release_gate?.image_runtime_certified !== true ||
    lock?.release_gate?.image_default_routing_certified !== true ||
    lock?.release_gate?.image_human_quality_certified !== true ||
    lock?.release_gate?.image_economics_certified !== true ||
    lock?.release_gate?.production_deploy_completed !== false
  ) {
    throw new Error("AVANTIQO_VIDEO_I2V_POD_CACHE_IMAGE_V9_LOCK_INVALID");
  }
}

function validateVideoEvidence(evidence) {
  if (
    evidence?.success !== true ||
    text(evidence.engine_contract) !== "AVANTIQO_SYNTHETIC_VIDEO_ENGINE_V1" ||
    text(evidence.runtime_revision) !== "AVANTIQO_VIDEO_WAN22_A14B_DEFAULT_ROUTING_CACHE_V1" ||
    text(evidence.configured_text_to_video_foundation) !== T2V_MODEL ||
    text(evidence.configured_image_to_video_foundation) !== I2V_MODEL ||
    text(evidence.cache_authorization_contract) !== "AVANTIQO_VIDEO_WAN22_CACHE_AUTHORIZATION_V1" ||
    text(evidence.cache_completion_contract) !== "AVANTIQO_VIDEO_WAN22_CACHE_COMPLETION_V1" ||
    finite(evidence.minimum_network_volume_quota_gb_for_cache, 0) !== MIN_VOLUME_GB ||
    evidence.partial_snapshot_satisfies_final_worker_fitness !== false
  ) {
    throw new Error("AVANTIQO_VIDEO_I2V_POD_CACHE_VIDEO_EVIDENCE_INVALID");
  }
}

function validateBaseline(image, cinema, volume) {
  if (
    text(image.name) !== IMAGE_NAME ||
    finite(image.workersMin) !== 0 ||
    finite(image.workersMax) !== 1 ||
    !sameSet(endpointVolumeIds(image), [VOLUME_ID])
  ) throw new Error(`AVANTIQO_VIDEO_I2V_POD_CACHE_IMAGE_BASELINE_INVALID:${JSON.stringify(safeEndpoint(image))}`);

  if (
    !CINEMA_NAMES.has(text(cinema.name)) ||
    finite(cinema.workersMin) !== 0 ||
    finite(cinema.workersMax) !== 0 ||
    finite(cinema.executionTimeoutMs ?? cinema.executionTimeout) !== ORIGINAL_EXECUTION_TIMEOUT_MS ||
    !sameSet(list(cinema.gpuTypeIds), ORIGINAL_BLACKWELL_POOL) ||
    !sameSet(endpointVolumeIds(cinema), [VOLUME_ID])
  ) throw new Error(`AVANTIQO_VIDEO_I2V_POD_CACHE_CINEMA_BASELINE_INVALID:${JSON.stringify(safeEndpoint(cinema))}`);

  if (
    text(volume.id) !== VOLUME_ID ||
    text(volume.name) !== VOLUME_NAME ||
    text(volume.dataCenterId) !== VOLUME_DC ||
    finite(volume.size, 0) < MIN_VOLUME_GB
  ) throw new Error(`AVANTIQO_VIDEO_I2V_POD_CACHE_VOLUME_INVALID:${JSON.stringify({
    id: text(volume.id),
    name: text(volume.name),
    data_center_id: text(volume.dataCenterId),
    size_gb: finite(volume.size, 0),
  })}`);
}

async function inventory(managementKey) {
  const [endpointsRaw, volumesRaw, podsRaw] = await Promise.all([
    rest("/endpoints?includeTemplate=false&includeWorkers=true", managementKey),
    rest("/networkvolumes", managementKey),
    rest("/pods", managementKey),
  ]);
  const endpoints = normalizeList(endpointsRaw, ["endpoints", "serverlessEndpoints"]);
  const volumes = normalizeList(volumesRaw, ["networkVolumes", "volumes"]);
  const pods = normalizeList(podsRaw, ["pods"]);
  if (!endpoints || !volumes || !pods) throw new Error("AVANTIQO_VIDEO_I2V_POD_CACHE_INVENTORY_INVALID");
  return { endpoints, volumes, pods };
}

function validateNoExistingBootstrapPod(pods) {
  const matches = pods.filter((pod) => text(pod?.name).startsWith(BOOTSTRAP_NAME_PREFIX));
  if (matches.length) {
    throw new Error(`AVANTIQO_VIDEO_I2V_POD_CACHE_EXISTING_BOOTSTRAP_POD:${matches.map((pod) => text(pod.id)).filter(Boolean).join(",")}`);
  }
}

function safePod(pod = {}) {
  return {
    id: text(pod.id) || null,
    name: text(pod.name) || null,
    desired_status: text(pod.desiredStatus) || null,
    image: text(pod.image || pod.imageName) || null,
    machine_id: text(pod.machineId || pod.machine?.id) || null,
    data_center_id: text(pod.machine?.dataCenterId || pod.networkVolume?.dataCenterId) || null,
    cpu_flavor_id: text(pod.cpuFlavorId) || null,
    vcpu_count: finite(pod.vcpuCount),
    network_volume_id: text(pod.networkVolume?.id) || null,
    network_volume_name: text(pod.networkVolume?.name) || null,
    public_ip_assigned: Boolean(text(pod.publicIp)),
  };
}

function bootstrapPython() {
  return String.raw`
import json
import os
import subprocess
import sys
import time
import traceback

T2V_MODEL = "Wan-AI/Wan2.2-T2V-A14B-Diffusers"
I2V_MODEL = "Wan-AI/Wan2.2-I2V-A14B-Diffusers"
CACHE_ROOT = "/runpod-volume/huggingface-cache/hub"
STATUS_ROOT = "/runpod-volume/avantiqo-cache-status"
T2V_MARKER = os.path.join(STATUS_ROOT, "avantiqo-video-t2v-cache-marker.json")
I2V_MARKER = os.path.join(STATUS_ROOT, "avantiqo-video-i2v-cache-marker.json")
T2V_REPO_CACHE = os.path.join(CACHE_ROOT, "models--Wan-AI--Wan2.2-T2V-A14B-Diffusers")
I2V_REPO_CACHE = os.path.join(CACHE_ROOT, "models--Wan-AI--Wan2.2-I2V-A14B-Diffusers")

os.makedirs(CACHE_ROOT, exist_ok=True)
os.makedirs(STATUS_ROOT, exist_ok=True)

def write_marker(value):
    tmp = I2V_MARKER + ".tmp"
    with open(tmp, "w", encoding="utf-8") as handle:
        json.dump(value, handle, indent=2, sort_keys=True)
    os.replace(tmp, I2V_MARKER)

def inspect_incomplete(repo_cache):
    found = []
    if os.path.isdir(repo_cache):
        for root, _, files in os.walk(repo_cache):
            for filename in files:
                if filename.endswith(".incomplete"):
                    found.append(os.path.relpath(os.path.join(root, filename), repo_cache))
    return found

def validate_snapshot(api, model, revision, snapshot_path, token):
    info = api.model_info(model, revision=revision, files_metadata=True, token=token)
    expected = {}
    for sibling in info.siblings or []:
        name = str(getattr(sibling, "rfilename", "") or "")
        size = getattr(sibling, "size", None)
        if name:
            expected[name] = int(size) if isinstance(size, int) and size >= 0 else None
    missing = []
    mismatched = []
    actual_bytes = 0
    expected_bytes = 0
    sized_file_count = 0
    for name, expected_size in expected.items():
        path = os.path.join(snapshot_path, name)
        if not os.path.isfile(path):
            missing.append(name)
            continue
        actual_size = os.path.getsize(path)
        actual_bytes += actual_size
        if expected_size is not None:
            expected_bytes += expected_size
            sized_file_count += 1
            if actual_size != expected_size:
                mismatched.append({
                    "path": name,
                    "expected_bytes": expected_size,
                    "actual_bytes": actual_size,
                })
    model_index = os.path.join(snapshot_path, "model_index.json")
    return {
        "revision": revision,
        "snapshot_path": snapshot_path,
        "required_file_count": len(expected),
        "sized_file_count": sized_file_count,
        "missing_required_files": missing,
        "size_mismatches": mismatched,
        "actual_snapshot_bytes": actual_bytes,
        "expected_snapshot_bytes": expected_bytes,
        "model_index_present": os.path.isfile(model_index),
    }

marker = {
    "success": False,
    "contract": "AVANTIQO_VIDEO_WAN22_I2V_A14B_DIRECT_POD_CACHE_MARKER_V1",
    "target_model": I2V_MODEL,
    "cache_root": CACHE_ROOT,
    "t2v_gate_passed": False,
    "i2v_download_started_after_t2v_gate": False,
    "video_generation_submitted": False,
    "inference_performed": False,
    "created_at_epoch": int(time.time()),
}

try:
    subprocess.check_call([
        sys.executable,
        "-m",
        "pip",
        "install",
        "--disable-pip-version-check",
        "--no-cache-dir",
        "huggingface_hub>=0.34,<2",
    ])
    from huggingface_hub import HfApi, snapshot_download

    token = os.environ.get("HF_TOKEN") or None
    api = HfApi(token=token)

    if not os.path.isfile(T2V_MARKER):
        raise RuntimeError("T2V_MARKER_MISSING")
    with open(T2V_MARKER, "r", encoding="utf-8") as handle:
        t2v_marker = json.load(handle)
    if t2v_marker.get("success") is not True:
        raise RuntimeError("T2V_MARKER_NOT_SUCCESSFUL")
    if str(t2v_marker.get("contract") or "") != "AVANTIQO_VIDEO_WAN22_T2V_A14B_DIRECT_POD_CACHE_MARKER_V1":
        raise RuntimeError("T2V_MARKER_CONTRACT_INVALID")
    if str(t2v_marker.get("target_model") or "") != T2V_MODEL:
        raise RuntimeError("T2V_MARKER_MODEL_INVALID")
    t2v_revision = str(t2v_marker.get("revision") or "")
    t2v_snapshot = str(t2v_marker.get("snapshot_path") or "")
    if not t2v_revision or not t2v_snapshot or not os.path.isdir(t2v_snapshot):
        raise RuntimeError("T2V_MARKER_SNAPSHOT_INVALID")

    t2v_check = validate_snapshot(api, T2V_MODEL, t2v_revision, t2v_snapshot, token)
    t2v_incomplete = inspect_incomplete(T2V_REPO_CACHE)
    t2v_ok = (
        t2v_check["model_index_present"]
        and not t2v_check["missing_required_files"]
        and not t2v_check["size_mismatches"]
        and not t2v_incomplete
        and t2v_check["actual_snapshot_bytes"] > 1_000_000_000
        and (
            t2v_check["expected_snapshot_bytes"] == 0
            or t2v_check["actual_snapshot_bytes"] >= t2v_check["expected_snapshot_bytes"]
        )
    )
    marker["t2v_gate"] = dict(t2v_check)
    marker["t2v_gate"]["incomplete_files"] = t2v_incomplete
    marker["t2v_gate"]["passed"] = t2v_ok
    if not t2v_ok:
        raise RuntimeError("T2V_INDEPENDENT_REVALIDATION_FAILED")
    marker["t2v_gate_passed"] = True

    marker["i2v_download_started_after_t2v_gate"] = True
    i2v_info = api.model_info(I2V_MODEL, files_metadata=True, token=token)
    i2v_revision = str(i2v_info.sha)
    i2v_snapshot = snapshot_download(
        repo_id=I2V_MODEL,
        revision=i2v_revision,
        cache_dir=CACHE_ROOT,
        token=token,
        max_workers=8,
    )
    i2v_check = validate_snapshot(api, I2V_MODEL, i2v_revision, i2v_snapshot, token)
    i2v_incomplete = inspect_incomplete(I2V_REPO_CACHE)
    i2v_ok = (
        i2v_check["model_index_present"]
        and not i2v_check["missing_required_files"]
        and not i2v_check["size_mismatches"]
        and not i2v_incomplete
        and i2v_check["actual_snapshot_bytes"] > 1_000_000_000
        and (
            i2v_check["expected_snapshot_bytes"] == 0
            or i2v_check["actual_snapshot_bytes"] >= i2v_check["expected_snapshot_bytes"]
        )
    )
    marker["i2v_cache"] = dict(i2v_check)
    marker["i2v_cache"]["incomplete_files"] = i2v_incomplete
    marker["i2v_cache"]["passed"] = i2v_ok
    marker["success"] = bool(t2v_ok and i2v_ok)
    marker["completed_at_epoch"] = int(time.time())
    if not marker["success"]:
        marker["error"] = "I2V_CACHE_INTEGRITY_CHECK_FAILED"
except Exception as exc:
    marker.update({
        "error": f"{type(exc).__name__}:{exc}",
        "traceback_tail": traceback.format_exc().splitlines()[-12:],
        "completed_at_epoch": int(time.time()),
    })

write_marker(marker)

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
os.chdir(STATUS_ROOT)
ThreadingHTTPServer(("0.0.0.0", 8000), SimpleHTTPRequestHandler).serve_forever()
`.trim();
}

async function fetchMarker(podId) {
  const url = `https://${encodeURIComponent(podId)}-${HTTP_PORT}.proxy.runpod.net/${I2V_MARKER_NAME}?t=${Date.now()}`;
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    const raw = await response.text();
    if (!response.ok) return null;
    try { return raw ? JSON.parse(raw) : null; } catch { return null; }
  } catch {
    return null;
  }
}

function validateMarker(marker) {
  if (
    marker?.success !== true ||
    text(marker.contract) !== "AVANTIQO_VIDEO_WAN22_I2V_A14B_DIRECT_POD_CACHE_MARKER_V1" ||
    text(marker.target_model) !== I2V_MODEL ||
    text(marker.cache_root) !== CACHE_ROOT ||
    marker.t2v_gate_passed !== true ||
    marker.i2v_download_started_after_t2v_gate !== true ||
    marker.video_generation_submitted !== false ||
    marker.inference_performed !== false ||
    marker?.t2v_gate?.passed !== true ||
    marker?.i2v_cache?.passed !== true ||
    !text(marker?.t2v_gate?.revision) ||
    !text(marker?.i2v_cache?.revision) ||
    marker?.t2v_gate?.model_index_present !== true ||
    marker?.i2v_cache?.model_index_present !== true ||
    !Array.isArray(marker?.t2v_gate?.missing_required_files) ||
    marker.t2v_gate.missing_required_files.length !== 0 ||
    !Array.isArray(marker?.t2v_gate?.size_mismatches) ||
    marker.t2v_gate.size_mismatches.length !== 0 ||
    !Array.isArray(marker?.t2v_gate?.incomplete_files) ||
    marker.t2v_gate.incomplete_files.length !== 0 ||
    !Array.isArray(marker?.i2v_cache?.missing_required_files) ||
    marker.i2v_cache.missing_required_files.length !== 0 ||
    !Array.isArray(marker?.i2v_cache?.size_mismatches) ||
    marker.i2v_cache.size_mismatches.length !== 0 ||
    !Array.isArray(marker?.i2v_cache?.incomplete_files) ||
    marker.i2v_cache.incomplete_files.length !== 0 ||
    finite(marker?.t2v_gate?.actual_snapshot_bytes, 0) <= 1_000_000_000 ||
    finite(marker?.i2v_cache?.actual_snapshot_bytes, 0) <= 1_000_000_000
  ) {
    throw new Error(`AVANTIQO_VIDEO_I2V_POD_CACHE_MARKER_INVALID:${redact(JSON.stringify(marker)).slice(0, 3200)}`);
  }
}

async function deleteCreatedPod(podId, managementKey) {
  if (!podId) return false;
  let lastError = null;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      await rest(`/pods/${encodeURIComponent(podId)}`, managementKey, { method: "DELETE", allow404: true });
      const current = await rest(`/pods/${encodeURIComponent(podId)}`, managementKey, { allow404: true });
      if (current?.__not_found === true) {
        console.log(`AVANTIQO_VIDEO_I2V_POD_CACHE_TEMP_POD_DELETED=true pod=${podId}`);
        return true;
      }
    } catch (error) {
      lastError = error;
    }
    await sleep(5_000);
  }
  console.error(`AVANTIQO_VIDEO_I2V_POD_CACHE_TEMP_POD_DELETE_FAILED=true pod=${podId} error=${redact(text(lastError?.message || lastError))}`);
  return false;
}

if (Number(process.versions.node.split(".")[0]) < 24) {
  throw new Error(`AVANTIQO_VIDEO_I2V_POD_CACHE_NODE24_REQUIRED:${process.version}`);
}

const apply = process.argv.includes("--apply");
if (apply && !approved(process.env.AVANTIQO_VIDEO_WAN22_I2V_POD_CACHE_APPROVED)) {
  throw new Error("AVANTIQO_VIDEO_WAN22_I2V_POD_CACHE_APPROVED=YES_REQUIRED");
}

const startSha = requireScopedMain();
const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
if (!managementKey) throw new Error("AVANTIQO_VIDEO_I2V_POD_CACHE_MANAGEMENT_CREDENTIAL_REQUIRED");

const [imageLock, videoEvidence] = await Promise.all([
  readFile(IMAGE_LOCK_PATH, "utf8").then(JSON.parse),
  readFile(VIDEO_EVIDENCE_PATH, "utf8").then(JSON.parse),
]);
validateImageLock(imageLock);
validateVideoEvidence(videoEvidence);

const initial = await inventory(managementKey);
validateNoExistingBootstrapPod(initial.pods);
const volumeMatches = initial.volumes.filter((volume) => text(volume.id) === VOLUME_ID || text(volume.name) === VOLUME_NAME);
if (volumeMatches.length !== 1) throw new Error(`AVANTIQO_VIDEO_I2V_POD_CACHE_VOLUME_RESOLUTION_FAILED:${volumeMatches.length}`);
const volume = volumeMatches[0];
const image = resolveEndpoint(
  initial.endpoints,
  text(process.env.RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID),
  new Set([IMAGE_NAME]),
  "AVANTIQO_VIDEO_I2V_POD_CACHE_IMAGE",
);
const cinema = resolveEndpoint(
  initial.endpoints,
  text(process.env.RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID),
  CINEMA_NAMES,
  "AVANTIQO_VIDEO_I2V_POD_CACHE_CINEMA",
);
validateBaseline(image, cinema, volume);

const imageQueueCredential = await selectQueueCredential(
  text(image.id),
  [
    { source: "RUNPOD_AVANTIQO_IMAGE_API_KEY", key: text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY) },
    { source: "RUNPOD_API_KEY", key: text(process.env.RUNPOD_API_KEY) },
    { source: "RUNPOD_MANAGEMENT_API_KEY", key: text(process.env.RUNPOD_MANAGEMENT_API_KEY) },
  ],
  "AVANTIQO_VIDEO_I2V_POD_CACHE_IMAGE",
);
const cinemaQueueCredential = await selectQueueCredential(
  text(cinema.id),
  [
    { source: "RUNPOD_AVANTIQO_VIDEO_API_KEY", key: text(process.env.RUNPOD_AVANTIQO_VIDEO_API_KEY) },
    { source: "RUNPOD_API_KEY", key: text(process.env.RUNPOD_API_KEY) },
    { source: "RUNPOD_MANAGEMENT_API_KEY", key: text(process.env.RUNPOD_MANAGEMENT_API_KEY) },
  ],
  "AVANTIQO_VIDEO_I2V_POD_CACHE_CINEMA",
);

const [imageHealth, cinemaHealth] = await Promise.all([
  queueRequest(text(image.id), "/health", imageQueueCredential.key).then(healthSummary),
  queueRequest(text(cinema.id), "/health", cinemaQueueCredential.key).then(healthSummary),
]);
assertSharedQuiescent(imageHealth, "AVANTIQO_VIDEO_I2V_POD_CACHE_IMAGE");
assertSharedQuiescent(cinemaHealth, "AVANTIQO_VIDEO_I2V_POD_CACHE_CINEMA");

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  main_sha: startSha,
  strategy: {
    scheduler: "DIRECT_RUNPOD_POD",
    compute_type: "CPU",
    t2v_gate_before_i2v: true,
    t2v_gate_method: "RELOAD_V9_MARKER_AND_REVALIDATE_EXACT_PINNED_REVISION_FILE_BY_FILE",
    i2v_download_only_after_t2v_gate: true,
    t2v_model: T2V_MODEL,
    i2v_model: I2V_MODEL,
    network_volume_id: VOLUME_ID,
    network_volume_name: VOLUME_NAME,
    network_volume_data_center: VOLUME_DC,
    cache_root: CACHE_ROOT,
    temporary_pod_only: true,
    terminate_after_verified_marker: true,
  },
  baseline: {
    image: safeEndpoint(image),
    cinema: safeEndpoint(cinema),
    image_health: imageHealth,
    cinema_health: cinemaHealth,
  },
  queue_credentials: {
    image_source: imageQueueCredential.source,
    cinema_source: cinemaQueueCredential.source,
  },
  safety: {
    image_endpoint_mutation: false,
    cinema_endpoint_mutation: false,
    serverless_job_submission: false,
    video_generation: false,
    inference: false,
    t2v_cache_mutation: false,
    i2v_cache_download: apply,
    temporary_pod_creation: apply,
    pod_cleanup_required: apply,
    production_web_deploy: false,
    pricing_activation: false,
    secrets_printed: false,
  },
  next_action: apply ? "REVALIDATE_T2V_THEN_CACHE_I2V_AND_TERMINATE" : "APPLY_T2V_GATE_AND_I2V_CACHE",
}, null, 2));

if (!apply) process.exit(0);

requireScopedMain();
const fresh = await inventory(managementKey);
validateNoExistingBootstrapPod(fresh.pods);
const freshVolumeMatches = fresh.volumes.filter((entry) => text(entry.id) === VOLUME_ID || text(entry.name) === VOLUME_NAME);
if (freshVolumeMatches.length !== 1) throw new Error("AVANTIQO_VIDEO_I2V_POD_CACHE_FRESH_VOLUME_RESOLUTION_FAILED");
const freshImage = resolveEndpoint(
  fresh.endpoints,
  text(image.id),
  new Set([IMAGE_NAME]),
  "AVANTIQO_VIDEO_I2V_POD_CACHE_FRESH_IMAGE",
);
const freshCinema = resolveEndpoint(
  fresh.endpoints,
  text(cinema.id),
  CINEMA_NAMES,
  "AVANTIQO_VIDEO_I2V_POD_CACHE_FRESH_CINEMA",
);
validateBaseline(freshImage, freshCinema, freshVolumeMatches[0]);
const [freshImageHealth, freshCinemaHealth] = await Promise.all([
  queueRequest(text(freshImage.id), "/health", imageQueueCredential.key).then(healthSummary),
  queueRequest(text(freshCinema.id), "/health", cinemaQueueCredential.key).then(healthSummary),
]);
assertSharedQuiescent(freshImageHealth, "AVANTIQO_VIDEO_I2V_POD_CACHE_FRESH_IMAGE");
assertSharedQuiescent(freshCinemaHealth, "AVANTIQO_VIDEO_I2V_POD_CACHE_FRESH_CINEMA");

const podName = `${BOOTSTRAP_NAME_PREFIX}-${Date.now()}`;
const podEnv = {};
const hfToken = text(process.env.HF_TOKEN || process.env.HUGGINGFACE_TOKEN || process.env.HUGGING_FACE_HUB_TOKEN);
if (hfToken) podEnv.HF_TOKEN = hfToken;

let createdPodId = null;
let podDeleted = false;
let marker = null;

try {
  const created = await rest("/pods", managementKey, {
    method: "POST",
    timeoutMs: 60_000,
    body: {
      name: podName,
      cloudType: "SECURE",
      computeType: "CPU",
      cpuFlavorIds: ["cpu5g", "cpu3g", "cpu5c", "cpu3c", "cpu5m", "cpu3m"],
      cpuFlavorPriority: "availability",
      containerDiskInGb: 10,
      imageName: "python:3.11-slim",
      networkVolumeId: VOLUME_ID,
      volumeMountPath: "/runpod-volume",
      ports: [`${HTTP_PORT}/http`],
      supportPublicIp: true,
      dockerEntrypoint: [],
      dockerStartCmd: ["python", "-c", bootstrapPython()],
      env: podEnv,
      interruptible: false,
      locked: false,
    },
  });

  createdPodId = text(created.id);
  if (!createdPodId) throw new Error("AVANTIQO_VIDEO_I2V_POD_CACHE_CREATED_POD_ID_MISSING");
  console.log(`AVANTIQO_VIDEO_I2V_POD_CACHE_TEMP_POD_CREATED=true pod=${createdPodId}`);

  const deadline = Date.now() + MAX_WAIT_MS;
  let lastPrintedAt = 0;
  while (Date.now() <= deadline) {
    marker = await fetchMarker(createdPodId);
    if (marker) break;

    if (Date.now() - lastPrintedAt >= 60_000) {
      const current = await rest(`/pods/${encodeURIComponent(createdPodId)}`, managementKey, { allow404: true });
      if (current?.__not_found === true) {
        throw new Error(`AVANTIQO_VIDEO_I2V_POD_CACHE_TEMP_POD_DISAPPEARED:${createdPodId}`);
      }
      console.log(`AVANTIQO_VIDEO_I2V_POD_CACHE_PROGRESS ${JSON.stringify(safePod(current))}`);
      lastPrintedAt = Date.now();
    }
    await sleep(POLL_MS);
  }

  if (!marker) throw new Error(`AVANTIQO_VIDEO_I2V_POD_CACHE_MARKER_TIMEOUT:${createdPodId}`);
  validateMarker(marker);
  assertScopedInputsUnchangedFrom(startSha);

  const [beforeDeleteImageHealth, beforeDeleteCinemaHealth] = await Promise.all([
    queueRequest(text(image.id), "/health", imageQueueCredential.key).then(healthSummary),
    queueRequest(text(cinema.id), "/health", cinemaQueueCredential.key).then(healthSummary),
  ]);
  assertSharedQuiescent(beforeDeleteImageHealth, "AVANTIQO_VIDEO_I2V_POD_CACHE_POST_DOWNLOAD_IMAGE");
  assertSharedQuiescent(beforeDeleteCinemaHealth, "AVANTIQO_VIDEO_I2V_POD_CACHE_POST_DOWNLOAD_CINEMA");

  console.log(
    `AVANTIQO_VIDEO_I2V_POD_CACHE_MARKER_VERIFIED=true t2v_revision=${text(marker.t2v_gate.revision)} i2v_revision=${text(marker.i2v_cache.revision)} i2v_bytes=${finite(marker.i2v_cache.actual_snapshot_bytes, 0)}`,
  );
} finally {
  if (createdPodId) podDeleted = await deleteCreatedPod(createdPodId, managementKey);
}

if (!podDeleted) {
  throw new Error(`AVANTIQO_VIDEO_I2V_POD_CACHE_TEMP_POD_CLEANUP_REQUIRED:${createdPodId || "UNKNOWN"}`);
}

const final = await inventory(managementKey);
const finalVolumeMatches = final.volumes.filter((entry) => text(entry.id) === VOLUME_ID || text(entry.name) === VOLUME_NAME);
if (finalVolumeMatches.length !== 1) throw new Error("AVANTIQO_VIDEO_I2V_POD_CACHE_FINAL_VOLUME_RESOLUTION_FAILED");
const finalImage = resolveEndpoint(
  final.endpoints,
  text(image.id),
  new Set([IMAGE_NAME]),
  "AVANTIQO_VIDEO_I2V_POD_CACHE_FINAL_IMAGE",
);
const finalCinema = resolveEndpoint(
  final.endpoints,
  text(cinema.id),
  CINEMA_NAMES,
  "AVANTIQO_VIDEO_I2V_POD_CACHE_FINAL_CINEMA",
);
validateBaseline(finalImage, finalCinema, finalVolumeMatches[0]);
validateNoExistingBootstrapPod(final.pods);
const [finalImageHealth, finalCinemaHealth] = await Promise.all([
  queueRequest(text(finalImage.id), "/health", imageQueueCredential.key).then(healthSummary),
  queueRequest(text(finalCinema.id), "/health", cinemaQueueCredential.key).then(healthSummary),
]);
assertSharedQuiescent(finalImageHealth, "AVANTIQO_VIDEO_I2V_POD_CACHE_FINAL_IMAGE");
assertSharedQuiescent(finalCinemaHealth, "AVANTIQO_VIDEO_I2V_POD_CACHE_FINAL_CINEMA");

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: "APPLY",
  t2v_revalidated: true,
  i2v_cache_ready: true,
  t2v_gate: {
    revision: text(marker.t2v_gate.revision),
    snapshot_path: text(marker.t2v_gate.snapshot_path),
    required_file_count: finite(marker.t2v_gate.required_file_count, 0),
    actual_snapshot_bytes: finite(marker.t2v_gate.actual_snapshot_bytes, 0),
    expected_snapshot_bytes: finite(marker.t2v_gate.expected_snapshot_bytes, 0),
    missing_required_files: marker.t2v_gate.missing_required_files,
    size_mismatches: marker.t2v_gate.size_mismatches,
    incomplete_files: marker.t2v_gate.incomplete_files,
  },
  i2v_cache: {
    revision: text(marker.i2v_cache.revision),
    snapshot_path: text(marker.i2v_cache.snapshot_path),
    required_file_count: finite(marker.i2v_cache.required_file_count, 0),
    actual_snapshot_bytes: finite(marker.i2v_cache.actual_snapshot_bytes, 0),
    expected_snapshot_bytes: finite(marker.i2v_cache.expected_snapshot_bytes, 0),
    missing_required_files: marker.i2v_cache.missing_required_files,
    size_mismatches: marker.i2v_cache.size_mismatches,
    incomplete_files: marker.i2v_cache.incomplete_files,
  },
  temporary_pod: {
    id: createdPodId,
    deleted: true,
  },
  final_baseline: {
    image: safeEndpoint(finalImage),
    cinema: safeEndpoint(finalCinema),
    image_health: finalImageHealth,
    cinema_health: finalCinemaHealth,
    shared_volume_preserved: true,
  },
  safety: {
    image_endpoint_mutation: false,
    cinema_endpoint_mutation: false,
    serverless_job_submission: false,
    video_generation: false,
    inference: false,
    temporary_pod_deleted: true,
    production_web_deploy: false,
    pricing_activation: false,
    secrets_printed: false,
  },
  next_action: "INSPECT_BOTH_CACHE_RESULTS_THEN_CERTIFY_RUNTIME_WHEN_PROVIDER_CAPACITY_IS_SCHEDULABLE",
}, null, 2));

console.log("AVANTIQO_VIDEO_WAN22_I2V_DIRECT_POD_CACHE_V10_APPLIED=true");
