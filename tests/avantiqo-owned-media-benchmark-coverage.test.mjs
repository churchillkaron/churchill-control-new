import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const suite = fs.readFileSync(
  path.join(root, "scripts/benchmark-avantiqo-owned-engines.mjs"),
  "utf8",
);

test("owned media benchmark suite distinguishes implemented from measured capability coverage", () => {
  assert.match(suite, /AVANTIQO_OWNED_ENGINE_CERTIFICATION_SUITE_V2/);
  assert.match(suite, /implemented_capabilities/);
  assert.match(suite, /measured_capabilities/);
  assert.match(suite, /unmeasured_capabilities/);
  assert.match(suite, /full_capability_coverage/);
  assert.match(suite, /MEASURED_PARTIAL_CAPABILITY_COVERAGE/);
  assert.match(suite, /UNMEASURED_CAPABILITIES:/);
  assert.match(suite, /full_capability_coverage_required:true/);
  assert.match(suite, /activation_allowed:false/);
  assert.match(suite, /automatic_activation_forbidden:true/);
});

test("Image benchmark truth is six implemented but generation-only measured until advanced campaign runs", () => {
  for (const capability of [
    "ai.image.generate",
    "ai.image.edit",
    "ai.image.inpaint",
    "ai.image.outpaint",
    "ai.image.upscale",
    "ai.image.analyze",
  ]) {
    assert.match(suite, new RegExp(capability.replaceAll(".", "\\.")));
  }
  assert.match(suite, /id:"image"[\s\S]*?implemented_capabilities:IMAGE_IMPLEMENTED[\s\S]*?measured_capabilities:\["ai\.image\.generate"\]/);
});

test("Cinema benchmark truth is nine implemented but only T2V and I2V measured until advanced campaign runs", () => {
  for (const capability of [
    "ai.video.generate",
    "ai.video.image_to_video",
    "ai.video.first_last_frame_to_video",
    "ai.video.video_to_video",
    "ai.video.edit",
    "ai.video.inpaint",
    "ai.video.extend",
    "ai.video.upscale",
    "ai.video.lipsync",
  ]) {
    assert.match(suite, new RegExp(capability.replaceAll(".", "\\.")));
  }
  assert.match(suite, /id:"cinema"[\s\S]*?implemented_capabilities:CINEMA_IMPLEMENTED[\s\S]*?measured_capabilities:\["ai\.video\.generate","ai\.video\.image_to_video"\]/);
});
