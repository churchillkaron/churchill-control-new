import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const evidence=fs.readFileSync("lib/creative/music/runtime/CreativeMusicMixEvidenceRuntime.js","utf8");
const engineer=fs.readFileSync("lib/creative/music/runtime/CreativeMusicMixEngineerRuntime.js","utf8");

test("long tracks cannot silently promote capped evidence to whole-track decisions",()=>{
  assert.match(evidence,/required<=MAX_ANALYSIS_SECONDS/);
  assert.match(evidence,/measured:false,reason:"ANALYSIS_RANGE_INCOMPLETE"/);
  assert.match(evidence,/timeline_evidence_safe:false/);
  assert.match(engineer,/TRACK_ANALYSIS_RANGE_INCOMPLETE/);
  assert.match(engineer,/Partial diagnostics are retained/);
});
