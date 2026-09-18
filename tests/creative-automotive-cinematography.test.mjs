import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  CreativeAutomotiveCinematographyRuntime,
} from "../lib/creative/rendering/runtime/CreativeAutomotiveCinematographyRuntime.js";

const cycles = fs.readFileSync(
  "lib/creative/rendering/runtime/CreativeCyclesProductionRenderRuntime.js",
  "utf8",
);
const environment = fs.readFileSync(
  "lib/creative/rendering/runtime/CreativeEnvironmentAssetBindingRuntime.js",
  "utf8",
);

function plan(overrides = {}) {
  return {
    mode: "STUDIO_HERO",
    reflection_strategy: "HDRI_PLUS_LIGHT_CARDS",
    environment_asset_node_id: "env-1",
    focal_length_mm: 65, sensor_width_mm: 36, t_stop: 4,
    shutter_angle_degrees: 180, focus_distance_m: 7,
    ground_contact_shadow: true, body_line_readability_validated: true,
    highlight_sweep_validated: true,
    reflection_cards: [{ name: "Key Strip" }, { name: "Edge Strip" }],
    ...overrides,
  };
}
test("automotive hero plan requires physical camera and reflection lighting", () => {
  const result = CreativeAutomotiveCinematographyRuntime.author(plan());
  assert.equal(result.status, "READY");
  assert.equal(result.camera.lens, 65);
  assert.equal(result.camera.t_stop, 4);
  assert.equal(result.lights.length, 2);
  assert.equal(result.environment_asset_node_id, "env-1");
});

test("automotive plan fails closed without HDR environment or reflection cards", () => {
  const result = CreativeAutomotiveCinematographyRuntime.author(plan({
    environment_asset_node_id: null, reflection_cards: [],
  }));
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.blockers.includes("AUTOMOTIVE_HDR_ENVIRONMENT_REQUIRED"));
  assert.ok(result.blockers.includes("AUTOMOTIVE_REFLECTION_CARDS_REQUIRED"));
});

test("Cycles executes automotive camera, HDR environment and authored reflection lights", () => {
  assert.match(cycles, /CreativeAutomotiveCinematographyRuntime\.author/);
  assert.match(cycles, /CreativeEnvironmentAssetBindingRuntime\.bind/);
  assert.match(cycles, /ShaderNodeTexEnvironment/);
  assert.match(cycles, /aperture_fstop/);
  assert.match(cycles, /motion_blur_shutter/);
  assert.match(cycles, /automotive_cinematography\?\.rigs/);
});

test("HDR environment binding is restricted to high-dynamic-range production formats", () => {
  assert.match(environment, /"hdr", "exr", "tif", "tiff"/);
  assert.match(environment, /ENVIRONMENT_ASSET_FORMAT_UNSUPPORTED/);
});
