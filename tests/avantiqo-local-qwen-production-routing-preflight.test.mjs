import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const source=fs.readFileSync("scripts/preflight-avantiqo-local-qwen4b-production-routing.mjs","utf8");
test("local Qwen activation requires current-head evidence and exact deployed SHA",()=>{
  assert.match(source,/AVANTIQO_LOCAL_QWEN4B_PRODUCTION_ROUTING_PREFLIGHT_V1/);
  assert.match(source,/"ai\.text\.generate": 1/);
  assert.match(source,/"ai\.reasoning\.execute": 3/);
  assert.match(source,/AVANTIQO_DEPLOYED_PRODUCTION_SHA/);
  assert.match(source,/AVANTIQO_LOCAL_QWEN_PRODUCTION_ROUTING_APPROVED/);
  assert.match(source,/deploymentMatches/);
  assert.match(source,/production_routing_allowed: true/);
  assert.match(source,/certification_repository_head: head/);
  assert.match(source,/deep_lane_local_forbidden: true/);
});
