import crypto from "node:crypto";
import fs from "node:fs/promises";

import {
  finite,
  podRest,
  podTerminal,
  text,
  videoPodCandidateSnapshot,
} from "./AvantiqoVideoPodRunpod.js";

export const AVANTIQO_VIDEO_VOLUME_CPU_BRIDGE_CONTRACT = "AVANTIQO_VIDEO_RUNPOD_VOLUME_CPU_BRIDGE_V1";
export const AVANTIQO_VIDEO_VOLUME_CPU_BRIDGE_PREFIX = "avantiqo-video-volume-bridge-";

const HTTP_PORT = 8000;
const DC = "EU-RO-1";
const VOLUME_ID = "t4erb6kxi1";
const VOLUME_NAME = "avantiqo-video-cache-eu-ro-1";
const CHUNK_BYTES = 16 * 1024 * 1024;
const START_TIMEOUT_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 120_000;
const TERMINAL = new Set(["EXITED", "TERMINATED", "DELETED", "STOPPED"]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function podStatus(pod = {}) {
  return text(pod.status || pod.workerStatus || pod.runtimeStatus || pod.desiredStatus).toUpperCase();
}

function bridgeScript() {
  return String.raw`
import http.server
import json
import os
import pathlib
import urllib.parse

TOKEN = os.environ["AVANTIQO_VIDEO_VOLUME_BRIDGE_TOKEN"]
ROOT = pathlib.Path("/workspace").resolve()
MAX_CHUNK = 32 * 1024 * 1024


def target_from_key(key):
    raw = urllib.parse.unquote(key or "").lstrip("/")
    if not raw or ".." in pathlib.PurePosixPath(raw).parts:
        raise ValueError("INVALID_KEY")
    target = (ROOT / raw).resolve()
    if ROOT not in target.parents and target != ROOT:
        raise ValueError("OUTSIDE_ROOT")
    return target


class Handler(http.server.BaseHTTPRequestHandler):
    def authorized(self):
        return self.headers.get("Authorization", "") == f"Bearer {TOKEN}"

    def query(self):
        return urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)

    def route(self):
        return urllib.parse.urlparse(self.path).path

    def send_json(self, status, payload):
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if not self.authorized():
            self.send_json(404, {"success": False})
            return
        try:
            q = self.query()
            route = self.route()
            if route == "/health":
                self.send_json(200, {"success": True, "contract": "AVANTIQO_VIDEO_RUNPOD_VOLUME_CPU_BRIDGE_V1"})
                return
            target = target_from_key((q.get("key") or [""])[0])
            if route == "/stat":
                exists = target.is_file()
                self.send_json(200, {"success": True, "exists": exists, "size": target.stat().st_size if exists else 0})
                return
            if route == "/read":
                if not target.is_file():
                    self.send_json(404, {"success": False, "error": "NOT_FOUND"})
                    return
                offset = max(0, int((q.get("offset") or ["0"])[0]))
                length = max(1, min(MAX_CHUNK, int((q.get("length") or [str(MAX_CHUNK)])[0])))
                size = target.stat().st_size
                if offset >= size:
                    data = b""
                else:
                    with open(target, "rb", buffering=8 * 1024 * 1024) as f:
                        f.seek(offset)
                        data = f.read(min(length, size - offset))
                self.send_response(200)
                self.send_header("Content-Type", "application/octet-stream")
                self.send_header("Content-Length", str(len(data)))
                self.send_header("X-Avantiqo-Object-Size", str(size))
                self.end_headers()
                self.wfile.write(data)
                return
            self.send_json(404, {"success": False})
        except Exception as exc:
            self.send_json(400, {"success": False, "error": type(exc).__name__})

    def do_PUT(self):
        if not self.authorized() or self.route() != "/write":
            self.send_json(404, {"success": False})
            return
        try:
            q = self.query()
            target = target_from_key((q.get("key") or [""])[0])
            offset = max(0, int((q.get("offset") or ["0"])[0]))
            length = int(self.headers.get("Content-Length", "0") or "0")
            if length < 0 or length > MAX_CHUNK:
                raise ValueError("CHUNK_TOO_LARGE")
            data = self.rfile.read(length)
            if len(data) != length:
                raise ValueError("SHORT_BODY")
            target.parent.mkdir(parents=True, exist_ok=True)
            if offset == 0:
                with open(target, "wb") as f:
                    f.write(data)
            else:
                if not target.is_file() or target.stat().st_size != offset:
                    raise ValueError("OFFSET_MISMATCH")
                with open(target, "ab") as f:
                    f.write(data)
            self.send_json(200, {"success": True, "size": target.stat().st_size})
        except Exception as exc:
            self.send_json(409, {"success": False, "error": type(exc).__name__})

    def do_DELETE(self):
        if not self.authorized() or self.route() != "/object":
            self.send_json(404, {"success": False})
            return
        try:
            q = self.query()
            target = target_from_key((q.get("key") or [""])[0])
            existed = target.is_file()
            if existed:
                target.unlink()
            self.send_json(200, {"success": True, "existed": existed})
        except Exception as exc:
            self.send_json(400, {"success": False, "error": type(exc).__name__})

    def log_message(self, fmt, *args):
        return


http.server.ThreadingHTTPServer(("0.0.0.0", 8000), Handler).serve_forever()
`;
}

async function bridgeFetch(bridge, path, options = {}) {
  const response = await fetch(`${bridge.base_url}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${bridge.token}`,
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(options.timeout_ms || REQUEST_TIMEOUT_MS),
  });
  return response;
}

