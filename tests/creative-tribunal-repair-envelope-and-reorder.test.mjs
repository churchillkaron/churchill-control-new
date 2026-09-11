import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { mergeCreativeRepairedPlan } from "../lib/creative/director/runtime/mergeCreativeRepairedPlan.js";

test("full structural repair can explicitly reorder scenes", () => {
  const base={scenes:[{id:"a",title:"A"},{id:"b",title:"B"},{id:"c",title:"C"}]};
  const repaired=mergeCreativeRepairedPlan(base,{scenes:[{id:"a"},{id:"c",title:"C2"},{id:"b"}]});
  assert.deepEqual(repaired.scenes.map((s)=>s.id),["a","c","b"]);
  assert.equal(repaired.scenes[1].title,"C2");
  assert.equal(repaired.scenes[2].title,"B");
});

test("Tribunal unwraps plan repair envelope before merge", () => {
  const source=fs.readFileSync(new URL("../lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js",import.meta.url),"utf8");
  assert.match(source,/normalizedRepairPatch\(repair\.output, plan\)/);
});
