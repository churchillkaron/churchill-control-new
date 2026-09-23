import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const multiview = fs.readFileSync("lib/creative/image/runtime/CreativeImageAssetMultiViewRuntime.js", "utf8");
const handoff = fs.readFileSync("lib/creative/image/runtime/CreativeImageAssetMultiViewHandoffRuntime.js", "utf8");
const queue = fs.readFileSync("lib/creative/production/queue/runtime/ProductionQueueRuntime.js", "utf8");
const gate = fs.readFileSync("lib/creative/production-graph/runtime/CreativeVisualProductionExecutionGate.js", "utf8");

test("multiview generation creates rigid production views", () => {
  assert.match(multiview, /FRONT/);
  assert.match(multiview, /LEFT_THREE_QUARTER/);
  assert.match(multiview, /RIGHT_PROFILE/);
  assert.match(multiview, /REAR/);
  assert.match(multiview, /DETAIL/);
  assert.match(multiview, /Change only viewpoint\/framing needed to reveal the requested side/);
  assert.match(multiview, /preserve exact facial geometry/);
  assert.match(multiview, /preserve exact dimensions, silhouette, panel layout/);
});

test("cross-view QC rejects approximate likeness and invented rear geometry", () => {
  assert.match(multiview, /multiview_consistency_score >= 96/);
  assert.match(multiview, /identity_geometry_score >= 97/);
  assert.match(multiview, /Reject approximate likeness/);
  assert.match(multiview, /invented rear\/detail geometry/);
});

test("multi-view handoff is fail-closed on QC seal and stale parent lineage", () => {
  assert.match(handoff, /image_multiview_qc_sealed===true/);
  assert.match(handoff, /complete:Boolean\(parent\)&&required.every\(Boolean\)/);
  assert.match(handoff, /parent_version_fingerprint/);
  assert.match(handoff, /stale_view_count/);
  assert.match(handoff, /stableParentVersion/);
});

test("production queue executes multiview lifecycle", () => {
  assert.match(queue, /CreativeImageAssetMultiViewRuntime/);
  assert.match(queue, /imageMultiViews/);
  assert.match(queue, /imageMultiViewReviews/);
  assert.match(queue, /imageMultiViewQc/);
});

test("video dispatch requires human and threat multiview authority", () => {
  assert.match(gate, /IMAGE_STUDIO_CHARACTER_MULTIVIEW_AUTHORITY_REQUIRED/);
  assert.match(gate, /IMAGE_STUDIO_THREAT_MULTIVIEW_AUTHORITY_REQUIRED/);
  assert.match(gate, /character_multiview_authority_bound/);
  assert.match(gate, /threat_multiview_authority_bound/);
  assert.match(gate, /IMAGE_STUDIO_CHARACTER_\$\{text/);
  assert.match(gate, /IMAGE_STUDIO_THREAT_\$\{text/);
});
