import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const readiness=fs.readFileSync("lib/creative/image/runtime/CreativeImageStudioCapabilityReadinessRuntime.js","utf8");
const queue=fs.readFileSync("lib/creative/production/queue/runtime/ProductionQueueRuntime.js","utf8");
const identity=fs.readFileSync("lib/creative/identity/runtime/CreativeIdentityKeyframeGraphRuntime.js","utf8");
const continuation=fs.readFileSync("lib/creative/continuity/runtime/CreativeShotContinuationGraphRuntime.js","utf8");
const closing=fs.readFileSync("lib/creative/continuity/runtime/CreativeClosingKeyframeExecutionGate.js","utf8");

test("Image Studio owned capabilities fail closed before dispatch",()=>{
  assert.match(readiness,/avantiqo-image/);
  assert.match(readiness,/IMAGE_PROVIDER_RUNTIME_UNAVAILABLE/);
  assert.match(readiness,/IMAGE_CAPABILITY_NOT_CERTIFIED/);
  assert.match(readiness,/IMAGE_EXTERNAL_FALLBACK_MUST_BE_DISABLED/);
  assert.match(queue,/IMAGE_STUDIO_CAPABILITY_NOT_READY/);
});

test("legacy identity keyframe is suppressed when Image Studio is upstream authority",()=>{
  assert.match(identity,/image_studio_is_upstream_asset_authority/);
  assert.match(identity,/legacy_identity_keyframe_generation_suppressed/);
  assert.match(identity,/image_studio_identity_authority_required/);
  assert.doesNotMatch(identity,/provider: contract\.provider \|\| "openai"/);
});

test("closing keyframe planning is provider-neutral",()=>{
  assert.match(continuation,/image_studio_closing_authority_required/);
  assert.doesNotMatch(continuation,/provider: "openai"/);
  assert.doesNotMatch(continuation,/provider: "avantiqo-image"/);
});

test("closing keyframe binds current Image Studio package",()=>{
  assert.match(closing,/CreativeImageProductionPackageRuntime/);
  assert.match(closing,/CLOSING_KEYFRAME_IMAGE_STUDIO_PACKAGE_BLOCKED/);
  assert.match(closing,/image_studio_closing_package_digest/);
  assert.match(closing,/CreativeImageProviderReferenceCompilerRuntime/);
  assert.match(queue,/IMAGE_STUDIO_CLOSING_PACKAGE_PENDING/);
});
