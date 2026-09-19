import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync(
  new URL("../lib/markets/runtime/MarketAutonomousPaperRuntime.js", import.meta.url),
  "utf8",
);

test("automation state keeps live snapshots separate from REST fallback snapshots", () => {
  assert.match(runtime, /const liveBySymbol = new Map\(\)/);
  assert.match(runtime, /for \(const row of liveSnapshotsResult\.data \|\| \[\]\)/);
  assert.match(runtime, /liveBySymbol,/);
});

test("circuit breaker marks only open long positions from live snapshots", () => {
  assert.match(runtime, /function markPortfolioForCircuitBreaker/);
  assert.match(runtime, /liveSnapshots\.get\(symbol\)/);
  assert.match(runtime, /number\(position\.quantity, 0\)/);
});

test("circuit breaker marks require websocket fresh valid top of book", () => {
  assert.match(runtime, /CIRCUIT_BREAKER_MARK_SNAPSHOT_REQUIRED/);
  assert.match(runtime, /CIRCUIT_BREAKER_MARK_WEBSOCKET_REQUIRED/);
  assert.match(runtime, /CIRCUIT_BREAKER_MARK_STALE/);
  assert.match(runtime, /CIRCUIT_BREAKER_MARK_TOP_OF_BOOK_INVALID/);
});

test("circuit breaker uses bid ask midpoint rather than BUY ask fallback", () => {
  assert.match(runtime, /const price = \(bid \+ ask\) \/ 2/);
  const helperStart = runtime.indexOf("function markPortfolioForCircuitBreaker");
  const helperEnd = runtime.indexOf("async function hasQueuedOrder", helperStart);
  const helper = runtime.slice(helperStart, helperEnd);
  assert.doesNotMatch(helper, /latestPrice\(/);
  assert.doesNotMatch(helper, /position\.market_price/);
});

test("valuation outage does not fabricate a new breaker breach", () => {
  assert.match(runtime, /valuation_status: "UNAVAILABLE"/);
  assert.match(runtime, /authority_effect: "NO_NEW_BREACH_INFERRED"/);
  assert.match(runtime, /breached: false/);
});

test("already latched breaker remains latched when valuation is unavailable", () => {
  assert.match(
    runtime,
    /automationPolicy\?\.circuit_breaker_latched === true && !breaker\.breached[\s\S]*?breached: true/,
  );
});

test("valuation failures are durably surfaced in cycle errors", () => {
  assert.match(runtime, /stage: "CIRCUIT_BREAKER_MARKING"/);
  assert.match(runtime, /breakerMarked\.reasons\.join/);
});
