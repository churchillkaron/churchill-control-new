import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const gate = fs.readFileSync("lib/creative/production-graph/runtime/CreativeVisualProductionExecutionGate.js", "utf8");
const handoff = fs.readFileSync("lib/creative/image/runtime/CreativeImageAssetHandoffRuntime.js", "utf8");

test("all governed video generation requires Image Studio authority", () => {
  assert.match(gate, /imageStudioAuthorityRequired/);
  assert.match(gate, /"ai\.video\.generate"/);
  assert.match(gate, /"ai\.video\.image_to_video"/);
  assert.match(gate, /"ai\.video\.first_last_frame_to_video"/);
  assert.match(gate, /IMAGE_STUDIO_CONTINUITY_GROUP_REQUIRED/);
});

test("motion binds selected hero frame and continuity reference", () => {
  assert.match(gate, /IMAGE_STUDIO_APPROVED_HERO_FRAME_REQUIRED/);
  assert.match(gate, /IMAGE_STUDIO_CONTINUITY_REFERENCE_REQUIRED/);
  assert.match(gate, /IMAGE_STUDIO_SELECTED_HERO_FRAME/);
  assert.match(gate, /IMAGE_STUDIO_CONTINUITY_REFERENCE/);
  assert.match(gate, /IMAGE_STUDIO_PACK_AUTHORITY/);
});

test("Image Studio handoff remains fail-closed on pack and art-direction selection", () => {
  assert.match(handoff, /image_asset_pack_qc_sealed!==true/);
  assert.match(handoff, /image_asset_exploration_selected!==true/);
});

test("Image Studio authority is applied immediately before video dispatch", () => {
  const bind = gate.indexOf("bindApprovedImageStudioAuthority");
  const dispatch = gate.lastIndexOf("dispatchWithoutVisualProductionGate");
  assert.ok(bind >= 0);
  assert.ok(dispatch > bind);
});
