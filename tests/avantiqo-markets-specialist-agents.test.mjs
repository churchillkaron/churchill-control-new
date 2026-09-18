import assert from "node:assert/strict";
import test from "node:test";

import {
  buildNewsThesis,
  buildQuantThesis,
  buildTechnicalThesis,
  probabilityUpFromDecision,
  synthesizeMarketDecision,
} from "../lib/markets/runtime/MarketSpecialistModels.js";

function bars(count = 40, start = 100, step = 0.6) {
  return Array.from({ length: count }, (_, index) => ({
    bar_time: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
    close: start + (step * index),
  }));
}

test("technical and quant agents form bounded theses from sufficient bars", () => {
  const rows = bars();
  const technical = buildTechnicalThesis({ symbol: "TEST", bars: rows });
  const quant = buildQuantThesis({ symbol: "TEST", bars: rows });

  assert.equal(technical.agent_type, "TECHNICAL");
  assert.equal(technical.stance, "BULLISH");
  assert.ok(technical.confidence > 0 && technical.confidence <= 0.9);

  assert.equal(quant.agent_type, "QUANT");
  assert.notEqual(quant.stance, "INSUFFICIENT_EVIDENCE");
  assert.ok(quant.confidence > 0 && quant.confidence <= 0.85);
});

test("news agent refuses stance without governed sentiment", () => {
  const thesis = buildNewsThesis({
    symbol: "TEST",
    evidence: [{ evidence_type: "NEWS", symbol: "TEST", sentiment: null }],
  });
  assert.equal(thesis.stance, "INSUFFICIENT_EVIDENCE");
  assert.equal(thesis.confidence, 0);
});

test("ensemble requires two independent usable specialists", () => {
  const decision = synthesizeMarketDecision({
    symbol: "TEST",
    theses: [
      { agent_type: "TECHNICAL", stance: "BULLISH", confidence: 0.8 },
      { agent_type: "NEWS", stance: "INSUFFICIENT_EVIDENCE", confidence: 0 },
    ],
  });
  assert.equal(decision.action, "NO_ACTION");
  assert.equal(decision.confidence, 0);
});

test("ensemble produces governed action from two aligned specialists", () => {
  const decision = synthesizeMarketDecision({
    symbol: "TEST",
    theses: [
      { agent_type: "TECHNICAL", stance: "BULLISH", confidence: 0.82, expected_return: 0.06 },
      { agent_type: "QUANT", stance: "BULLISH", confidence: 0.74, expected_return: 0.04, downside_risk: 0.08 },
    ],
  });
  assert.equal(decision.action, "BUY");
  assert.ok(decision.confidence > 0);
  assert.ok(decision.confidence <= 0.95);
});

test("decision confidence converts to bounded upward probability", () => {
  assert.equal(probabilityUpFromDecision({ action: "BUY", confidence: 0.8 }), 0.9);
  assert.ok(Math.abs(probabilityUpFromDecision({ action: "SELL", confidence: 0.8 }) - 0.1) < 1e-12);
  assert.equal(probabilityUpFromDecision({ action: "HOLD", confidence: 0.9 }), 0.5);
});
