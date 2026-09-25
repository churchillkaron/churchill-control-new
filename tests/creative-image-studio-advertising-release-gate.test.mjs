import test from "node:test";
import assert from "node:assert/strict";
import { buildCreativeImageStudioOperatingState } from "../lib/creative/stills/runtime/CreativeImageStudioOperatingRuntime.js";

test("Image Studio does not call an ad release-ready from status alone", () => {
  const runtime = { assetRuntime:{ items:[{ id:"a", asset_type:"image", status:"APPROVED", metadata:{} }] }, taskRuntime:{ items:[{ id:"r", status:"COMPLETED", title:"quality review" }, { id:"d", status:"COMPLETED", title:"export delivery" }] }, projectRuntime:{ current:{ id:"p" } }, strategyRuntime:{ current:{ id:"s" } } };
  const state = buildCreativeImageStudioOperatingState(runtime);
  assert.equal(state.quality.world_class_reviewed_images, 0);
  assert.equal(state.quality.release_ready, false);
});

test("premium still release requires perceptual seal, explicit release approval and completed independent review", () => {
  const runtime = { assetRuntime:{ items:[{ id:"a", asset_type:"image", status:"APPROVED", metadata:{ image_asset_perceptual_qc_sealed:true, release_approved:true } }] }, taskRuntime:{ items:[{ id:"r", status:"COMPLETED", title:"independent quality review" }, { id:"d", status:"COMPLETED", title:"export delivery" }] }, projectRuntime:{ current:{ id:"p" } }, strategyRuntime:{ current:{ id:"s" } } };
  const state = buildCreativeImageStudioOperatingState(runtime);
  assert.equal(state.quality.world_class_reviewed_images, 1);
  assert.equal(state.quality.release_ready, true);
  assert.equal(state.quality.independent_review_evidence_required, true);
});
