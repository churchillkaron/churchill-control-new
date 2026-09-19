import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const compiler=fs.readFileSync("lib/creative/image/runtime/CreativeImageGenerationReferenceCompilerRuntime.js","utf8");
const queue=fs.readFileSync("lib/creative/production/queue/runtime/ProductionQueueRuntime.js","utf8");

test("Image Studio generation reserves provider transport for semantic source and mask inputs",()=>{
  assert.match(compiler,/provider_reference_limit:12/);
  assert.match(compiler,/semanticReserved/);
  assert.match(compiler,/12-reserved\.length/);
  assert.match(compiler,/provider_transport_safe/);
});

test("reference priority protects identity and scene foundations first",()=>{
  assert.match(compiler,/IDENTITY_ATLAS\|IDENTITY_ANGLE/);
  assert.match(compiler,/FOUNDATION_CHARACTER/);
  assert.match(compiler,/FOUNDATION_THREAT/);
  assert.match(compiler,/FOUNDATION_ENVIRONMENT/);
  assert.match(compiler,/PRIMARY\|SOURCE_AUTHORITY\|AUTHENTIC_SOURCE/);
});

test("Image Studio image generation never relies on owned-worker silent truncation",()=>{
  assert.match(compiler,/selected_references/);
  assert.match(compiler,/omitted_reference_keys/);
  assert.match(compiler,/IMAGE_STUDIO_GENERATION_REFERENCE_TRANSPORT_UNSAFE/);
});

test("reference compiler runs after foundation binding and before routing",()=>{
  const foundation=queue.indexOf("CreativeImageFoundationAuthorityRuntime.bind");
  const compile=queue.indexOf("CreativeImageGenerationReferenceCompilerRuntime.bind");
  const route=queue.indexOf("routeCampaignTask(referenceBound)");
  assert.ok(foundation>=0);
  assert.ok(compile>foundation);
  assert.ok(route>compile);
});
