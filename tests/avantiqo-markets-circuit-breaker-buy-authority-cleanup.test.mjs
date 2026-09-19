import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync(
  new URL("../lib/markets/runtime/MarketAutonomousPaperRuntime.js", import.meta.url),
  "utf8",
);
const migration = fs.readFileSync(
  new URL("../supabase/migrations/20260919032653_markets_circuit_breaker_buy_authority_cleanup.sql", import.meta.url),
  "utf8",
);

test("breaker BUY cleanup locks current automation policy", () => {
  assert.match(
    migration,
    /from public\.market_automation_policies[\s\S]*?for update/,
  );
  assert.match(migration, /circuit_breaker_latched is not true/);
});

test("breaker cleanup targets queued and partial BUY orders only", () => {
  assert.match(migration, /side = 'BUY'/);
  assert.match(migration, /status in \('QUEUED', 'PARTIALLY_FILLED'\)/);
});

test("breaker cleanup cancels linked approved decisions", () => {
  assert.match(migration, /update public\.market_decisions/);
  assert.match(migration, /risk_status = 'CANCELLED'/);
  assert.match(migration, /invalidation_reason = 'PORTFOLIO_CIRCUIT_BREAKER'/);
  assert.match(
    migration,
    /select decision_id[\s\S]*?from open_buy_orders/,
  );
});

test("breaker cleanup cancels orders with terminal lifecycle metadata", () => {
  assert.match(migration, /cancellation_reason = 'PORTFOLIO_CIRCUIT_BREAKER'/);
  assert.match(migration, /lifecycle_reason = 'PORTFOLIO_CIRCUIT_BREAKER'/);
});

test("breaker cleanup RPC is service-role only", () => {
  assert.match(
    migration,
    /revoke all on function public\.market_cancel_open_paper_buy_authority_on_breaker[\s\S]*?from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.market_cancel_open_paper_buy_authority_on_breaker[\s\S]*?to service_role/,
  );
});

test("autonomous breaker path uses governed authority cleanup RPC", () => {
  assert.match(runtime, /market_cancel_open_paper_buy_authority_on_breaker/);
  assert.match(runtime, /buy_authority_cleanup: authorityCleanup \|\| null/);
  assert.doesNotMatch(
    runtime.slice(
      runtime.indexOf("async function latchPortfolioCircuitBreaker"),
      runtime.indexOf("async function createCircuitBreakerDecision"),
    ),
    /\.from\("market_paper_orders"\)[\s\S]{0,500}?\.update\s*\(/,
  );
});
