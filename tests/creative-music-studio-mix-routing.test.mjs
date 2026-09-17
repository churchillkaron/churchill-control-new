import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const studio = fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicStudioWorkspace.jsx", "utf8");
test("Mix uses the canonical multitrack Workstation instead of the legacy single-file Auto Studio chain", () => {
  assert.match(studio, /id: "mix", label: "Mix"/);
  assert.match(studio, /mode === "mix" \? <MusicUnifiedWorkstationShell/);
  assert.doesNotMatch(studio, /mode === "mix" \? <MusicSpecialistStudioPanel/);
  assert.match(studio, /onProfessionalReleaseAdvanced/);
});
