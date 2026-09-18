import assert from "node:assert/strict";
import test from "node:test";

import { evaluatePaperTradeRisk } from "../lib/markets/runtime/MarketRiskPolicyRuntime.js";

test("approves bounded paper trade", () => {
  const result = evaluatePaperTradeRisk({
    policy: {
      max_position_pct: 10,
      max_daily_loss_pct: 2,
      max_portfolio_drawdown_pct: 10,
      min_decision_confidence: 0.7,
      live_execution_enabled: false,
    },
    decision: { action: "BUY", confidence: 0.82 },
    portfolio: { equity: 100000, current_position_value: 2000, daily_pnl: 500, drawdown_pct: 1 },
    order: { side: "BUY", notional: 3000 },
  });

  assert.equal(result.approved, true);
  assert.equal(result.status, "APPROVED_PAPER");
  assert.deepEqual(result.reasons, []);
});

test("rejects low-confidence decision", () => {
  const result = evaluatePaperTradeRisk({
    policy: { min_decision_confidence: 0.75, live_execution_enabled: false },
    decision: { action: "BUY", confidence: 0.5 },
    portfolio: { equity: 100000 },
    order: { side: "BUY", notional: 1000 },
  });

  assert.equal(result.approved, false);
  assert.match(result.reasons.join(" "), /below minimum/);
});