export async function createAvantiqoVideoVolumeCpuBridge({ owner_request_id = crypto.randomUUID() } = {}) {
  const snapshot = await videoPodCandidateSnapshot();
  if (text(snapshot.volume?.id) !== VOLUME_ID || text(snapshot.volume?.name) !== VOLUME_NAME) {
    throw new Error(`${AVANTIQO_VIDEO_VOLUME_CPU_BRIDGE_CONTRACT}_VOLUME_INVALID`);
  }
  if (text(snapshot.volume?.dataCenterId || snapshot.volume?.data_center_id) !== DC) {
    throw new Error(`${AVANTIQO_VIDEO_VOLUME_CPU_BRIDGE_CONTRACT}_DATACENTER_INVALID`);
  }
  const token = crypto.randomBytes(32).toString("hex");
  const safeOwner = text(owner_request_id).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40) || crypto.randomBytes(8).toString("hex");
  const created = await podRest("/pods", {
    method: "POST",
    timeoutMs: 60_000,
    body: {
      name: `${AVANTIQO_VIDEO_VOLUME_CPU_BRIDGE_PREFIX}${safeOwner}`,
      imageName: "python:3.11-slim",
      cloudType: "SECURE",
      computeType: "CPU",
      cpuFlavorIds: ["cpu3c"],
      cpuFlavorPriority: "custom",
      dataCenterIds: [DC],
      dataCenterPriority: "custom",
      vcpuCount: 2,
      containerDiskInGb: 5,
      networkVolumeId: VOLUME_ID,
      volumeMountPath: "/workspace",
      globalNetworking: true,
      supportPublicIp: false,
      ports: [`${HTTP_PORT}/http`],
      dockerEntrypoint: ["python", "-c"],
      dockerStartCmd: [
        "import base64,os;exec(compile(base64.b64decode(os.environ['AVANTIQO_VIDEO_VOLUME_BRIDGE_SCRIPT_B64']),'<avantiqo-video-volume-bridge>','exec'))",
      ],
      env: {
        AVANTIQO_VIDEO_VOLUME_BRIDGE_SCRIPT_B64: Buffer.from(bridgeScript(), "utf8").toString("base64"),
        AVANTIQO_VIDEO_VOLUME_BRIDGE_TOKEN: token,
      },
    },
  });
  const podId = text(created?.id || created?.pod?.id || created?.data?.id);
  if (!podId) throw new Error(`${AVANTIQO_VIDEO_VOLUME_CPU_BRIDGE_CONTRACT}_POD_ID_REQUIRED`);
  const bridge = {
    contract: AVANTIQO_VIDEO_VOLUME_CPU_BRIDGE_CONTRACT,
    pod_id: podId,
    token,
    base_url: `https://${podId}-${HTTP_PORT}.proxy.runpod.net`,
    volume_id: VOLUME_ID,
    data_center_id: DC,
    compute_type: "CPU",
    gpu_compute_used: false,
    ffmpeg_used: false,
    model_inference_used: false,
    secrets_printed: false,
  };
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const response = await bridgeFetch(bridge, "/health", { timeout_ms: 15_000 });
      if (response.ok) {
        const body = await response.json();
        if (body?.contract === AVANTIQO_VIDEO_VOLUME_CPU_BRIDGE_CONTRACT) return bridge;
      }
    } catch {}
    try {
      const current = await podRest(`/pods/${encodeURIComponent(podId)}?includeNetworkVolume=true`, { timeoutMs: 15_000 });
      const status = podStatus(current);
      if (podTerminal(current) || TERMINAL.has(status)) throw new Error(`${AVANTIQO_VIDEO_VOLUME_CPU_BRIDGE_CONTRACT}_START_FAILED:${status || "UNKNOWN"}`);
      if (current?.gpu && finite(current.gpu.count, 0) > 0) throw new Error(`${AVANTIQO_VIDEO_VOLUME_CPU_BRIDGE_CONTRACT}_GPU_FORBIDDEN`);
    } catch (error) {
      if (text(error?.message).startsWith(AVANTIQO_VIDEO_VOLUME_CPU_BRIDGE_CONTRACT)) throw error;
    }
    await sleep(3_000);
  }
  await deleteAvantiqoVideoVolumeCpuBridge(bridge).catch(() => null);
  throw new Error(`${AVANTIQO_VIDEO_VOLUME_CPU_BRIDGE_CONTRACT}_START_TIMEOUT`);
}

