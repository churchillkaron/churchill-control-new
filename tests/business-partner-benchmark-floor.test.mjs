import assert from "node:assert/strict";
import test from "node:test";

import {
  BUSINESS_PARTNER_QUALITY_DIMENSIONS,
  BUSINESS_PARTNER_REFERENCE_FAMILIES,
  businessPartnerBenchmarkFloorPolicy,
  evaluateBusinessPartnerBenchmarkFloor,
} from "../lib/intelligence/runtime/AvantiqoBusinessPartnerBenchmarkFloorRuntime.mjs";

function scores(value) {
  return Object.fromEntries(
    BUSINESS_PARTNER_QUALITY_DIMENSIONS.map((dimension) => [dimension, value]),
  );
}

test("ChatGPT Claude and Gemini are all immutable Business Partner reference families", () => {
  assert.deepEqual(BUSINESS_PARTNER_REFERENCE_FAMILIES, [
    "chatgpt",
    "claude",
    "gemini",
  ]);
  const policy = businessPartnerBenchmarkFloorPolicy();
  assert.equal(policy.immutable_floor, true);
  assert.equal(policy.regression_policy, "BLOCK_RELEASE");
  assert.equal(
    policy.benchmark_execution_policy.external_reference_execution_automatic,
    false,
  );
  assert.equal(
    policy.benchmark_execution_policy.explicit_authorization_required,
    true,
  );
});

test("candidate cannot hide a weak dimension behind a high aggregate score", () => {
  const references = {
    chatgpt: scores(0.91),
    claude: scores(0.92),
    gemini: scores(0.9),
  };
  const candidate = scores(0.97);
  candidate.contextual_continuity = 0.91;

  const result = evaluateBusinessPartnerBenchmarkFloor({
    candidate,
    references,
    evidenceFresh: true,
    matchedConditions: true,
  });

  assert.equal(result.release_eligible, false);
  assert.equal(result.status, "BELOW_FLOOR");
  assert.deepEqual(result.regressions.map((item) => item.dimension), [
    "contextual_continuity",
  ]);
  assert.equal(result.floor_scores.contextual_continuity, 0.92);
});

test("candidate must meet the strongest measured reference on every dimension", () => {
  const references = {
    chatgpt: scores(0.91),
    claude: scores(0.92),
    gemini: scores(0.9),
  };
  const candidate = scores(0.92);

  const result = evaluateBusinessPartnerBenchmarkFloor({
    candidate,
    references,
    evidenceFresh: true,
    matchedConditions: true,
  });

  assert.equal(result.release_eligible, true);
  assert.equal(result.status, "CERTIFIED");
  assert.equal(result.regressions.length, 0);
});

test("missing stale or unmatched external benchmark evidence never certifies", () => {
  const complete = {
    chatgpt: scores(0.9),
    claude: scores(0.9),
    gemini: scores(0.9),
  };
  assert.equal(
    evaluateBusinessPartnerBenchmarkFloor({
      candidate: scores(1),
      references: {},
      evidenceFresh: true,
      matchedConditions: true,
    }).release_eligible,
    false,
  );
  assert.equal(
    evaluateBusinessPartnerBenchmarkFloor({
      candidate: scores(1),
      references: complete,
      evidenceFresh: false,
      matchedConditions: true,
    }).release_eligible,
    false,
  );
  assert.equal(
    evaluateBusinessPartnerBenchmarkFloor({
      candidate: scores(1),
      references: complete,
      evidenceFresh: true,
      matchedConditions: false,
    }).release_eligible,
    false,
  );
});
