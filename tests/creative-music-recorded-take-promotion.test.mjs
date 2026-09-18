import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const route=fs.readFileSync("app/api/creative/music/auto-studio/route.js","utf8");

test("failed capture QC preserves asset but quarantines it from active multitrack",()=>{
  assert.match(route,/function recordedTakePromotionDecision/);
  assert.match(route,/RETAKE_CAPTURE_WARNINGS/);
  assert.match(route,/quarantined_from_active_multitrack/);
  assert.match(route,/multitrack_quarantine_reasons/);
  assert.match(route,/promotion\.promotion_allowed \? await appendRecordedTakeToMultitrack/);
  assert.match(route,/added_to_multitrack: Boolean\(multitrack\)/);
});

test("review-only capture warnings remain human-promotable rather than auto-quarantined",()=>{
  assert.doesNotMatch(route,/RETAKE_CAPTURE_WARNINGS[^\n]*MAINS_HUM/);
  assert.doesNotMatch(route,/RETAKE_CAPTURE_WARNINGS[^\n]*CHANNEL_IMBALANCE/);
});
