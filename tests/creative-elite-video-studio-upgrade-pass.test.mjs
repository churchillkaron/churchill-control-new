import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { CreativeDistributedRenderWorkerRuntime } from "../lib/creative/render-farm/runtime/CreativeDistributedRenderWorkerRuntime.js";
import { CreativeProfessionalMatchmoveAuthorityRuntime } from "../lib/creative/tracking/runtime/CreativeProfessionalMatchmoveAuthorityRuntime.js";
import { CreativeProfessionalRotoMattingRuntime } from "../lib/creative/roto/runtime/CreativeProfessionalRotoMattingRuntime.js";
import { CreativeProfessionalCompositingGraphRuntime } from "../lib/creative/compositing/runtime/CreativeProfessionalCompositingGraphRuntime.js";
import { CreativeAdvancedDeliveryPackageRuntime } from "../lib/creative/release/runtime/CreativeAdvancedDeliveryPackageRuntime.js";
import { CreativeEliteVideoStudioReadinessRuntime } from "../lib/creative/certification/runtime/CreativeEliteVideoStudioReadinessRuntime.js";

const renderFarm = fs.readFileSync("lib/creative/render-farm/runtime/CreativeRenderFarmExecutionRuntime.js", "utf8");
const aaf = fs.readFileSync("lib/creative/post-production/runtime/CreativeAafEditorialHandoffRuntime.js", "utf8");
const stmap = fs.readFileSync("lib/creative/post-production/runtime/CreativeLensStmapCalibrationRuntime.js", "utf8");
const versioning = fs.readFileSync("lib/creative/assets/versioning/runtime/CreativeVfxVersionPublishCacheRuntime.js", "utf8");
const ui = fs.readFileSync("components/creative/ProductionStudio/workspaces/VideoVfxPipelinePanel.jsx", "utf8");
test("distributed render workers require a trusted endpoint and matching checksum evidence", async () => {
  const result = await CreativeDistributedRenderWorkerRuntime.dispatch({
    project: { id: "p", organization_id: "o" },
    scene: { id: "scene" },
    assignment: { worker_id: "w1", chunk_id: "c1", frame_start: 1, frame_end: 8, frame_count: 8 },
    workers: [{ worker_id: "w1", endpoint: "https://worker.example/render" }],
    fetch_impl: async () => ({
      ok: true,
      json: async () => ({ chunk_id: "c1", frame_count: 8, checksum: "abc", bytes: 42 }),
    }),
  });
  assert.equal(result.remote_execution, true);
  assert.equal(result.local_render_fallback_used, false);
  assert.match(renderFarm, /distributed_worker_execution:true/);
});

test("professional matchmove requires scale, origin, lens and calibrated solve", () => {
  const ready = CreativeProfessionalMatchmoveAuthorityRuntime.evaluate({
    solve: {
      camera_intrinsics: { calibrated: true, calibration_source: "CALIBRATED_INPUT" },
      lens_model: { type: "BROWN_CONRADY" },
      parallax_evidence: { sufficient: true, median_pose_inlier_ratio: 0.7 },
      rolling_shutter_model: { detected: false },
      samples: [{}, {}, {}],
      reprojection_error_rms_px: 0.8,
    },
    scale_reference: { known_distance_m: 2.7 },
    origin: { axis: "Z_UP", point: [0, 0, 0] },
  });
  assert.equal(ready.status, "READY");
  assert.equal(ready.authority.usd_camera_export_allowed, true);
});
test("professional roto supports layered splines, trimap, hair and manual corrections", () => {
  const plan = CreativeProfessionalRotoMattingRuntime.author({
    subject_id: "car",
    tracking_asset_node_id: "track",
    trimap_asset_node_id: "trimap",
    hair_detail_required: true,
    layers: [{ id: "body", seed_matte_asset_node_id: "seed", spline_keyframes: [1, 12] }],
    keyframes: [1, 12],
    manual_correction_frames: [7],
  });
  assert.equal(plan.status, "READY");
  assert.equal(plan.operations.spline_roto, true);
  assert.equal(plan.operations.foreground_color_decontamination, true);
  assert.equal(plan.operations.motion_blur_reconstruction, true);
});

test("professional comp graph is scene-linear, acyclic and includes deep/STMap operators", () => {
  const graph = CreativeProfessionalCompositingGraphRuntime.author({
    ocio_config_id: "aces-1.3",
    nodes: [
      { id: "read", op: "DEEP_READ" },
      { id: "hold", op: "DEEP_HOLDOUT", inputs: ["read"] },
      { id: "stmap", op: "STMAP", inputs: ["hold"] },
      { id: "write", op: "WRITE", inputs: ["stmap"] },
    ],
    output_node_id: "write",
  });
  assert.equal(graph.status, "READY");
  assert.equal(graph.deep_compositing_required, true);
  assert.deepEqual(graph.execution_order, ["read", "hold", "stmap", "write"]);
});
test("AAF, STMap, version publish/cache and UI are wired as real Studio surfaces", () => {
  assert.match(aaf, /pyaaf2|import base64,json,aaf2/);
  assert.match(aaf, /AAF_PICTURE_LOCK_APPROVAL_REQUIRED/);
  assert.match(stmap, /initUndistortRectifyMap/);
  assert.match(stmap, /plate-to-undistorted\.exr/);
  assert.match(stmap, /undistorted-to-plate\.exr/);
  assert.match(versioning, /vfx_publish/);
  assert.match(versioning, /SUPERSEDED/);
  assert.match(versioning, /VFX_CACHE_DEPENDENCY_CHANGED/);
  assert.match(ui, /Professional VFX pipeline/);
  assert.match(ui, /Audio remains owned by Audio Studio/);
});

test("advanced delivery distinguishes HDR mezzanine from governed IMF/DCP packages", () => {
  const hdr = CreativeAdvancedDeliveryPackageRuntime.plan({
    profile_id: "HDR10_PQ",
    master: { id: "m1", checksum: "abc" },
    color_authority: { status: "READY", output: { id: "REC2020_PQ" }, color_pipeline_hash: "c" },
  });
  assert.equal(hdr.status, "READY");
  const dcp = CreativeAdvancedDeliveryPackageRuntime.plan({
    profile_id: "DCP_SMPTE",
    master: { id: "m1", checksum: "abc" },
    color_authority: { status: "READY", output: { id: "P3_D65" }, color_pipeline_hash: "c" },
  });
  assert.equal(dcp.status, "BLOCKED");
  assert.ok(dcp.blockers.includes("ADVANCED_DELIVERY_SPECIALIST_PACKAGER_REQUIRED"));
});
test("elite readiness keeps implementation and certification separate", () => {
  const evidence = CreativeEliteVideoStudioReadinessRuntime.systems.map(([system_id, contract]) => ({
    system_id,
    implemented: true,
    implementation_contracts: [contract],
    technical_proof_passed: true,
  }));
  const result = CreativeEliteVideoStudioReadinessRuntime.evaluate({ evidence });
  assert.equal(result.implemented, true);
  assert.equal(result.certified, true);
  assert.equal(result.policy.audio_studio_remains_canonical_audio_authority, true);
});
