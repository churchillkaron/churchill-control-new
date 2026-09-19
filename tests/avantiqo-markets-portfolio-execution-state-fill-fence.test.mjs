import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync(
  new URL("../lib/markets/runtime/MarketPaperExecutionRuntime.js", import.meta.url),
  "utf8",
);
const migration = fs.readFileSync(
  new URL("../supabase/migrations/20260919032930_markets_portfolio_execution_state_fill_fence.sql", import.meta.url),
  "utf8",
);

test("fill worker loads portfolio execution state with current risk state", () => {
  assert.match(runtime, /from\("market_portfolios"\)/);
  assert.match(runtime, /select\("id,status,execution_mode,updated_at"\)/);
  assert.match(runtime, /portfolio: portfolioResult\.data \|\| null/);
});

test("inactive missing or non-PAPER portfolio cancels stale order authority", () => {
  assert.match(runtime, /PAPER_PORTFOLIO_REQUIRED/);
  assert.match(runtime, /PAPER_PORTFOLIO_NOT_ACTIVE/);
  assert.match(runtime, /PAPER_PORTFOLIO_EXECUTION_MODE_INVALID/);
  assert.match(runtime, /status: "CANCELLED"/);
  assert.match(runtime, /risk_status: "CANCELLED"/);
});

test("portfolio execution state is checked before daily account rollover", () => {
  const portfolioIndex = runtime.indexOf("PAPER_PORTFOLIO_NOT_ACTIVE");
  const rolloverIndex = runtime.indexOf("market_roll_paper_daily_equity_if_needed");
  assert.ok(portfolioIndex >= 0 && portfolioIndex < rolloverIndex);
});

test("database locks exact portfolio before fill evaluation", () => {
  assert.match(
    migration,
    /from public\.market_portfolios[\s\S]*?id = v_order\.portfolio_id[\s\S]*?for share/,
  );
});

test("database requires ACTIVE PAPER portfolio for every fill", () => {
  assert.match(migration, /PAPER_PORTFOLIO_REQUIRED/);
  assert.match(migration, /v_portfolio\.status <> 'ACTIVE'/);
  assert.match(migration, /PAPER_PORTFOLIO_NOT_ACTIVE/);
  assert.match(migration, /v_portfolio\.execution_mode <> 'PAPER'/);
  assert.match(migration, /PAPER_PORTFOLIO_EXECUTION_MODE_INVALID/);
});

test("portfolio state fence occurs before risk slice and fill mutation", () => {
  const portfolioIndex = migration.indexOf("PAPER_PORTFOLIO_EXECUTION_MODE_INVALID");
  const sliceIndex = migration.indexOf("PAPER_RISK_SLICE_EVIDENCE_REQUIRED");
  const fillIndex = migration.indexOf("v_result := public.market_apply_paper_fill(");
  assert.ok(portfolioIndex >= 0 && portfolioIndex < sliceIndex);
  assert.ok(portfolioIndex < fillIndex);
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
