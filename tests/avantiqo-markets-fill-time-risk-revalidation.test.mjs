import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync(
  new URL("../lib/markets/runtime/MarketPaperExecutionRuntime.js", import.meta.url),
  "utf8",
);

test("paper fill worker requires the governed decision to remain approved", () => {
  assert.match(
    runtime,
    /decision\.risk_status !== "APPROVED_PAPER"[\s\S]*?GOVERNED_DECISION_NOT_APPROVED/,
  );
});

test("paper BUY fill worker honors the live circuit-breaker latch", () => {
  assert.match(
    runtime,
    /side === "BUY"[\s\S]*?circuit_breaker_latched === true[\s\S]*?PORTFOLIO_CIRCUIT_BREAKER_LATCHED/,
  );
});

test("paper fill worker rebuilds current account positions and risk policy before fill", () => {
  assert.match(runtime, /from\("market_risk_policies"\)/);
  assert.match(runtime, /from\("market_paper_accounts"\)/);
  assert.match(runtime, /from\("market_paper_positions"\)/);
});

test("paper fill worker reruns execution portfolio microstructure and corporate-action risk", () => {
  assert.match(runtime, /evaluatePaperTradeRisk\(/);
  assert.match(runtime, /MarketPortfolioRiskRuntime\.evaluate\(/);
  assert.match(runtime, /evaluateMarketMicrostructureRisk\(/);
  assert.match(runtime, /MarketCorporateActionRiskRuntime\.evaluate\(/);
  assert.match(runtime, /EXECUTION_RISK_REVALIDATION_FAILED/);
});

test("successful fill persists its risk revalidation with execution quality", () => {
  assert.match(runtime, /risk_revalidation: riskRevalidation/);
  assert.match(runtime, /p_execution_quality: executionQuality/);
});
