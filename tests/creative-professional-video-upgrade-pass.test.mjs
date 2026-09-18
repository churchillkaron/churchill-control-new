import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { CreativeProfessionalMatchmoveAuthorityRuntime } from
  "../lib/creative/tracking/runtime/CreativeProfessionalMatchmoveAuthorityRuntime.js";
import { CreativeProfessionalRotoMattingRuntime } from
  "../lib/creative/roto/runtime/CreativeProfessionalRotoMattingRuntime.js";
import { CreativeProfessionalCompositingGraphRuntime } from
  "../lib/creative/compositing/runtime/CreativeProfessionalCompositingGraphRuntime.js";
import { CreativeAdvancedDeliveryAuthorityRuntime } from
  "../lib/creative/release/runtime/CreativeAdvancedDeliveryAuthorityRuntime.js";
import { CreativeDistributedRenderWorkerRuntime } from
  "../lib/creative/render-farm/runtime/CreativeDistributedRenderWorkerRuntime.js";

const farm = fs.readFileSync("lib/creative/render-farm/runtime/CreativeRenderFarmExecutionRuntime.js", "utf8");
const worker = fs.readFileSync("lib/creative/render-farm/runtime/CreativeDistributedRenderWorkerRuntime.js", "utf8");
const matchmove = fs.readFileSync("lib/creative/tracking/runtime/CreativeOpenCVMatchmoveRuntime.js", "utf8");
const aaf = fs.readFileSync("lib/creative/post-production/runtime/CreativeAafEditorialHandoffRuntime.js", "utf8");
const stmap = fs.readFileSync("lib/creative/post-production/runtime/CreativeLensStmapCalibrationRuntime.js", "utf8");
const versions = fs.readFileSync("lib/creative/assets/versioning/runtime/CreativeVfxVersionPublishCacheRuntime.js", "utf8");
const ui = fs.readFileSync("components/creative/ProductionStudio/workspaces/RenderWorkspaceV5.jsx", "utf8");
test("render farm requires assigned remote worker evidence and no local fallback", () => {
  assert.match(farm, /CreativeDistributedRenderWorkerRuntime\.dispatch/);
  assert.match(farm, /local_render_fallback_used:false/);
  assert.match(worker, /RENDER_WORKER_TRUSTED_ENDPOINT_REQUIRED/);
  assert.match(worker, /RENDER_WORKER_CHECKSUM_REQUIRED/);
  assert.match(worker, /remote_execution:\s*true/);
});

test("matchmove includes bounded automatic focal search and professional world authority", () => {
  assert.match(matchmove, /AUTO_FOCAL_SEARCH/);
  assert.match(matchmove, /auto_focal_confidence/);
  const result = CreativeProfessionalMatchmoveAuthorityRuntime.evaluate({
    solve: {
      camera_intrinsics: { calibrated: true, calibration_source: "AUTO_FOCAL_SEARCH", auto_focal_confidence: .8 },
      lens_model: { source: "AUTO_FOCAL_SEARCH" },
      parallax_evidence: { sufficient: true, median_pose_inlier_ratio: .7 },
      rolling_shutter_model: { detected: false },
      samples: [{}, {}, {}],
    },
    scale_reference: { known_distance_m: 2.7 },
    origin: { axis: "Z_UP", point: [0, 0, 0] },
  });
  assert.equal(result.status, "READY");
});
test("professional roto supports layered spline, trimap, hair and correction authority", () => {
  const result = CreativeProfessionalRotoMattingRuntime.author({
    subject_id: "car",
    tracking_asset_node_id: "track-1",
    trimap_asset_node_id: "trimap-1",
    hair_detail_required: true,
    layers: [{ id: "body", seed_matte_asset_node_id: "matte-1", spline_keyframes: [{ frame: 1 }] }],
    keyframes: [{ frame: 1 }],
  });
  assert.equal(result.status, "READY");
  assert.equal(result.operations.layered_occlusion, true);
  assert.equal(result.operations.motion_blur_reconstruction, true);
});

test("professional comp graph is scene-linear DAG with deep and STMap operations", () => {
  const result = CreativeProfessionalCompositingGraphRuntime.author({
    nodes: [
      { id: "read", op: "DEEP_READ" },
      { id: "lens", op: "STMAP", inputs: ["read"] },
      { id: "write", op: "WRITE", inputs: ["lens"] },
    ],
    output_node_id: "write",
    scene_linear: true,
  });
  assert.equal(result.status, "READY");
  assert.equal(result.deep_compositing_required, true);
  assert.deepEqual(result.execution_order, ["read", "lens", "write"]);
});
test("AAF and STMap paths are executable rather than extension-only declarations", () => {
  assert.match(aaf, /pyaaf2|import base64,json,aaf2/);
  assert.match(aaf, /AAF_EXPORT_OUTPUT_TOO_SMALL/);
  assert.match(stmap, /cv2\.initUndistortRectifyMap/);
  assert.match(stmap, /plate-to-undistorted\.exr/);
  assert.match(stmap, /undistorted-to-plate\.exr/);
});

test("VFX publish/cache uses immutable versions, dependency hashes and supersession", () => {
  assert.match(versions, /version_label/);
  assert.match(versions, /dependency_hash/);
  assert.match(versions, /SUPERSEDED/);
  assert.match(versions, /VFX_CACHE_DEPENDENCY_CHANGED/);
});

test("advanced delivery fails closed for fake IMF or DCP packaging", () => {
  const blocked = CreativeAdvancedDeliveryAuthorityRuntime.authorize({
    target: "IMF_APP2E",
    final_mastering_seal: { seal_hash: "seal" },
    color_authority: { status: "READY", output: { id: "REC2020_PQ" } },
  });
  assert.equal(blocked.status, "BLOCKED");
  assert.ok(blocked.blockers.includes("ADVANCED_DELIVERY_SPECIALIST_PACKAGER_REQUIRED:IMF"));
});

test("Render workspace exposes professional video systems without a second studio", () => {
  assert.match(ui, /Professional video systems/);
  assert.match(ui, /Deep EXR/);
  assert.match(ui, /Distributed worker execution/);
  assert.match(ui, /OTIO \+ AAF/);
  assert.match(ui, /HDR \/ IMF \/ DCP authority/);
});

test("distributed worker dispatch validates remote chunk identity and checksum", async () => {
  const result = await CreativeDistributedRenderWorkerRuntime.dispatch({
    project: { id: "project-1", organization_id: "org-1" },
    scene: { frame_start: 1, frame_end: 8 },
    assignment: {
      worker_id: "worker-a",
      chunk_id: "chunk-1",
      frame_start: 1,
      frame_end: 8,
      frame_count: 8,
    },
    workers: [{
      worker_id: "worker-a",
      render_endpoint: "https://render-worker.example.test/execute",
    }],
    fetch_impl: async () => ({
      ok: true,
      json: async () => ({
        chunk_id: "chunk-1",
        checksum: "abc123",
        frame_count: 8,
        bytes: 4096,
      }),
    }),
  });
  assert.equal(result.remote_execution, true);
  assert.equal(result.local_render_fallback_used, false);
  assert.equal(result.worker_id, "worker-a");
});
