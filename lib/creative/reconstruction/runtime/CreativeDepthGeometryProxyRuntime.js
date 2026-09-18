import crypto from "node:crypto";

import {
  signCreativeStorageReference,
} from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";
import {
  CreativeSandboxRuntime,
} from "@/lib/creative/tools/runtime/CreativeSandboxRuntime";

export const CREATIVE_DEPTH_GEOMETRY_PROXY_CONTRACT =
  "CREATIVE_DEPTH_GEOMETRY_PROXY_V1";

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function integer(value, fallback, minimum = 8, maximum = 512) {
  return Math.min(maximum, Math.max(minimum, Math.round(finite(value, fallback))));
}

function snapshotId(project = {}) {
  return text(project?.metadata?.creative_tool_snapshots?.opencv?.snapshot_id);
}

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function workerSource(encodedConfig) {
  return `
import base64
import json
import urllib.request
import cv2
import numpy as np

cfg = json.loads(base64.b64decode("${encodedConfig}").decode("utf-8"))
source_path = cfg["source_path"]
obj_path = cfg["obj_path"]
meta_path = cfg["meta_path"]
urllib.request.urlretrieve(cfg["source_url"], source_path)
depth = cv2.imread(source_path, cv2.IMREAD_UNCHANGED)
if depth is None:
    raise RuntimeError("CREATIVE_DEPTH_GEOMETRY_SOURCE_OPEN_FAILED")
if depth.ndim == 3:
    depth = cv2.cvtColor(depth, cv2.COLOR_BGR2GRAY)
depth = depth.astype(np.float32)
height, width = depth.shape[:2]
low = float(np.percentile(depth, 1))
high = float(np.percentile(depth, 99))
span = max(1e-6, high - low)
normalized = np.clip((depth - low) / span, 0.0, 1.0)
# Depth Anything may be inverse-depth-like depending on model; this proxy only preserves relative ordering.
# We map to normalized camera space and explicitly do not claim metric scale.
normalized = cv2.GaussianBlur(normalized, (0, 0), 0.8)
grid_w = min(int(cfg["grid_width"]), width)
grid_h = min(int(cfg["grid_height"]), height)
xs = np.linspace(0, width - 1, grid_w).astype(np.int32)
ys = np.linspace(0, height - 1, grid_h).astype(np.int32)
vertices = []
uvs = []
for yi, y in enumerate(ys):
    for xi, x in enumerate(xs):
        z = float(normalized[y, x])
        nx = (float(x) / max(1.0, width - 1.0) - 0.5) * 2.0
        ny = -((float(y) / max(1.0, height - 1.0) - 0.5) * 2.0)
        # Keep image plane stable while giving depth enough amplitude for controlled reprojection.
        vertices.append((nx, ny, z * float(cfg["depth_amplitude"])))
        uvs.append((float(x) / max(1.0, width - 1.0), 1.0 - float(y) / max(1.0, height - 1.0)))
faces = []
for y in range(grid_h - 1):
    for x in range(grid_w - 1):
        a = y * grid_w + x + 1
        b = a + 1
        c = a + grid_w
        d = c + 1
        faces.append((a, c, b))
        faces.append((b, c, d))
with open(obj_path, "w", encoding="utf-8") as handle:
    handle.write("# Avantiqo governed depth reprojection proxy\\n")
    for vx, vy, vz in vertices:
        handle.write(f"v {vx:.7f} {vy:.7f} {vz:.7f}\\n")
    for u, v in uvs:
        handle.write(f"vt {u:.7f} {v:.7f}\\n")
    for a, b, c in faces:
        handle.write(f"f {a}/{a} {b}/{b} {c}/{c}\\n")
meta = {
    "contract": "${CREATIVE_DEPTH_GEOMETRY_PROXY_CONTRACT}",
    "source_width": width,
    "source_height": height,
    "grid_width": grid_w,
    "grid_height": grid_h,
    "vertex_count": len(vertices),
    "triangle_count": len(faces),
    "relative_depth_min_p01": low,
    "relative_depth_max_p99": high,
    "metric_scale_resolved": False,
    "geometry_mode": "SINGLE_VIEW_DEPTH_REPROJECTION_PROXY",
    "safe_camera_motion": "SMALL_TRANSLATION_AND_PARALLAX_ONLY",
    "large_orbit_allowed": False,
    "reverse_angle_allowed": False,
    "maximum_recommended_frame_translation_ratio": 0.05,
}
with open(meta_path, "w", encoding="utf-8") as handle:
    json.dump(meta, handle, separators=(",", ":"), sort_keys=True)
print(json.dumps(meta, separators=(",", ":"), sort_keys=True))
`;
}

