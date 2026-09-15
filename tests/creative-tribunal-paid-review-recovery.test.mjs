import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  new URL("../lib/creative/director/runtime/CreativeWorkflowResolutionRuntime.js", import.meta.url),
  "utf8",
);

test("workflow recovers paid Tribunal panel and reviews from usage receipts", () => {
  assert.match(source, /recoverSettledTribunalResume/);
  assert.match(source, /paid_tribunal_approval/);
  assert.match(source, /UsageRuntime\.get\(entry\.usage_id\)/);
  assert.match(source, /normalizedTribunalUsageOutput/);
  assert.match(source, /reviewContextSnapshot/);
  assert.match(source, /reviewEvidenceHash/);
  assert.match(source, /recoveredTribunalResume/);
});


test('recovered tribunal plans are grounded and still-normalized before review reuse', () => {
  assert.match(source, /function normalizeRecoveredTribunalPlan/);
  assert.match(source, /CreativeExactClaimAuthorityRuntime\.ground\(\{ plan, mission \}\)/);
  assert.match(source, /CreativeStillPlanNormalizationRuntime\.normalize/);
  assert.match(source, /let replayPlan = normalizeRecoveredTribunalPlan\(master\.plan, context\.mission\)/);
  assert.match(source, /replayPlan = normalizeRecoveredTribunalPlan\(replay\.plan, context\.mission\)/);
});
