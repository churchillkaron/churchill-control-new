import fs from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

const delivery=fs.readFileSync("lib/creative/upscale/runtime/CreativeTemporal4KDeliveryTaskRuntime.js","utf8");
const review=fs.readFileSync("lib/creative/upscale/runtime/CreativeTemporal4KReviewTaskRuntime.js","utf8");
const mastering=fs.readFileSync("lib/creative/post-production/runtime/CreativeGovernedVideoMasteringRuntime.js","utf8");

test("sub-4K master fails closed while temporal upscale capability is uncertified",()=>{
  assert.match(delivery,/CreativeVideoProductionCertificationRuntime\.status\("ai\.video\.upscale"\)/);
  assert.match(delivery,/TEMPORAL_4K_UPSCALE_CAPABILITY_NOT_CERTIFIED/);
  const gateIndex=delivery.indexOf("upscaleCertification");
  const createIndex=delivery.indexOf("ProductionTaskRuntime.create");
  assert.ok(gateIndex>=0&&createIndex>gateIndex);
});

test("existing native 4K master bypasses upscale safely",()=>{
  assert.match(delivery,/if\(is4k\(source_render\)\)return\{contract:CREATIVE_TEMPORAL_4K_DELIVERY_TASK_CONTRACT,status:"READY_4K"/);
});

test("retained 4K review contract uses stronger perceptual thresholds",()=>{
  assert.match(review,/GENERATED_MEDIA_PERCEPTUAL_REVIEW_V1/);
  assert.match(review,/minimum_overall_score:94/);
  assert.match(review,/minimum_continuity_score:96/);
  assert.match(review,/minimum_artifact_score:96/);
});

test("governed mastering blocks final approval until verified 4K exists",()=>{
  assert.match(mastering,/CreativeTemporal4KDeliveryTaskRuntime\.ensure/);
  assert.match(mastering,/if \(delivery\.status !== "READY_4K"\)/);
  assert.match(mastering,/final_4k_verified: false/);
  assert.match(mastering,/final_4k_verified: true/);
  assert.match(mastering,/render: delivery\.delivery_render/);
});
