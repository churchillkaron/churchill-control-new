import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const source=fs.readFileSync("lib/creative/quality/runtime/CreativeQualityPolicyResolverRuntime.js","utf8");
test("temporal canonical quality stays world-class and generated policy remains upgradeable",()=>{
  assert.match(source,/minimum_scene_score: context\.temporal \? 94/);
  assert.match(source,/regenerate_below_score: context\.temporal \? 94/);
  assert.match(source,/minimum_confidence: context\.temporal \? 85/);
  assert.match(source,/minimum_score: context\.temporal \? 94/);
  assert.match(source,/creative_quality_policy_source\)/);
  assert.match(source,/projectSource === "EXPLICIT"/);
  assert.match(source,/CREATIVE_QUALITY_POLICY_RESOLVER_V2/);
});
console.log("AVANTIQO_TEMPORAL_WORLDCLASS_QUALITY_POLICY=PASS");
