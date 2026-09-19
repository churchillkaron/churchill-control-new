import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync(
  new URL("../lib/markets/runtime/MarketPaperExecutionRuntime.js", import.meta.url),
  "utf8",
);
const migration = fs.readFileSync(
  new URL("../supabase/migrations/20260919011004_markets_strategy_evidence_revision_fence.sql", import.meta.url),
  "utf8",
);

test("fill worker ensures a lockable per-symbol strategy revision row", () => {
  assert.match(runtime, /market_strategy_evidence_revisions/);
  assert.match(runtime, /backtest_revision: 0/);
  assert.match(runtime, /outcome_revision: 0/);
  assert.match(runtime, /ignoreDuplicates: true/);
});

test("BUY reads strategy revision before and after strategy evidence", () => {
  assert.match(runtime, /const strategyRevisionBefore = await readStrategyEvidenceRevision/);
  assert.match(runtime, /executionBacktest = await latestExecutionBacktest/);
  assert.match(runtime, /const recentOutcomes = await recentExecutionPredictionOutcomes/);
  assert.match(runtime, /const strategyRevisionAfter = await readStrategyEvidenceRevision/);
  assert.match(runtime, /EXECUTION_STRATEGY_EVIDENCE_CHANGED/);
});

test("successful BUY seals exact backtest and outcome revisions", () => {
  assert.match(runtime, /strategy_evidence_revision: strategyEvidenceRevision/);
  assert.match(runtime, /backtest_revision: strategyEvidenceRevision\.backtest_revision/);
  assert.match(runtime, /outcome_revision: strategyEvidenceRevision\.outcome_revision/);
});

test("database revision advances on backtest insert update delete", () => {
  assert.match(
    migration,
    /after insert or update or delete on public\.market_backtest_runs/,
  );
  assert.match(migration, /'BACKTEST'/);
});

test("database revision advances on outcome insert update delete", () => {
  assert.match(
    migration,
    /after insert or update or delete on public\.market_prediction_outcomes/,
  );
  assert.match(migration, /'OUTCOME'/);
});

test("strategy revision backfill aggregates both datasets per symbol", () => {
  assert.match(migration, /sum\(scope\.backtest_revision\)::bigint/);
  assert.match(migration, /sum\(scope\.outcome_revision\)::bigint/);
  assert.match(
    migration,
    /group by scope\.organization_id, scope\.portfolio_id, scope\.symbol/,
  );
});

test("BUY fill requires exact strategy symbol and revisions", () => {
  assert.match(migration, /PAPER_STRATEGY_EVIDENCE_REVISION_REQUIRED/);
  assert.match(migration, /PAPER_STRATEGY_EVIDENCE_REVISION_SYMBOL_MISMATCH/);
  assert.match(migration, /PAPER_BACKTEST_REVISION_STALE/);
  assert.match(migration, /PAPER_OUTCOME_REVISION_STALE/);
});

test("database share-locks strategy revision before fill mutation", () => {
  assert.match(
    migration,
    /from public\.market_strategy_evidence_revisions[\s\S]*?for share/,
  );
  const revisionIndex = migration.indexOf("PAPER_BACKTEST_REVISION_STALE");
  const fillIndex = migration.indexOf("v_result := public.market_apply_paper_fill(");
  assert.ok(revisionIndex >= 0 && revisionIndex < fillIndex);
});

test("SELL de-risking bypasses strategy evidence revision fence", () => {
  assert.match(
    migration,
    /if upper\(coalesce\(v_order\.side, ''\)\) = 'BUY' then[\s\S]*?PAPER_OUTCOME_REVISION_STALE[\s\S]*?end if;/,
  );
});

test("strategy revision helpers remain non-public", () => {
  assert.match(
    migration,
    /revoke all on function public\.market_bump_strategy_evidence_revision[\s\S]*?from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.market_bump_strategy_evidence_revision[\s\S]*?to service_role/,
  );
});
