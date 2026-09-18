import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(
  new URL("../supabase/migrations/20260918165748_markets_final_session_evidence_fence.sql", import.meta.url),
  "utf8",
);

test("database requires final authoritative session evidence", () => {
  assert.match(migration, /PAPER_FINAL_SESSION_EVIDENCE_REQUIRED/);
  assert.match(migration, /PAPER_FINAL_SESSION_NOT_OPEN/);
  assert.match(migration, /PAPER_FINAL_ASSET_NOT_TRADABLE/);
});

test("final session evidence has a tight freshness fence", () => {
  assert.match(migration, /PAPER_FINAL_SESSION_EVIDENCE_STALE/);
  assert.match(migration, /PAPER_FINAL_SESSION_CLOCK_STALE/);
  assert.match(migration, /least\(v_max_age_seconds, 30\)/);
});

test("database rejects a fill if lock wait crosses authoritative next close", () => {
  assert.match(migration, /PAPER_FINAL_SESSION_CLOCK_INVALID/);
  assert.match(migration, /if now\(\) >= v_final_next_close then/);
  assert.match(migration, /PAPER_MARKET_SESSION_CLOSED_AT_FILL/);
});

test("final session fence runs before order lock and portfolio mutation", () => {
  const closeIndex = migration.indexOf("PAPER_MARKET_SESSION_CLOSED_AT_FILL");
  const orderLockIndex = migration.indexOf("select * into v_order");
  const fillIndex = migration.indexOf("v_result := public.market_apply_paper_fill(");
  assert.ok(closeIndex >= 0 && closeIndex < orderLockIndex);
  assert.ok(closeIndex < fillIndex);
});

test("final session fence preserves service-role-only governed fill wrapper", () => {
  assert.match(
    migration,
    /revoke all on function public\.market_apply_paper_fill_with_quality[\s\S]*?from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.market_apply_paper_fill_with_quality[\s\S]*?to service_role/,
  );
});
