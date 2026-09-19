import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const route = fs.readFileSync(
  new URL("../app/api/markets/command-center/route.js", import.meta.url),
  "utf8",
);
const runtime = fs.readFileSync(
  new URL("../lib/markets/runtime/MarketPaperExecutionRuntime.js", import.meta.url),
  "utf8",
);
const migration = fs.readFileSync(
  new URL("../supabase/migrations/20260919012246_markets_daily_equity_revision_fence.sql", import.meta.url),
  "utf8",
);

test("daily equity rollover locks the paper account row", () => {
  assert.match(
    migration,
    /from public\.market_paper_accounts[\s\S]*?for update/,
  );
});

test("daily equity rollover advances execution revision only when date changes", () => {
  assert.match(
    migration,
    /if v_account\.daily_equity_date is distinct from current_date then[\s\S]*?execution_revision = execution_revision \+ 1/,
  );
  const conditionIndex = migration.indexOf("if v_account.daily_equity_date is distinct from current_date then");
  const revisionIndex = migration.indexOf("execution_revision = execution_revision + 1");
  assert.ok(conditionIndex >= 0 && conditionIndex < revisionIndex);
});

test("rollover RPC is service-role only", () => {
  assert.match(
    migration,
    /revoke all on function public\.market_roll_paper_daily_equity_if_needed[\s\S]*?from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.market_roll_paper_daily_equity_if_needed[\s\S]*?to service_role/,
  );
});

test("manual paper order path uses governed daily rollover RPC", () => {
  assert.match(route, /market_roll_paper_daily_equity_if_needed/);
  const submitStart = route.indexOf("async function submitPaperOrder");
  const submitEnd = route.indexOf("async function", submitStart + 20);
  const block = route.slice(submitStart, submitEnd > submitStart ? submitEnd : route.length);
  assert.doesNotMatch(
    block,
    /\.from\("market_paper_accounts"\)[\s\S]{0,250}\.update\(\{[\s\S]{0,200}daily_equity_start/,
  );
});

test("fill worker rolls stale daily baseline before execution risk state is used", () => {
  assert.match(runtime, /market_roll_paper_daily_equity_if_needed/);
  assert.match(runtime, /executionState = await loadExecutionRiskState/);
  assert.match(runtime, /daily_equity_date/);
});

test("atomic fill rejects a baseline that becomes stale before mutation", () => {
  assert.match(migration, /PAPER_DAILY_EQUITY_BASELINE_STALE/);
  const staleIndex = migration.indexOf("PAPER_DAILY_EQUITY_BASELINE_STALE");
  const fillIndex = migration.indexOf("v_result := public.market_apply_paper_fill(");
  assert.ok(staleIndex >= 0 && staleIndex < fillIndex);
});

test("daily baseline stale check occurs before execution revision comparison", () => {
  const staleIndex = migration.indexOf("PAPER_DAILY_EQUITY_BASELINE_STALE");
  const revisionIndex = migration.indexOf("PAPER_RISK_REVALIDATION_STALE");
  assert.ok(staleIndex >= 0 && staleIndex < revisionIndex);
});
