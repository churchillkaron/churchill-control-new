import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluationHorizonDays,
  scorePredictionOutcome,
  targetEvaluationTime,
} from "../lib/markets/runtime/MarketPredictionOutcomeModels.js";

test("medium decisions default to five-day evaluation", () => {
  const decision = {
    horizon: "MEDIUM",
    reference_time: "2026-09-01T00:00:00.000Z",
  };
  assert.equal(evaluationHorizonDays(decision), 5);
  assert.equal(targetEvaluationTime(decision), "2026-09-06T00:00:00.000Z");
});

test("correct confident BUY receives low Brier and log loss", () => {
  const outcome = scorePredictionOutcome({
    decision: {
      symbol: "TEST",
      horizon: "MEDIUM",
      action: "BUY",
      probability_up: 0.9,
      reference_price: 100,
      reference_time: "2026-09-01T00:00:00.000Z",
    },
    observedPrice: 110,
    evaluationTime: "2026-09-06T00:00:00.000Z",
  });

  assert.equal(outcome.directional_hit, true);
  assert.ok(Math.abs(outcome.realized_return - 0.1) < 1e-12);
  assert.ok(Math.abs(outcome.squared_error - 0.01) < 1e-12);
  assert.ok(outcome.log_loss < 0.11);
});

test("wrong confident BUY is penalized heavily", () => {
  const outcome = scorePredictionOutcome({
    decision: {
      symbol: "TEST",
      action: "BUY",
      probability_up: 0.9,
      reference_price: 100,
      reference_time: "2026-09-01T00:00:00.000Z",
    },
    observedPrice: 90,
    evaluationTime: "2026-09-06T00:00:00.000Z",
  });

  assert.equal(outcome.directional_hit, false);
  assert.ok(outcome.squared_error > 0.8);
  assert.ok(outcome.log_loss > 2.3);
});
