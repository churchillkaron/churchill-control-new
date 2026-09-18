import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route=fs.readFileSync("app/api/creative/music/mix-engineer/route.js","utf8");
const evidence=fs.readFileSync("lib/creative/music/runtime/CreativeMusicMixEvidenceRuntime.js","utf8");
const engineer=fs.readFileSync("lib/creative/music/runtime/CreativeMusicMixEngineerRuntime.js","utf8");

test("Mix Engineer validates neutral evidence technical integrity before reuse",()=>{
  assert.match(route,/evidenceRenderRejection/);
  assert.match(route,/TRACK_EVIDENCE_RENDER_CLIPPING/);
  assert.match(route,/TRACK_EVIDENCE_RENDER_FORMAT_INVALID/);
  assert.match(route,/TRACK_EVIDENCE_RENDER_LEVEL_EVIDENCE_INVALID/);
  assert.match(route,/TRACK_EVIDENCE_RENDER_DURATION_INCOMPLETE/);
  assert.match(route,/render_duration_seconds/);
  assert.match(route,/sample_rate/);
  assert.match(route,/channels/);
  assert.match(route,/bit_depth/);
  assert.match(route,/peak_dbfs/);
  assert.match(route,/rms_dbfs/);
});

test("invalid evidence reason reaches analysis instead of degrading to generic missing render",()=>{
  assert.match(route,/track_render_rejections/);
  assert.match(evidence,/track_render_rejections/);
  assert.match(evidence,/invalid_evidence_render_count/);
  assert.match(evidence,/blocked_evidence_track_count/);
  assert.match(engineer,/complete technically valid neutral evidence/);
});
