import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const inspect = fs.readFileSync(new URL("../lib/creative/production/capabilities/inspectCreativeProduction.js", import.meta.url), "utf8");
const run = fs.readFileSync(new URL("../lib/creative/production/capabilities/runCreativeProduction.js", import.meta.url), "utf8");

test("Creative production inspection returns canonical media artifacts for Business Partner preview", () => {
  assert.match(inspect, /CreativeAssetsRuntime/);
  assert.match(inspect, /artifacts: presentationArtifacts\(assets\)/);
  assert.match(inspect, /creative_project_id: resolved\.project\.id/);
  assert.match(inspect, /slice\(0, 24\)/);
});

test("Run Production returns created project assets without granting publish authority", () => {
  assert.match(run, /CreativeAssetsRuntime/);
  assert.match(run, /artifacts: presentationArtifacts\(assets\)/);
  assert.match(run, /publish_authorized: false/);
  assert.match(run, /operatorRequiresConfirmation: true/);
});
