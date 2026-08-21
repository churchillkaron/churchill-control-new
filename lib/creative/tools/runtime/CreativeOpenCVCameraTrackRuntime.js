import crypto from "node:crypto";

import {
  signCreativeStorageReference,
} from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";
import {
  CreativeSandboxRuntime,
} from "@/lib/creative/tools/runtime/CreativeSandboxRuntime";

const CONTRACT = "CREATIVE_OPENCV_CAMERA_TRACK_RUNTIME_V2";
const TOOL_ID = "opencv";
const PYTHON = "/tmp/avantiqo-opencv/venv/bin/python";

function text(value) {
  return String(value ?? "").trim();
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function snapshotId(project) {
  return text(project?.metadata?.creative_tool_snapshots?.[TOOL_ID]?.snapshot_id);
}

function jobId(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 20);
}

function workerSource(encodedConfig) {
  return `
import base64, json, math, urllib.request
import cv2
import numpy as np

cfg=json.loads(base64.b64decode("${encodedConfig}").decode("utf-8"))
urllib.request.urlretrieve(cfg["source_url"],cfg["source_path"])
cap=cv2.VideoCapture(cfg["source_path"])
if not cap.isOpened(): raise RuntimeError("CREATIVE_OPENCV_SOURCE_OPEN_FAILED")
fps=float(cap.get(cv2.CAP_PROP_FPS) or 0.0)
frame_count=int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
width=int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
height=int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
sample_fps=max(.25,float(cfg.get("sample_fps",4)))
step=max(1,int(round(fps/sample_fps))) if fps>0 else 1
max_frames=max(2,int(cfg.get("max_frames",240)))
ok,previous=cap.read()
if not ok: raise RuntimeError("CREATIVE_OPENCV_FIRST_FRAME_REQUIRED")
previous_gray=cv2.cvtColor(previous,cv2.COLOR_BGR2GRAY)
previous_points=cv2.goodFeaturesToTrack(previous_gray,maxCorners=600,qualityLevel=.01,minDistance=8,blockSize=7)
tracks=[]
frame_index=0
sampled=0
cx=cy=rotation=0.0
scale_total=1.0
while sampled<max_frames:
    target=frame_index+step
    cap.set(cv2.CAP_PROP_POS_FRAMES,target)
    ok,frame=cap.read()
    if not ok: break
    current_gray=cv2.cvtColor(frame,cv2.COLOR_BGR2GRAY)
    if previous_points is None or len(previous_points)<12:
        previous_points=cv2.goodFeaturesToTrack(previous_gray,maxCorners=600,qualityLevel=.01,minDistance=8,blockSize=7)
    if previous_points is None: break
    current_points,status,errors=cv2.calcOpticalFlowPyrLK(previous_gray,current_gray,previous_points,None,winSize=(31,31),maxLevel=4,criteria=(cv2.TERM_CRITERIA_EPS|cv2.TERM_CRITERIA_COUNT,30,.01))
    if current_points is None or status is None: break
    keep=status.reshape(-1)==1
    old=previous_points.reshape(-1,2)[keep]
    new=current_points.reshape(-1,2)[keep]
    if len(old)<6:
        previous_gray=current_gray
        previous_points=cv2.goodFeaturesToTrack(current_gray,600,.01,8)
        frame_index=target
        sampled+=1
        continue
    matrix,inliers=cv2.estimateAffinePartial2D(old,new,method=cv2.RANSAC,ransacReprojThreshold=3.0)
    if matrix is not None:
        a=float(matrix[0,0]); b=float(matrix[0,1]); dx=float(matrix[0,2]); dy=float(matrix[1,2])
        s=float(math.sqrt(a*a+b*b)); r=float(math.degrees(math.atan2(b,a)))
        cx+=dx; cy+=dy; rotation+=r; scale_total*=s
        tracks.append({"frame":target,"time_seconds":target/fps if fps>0 else None,"dx":dx,"dy":dy,"rotation_degrees":r,"scale":s,"cumulative_x":cx,"cumulative_y":cy,"cumulative_rotation_degrees":rotation,"cumulative_scale":scale_total,"tracked_points":int(len(old)),"inliers":int(np.sum(inliers)) if inliers is not None else None})
    previous_gray=current_gray
    previous_points=new.reshape(-1,1,2)
    frame_index=target
    sampled+=1
cap.release()
result={"operation":"CAMERA_TRACK","source":{"fps":fps,"frame_count":frame_count,"width":width,"height":height,"duration_seconds":frame_count/fps if fps>0 else None},"samples":tracks}
with open(cfg["result_path"],"w",encoding="utf-8") as h: json.dump(result,h,separators=(",",":"))
print(json.dumps({"samples":len(tracks)}))
`;
}

export async function executeCreativeOpenCVCameraTrack({
  organization_id,
  project,
  source_reference,
  sample_fps = 4,
  max_frames = 240,
} = {}) {
  const snapshot = snapshotId(project);
  if (!snapshot) throw new Error("CREATIVE_OPENCV_SNAPSHOT_REQUIRED");
  if (!text(organization_id)) throw new Error("CREATIVE_OPENCV_ORGANIZATION_REQUIRED");
  if (!text(source_reference).startsWith("storage://")) {
    throw new Error("CREATIVE_OPENCV_STORAGE_REFERENCE_REQUIRED");
  }

  const sourceUrl = await signCreativeStorageReference({
    organization_id,
    reference: source_reference,
    expires_in: 900,
  });
  const identity = jobId({ organization_id, source_reference, sample_fps, max_frames });
  const base = `/tmp/avantiqo-opencv-track-v2-${identity}`;
  const scriptPath = `${base}/worker.py`;
  const sourcePath = `${base}/source.mp4`;
  const resultPath = `${base}/result.json`;
  const encodedConfig = Buffer.from(JSON.stringify({
    source_url: sourceUrl,
    source_path: sourcePath,
    result_path: resultPath,
    sample_fps: Math.max(.25, number(sample_fps, 4)),
    max_frames: Math.max(2, Math.min(1200, Math.floor(number(max_frames, 240)))),
  }), "utf8").toString("base64");

  const sandbox = await CreativeSandboxRuntime.fromSnapshot({
    snapshot_id: snapshot,
    timeout_ms: 420000,
    network_policy: "allow-all",
  });
  try {
    await CreativeSandboxRuntime.writeText({ sandbox, path: scriptPath, content: workerSource(encodedConfig) });
    await CreativeSandboxRuntime.run({
      sandbox,
      cmd: PYTHON,
      args: [scriptPath],
      timeout_ms: 360000,
      error_prefix: "CREATIVE_OPENCV_CAMERA_TRACK_FAILED",
    });
    const buffer = await CreativeSandboxRuntime.readBuffer({ sandbox, path: resultPath });
    return {
      contract: CONTRACT,
      tool_id: TOOL_ID,
      operation: "CAMERA_TRACK",
      result: JSON.parse(buffer.toString("utf8")),
      mask: null,
    };
  } finally {
    await CreativeSandboxRuntime.stop(sandbox);
  }
}

export const CreativeOpenCVCameraTrackRuntime = Object.freeze({
  contract: CONTRACT,
  execute: executeCreativeOpenCVCameraTrack,
});
