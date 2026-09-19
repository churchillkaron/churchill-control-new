import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const studio = fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicStudioWorkspace.jsx", "utf8");
const master = fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicMasterStudioPanel.jsx", "utf8");
test("Master tool is presented as saved-master QC while master creation remains in Professional Release", () => {
  assert.match(studio, /label: "Masters & QC"/);
  assert.match(studio, /independently revalidate saved release masters/);
  assert.match(master, /Release masters & QC/);
  assert.match(master, /continue Professional Release to create a governed release master/);
  assert.match(master, /master-validate/);
  assert.match(master, /technical_validation_passed/);
});
