import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const preflight = fs.readFileSync(new URL("../scripts/preflight-avantiqo-music-edit-modal-certification-local.mjs", import.meta.url), "utf8");

test("Music edit Modal certification preflight is zero-spend and non-activating", () => {
  assert.match(preflight, /AVANTIQO_MUSIC_EDIT_MODAL_CERTIFICATION_PREFLIGHT_V1/);
  assert.match(preflight, /provider_jobs_submitted: 0/);
  assert.match(preflight, /gpu_inference_performed: false/);
  assert.match(preflight, /production_activation_performed: false/);
  assert.match(preflight, /pricing_activation_performed: false/);
  assert.match(preflight, /provider_selection_changed: false/);
  assert.match(preflight, /production_deploy_performed: false/);
  assert.doesNotMatch(preflight, /executeService\(/);
  assert.doesNotMatch(preflight, /\.spawn\(/);
  assert.doesNotMatch(preflight, /\.remote\(/);
});
