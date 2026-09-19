import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(
  new URL("../supabase/migrations/20260919025716_markets_protective_exit_fill_evidence_fence.sql", import.meta.url),
  "utf8",
);

test("database identifies deterministic protective exit decisions", () => {
  assert.match(migration, /DETERMINISTIC_PROTECTIVE_EXIT/);
  assert.match(migration, /decision_payload->>'trigger_reason'/);
});

test("database requires matching protective revalidation evidence", () => {
  assert.match(migration, /PAPER_PROTECTIVE_EXIT_REVALIDATION_REQUIRED/);
  assert.match(migration, /protective_exit_revalidation,triggered/);
  assert.match(migration, /protective_exit_revalidation,position_id/);
});

test("database reads bid from the exact locked live snapshot", () => {
  assert.match(
    migration,
    /latest_quote_fingerprint,[\s\S]*?bid_price[\s\S]*?from public\.market_live_snapshots[\s\S]*?for share/,
  );
  assert.match(migration, /PAPER_PROTECTIVE_LIVE_BID_REQUIRED/);
});

test("database locks the exact protected position before mutation", () => {
  assert.match(
    migration,
    /from public\.market_paper_positions[\s\S]*?decision_payload->>'position_id'[\s\S]*?for update/,
  );
  assert.match(migration, /PAPER_PROTECTIVE_POSITION_NOT_OPEN/);
});

test("database independently validates stop loss and take profit", () => {
  assert.match(migration, /v_protective_reason = 'STOP_LOSS'/);
  assert.match(migration, /v_persisted_bid > v_protective_position\.stop_loss_price/);
  assert.match(migration, /v_protective_reason = 'TAKE_PROFIT'/);
  assert.match(migration, /v_persisted_bid < v_protective_position\.take_profit_price/);
});

test("database independently validates trailing stop", () => {
  assert.match(migration, /v_protective_reason = 'TRAILING_STOP'/);
  assert.match(migration, /default_trailing_stop_pct/);
  assert.match(migration, /PAPER_PROTECTIVE_TRAILING_STOP_NO_LONGER_ACTIVE/);
});

test("database independently validates max holding period", () => {
  assert.match(migration, /v_protective_reason = 'MAX_HOLDING_PERIOD'/);
  assert.match(migration, /max_holding_days/);
  assert.match(migration, /PAPER_PROTECTIVE_TIME_EXIT_NO_LONGER_ACTIVE/);
});

test("protective database checks precede fill mutation", () => {
  const protectiveIndex = migration.indexOf("PAPER_PROTECTIVE_TRIGGER_REASON_INVALID");
  const fillIndex = migration.indexOf("v_result := public.market_apply_paper_fill(");
  assert.ok(protectiveIndex >= 0 && protectiveIndex < fillIndex);
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
