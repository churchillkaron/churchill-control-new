import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source=fs.readFileSync("lib/creative/image/runtime/CreativeImageFoundationAuthorityRuntime.js","utf8");

test("foundation fingerprint imports crypto and hashes stable visual lineage",()=>{
  assert.match(source,/import crypto from "node:crypto"/);
  assert.match(source,/stableVisualSeal/);
  assert.match(source,/stable_visual_seal/);
  assert.match(source,/perceptual_qc_sealed/);
});

test("foundation fingerprint does not depend on mutable whole-pack QC seal",()=>{
  const block=source.slice(
    source.indexOf("function stableVisualSeal"),
    source.indexOf("function assetClass"),
  );
  assert.doesNotMatch(block,/image_asset_pack_qc_seal_hash/);
});

test("localized repair lineage participates in stable visual fingerprint",()=>{
  assert.match(source,/localized_repair_review_task_id/);
  assert.match(source,/localized_repair_review_sealed/);
});
