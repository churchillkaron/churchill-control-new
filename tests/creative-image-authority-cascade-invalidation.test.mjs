import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const invalidation=fs.readFileSync("lib/creative/image/runtime/CreativeImageAuthorityInvalidationRuntime.js","utf8");
const queue=fs.readFileSync("lib/creative/production/queue/runtime/ProductionQueueRuntime.js","utf8");

test("image authority invalidation detects parent material and foundation staleness",()=>{
  assert.match(invalidation,/PARENT_IMAGE_AUTHORITY_CHANGED/);
  assert.match(invalidation,/MATERIAL_TRUTH_SOURCE_AUTHORITY_CHANGED/);
  assert.match(invalidation,/FOUNDATION_AUTHORITY_CHANGED/);
});

test("stale approved descendants are revoked fail-closed",()=>{
  assert.match(invalidation,/release_approved: false/);
  assert.match(invalidation,/image_multiview_qc_sealed = false|image_multiview_qc_sealed: false/);
  assert.match(invalidation,/image_asset_derivative_qc_sealed = false|image_asset_derivative_qc_sealed: false/);
  assert.match(invalidation,/material_truth_pack_qc_sealed = false|material_truth_pack_qc_sealed: false/);
});

test("downstream non-image work is held when upstream image authority changes",()=>{
  assert.match(invalidation,/status: "WAITING"/);
  assert.match(invalidation,/image_authority_invalidated_upstream: true/);
  assert.match(invalidation,/downstream_release_must_fail_closed: true/);
  assert.match(queue,/CreativeImageAuthorityInvalidationRuntime\.reconcile/);
});
