import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync(
  new URL("../lib/markets/runtime/MarketCorporateActionRiskRuntime.js", import.meta.url),
  "utf8",
);
const migration = fs.readFileSync(
  new URL("../supabase/migrations/20260919010435_markets_corporate_action_revision_fence.sql", import.meta.url),
  "utf8",
);

test("corporate-action evaluation ensures a lockable revision row even for empty datasets", () => {
  assert.match(runtime, /market_corporate_action_revisions/);
  assert.match(runtime, /revision: 0/);
  assert.match(runtime, /ignoreDuplicates: true/);
});

test("corporate-action risk evidence seals exact per-symbol dataset revision", () => {
  assert.match(runtime, /const revisionBeforeResult = await revisionQuery\(\)/);
  assert.match(runtime, /const revisionAfterResult = await revisionQuery\(\)/);
  assert.match(runtime, /revisionBefore !== revisionAfter/);
  assert.match(runtime, /CHANGED_DURING_EVALUATION/);
  assert.match(runtime, /dataset_revision: revisionAfter/);
  assert.match(runtime, /dataset_revision_updated_at/);
  assert.match(runtime, /revision_scope_symbol: ticker/);
  assert.match(runtime, /consistency_status: "STABLE"/);
});

test("database revision advances on insert update and delete", () => {
  assert.match(
    migration,
    /after insert or update or delete on public\.market_corporate_actions/,
  );
  assert.match(migration, /revision = public\.market_corporate_action_revisions\.revision \+ 1/);
});

test("existing corporate actions are backfilled into revision state", () => {
  assert.match(migration, /from public\.market_corporate_actions/);
  assert.match(migration, /count\(\*\)::bigint/);
});

test("BUY fill requires exact corporate-action revision and symbol", () => {
  assert.match(migration, /PAPER_CORPORATE_ACTION_REVISION_REQUIRED/);
  assert.match(migration, /PAPER_CORPORATE_ACTION_REVISION_SYMBOL_MISMATCH/);
  assert.match(migration, /PAPER_CORPORATE_ACTION_REVISION_STALE/);
});

test("corporate-action revision row is share-locked before fill mutation", () => {
  assert.match(
    migration,
    /from public\.market_corporate_action_revisions[\s\S]*?for share/,
  );
  const revisionIndex = migration.indexOf("PAPER_CORPORATE_ACTION_REVISION_STALE");
  const fillIndex = migration.indexOf("v_result := public.market_apply_paper_fill(");
  assert.ok(revisionIndex >= 0 && revisionIndex < fillIndex);
});

test("SELL de-risking bypasses the corporate-action revision fence", () => {
  assert.match(
    migration,
    /if upper\(coalesce\(v_order\.side, ''\)\) = 'BUY' then[\s\S]*?PAPER_CORPORATE_ACTION_REVISION_STALE[\s\S]*?end if;/,
  );
});

test("revision helpers are not public and bump helper is service-role only", () => {
  assert.match(
    migration,
    /revoke all on function public\.market_bump_corporate_action_revision[\s\S]*?from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.market_bump_corporate_action_revision[\s\S]*?to service_role/,
  );
});
