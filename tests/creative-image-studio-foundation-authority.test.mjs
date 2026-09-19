import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const foundation=fs.readFileSync("lib/creative/image/runtime/CreativeImageFoundationAuthorityRuntime.js","utf8");
const queue=fs.readFileSync("lib/creative/production/queue/runtime/ProductionQueueRuntime.js","utf8");

test("shot-level Image Studio assets require selected scene foundations",()=>{
  assert.match(foundation,/CREATIVE_IMAGE_FOUNDATION_AUTHORITY_V1/);
  assert.match(foundation,/IMAGE_FOUNDATION_CHARACTER_AUTHORITY_REQUIRED/);
  assert.match(foundation,/IMAGE_FOUNDATION_THREAT_AUTHORITY_REQUIRED/);
  assert.match(foundation,/IMAGE_FOUNDATION_ENVIRONMENT_AUTHORITY_REQUIRED/);
  assert.match(foundation,/CHARACTER_SHEET/);
  assert.match(foundation,/THREAT_DESIGN/);
  assert.match(foundation,/ENVIRONMENT_LOOKFRAME/);
});

test("foundation binding injects governed source references into shot asset generation",()=>{
  assert.match(foundation,/IMAGE_STUDIO_FOUNDATION_CHARACTER/);
  assert.match(foundation,/IMAGE_STUDIO_FOUNDATION_THREAT/);
  assert.match(foundation,/IMAGE_STUDIO_FOUNDATION_ENVIRONMENT/);
  assert.match(foundation,/reference_images:/);
  assert.match(foundation,/image_foundation_authority_bound:true/);
});

test("production queue holds downstream image generation until foundation assets pass QC",()=>{
  assert.match(queue,/CreativeImageFoundationAuthorityRuntime\.evaluate/);
  assert.match(queue,/IMAGE_STUDIO_FOUNDATION_AUTHORITY_PENDING/);
  assert.match(queue,/retryable: true/);
});

test("foundation authority is rebound immediately before creative task dispatch",()=>{
  const bind=queue.indexOf("CreativeImageFoundationAuthorityRuntime.bind");
  const compile=queue.indexOf("CreativeImageGenerationReferenceCompilerRuntime.bind");
  const route=queue.indexOf("routeCampaignTask(referenceBound)");
  assert.ok(bind>=0);
  assert.ok(compile>bind);
  assert.ok(route>compile);
});
