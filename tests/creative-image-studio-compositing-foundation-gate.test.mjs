import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source=fs.readFileSync("lib/creative/compositing/runtime/CreativeLayeredCompositingRenderRuntime.js","utf8");

test("compositing evaluates current Image Studio foundation authority",()=>{
  assert.match(source,/CreativeImageFoundationAuthorityRuntime/);
  assert.match(source,/foundationAuthority = CreativeImageFoundationAuthorityRuntime\.evaluate/);
  assert.match(source,/force: true/);
});

test("foundation-bound Image Studio layers require release perceptual and pack QC",()=>{
  assert.match(source,/COMPOSITING_IMAGE_STUDIO_RELEASE_APPROVAL_REQUIRED/);
  assert.match(source,/COMPOSITING_IMAGE_STUDIO_PERCEPTUAL_QC_REQUIRED/);
  assert.match(source,/COMPOSITING_IMAGE_STUDIO_PACK_QC_REQUIRED/);
});

test("compositing rejects stale Image Studio shot assets",()=>{
  assert.match(source,/COMPOSITING_IMAGE_STUDIO_FOUNDATION_AUTHORITY_REQUIRED/);
  assert.match(source,/COMPOSITING_IMAGE_STUDIO_FOUNDATION_STALE/);
  assert.match(source,/image_foundation_authority_digest/);
});
