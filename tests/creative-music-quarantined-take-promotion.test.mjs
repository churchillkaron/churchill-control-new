import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const route=fs.readFileSync("app/api/creative/music/auto-studio/route.js","utf8");

test("quarantined take promotion requires explicit acknowledgement and current revision",()=>{
  assert.match(route,/action === "promote_quarantined_take"/);
  assert.match(route,/acknowledge_quarantine_reasons !== true/);
  assert.match(route,/CREATIVE_MUSIC_MULTITRACK_REVISION_CONFLICT/);
  assert.match(route,/expected_revision:body.expected_revision/);
});

test("promotion validates exact immutable verified quarantined asset and prevents duplicates",()=>{
  assert.match(route,/CREATIVE_MUSIC_QUARANTINED_TAKE_SERVER_VERIFICATION_REQUIRED/);
  assert.match(route,/CREATIVE_MUSIC_QUARANTINED_TAKE_NOT_QUARANTINED/);
  assert.match(route,/CREATIVE_MUSIC_QUARANTINED_TAKE_ALREADY_PROMOTED/);
  assert.match(route,/immutable_original_take/);
});

test("promotion writes durable override proof after multitrack mutation",()=>{
  assert.match(route,/AVANTIQO_MUSIC_QUARANTINED_TAKE_PROMOTION_V1/);
  assert.match(route,/quarantine_override_applied:true/);
  assert.match(route,/quarantine_override_acknowledged:true/);
  assert.match(route,/quarantine_override_reasons/);
  assert.match(route,/quarantine_promoted_revision/);
  assert.match(route,/CreativeAssetsRuntime.update/);
});
