import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync(
  new URL("../lib/markets/runtime/MarketPaperExecutionRuntime.js", import.meta.url),
  "utf8",
);

test("fill worker reloads rolling fills for current BUY budget and discipline state", () => {
  assert.match(runtime, /async function rollingExecutionPaperFills/);
  assert.match(runtime, /async function recentExecutionSellFills/);
  assert.match(
    runtime,
    /const \[recentFills, recentSellFills\] = side === "BUY"[\s\S]*?Promise\.all/,
  );
});

test("fill-time trading budget uses exact executable fill notional", () => {
  assert.match(runtime, /const fillNotional = liquidity\.executable_quantity \* fillPrice/);
  assert.match(
    runtime,
    /summarizeRollingTradingBudget\(\{[\s\S]*?proposedNotional: fillNotional/,
  );
});

test("fill-time BUY reruns cash reserve and open-position limit", () => {
  assert.match(runtime, /evaluateCashReserve\(\{/);
  assert.match(runtime, /proposedNotional: fillNotional/);
  assert.match(runtime, /evaluateOpenPositionLimit\(\{/);
  assert.match(runtime, /positions: markedPositions/);
});

test("fill-time BUY reruns loss streak and symbol re-entry lockout", () => {
  assert.match(runtime, /evaluateLossStreakCooloff\(\{/);
  assert.match(runtime, /evaluateSymbolLossReentryLockout\(\{/);
  assert.match(runtime, /fills: recentSellFills/);
});

test("all five discipline gates are mandatory for risk approval", () => {
  assert.match(runtime, /tradingBudget\.approved &&/);
  assert.match(runtime, /cashReserve\.approved &&/);
  assert.match(runtime, /openPositionLimit\.approved &&/);
  assert.match(runtime, /lossStreakCooloff\.approved &&/);
  assert.match(runtime, /symbolLossReentry\.approved &&/);
});

test("discipline results are persisted in fill-time risk evidence", () => {
  assert.match(runtime, /trading_budget: tradingBudget/);
  assert.match(runtime, /cash_reserve: cashReserve/);
  assert.match(runtime, /open_position_limit: openPositionLimit/);
  assert.match(runtime, /loss_streak_cooloff: lossStreakCooloff/);
  assert.match(runtime, /symbol_loss_reentry: symbolLossReentry/);
});

test("SELL avoids historical fill queries and keeps de-risking path", () => {
  assert.match(runtime, /: \[\[\], \[\]\];/);
});
