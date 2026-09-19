import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync(
  new URL("../lib/markets/runtime/MarketPaperExecutionRuntime.js", import.meta.url),
  "utf8",
);
const migration = fs.readFileSync(
  new URL("../supabase/migrations/20260919025955_markets_circuit_breaker_sell_latch_fence.sql", import.meta.url),
  "utf8",
);

test("application identifies deterministic breaker liquidation decisions", () => {
  assert.match(runtime, /DETERMINISTIC_PORTFOLIO_CIRCUIT_BREAKER/);
});

test("cleared breaker latch cancels stale liquidation order and decision", () => {
  assert.match(runtime, /CIRCUIT_BREAKER_LATCH_CLEARED/);
  assert.match(runtime, /status: "CANCELLED"/);
  assert.match(runtime, /risk_status: "CANCELLED"/);
});

test("database rejects breaker liquidation after latch is cleared", () => {
  assert.match(migration, /DETERMINISTIC_PORTFOLIO_CIRCUIT_BREAKER/);
  assert.match(migration, /PAPER_CIRCUIT_BREAKER_LATCH_CLEARED/);
  assert.match(
    migration,
    /v_automation_policy\.circuit_breaker_latched is not true/,
  );
});

test("breaker latch database fence precedes fill mutation", () => {
  const latchIndex = migration.indexOf("PAPER_CIRCUIT_BREAKER_LATCH_CLEARED");
  const fillIndex = migration.indexOf("v_result := public.market_apply_paper_fill(");
  assert.ok(latchIndex >= 0 && latchIndex < fillIndex);
});

test("governed fill wrapper remains service-role only", () => {
  assert.match(
    migration,
    /revoke all on function public\.market_apply_paper_fill_with_quality[\s\S]*?from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.market_apply_paper_fill_with_quality[\s\S]*?to service_role/,
  );
});
