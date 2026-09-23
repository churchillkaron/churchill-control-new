import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const closing=fs.readFileSync("lib/creative/continuity/runtime/CreativeClosingKeyframeExecutionGate.js","utf8");
const compiler=fs.readFileSync("lib/creative/image/runtime/CreativeImageProviderReferenceCompilerRuntime.js","utf8");

test("closing generation compiles Image Studio and endpoint references together",()=>{
  assert.match(closing,/endpointReferences/);
  assert.match(closing,/source_assets: \[\s*\.\.\.sourceAssets/);
  assert.match(closing,/\.\.\.list\(task\.input\?\.source_assets\)/);
  assert.match(closing,/\.\.\.endpointReferences/);
  assert.match(closing,/CLOSING_KEYFRAME_REFERENCE_TRANSPORT_UNSAFE/);
});

test("closing generation no longer places unbounded endpoint references before compiled authority",()=>{
  assert.match(closing,/reference_images: preparedSourceAssets\.map/);
  assert.match(closing,/source_assets: preparedSourceAssets/);
  assert.match(closing,/closing_keyframe_reference_transport_safe/);
  assert.match(closing,/closing_keyframe_reference_omitted_count/);
});

test("closing review uses generated image plus one bounded compiled authority set",()=>{
  assert.match(closing,/const reviewReferences = CreativeImageProviderReferenceCompilerRuntime\.compile/);
  assert.match(closing,/CLOSING_KEYFRAME_REVIEW_REFERENCE_TRANSPORT_UNSAFE/);
  assert.match(closing,/\.\.\.reviewReferences\.source_assets/);
  assert.match(closing,/closing_keyframe_review_reference_transport_safe/);
});

test("endpoint references have explicit compiler priority before material extras",()=>{
  const endpointIndex=compiler.indexOf("ENDPOINT_OR_IDENTITY_REFERENCE");
  const materialIndex=compiler.indexOf("MATERIAL_RELEVANCE");
  assert.ok(endpointIndex>=0);
  assert.ok(materialIndex>endpointIndex);
});