export async function deleteAvantiqoVideoVolumeCpuBridge(bridge = {}) {
  const podId = text(bridge.pod_id);
  if (!podId) return { success: true, deleted: false, confirmed_terminal: true };
  try {
    await podRest(`/pods/${encodeURIComponent(podId)}`, { method: "DELETE", timeoutMs: 60_000 });
  } catch (error) {
    if (!text(error?.message).includes("HTTP_404")) throw error;
  }
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const current = await podRest(`/pods/${encodeURIComponent(podId)}?includeNetworkVolume=true`, { timeoutMs: 15_000 });
      const status = podStatus(current);
      if (podTerminal(current) || TERMINAL.has(status)) {
        return { success: true, deleted: true, confirmed_terminal: true, pod_id: podId };
      }
    } catch (error) {
      if (text(error?.message).includes("HTTP_404")) {
        return { success: true, deleted: true, confirmed_terminal: true, pod_id: podId };
      }
      throw error;
    }
    await sleep(3_000);
  }
  throw new Error(`${AVANTIQO_VIDEO_VOLUME_CPU_BRIDGE_CONTRACT}_DELETE_TIMEOUT:${podId}`);
}

export async function statAvantiqoVideoVolumeObjectViaCpuBridge(bridge, key) {
  const response = await bridgeFetch(bridge, `/stat?key=${encodeURIComponent(text(key))}`);
  if (!response.ok) throw new Error(`${AVANTIQO_VIDEO_VOLUME_CPU_BRIDGE_CONTRACT}_STAT_HTTP_${response.status}`);
  return response.json();
}

