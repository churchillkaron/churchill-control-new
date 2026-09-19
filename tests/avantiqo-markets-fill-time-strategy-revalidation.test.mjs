import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync(
  new URL("../lib/markets/runtime/MarketPaperExecutionRuntime.js", import.meta.url),
  "utf8",
);

test("BUY fill reloads latest walk-forward validation", () => {
  assert.match(runtime, /async function latestExecutionBacktest/);
  assert.match(runtime, /market_backtest_runs/);
  assert.match(runtime, /strategy_key", "TECHNICAL_QUANT_V1"/);
  assert.match(runtime, /evaluateStrategyReadiness/);
});

test("BUY fill reloads current mature prediction outcomes", () => {
  assert.match(runtime, /async function recentExecutionPredictionOutcomes/);
  assert.match(runtime, /market_prediction_outcomes/);
  assert.match(runtime, /evaluateStrategyDrift/);
});

test("strategy failure stops BUY before governed fill RPC", () => {
  const failIndex = runtime.indexOf("EXECUTION_STRATEGY_REVALIDATION_FAILED");
  const rpcIndex = runtime.indexOf('rpc("market_apply_paper_fill_with_quality"');
  assert.ok(failIndex >= 0 && failIndex < rpcIndex);
});

test("SELL remains de-risking-safe without strategy evidence queries", () => {
  assert.match(
    runtime,
    /if \(side === "BUY"\) \{[\s\S]*?latestExecutionBacktest[\s\S]*?recentExecutionPredictionOutcomes[\s\S]*?\n  \}/,
  );
});

test("successful fill seals strategy readiness and health evidence", () => {
  assert.match(runtime, /strategy_readiness:/);
  assert.match(runtime, /backtest_run_id: executionBacktest\?\.id/);
  assert.match(runtime, /backtest_completed_at: executionBacktest\?\.completed_at/);
  assert.match(runtime, /strategy_health: strategyHealth/);
});

test("final risk approval requires both current strategy gates", () => {
  assert.match(runtime, /strategyReadiness\.ready &&/);
  assert.match(runtime, /strategyHealth\.ready &&/);
});
