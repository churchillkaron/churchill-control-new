import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const panel = readFileSync("components/creative/ProductionStudio/workspaces/MusicReleaseRenderPanel.jsx", "utf8");

test("professional workstation render registers pre-master and stops before normal finishing", () => {
  assert.match(panel, /professionalRequest\(\{ action: "status"/);
  assert.match(panel, /authorized_stage: "MIX_ENGINEERING"/);
  assert.match(panel, /mix_asset_id: registered\.asset_id/);
  assert.match(panel, /PRE-MASTER REGISTERED · QC NEXT/);
  assert.match(panel, /if \(professionalRelease\?\.active\)[\s\S]*?else \{[\s\S]*?action: "finish"/);
});

test("professional workstation is locked outside the mix engineering stage", () => {
  assert.match(panel, /professionalLocked = professionalRelease\?\.active === true && !professionalMixStage/);
  assert.match(panel, /release_render_ready === true && !professionalLocked/);
  assert.match(panel, /Professional Release is at/);
});
