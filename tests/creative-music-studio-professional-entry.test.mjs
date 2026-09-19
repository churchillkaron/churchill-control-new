import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const studio = fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicStudioWorkspace.jsx", "utf8");
const auto = fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicAutoStudioPanel.jsx", "utf8");
test("Auto Studio returns uploaded professional sources to the unified release flow", () => {
  assert.match(studio, /onProfessionalReleaseStarted/);
  assert.match(studio, /setProfessionalReleaseRevision/);
  assert.match(studio, /setMode\("home"\)/);
  assert.match(auto, /start_professional_release/);
  assert.doesNotMatch(auto, /action: "execute_local"/);
});