export async function uploadAvantiqoVideoVolumeFileViaCpuBridge(bridge, key, filePath) {
  const stat = await fs.stat(filePath);
  const handle = await fs.open(filePath, "r");
  let offset = 0;
  try {
    while (offset < stat.size) {
      const length = Math.min(CHUNK_BYTES, stat.size - offset);
      const chunk = Buffer.allocUnsafe(length);
      const { bytesRead } = await handle.read(chunk, 0, length, offset);
      if (bytesRead !== length) throw new Error(`${AVANTIQO_VIDEO_VOLUME_CPU_BRIDGE_CONTRACT}_LOCAL_READ_SHORT`);
      const response = await bridgeFetch(
        bridge,
        `/write?key=${encodeURIComponent(text(key))}&offset=${offset}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/octet-stream", "Content-Length": String(length) },
          body: chunk,
        },
      );
      if (!response.ok) throw new Error(`${AVANTIQO_VIDEO_VOLUME_CPU_BRIDGE_CONTRACT}_WRITE_HTTP_${response.status}`);
      offset += length;
    }
  } finally {
    await handle.close();
  }
  const remote = await statAvantiqoVideoVolumeObjectViaCpuBridge(bridge, key);
  if (remote?.exists !== true || Number(remote.size) !== stat.size) {
    throw new Error(`${AVANTIQO_VIDEO_VOLUME_CPU_BRIDGE_CONTRACT}_UPLOAD_SIZE_MISMATCH`);
  }
  return stat.size;
}

export async function downloadAvantiqoVideoVolumeFileViaCpuBridge(bridge, key, filePath, { max_bytes = 16 * 1024 * 1024 * 1024 } = {}) {
  const remote = await statAvantiqoVideoVolumeObjectViaCpuBridge(bridge, key);
  if (remote?.exists !== true) {
    const error = new Error(`${AVANTIQO_VIDEO_VOLUME_CPU_BRIDGE_CONTRACT}_NOT_FOUND`);
    error.code = "NOT_FOUND";
    throw error;
  }
  const size = Math.max(0, Math.round(finite(remote.size, 0)));
  if (size > max_bytes) throw new Error(`${AVANTIQO_VIDEO_VOLUME_CPU_BRIDGE_CONTRACT}_OBJECT_TOO_LARGE:${size}`);
  const handle = await fs.open(filePath, "w");
  let offset = 0;
  try {
    while (offset < size) {
      const length = Math.min(CHUNK_BYTES, size - offset);
      const response = await bridgeFetch(bridge, `/read?key=${encodeURIComponent(text(key))}&offset=${offset}&length=${length}`);
      if (!response.ok) throw new Error(`${AVANTIQO_VIDEO_VOLUME_CPU_BRIDGE_CONTRACT}_READ_HTTP_${response.status}`);
      const chunk = Buffer.from(await response.arrayBuffer());
      if (!chunk.length && length > 0) throw new Error(`${AVANTIQO_VIDEO_VOLUME_CPU_BRIDGE_CONTRACT}_REMOTE_READ_EMPTY`);
      await handle.write(chunk, 0, chunk.length, offset);
      offset += chunk.length;
    }
  } finally {
    await handle.close();
  }
  if (offset !== size) throw new Error(`${AVANTIQO_VIDEO_VOLUME_CPU_BRIDGE_CONTRACT}_DOWNLOAD_SIZE_MISMATCH:${offset}:${size}`);
  return size;
}

export async function readAvantiqoVideoVolumeJsonViaCpuBridge(bridge, key, { max_bytes = 2 * 1024 * 1024 } = {}) {
  const temp = `/tmp/avantiqo-video-volume-bridge-${crypto.randomUUID()}.json`;
  try {
    await downloadAvantiqoVideoVolumeFileViaCpuBridge(bridge, key, temp, { max_bytes });
    return JSON.parse(await fs.readFile(temp, "utf8"));
  } finally {
    await fs.rm(temp, { force: true }).catch(() => null);
  }
}

export async function deleteAvantiqoVideoVolumeObjectViaCpuBridge(bridge, key) {
  const response = await bridgeFetch(bridge, `/object?key=${encodeURIComponent(text(key))}`, { method: "DELETE" });
  if (!response.ok) throw new Error(`${AVANTIQO_VIDEO_VOLUME_CPU_BRIDGE_CONTRACT}_DELETE_HTTP_${response.status}`);
  return response.json();
}
