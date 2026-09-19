import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync(
  new URL("../lib/markets/runtime/MarketAutonomousPaperRuntime.js", import.meta.url),
  "utf8",
);

test("autonomous BUY sizing uses live-only portfolio marking", () => {
  assert.match(
    runtime,
    /const marked = side === "BUY"[\s\S]*?markPortfolioForCircuitBreaker/,
  );
  assert.match(runtime, /liveSnapshots: state\.liveBySymbol/);
});

test("autonomous BUY is skipped before sizing when portfolio mark authority is unavailable", () => {
  const markIndex = runtime.indexOf('reason: "PORTFOLIO_MARK_AUTHORITY_UNAVAILABLE"');
  const sizingIndex = runtime.indexOf("let sizing = calculateAutonomousPaperOrder", markIndex - 2000);
  assert.ok(markIndex >= 0);
  assert.ok(sizingIndex >= 0);
  assert.ok(markIndex < sizingIndex);
});

test("autonomous BUY portfolio risk budget receives authoritative marked equity and positions", () => {
  assert.match(
    runtime,
    /if \(sizing\.side === "BUY"\)[\s\S]*?equity: marked\.equity[\s\S]*?positions: marked\.positions/,
  );
});

test("SELL sizing keeps de-risking fallback valuation path", () => {
  assert.match(
    runtime,
    /side === "BUY"[\s\S]*?: markPortfolio\(\{[\s\S]*?snapshots: state\.latestBySymbol/,
  );
});
