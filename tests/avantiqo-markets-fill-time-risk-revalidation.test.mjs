import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync(
  new URL("../lib/markets/runtime/MarketPaperExecutionRuntime.js", import.meta.url),
  "utf8",
);
const mutationMigration = fs.readFileSync(
  new URL("../supabase/migrations/20260918132124_avantiqo_markets_fill_mutation_binding_v1.sql", import.meta.url),
  "utf8",
);

test("paper fill worker requires the governed decision to remain approved", () => {
  assert.match(
    runtime,
    /decision\.risk_status !== "APPROVED_PAPER"[\s\S]*?GOVERNED_DECISION_NOT_APPROVED/,
  );
});

test("paper fill worker binds order symbol and side to the governed decision", () => {
  assert.match(
    runtime,
    /decision\.symbol[\s\S]*?order\.symbol[\s\S]*?decision\.action[\s\S]*?order\.side[\s\S]*?ORDER_DECISION_MUTATION_MISMATCH/,
  );
});

test("database fill wrapper enforces the same decision mutation binding", () => {
  assert.match(
    mutationMigration,
    /v_decision\.symbol[\s\S]*?v_order\.symbol[\s\S]*?v_decision\.action[\s\S]*?v_order\.side[\s\S]*?PAPER_ORDER_DECISION_MUTATION_MISMATCH/,
  );
  assert.match(mutationMigration, /grant execute[\s\S]*?to service_role/);
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