export async function buildDepthGeometryProxy({
  organization_id,
  project,
  depth_reference,
  grid_width = 128,
  grid_height = 72,
  depth_amplitude = 0.35,
} = {}) {
  const snapshot = snapshotId(project);
  if (!snapshot) throw new Error("CREATIVE_DEPTH_GEOMETRY_OPENCV_SNAPSHOT_REQUIRED");
  if (!text(organization_id)) throw new Error("CREATIVE_DEPTH_GEOMETRY_ORGANIZATION_REQUIRED");
  if (!text(depth_reference).startsWith("storage://")) {
    throw new Error("CREATIVE_DEPTH_GEOMETRY_STORAGE_REFERENCE_REQUIRED");
  }
  const sourceUrl = await signCreativeStorageReference({
    organization_id,
    reference: depth_reference,
    expires_in: 900,
  });
  const config = {
    source_url: sourceUrl,
    grid_width: integer(grid_width, 128, 16, 320),
    grid_height: integer(grid_height, 72, 16, 180),
    depth_amplitude: Math.max(0.05, Math.min(1.5, finite(depth_amplitude, 0.35))),
  };
  const id = digest({ organization_id, depth_reference, ...config }).slice(0, 20);
  const base = `/tmp/avantiqo-depth-geometry-${id}`;
  const sourcePath = `${base}/depth.png`;
  const objPath = `${base}/proxy.obj`;
  const metaPath = `${base}/proxy.json`;
  const scriptPath = `${base}/worker.py`;
  const encoded = Buffer.from(JSON.stringify({
    ...config,
    source_path: sourcePath,
    obj_path: objPath,
    meta_path: metaPath,
  }), "utf8").toString("base64");

  const sandbox = await CreativeSandboxRuntime.fromSnapshot({
    snapshot_id: snapshot,
    timeout_ms: 300000,
    network_policy: "allow-all",
  });
  try {
    await CreativeSandboxRuntime.writeText({
      sandbox,
      path: scriptPath,
      content: workerSource(encoded),
    });
    await CreativeSandboxRuntime.run({
      sandbox,
      cmd: "python3",
      args: [scriptPath],
      error_prefix: "CREATIVE_DEPTH_GEOMETRY_EXECUTION_FAILED",
    });
    const [objBuffer, metaBuffer] = await Promise.all([
      CreativeSandboxRuntime.readBuffer({ sandbox, path: objPath }),
      CreativeSandboxRuntime.readBuffer({ sandbox, path: metaPath }),
    ]);
    const metadata = JSON.parse(metaBuffer.toString("utf8"));
    return {
      contract: CREATIVE_DEPTH_GEOMETRY_PROXY_CONTRACT,
      tool_id: "opencv-depth-geometry",
      mime_type: "text/plain",
      file_extension: "obj",
      buffer: objBuffer,
      bytes: objBuffer.length,
      metadata,
      metric_scale_resolved: false,
      large_orbit_allowed: false,
      raw_reasoning_persisted: false,
    };
  } finally {
    await CreativeSandboxRuntime.stop(sandbox);
  }
}

export const CreativeDepthGeometryProxyRuntime = Object.freeze({
  contract: CREATIVE_DEPTH_GEOMETRY_PROXY_CONTRACT,
  build: buildDepthGeometryProxy,
});
