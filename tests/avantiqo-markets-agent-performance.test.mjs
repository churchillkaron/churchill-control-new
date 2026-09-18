import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveAgentReliabilityWeight,
  scoreAgentThesisOutcome,
  summarizeAgentOutcomes,
  thesisProbabilityUp,
} from "../lib/markets/runtime/MarketAgentPerformanceModels.js";

test("thesis probability maps bullish and bearish confidence conservatively", () => {
  assert.equal(thesisProbabilityUp({ stance: "BULLISH", confidence: 0.8 }), 0.9);
  assert.ok(Math.abs(thesisProbabilityUp({ stance: "BEARISH", confidence: 0.8 }) - 0.1) < 1e-12);
  assert.equal(thesisProbabilityUp({ stance: "NEUTRAL", confidence: 0.8 }), 0.5);
});

test("scores specialist thesis against realized market outcome", () => {
  const scored = scoreAgentThesisOutcome({
    thesis: {
      id: "thesis-1",
      symbol: "TEST",
      agent_type: "TECHNICAL",
      stance: "BULLISH",
      confidence: 0.8,
      generated_at: "2026-09-01T00:00:00Z",
    },
    decision: {
      id: "decision-1",
      symbol: "TEST",
      created_at: "2026-09-01T00:00:00Z",
    },
    outcome: {
      decision_id: "decision-1",
      realized_return: 0.05,
      evaluation_time: "2026-09-06T00:00:00Z",
    },
  });

  assert.equal(scored.directional_hit, true);
  assert.ok(scored.squared_error < 0.05);
  assert.equal(scored.signed_return, 0.05);
});

test("small samples remain near neutral reliability weight", () => {
  const weight = deriveAgentReliabilityWeight({
    sample_count: 2,
    directional_hit_rate: 1,
    avg_brier: 0.01,
    avg_signed_return: 0.08,
  });
  assert.ok(weight > 1);
  assert.ok(weight < 1.1);
});

test("strong mature specialist earns more influence but remains bounded", () => {
  const weight = deriveAgentReliabilityWeight({
    sample_count: 60,
    directional_hit_rate: 0.75,
    avg_brier: 0.08,
    avg_signed_return: 0.05,
  });
  assert.ok(weight > 1.3);
  assert.ok(weight <= 1.5);
});

test("weak mature specialist loses influence but remains bounded", () => {
  const weight = deriveAgentReliabilityWeight({
    sample_count: 60,
    directional_hit_rate: 0.25,
    avg_brier: 0.45,
    avg_signed_return: -0.05,
  });
  assert.ok(weight < 0.7);
  assert.ok(weight >= 0.5);
});

test("summarizes agent outcome evidence", () => {
  const summary = summarizeAgentOutcomes([
    { directional_hit: true, squared_error: 0.1, log_loss: 0.2, signed_return: 0.03 },
    { directional_hit: false, squared_error: 0.4, log_loss: 0.8, signed_return: -0.02 },
  ]);
  assert.equal(summary.sample_count, 2);
  assert.equal(summary.directional_tests, 2);
  assert.equal(summary.directional_hit_rate, 0.5);
  assert.ok(Math.abs(summary.avg_brier - 0.25) < 1e-12);
});

test("adaptive reliability changes influence while preserving independent specialist minimum", async () => {
  const { synthesizeMarketDecision } = await import("../lib/markets/runtime/MarketSpecialistModels.js");

  const theses = [
    { agent_type: "TECHNICAL", stance: "BULLISH", confidence: 0.8, expected_return: 0.05 },
    { agent_type: "QUANT", stance: "BEARISH", confidence: 0.8, expected_return: -0.03 },
  ];

  const neutral = synthesizeMarketDecision({
    symbol: "TEST",
    theses,
    agentWeights: {
      TECHNICAL: { weight: 1 },
      QUANT: { weight: 1 },
    },
  });
  const adaptive = synthesizeMarketDecision({
    symbol: "TEST",
    theses,
    agentWeights: {
      TECHNICAL: { weight: 1.5 },
      QUANT: { weight: 0.5 },
    },
  });

  assert.equal(neutral.action, "HOLD");
  assert.ok(adaptive.decision_payload.ensemble_score > neutral.decision_payload.ensemble_score);
  assert.equal(adaptive.decision_payload.agent_reliability_weights.TECHNICAL, 1.5);
  assert.equal(adaptive.decision_payload.agent_reliability_weights.QUANT, 0.5);
  assert.equal(adaptive.decision_payload.authority_effect, "NONE");

  const single = synthesizeMarketDecision({
    symbol: "TEST",
    theses: [theses[0]],
    agentWeights: { TECHNICAL: { weight: 1.5 } },
  });
  assert.equal(single.action, "NO_ACTION");
});
