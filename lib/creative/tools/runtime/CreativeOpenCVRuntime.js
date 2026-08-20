import crypto from "node:crypto";

import {
  signCreativeStorageReference,
} from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";
import {
  CreativeSandboxRuntime,
} from "@/lib/creative/tools/runtime/CreativeSandboxRuntime";

const CONTRACT = "CREATIVE_OPENCV_RUNTIME_V1";
const TOOL_ID = "opencv";

function text(value) {
  return String(value ?? "").trim();
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function integer(value, fallback, minimum = 1, maximum = 10000) {
  const parsed = Math.floor(number(value, fallback));
  return Math.min(maximum, Math.max(minimum, parsed));
}

function snapshotId(project) {
  return text(project?.metadata?.creative_tool_snapshots?.[TOOL_ID]?.snapshot_id);
}

function jobId(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")
    .slice(0, 20);
}

function normalizeBoundingBox(value) {
  if (!Array.isArray(value) || value.length !== 4) return null;
  const output = value.map((item) => number(item, NaN));
  if (output.some((item) => !Number.isFinite(item))) return null;
  return output;
}

function workerSource(encodedConfig) {
  return `
import base64
import json
import math
import os
import urllib.request

import cv2
import numpy as np

cfg = json.loads(base64.b64decode("${encodedConfig}").decode("utf-8"))
source_path = cfg["source_path"]
result_path = cfg["result_path"]
mask_path = cfg.get("mask_path")

urllib.request.urlretrieve(cfg["source_url"], source_path)
cap = cv2.VideoCapture(source_path)
if not cap.isOpened():
    raise RuntimeError("CREATIVE_OPENCV_SOURCE_OPEN_FAILED")

fps = float(cap.get(cv2.CAP_PROP_FPS) or 0.0)
frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
duration = (frame_count / fps) if fps > 0 else None
sample_fps = max(0.25, float(cfg.get("sample_fps", 4.0)))
step = max(1, int(round(fps / sample_fps))) if fps > 0 else 1
max_frames = max(2, int(cfg.get("max_frames", 240)))
operation = cfg["operation"]


def gray(frame):
    return cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)


def percentiles(values):
    if not values:
        return {"mean": 0.0, "p50": 0.0, "p95": 0.0, "max": 0.0}
    array = np.asarray(values, dtype=np.float32)
    return {
        "mean": float(np.mean(array)),
        "p50": float(np.percentile(array, 50)),
        "p95": float(np.percentile(array, 95)),
        "max": float(np.max(array)),
    }


def camera_track():
    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
    ok, previous = cap.read()
    if not ok:
        raise RuntimeError("CREATIVE_OPENCV_FIRST_FRAME_REQUIRED")
    previous_gray = gray(previous)
    previous_points = cv2.goodFeaturesToTrack(
        previous_gray,
        maxCorners=600,
        qualityLevel=0.01,
        minDistance=8,
        blockSize=7,
    )
    tracks = []
    frame_index = 0
    sampled = 0
    cumulative_x = 0.0
    cumulative_y = 0.0
    cumulative_rotation = 0.0
    cumulative_scale = 1.0

    while sampled < max_frames:
        target = frame_index + step
        cap.set(cv2.CAP_PROP_POS_FRAMES, target)
        ok, frame = cap.read()
        if not ok:
            break
        current_gray = gray(frame)
        if previous_points is None or len(previous_points) < 12:
            previous_points = cv2.goodFeaturesToTrack(
                previous_gray,
                maxCorners=600,
                qualityLevel=0.01,
                minDistance=8,
                blockSize=7,
            )
        if previous_points is None:
            break

        current_points, status, errors = cv2.calcOpticalFlowPyrLK(
            previous_gray,
            current_gray,
            previous_points,
            None,
            winSize=(31, 31),
            maxLevel=4,
            criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 30, 0.01),
        )
        if current_points is None or status is None:
            break
        keep = status.reshape(-1) == 1
        old = previous_points.reshape(-1, 2)[keep]
        new = current_points.reshape(-1, 2)[keep]
        if len(old) < 6:
            previous_gray = current_gray
            previous_points = cv2.goodFeaturesToTrack(current_gray, 600, 0.01, 8)
            frame_index = target
            sampled += 1
            continue

        matrix, inliers = cv2.estimateAffinePartial2D(
            old,
            new,
            method=cv2.RANSAC,
            ransacReprojThreshold=3.0,
        )
        if matrix is not None:
            a = float(matrix[0, 0])
            b = float(matrix[0, 1])
            dx = float(matrix[0, 2])
            dy = float(matrix[1, 2])
            scale = float(math.sqrt(a * a + b * b))
            rotation = float(math.degrees(math.atan2(b, a)))
            cumulative_x += dx
            cumulative_y += dy
            cumulative_rotation += rotation
            cumulative_scale *= scale
            tracks.append({
                "frame": target,
                "time_seconds": (target / fps) if fps > 0 else None,
                "dx": dx,
                "dy": dy,
                "rotation_degrees": rotation,
                "scale": scale,
                "cumulative_x": cumulative_x,
                "cumulative_y": cumulative_y,
                "cumulative_rotation_degrees": cumulative_rotation,
                "cumulative_scale": cumulative_scale,
                "tracked_points": int(len(old)),
                "inliers": int(np.sum(inliers)) if inliers is not None else None,
                "mean_lk_error": float(np.mean(errors[keep])) if errors is not None and np.any(keep) else None,
            })

        previous_gray = current_gray
        previous_points = new.reshape(-1, 1, 2)
        frame_index = target
        sampled += 1

    return {"samples": tracks}


def object_track():
    bbox = cfg.get("bbox")
    if not bbox or len(bbox) != 4:
        raise RuntimeError("CREATIVE_OPENCV_OBJECT_BBOX_REQUIRED")
    x, y, w, h = [float(v) for v in bbox]
    cap.set(cv2.CAP_PROP_POS_FRAMES, int(cfg.get("start_frame", 0)))
    ok, previous = cap.read()
    if not ok:
        raise RuntimeError("CREATIVE_OPENCV_FIRST_FRAME_REQUIRED")
    previous_gray = gray(previous)
    tracks = []
    frame_index = int(cfg.get("start_frame", 0))
    sampled = 0

    while sampled < max_frames:
        mask = np.zeros(previous_gray.shape, dtype=np.uint8)
        x1 = max(0, min(width - 1, int(round(x))))
        y1 = max(0, min(height - 1, int(round(y))))
        x2 = max(x1 + 1, min(width, int(round(x + w))))
        y2 = max(y1 + 1, min(height, int(round(y + h))))
        mask[y1:y2, x1:x2] = 255
        points = cv2.goodFeaturesToTrack(
            previous_gray,
            mask=mask,
            maxCorners=250,
            qualityLevel=0.01,
            minDistance=5,
            blockSize=7,
        )
        if points is None or len(points) < 4:
            break

        target = frame_index + step
        cap.set(cv2.CAP_PROP_POS_FRAMES, target)
        ok, frame = cap.read()
        if not ok:
            break
        current_gray = gray(frame)
        current_points, status, errors = cv2.calcOpticalFlowPyrLK(
            previous_gray,
            current_gray,
            points,
            None,
            winSize=(31, 31),
            maxLevel=4,
        )
        if current_points is None or status is None:
            break
        keep = status.reshape(-1) == 1
        old = points.reshape(-1, 2)[keep]
        new = current_points.reshape(-1, 2)[keep]
        if len(old) < 4:
            break
        motion = new - old
        dx = float(np.median(motion[:, 0]))
        dy = float(np.median(motion[:, 1]))
        x += dx
        y += dy
        x = max(0.0, min(float(width) - w, x))
        y = max(0.0, min(float(height) - h, y))
        tracks.append({
            "frame": target,
            "time_seconds": (target / fps) if fps > 0 else None,
            "bbox": [x, y, w, h],
            "dx": dx,
            "dy": dy,
            "tracked_points": int(len(old)),
            "mean_lk_error": float(np.mean(errors[keep])) if errors is not None and np.any(keep) else None,
        })
        previous_gray = current_gray
        frame_index = target
        sampled += 1

    return {"samples": tracks, "final_bbox": [x, y, w, h]}


def flow_analysis():
    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
    ok, previous = cap.read()
    if not ok:
        raise RuntimeError("CREATIVE_OPENCV_FIRST_FRAME_REQUIRED")
    previous_gray = gray(previous)
    frame_index = 0
    sampled = 0
    samples = []
    magnitudes = []

    while sampled < max_frames:
        target = frame_index + step
        cap.set(cv2.CAP_PROP_POS_FRAMES, target)
        ok, frame = cap.read()
        if not ok:
            break
        current_gray = gray(frame)
        flow = cv2.calcOpticalFlowFarneback(
            previous_gray,
            current_gray,
            None,
            0.5,
            3,
            21,
            3,
            5,
            1.2,
            0,
        )
        magnitude, angle = cv2.cartToPolar(flow[..., 0], flow[..., 1])
        mean_mag = float(np.mean(magnitude))
        p95_mag = float(np.percentile(magnitude, 95))
        mean_angle = float(np.degrees(np.mean(angle)))
        samples.append({
            "frame": target,
            "time_seconds": (target / fps) if fps > 0 else None,
            "mean_magnitude": mean_mag,
            "p95_magnitude": p95_mag,
            "mean_angle_degrees": mean_angle,
        })
        magnitudes.append(mean_mag)
        previous_gray = current_gray
        frame_index = target
        sampled += 1

    return {"samples": samples, "motion": percentiles(magnitudes)}


def segmentation():
    frame_seconds = max(0.0, float(cfg.get("frame_seconds", 0.0)))
    target = int(round(frame_seconds * fps)) if fps > 0 else 0
    cap.set(cv2.CAP_PROP_POS_FRAMES, target)
    ok, frame = cap.read()
    if not ok:
        raise RuntimeError("CREATIVE_OPENCV_SEGMENTATION_FRAME_REQUIRED")
    bbox = cfg.get("bbox")
    if bbox and len(bbox) == 4:
        x, y, w, h = [int(round(float(v))) for v in bbox]
    else:
        margin_x = max(1, int(width * 0.08))
        margin_y = max(1, int(height * 0.08))
        x, y = margin_x, margin_y
        w, h = width - margin_x * 2, height - margin_y * 2
    x = max(0, min(width - 2, x))
    y = max(0, min(height - 2, y))
    w = max(1, min(width - x, w))
    h = max(1, min(height - y, h))
    mask = np.zeros(frame.shape[:2], np.uint8)
    bgd = np.zeros((1, 65), np.float64)
    fgd = np.zeros((1, 65), np.float64)
    cv2.grabCut(frame, mask, (x, y, w, h), bgd, fgd, 7, cv2.GC_INIT_WITH_RECT)
    binary = np.where((mask == 2) | (mask == 0), 0, 255).astype("uint8")
    cv2.imwrite(mask_path, binary)
    foreground_ratio = float(np.mean(binary > 0))
    return {
        "frame": target,
        "time_seconds": (target / fps) if fps > 0 else frame_seconds,
        "bbox": [x, y, w, h],
        "foreground_ratio": foreground_ratio,
    }

if operation == "CAMERA_TRACK":
    payload = camera_track()
elif operation == "OBJECT_TRACK":
    payload = object_track()
elif operation in ("OPTICAL_FLOW", "MOTION_ANALYSE"):
    payload = flow_analysis()
elif operation == "SEGMENTATION":
    payload = segmentation()
else:
    raise RuntimeError("CREATIVE_OPENCV_OPERATION_UNSUPPORTED:" + operation)

result = {
    "operation": operation,
    "source": {
        "fps": fps,
        "frame_count": frame_count,
        "width": width,
        "height": height,
        "duration_seconds": duration,
    },
    **payload,
}

with open(result_path, "w", encoding="utf-8") as handle:
    json.dump(result, handle, separators=(",", ":"))

cap.release()
print(json.dumps({"operation": operation, "result_path": result_path, "mask_path": mask_path}))
`;
}

export async function executeCreativeOpenCV({
  organization_id,
  project,
  operation,
  source_reference,
  sample_fps = 4,
  max_frames = 240,
  bbox = null,
  frame_seconds = 0,
  start_frame = 0,
} = {}) {
  const snapshot = snapshotId(project);
  if (!snapshot) throw new Error("CREATIVE_OPENCV_SNAPSHOT_REQUIRED");
  if (!text(organization_id)) throw new Error("CREATIVE_OPENCV_ORGANIZATION_REQUIRED");
  if (!text(source_reference).startsWith("storage://")) {
    throw new Error("CREATIVE_OPENCV_STORAGE_REFERENCE_REQUIRED");
  }

  const mode = text(operation).toUpperCase();
  if (!["CAMERA_TRACK", "OBJECT_TRACK", "OPTICAL_FLOW", "SEGMENTATION", "MOTION_ANALYSE"].includes(mode)) {
    throw new Error(`CREATIVE_OPENCV_OPERATION_UNSUPPORTED:${mode}`);
  }

  const signedUrl = await signCreativeStorageReference({
    organization_id,
    reference: source_reference,
    expires_in: 900,
  });
  const normalizedBbox = normalizeBoundingBox(bbox);
  const identity = jobId({
    organization_id,
    source_reference,
    mode,
    sample_fps,
    max_frames,
    bbox: normalizedBbox,
    frame_seconds,
    start_frame,
  });
  const base = `/tmp/avantiqo-opencv-job-${identity}`;
  const scriptPath = `${base}/worker.py`;
  const sourcePath = `${base}/source.mp4`;
  const resultPath = `${base}/result.json`;
  const maskPath = `${base}/mask.png`;
  const config = {
    source_url: signedUrl,
    source_path: sourcePath,
    result_path: resultPath,
    mask_path: maskPath,
    operation: mode,
    sample_fps: Math.max(0.25, number(sample_fps, 4)),
    max_frames: integer(max_frames, 240, 2, 1200),
    bbox: normalizedBbox,
    frame_seconds: Math.max(0, number(frame_seconds, 0)),
    start_frame: integer(start_frame, 0, 0, 100000000),
  };
  const encodedConfig = Buffer.from(JSON.stringify(config), "utf8").toString("base64");

  const sandbox = await CreativeSandboxRuntime.fromSnapshot({
    snapshot_id: snapshot,
    timeout_ms: 420000,
    network_policy: "allow-all",
  });

  try {
    await CreativeSandboxRuntime.writeText({
      sandbox,
      path: scriptPath,
      content: workerSource(encodedConfig),
    });
    await CreativeSandboxRuntime.run({
      sandbox,
      cmd: "python3",
      args: [scriptPath],
      error_prefix: "CREATIVE_OPENCV_EXECUTION_FAILED",
    });
    const resultBuffer = await CreativeSandboxRuntime.readBuffer({
      sandbox,
      path: resultPath,
    });
    const result = JSON.parse(resultBuffer.toString("utf8"));

    let mask = null;
    if (mode === "SEGMENTATION") {
      const buffer = await CreativeSandboxRuntime.readBuffer({
        sandbox,
        path: maskPath,
      });
      mask = {
        mime_type: "image/png",
        buffer,
        bytes: buffer.length,
      };
    }

    return {
      contract: CONTRACT,
      tool_id: TOOL_ID,
      operation: mode,
      result,
      mask,
    };
  } finally {
    await CreativeSandboxRuntime.stop(sandbox);
  }
}

export const CreativeOpenCVRuntime = Object.freeze({
  contract: CONTRACT,
  execute: executeCreativeOpenCV,
});
