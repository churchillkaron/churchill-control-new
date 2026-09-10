import assert from "node:assert/strict";
import test from "node:test";

import { CreativeVirtualCameraStateRuntime } from "../lib/creative/quality/runtime/CreativeVirtualCameraStateRuntime.js";

function shot(overrides = {}) {
  return {
    camera: { framing: "medium-wide", movement_path: "slow lateral track", lens_intent: "natural perspective with restrained compression" },
    virtual_camera_state: {
      start: { focal_length_mm: 50, subject_distance_m: 18, camera_height_m: 2.2, roll_degrees: 0 },
      end: { focal_length_mm: 50, subject_distance_m: 14, camera_height_m: 2.2, roll_degrees: 0 },
      zoom_or_lens_change_declared: false,
      focus_behavior: "Focus remains locked to the helicopter fuselage as distance closes gradually.",
      perspective_intent: "Natural medium-telephoto compression preserves scale between aircraft and platform.",
    },
    ...overrides,
  };
}

test("measurable coherent virtual-camera state passes", () => {
  assert.equal(CreativeVirtualCameraStateRuntime.evaluate(shot()).passed, true);
});

test("undeclared focal-length jump is rejected", () => {
  const candidate = shot();
  candidate.virtual_camera_state.end.focal_length_mm = 135;
  const result = CreativeVirtualCameraStateRuntime.evaluate(candidate);
  assert.equal(result.passed, false);
  assert.ok(result.failures.includes("SHOT_VIRTUAL_CAMERA_UNDECLARED_FOCAL_CHANGE"));
});
