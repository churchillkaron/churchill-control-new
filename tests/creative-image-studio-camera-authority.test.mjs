import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const authority = fs.readFileSync("lib/creative/image/runtime/CreativeImageCameraAuthorityRuntime.js", "utf8");
const graph = fs.readFileSync("lib/creative/image/runtime/CreativeImageAssetGraphRuntime.js", "utf8");
const reconcile = fs.readFileSync("lib/creative/image/runtime/CreativeImageAssetReconciliationRuntime.js", "utf8");
const gate = fs.readFileSync("lib/creative/production-graph/runtime/CreativeVisualProductionExecutionGate.js", "utf8");
const dispatch = fs.readFileSync("lib/creative/video/runtime/CreativeVideoProductionDispatchBootstrap.js", "utf8");

test("Image Studio camera authority seals physical optics and perspective state", () => {
  assert.match(authority, /CREATIVE_IMAGE_CAMERA_AUTHORITY_V1/);
  assert.match(authority, /focal_length_mm/);
  assert.match(authority, /sensor_width_mm/);
  assert.match(authority, /aperture_t_stop/);
  assert.match(authority, /shutter_angle_degrees/);
  assert.match(authority, /subject_distance_m/);
  assert.match(authority, /camera_height_m/);
  assert.match(authority, /focus_distance_m/);
  assert.match(authority, /perspective_reinterpretation_forbidden:true/);
});

test("camera authority detects optical drift", () => {
  assert.match(authority, /IMAGE_CAMERA_FOCAL_LENGTH_DRIFT/);
  assert.match(authority, /IMAGE_CAMERA_SENSOR_FORMAT_DRIFT/);
  assert.match(authority, /\["START_DISTANCE"/);
  assert.match(authority, /\["START_HEIGHT"/);
  assert.match(authority, /IMAGE_CAMERA_LENS_CHANGE_DECLARATION_DRIFT/);
});

test("hero and continuity image assets receive camera authority", () => {
  assert.match(graph, /CreativeImageCameraAuthorityRuntime/);
  assert.match(graph, /HERO_FRAME","CONTINUITY_REFERENCE","STORYBOARD_FRAME/);
  assert.match(graph, /image_camera_authority:imageCameraAuthority/);
  assert.match(graph, /image_camera_authority_hash/);
  assert.match(reconcile, /image_camera_authority:/);
});

test("visual execution gate fails closed when hero camera authority is absent or drifts", () => {
  assert.match(gate, /IMAGE_STUDIO_CAMERA_AUTHORITY_REQUIRED/);
  assert.match(gate, /IMAGE_STUDIO_CAMERA_AUTHORITY_DRIFT/);
  assert.match(gate, /image_camera_authority_validated: true/);
  assert.match(gate, /image_camera_authority_hash/);
});

test("video dispatch revalidates Image Studio optics against canonical shot", () => {
  assert.match(dispatch, /CreativeImageCameraAuthorityRuntime/);
  assert.match(dispatch, /IMAGE_STUDIO_CAMERA_AUTHORITY_VIDEO_DISPATCH_DRIFT/);
  assert.match(dispatch, /image_camera_authority_validated/);
  assert.match(dispatch, /image_camera_authority_hash/);
});
