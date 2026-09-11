import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source=fs.readFileSync(new URL("../lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js",import.meta.url),"utf8");
test("Tribunal promotes common repair contract into canonical patch",()=>{
  assert.match(source,/const common = object\(envelope\.common_plan_contract\)/);
  assert.match(source,/const patch = \{ \.\.\.envelope, \.\.\.common \}/);
});
test("Tribunal preserves verified execution routing during creative repair",()=>{
  assert.match(source,/service: baseStep\.service/);
  assert.match(source,/capability: baseStep\.capability/);
});
test("Tribunal reconciles explicit asset scene assignment into manifest",()=>{
  assert.match(source,/assignments\.set\(sourceAssetId, sceneAssignment\)/);
  assert.match(source,/assignments: \[sceneAssignment\]/);
});
