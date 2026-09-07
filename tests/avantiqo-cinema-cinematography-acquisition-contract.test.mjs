import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const acquisitionRuntime = fs.readFileSync(
  "lib/creative/video/runtime/CreativeCinematographyAcquisitionRuntime.js",
  "utf8",
);
const dispatchBootstrap = fs.readFileSync(
  "lib/creative/video/runtime/CreativeVideoProductionDispatchBootstrap.js",
  "utf8",
);

test("cinematography acquisition is a provider-neutral governed physical shot contract", () => {
  assert.match(acquisitionRuntime, /AVANTIQO_CINEMATOGRAPHY_ACQUISITION_V1/);
  assert.match(acquisitionRuntime, /provider/i);
  assert.match(acquisitionRuntime, /focal_length_mm/);
  assert.match(acquisitionRuntime, /aperture_t_stop/);
  assert.match(acquisitionRuntime, /shutter_angle/);
  assert.match(acquisitionRuntime, /color_temperature_kelvin/);
  assert.match(acquisitionRuntime, /key_fill_ratio/);
  assert.match(acquisitionRuntime, /motion_curve/);
  assert.match(acquisitionRuntime, /movement_acceleration/);
  assert.match(acquisitionRuntime, /start_anchor/);
  assert.match(acquisitionRuntime, /end_anchor/);
});

test("professional camera rigs include aerial and ground cinematography grammar", () => {
  for (const rig of [
    "FPV_DRONE",
    "DRONE",
    "TECHNOCRANE",
    "CRANE_JIB",
    "STEADICAM",
    "GIMBAL",
    "HANDHELD",
    "DOLLY_TRACK",
    "TRIPOD",
  ]) {
    assert.match(acquisitionRuntime, new RegExp(`\\b${rig}\\b`));
  }
});

test("physical acquisition validates plausible optical and lighting ranges fail-closed", () => {
  assert.match(acquisitionRuntime, /CINEMATOGRAPHY_FOCAL_LENGTH_INVALID/);
  assert.match(acquisitionRuntime, /CINEMATOGRAPHY_APERTURE_INVALID/);
  assert.match(acquisitionRuntime, /CINEMATOGRAPHY_SHUTTER_ANGLE_INVALID/);
  assert.match(acquisitionRuntime, /CINEMATOGRAPHY_COLOR_TEMPERATURE_INVALID/);
  assert.match(acquisitionRuntime, /CINEMATOGRAPHY_KEY_FILL_RATIO_INVALID/);
  assert.match(acquisitionRuntime, /status:\s*blockingIssues\.length \? "BLOCKED" : "READY"/);
  assert.match(acquisitionRuntime, /CINEMATOGRAPHY_ACQUISITION_BLOCKED/);
});

test("graphic-only work is exempt from fake physical cinematography", () => {
  assert.match(acquisitionRuntime, /status:\s*"NOT_APPLICABLE"/);
  assert.match(acquisitionRuntime, /applicability:\s*"GRAPHIC_ONLY"/);
  assert.match(acquisitionRuntime, /physical_cinematography_required:\s*false/);
});

test("video dispatch compiles and asserts cinematography before engine routing", () => {
  const acquisitionIndex = dispatchBootstrap.indexOf(
    "CreativeCinematographyAcquisitionRuntime.assert",
  );
  const routeIndex = dispatchBootstrap.indexOf(
    "CreativeVideoEngineRouter.assert",
  );
  assert.ok(acquisitionIndex >= 0, "acquisition assertion must exist");
  assert.ok(routeIndex > acquisitionIndex, "acquisition must precede engine routing");
  assert.match(
    dispatchBootstrap,
    /cinematography_acquisition:\s*cinematographyAcquisition/,
  );
});

test("dispatch persists cinematography evidence without inventing provider knobs", () => {
  assert.match(
    dispatchBootstrap,
    /creative_cinematography_acquisition_contract/,
  );
  assert.match(
    dispatchBootstrap,
    /creative_cinematography_acquisition_evidence/,
  );
  assert.match(dispatchBootstrap, /provider_neutral:\s*true/);
  assert.match(dispatchBootstrap, /provider_knobs_invented:\s*false/);
});
