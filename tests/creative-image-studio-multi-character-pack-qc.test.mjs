import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source=fs.readFileSync("lib/creative/image/runtime/CreativeImageAssetPackConsistencyRuntime.js","utf8");

test("pack QC maps assets to governed character identities",()=>{
  assert.match(source,/Identity-aware asset map/);
  assert.match(source,/Distinct governed identity keys/);
  assert.match(source,/subject_identity_key/);
  assert.match(source,/identity_profile_id/);
});

test("pack QC preserves separation between different people",()=>{
  assert.match(source,/identity_separation_valid/);
  assert.match(source,/different non-empty subject_identity_key/);
  assert.match(source,/MUST NOT be forced toward one averaged face/);
  assert.match(source,/collapse toward the same synthetic person/);
});

test("pack QC checks continuity independently per identity",()=>{
  assert.match(source,/identity_consistency_by_key/);
  assert.match(source,/Object\.values\(object\(result\.identity_consistency_by_key\)\)/);
  assert.match(source,/score===null\|\|score<96/);
});
