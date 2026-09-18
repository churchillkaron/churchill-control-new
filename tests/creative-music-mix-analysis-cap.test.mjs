import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const evidence=fs.readFileSync("lib/creative/music/runtime/CreativeMusicMixEvidenceRuntime.js","utf8");
const engineer=fs.readFileSync("lib/creative/music/runtime/CreativeMusicMixEngineerRuntime.js","utf8");

test("long tracks are fully analyzed in bounded chunks rather than blocked or partially promoted",()=>{
  assert.match(evidence,/chunkCount=Math.max\(1,Math.ceil\(range\.required_seconds\/MAX_ANALYSIS_SECONDS\)\)/);
  assert.match(evidence,/analysis_chunk_count:chunkCount/);
  assert.match(evidence,/analysis_complete:true/);
  assert.match(evidence,/analysis_coverage_ratio:1/);
  assert.doesNotMatch(evidence,/ANALYSIS_RANGE_INCOMPLETE/);
  assert.doesNotMatch(engineer,/TRACK_ANALYSIS_RANGE_INCOMPLETE/);
});
