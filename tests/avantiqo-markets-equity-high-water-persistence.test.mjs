import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync(
  new URL("../lib/markets/runtime/MarketPortfolioPerformanceRuntime.js", import.meta.url),
  "utf8",
);
const migration = fs.readFileSync(
  new URL("../supabase/migrations/20260919013003_markets_equity_high_water_persistence.sql", import.meta.url),
  "utf8",
);

test("high-water promotion locks the paper account row", () => {
  assert.match(
    migration,
    /from public\.market_paper_accounts[\s\S]*?for update/,
  );
});

test("only a genuine new equity peak mutates account authority state", () => {
  assert.match(
    migration,
    /if p_observed_equity > coalesce\(v_account\.high_water_equity, 0\) then[\s\S]*?high_water_equity = p_observed_equity[\s\S]*?execution_revision = execution_revision \+ 1/,
  );
});

test("high-water promotion RPC is service-role only", () => {
  assert.match(
    migration,
    /revoke all on function public\.market_promote_paper_high_water[\s\S]*?from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.market_promote_paper_high_water[\s\S]*?to service_role/,
  );
});

test("existing equity history backfills missing account peaks", () => {
  assert.match(migration, /from public\.market_portfolio_equity_snapshots/);
  assert.match(migration, /max\(greatest\(equity, high_water_equity\)\)/);
  assert.match(
    migration,
    /historical\.high_water_equity > account\.high_water_equity/,
  );
  assert.match(
    migration,
    /execution_revision = execution_revision \+ 1/,
  );
});

test("new equity snapshots promote observed marked equity", () => {
  assert.match(runtime, /market_promote_paper_high_water/);
  assert.match(runtime, /observedEquity: equity/);
});

test("idempotent snapshot retries still repair high water", () => {
  const occurrences = runtime.match(/observedEquity: Math\.max\(number\(existing\.equity, 0\), equity\)/g) || [];
  assert.equal(occurrences.length, 2);
});

test("snapshot recorder does not directly update paper accounts", () => {
  assert.doesNotMatch(
    runtime,
    /\.from\("market_paper_accounts"\)[\s\S]{0,500}?\.update\s*\(/,
  );
});
