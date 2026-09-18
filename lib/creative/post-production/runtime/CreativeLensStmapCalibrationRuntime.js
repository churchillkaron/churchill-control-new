import crypto from "node:crypto";

import { CreativeSandboxRuntime } from "@/lib/creative/tools/runtime/CreativeSandboxRuntime";
import { CreativeToolSnapshotRuntime } from "@/lib/creative/tools/runtime/CreativeToolSnapshotRuntime";

export const AVANTIQO_LENS_STMAP_CALIBRATION_CONTRACT =
  "AVANTIQO_LENS_STMAP_CALIBRATION_V1";

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function hash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function worker(config64) {
  return [
    "import os,base64,json",
    "os.environ['OPENCV_IO_ENABLE_OPENEXR']='1'",
    "import cv2,numpy as np",
    "cfg=json.loads(base64.b64decode('" + config64 + "').decode())",
    "w=int(cfg['width']); h=int(cfg['height'])",
    "fx=float(cfg['fx']); fy=float(cfg['fy']); cx=float(cfg['cx']); cy=float(cfg['cy'])",
    "K=np.array([[fx,0,cx],[0,fy,cy],[0,0,1]],dtype=np.float64)",
    "dist=np.array(cfg['distortion'],dtype=np.float64)",
    "mx,my=cv2.initUndistortRectifyMap(K,dist,None,K,(w,h),cv2.CV_32FC1)",
    "forward=np.dstack((mx/max(1,w-1),my/max(1,h-1),np.zeros_like(mx))).astype(np.float32)",
    "yy,xx=np.mgrid[0:h,0:w].astype(np.float32)",
    "pts=np.stack((xx,yy),axis=-1).reshape(-1,1,2)",
    "ideal=cv2.undistortPoints(pts,K,dist,P=K).reshape(h,w,2)",
    "inverse=np.dstack((ideal[:,:,0]/max(1,w-1),ideal[:,:,1]/max(1,h-1),np.zeros((h,w),np.float32))).astype(np.float32)",
    "if not cv2.imwrite(cfg['undistort_tiff_path'],forward): raise RuntimeError('STMAP_UNDISTORT_WRITE_FAILED')",
    "if not cv2.imwrite(cfg['redistort_tiff_path'],inverse): raise RuntimeError('STMAP_REDISTORT_WRITE_FAILED')",
    "print(json.dumps({'width':w,'height':h,'channels':3}))",
  ].join("\n");
}
export async function renderLensStmaps({
  project, width, height, fx, fy = null, cx = null, cy = null,
  distortion = [0, 0, 0, 0, 0], lens_profile_id = "CUSTOM_LENS",
} = {}) {
  if (!project?.id) throw new Error("STMAP_PROJECT_REQUIRED");
  const w = Math.round(finite(width)); const h = Math.round(finite(height));
  if (w < 64 || h < 64) throw new Error("STMAP_DIMENSIONS_REQUIRED");
  const focalX = finite(fx);
  const focalY = finite(fy, focalX);
  if (!(focalX > 0) || !(focalY > 0)) throw new Error("STMAP_FOCAL_PIXELS_REQUIRED");
  const coeffs = Array.isArray(distortion) ? distortion.slice(0, 8).map((v) => finite(v)) : [];
  if (coeffs.length < 4) throw new Error("STMAP_DISTORTION_COEFFICIENTS_REQUIRED");
  const profile = {
    lens_profile_id, width: w, height: h, fx: focalX, fy: focalY,
    cx: finite(cx, w / 2), cy: finite(cy, h / 2), distortion: coeffs,
  };
  const profileHash = hash(profile);
  const ensured = await CreativeToolSnapshotRuntime.ensure({ project, tool_id: "opencv" });
  const base = "/tmp/avantiqo-stmap-" + profileHash.slice(0, 20);
  const scriptPath = base + "/stmap.py";
  const undistortTiffPath = base + "/plate-to-undistorted.tiff";
  const redistortTiffPath = base + "/undistorted-to-plate.tiff";
  const undistortPath = base + "/plate-to-undistorted.exr";
  const redistortPath = base + "/undistorted-to-plate.exr";
  const sandbox = await CreativeSandboxRuntime.fromSnapshot({
    snapshot_id: ensured.snapshot_id, timeout_ms: 300000, network_policy: "deny-all",
  });
  try {
    const config64 = Buffer.from(JSON.stringify({
      ...profile,
      undistort_tiff_path: undistortTiffPath,
      redistort_tiff_path: redistortTiffPath,
    })).toString("base64");
    await CreativeSandboxRuntime.writeText({
      sandbox, path: scriptPath, content: worker(config64),
    });
    await CreativeSandboxRuntime.run({
      sandbox, cmd: "/tmp/avantiqo-opencv/venv/bin/python", args: [scriptPath],
      error_prefix: "STMAP_GENERATION_FAILED",
    });
    await CreativeSandboxRuntime.run({
      sandbox, cmd: "oiiotool", args: [undistortTiffPath, "-o", undistortPath],
      error_prefix: "STMAP_UNDISTORT_EXR_CONVERSION_FAILED",
    });
    await CreativeSandboxRuntime.run({
      sandbox, cmd: "oiiotool", args: [redistortTiffPath, "-o", redistortPath],
      error_prefix: "STMAP_REDISTORT_EXR_CONVERSION_FAILED",
    });
    const [undistort, redistort] = await Promise.all([
      CreativeSandboxRuntime.readBuffer({ sandbox, path: undistortPath }),
      CreativeSandboxRuntime.readBuffer({ sandbox, path: redistortPath }),
    ]);
    return {
      contract: AVANTIQO_LENS_STMAP_CALIBRATION_CONTRACT,
      status: "READY",
      lens_profile: profile,
      lens_profile_hash: profileHash,
      undistort_stmap: {
        buffer: undistort, checksum: crypto.createHash("sha256").update(undistort).digest("hex"),
      },
      redistort_stmap: {
        buffer: redistort, checksum: crypto.createHash("sha256").update(redistort).digest("hex"),
      },
      mime_type: "image/x-exr",
      float_normalized_uv: true,
      round_trip_profile_hash_locked: true,
      provider_calls_performed: false,
    };
  } finally {
    await CreativeSandboxRuntime.stop(sandbox);
  }
}

export const CreativeLensStmapCalibrationRuntime = Object.freeze({
  contract: AVANTIQO_LENS_STMAP_CALIBRATION_CONTRACT,
  render: renderLensStmaps,
});
