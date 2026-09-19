import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync(
  new URL("../lib/markets/runtime/MarketPaperExecutionRuntime.js", import.meta.url),
  "utf8",
);
const migration = fs.readFileSync(
  new URL("../supabase/migrations/20260919033154_markets_paper_account_status_fill_fence.sql", import.meta.url),
  "utf8",
);

test("inactive PAPER account cancels queued authority", () => {
  assert.match(runtime, /executionState\.account\.status !== "ACTIVE"/);
  assert.match(runtime, /PAPER_ACCOUNT_NOT_ACTIVE/);
  assert.match(runtime, /status: "CANCELLED"/);
  assert.match(runtime, /risk_status: "CANCELLED"/);
});

test("account status is checked before daily rollover", () => {
  const statusIndex = runtime.indexOf("PAPER_ACCOUNT_NOT_ACTIVE");
  const rolloverIndex = runtime.indexOf("market_roll_paper_daily_equity_if_needed");
  assert.ok(statusIndex >= 0 && statusIndex < rolloverIndex);
});

test("database checks account status under the account row lock", () => {
  assert.match(
    migration,
    /from public\.market_paper_accounts[\s\S]*?for update[\s\S]*?v_account\.status <> 'ACTIVE'/,
  );
  assert.match(migration, /PAPER_ACCOUNT_NOT_ACTIVE/);
});

test("database account-status fence precedes revision and fill mutation", () => {
  const statusIndex = migration.indexOf("PAPER_ACCOUNT_NOT_ACTIVE");
  const revisionIndex = migration.indexOf("PAPER_RISK_REVALIDATION_STALE");
  const fillIndex = migration.indexOf("v_result := public.market_apply_paper_fill(");
  assert.ok(statusIndex >= 0 && statusIndex < revisionIndex);
  assert.ok(statusIndex < fillIndex);
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
