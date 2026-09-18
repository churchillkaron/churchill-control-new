import assert from "node:assert/strict";
import test from "node:test";

import { classifyMarketRegime } from "../lib/markets/runtime/MarketRegimeModels.js";

function barsFromCloses(closes) {
  return closes.map((close, index) => ({
    bar_time: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
    close,
  }));
}

test("regime classifier fails neutral with insufficient evidence", () => {
  const result = classifyMarketRegime({
    bars: barsFromCloses(Array.from({ length: 30 }, (_, index) => 100 + index)),
  });

  assert.equal(result.regime, "INSUFFICIENT_EVIDENCE");
  assert.equal(result.sizing_scale, 1);
});

test("persistent rising benchmark classifies risk-on", () => {
  const closes = Array.from({ length: 90 }, (_, index) => 100 + (index * 0.6));
  const result = classifyMarketRegime({ bars: barsFromCloses(closes) });

  assert.equal(result.regime, "RISK_ON");
  assert.equal(result.sizing_scale, 1);
  assert.ok(result.specialist_weight_multipliers.TECHNICAL > 1);
});

test("persistent falling benchmark classifies risk-off", () => {
  const closes = Array.from({ length: 90 }, (_, index) => 160 - (index * 0.2));
  const result = classifyMarketRegime({ bars: barsFromCloses(closes) });

  assert.equal(result.regime, "RISK_OFF");
  assert.ok(result.sizing_scale < 1);
  assert.ok(result.specialist_weight_multipliers.NEWS > 1);
});

test("volatile selloff classifies high-volatility risk-off", () => {
  const closes = [];
  let price = 150;
  for (let index = 0; index < 90; index += 1) {
    const shock = index > 60
      ? (index % 2 === 0 ? -0.05 : 0.025)
      : 0.001;
    price *= 1 + shock;
    closes.push(price);
  }
  const result = classifyMarketRegime({ bars: barsFromCloses(closes) });

  assert.equal(result.regime, "HIGH_VOL_RISK_OFF");
  assert.equal(result.sizing_scale, 0.5);
  assert.ok(result.specialist_weight_multipliers.NEWS > 1);
});
