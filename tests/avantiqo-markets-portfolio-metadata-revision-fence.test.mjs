import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync(
  new URL("../lib/markets/runtime/MarketPortfolioRiskRuntime.js", import.meta.url),
  "utf8",
);
const migration = fs.readFileSync(
  new URL("../supabase/migrations/20260919011820_markets_portfolio_metadata_revision_fence.sql", import.meta.url),
  "utf8",
);

test("portfolio risk brackets benchmark and classification metadata with revisions", () => {
  assert.match(runtime, /const \[benchmarkRevisionBefore, classificationRevisionBefore\]/);
  assert.match(runtime, /readBenchmarkRevision/);
  assert.match(runtime, /readClassificationRevision/);
  assert.match(runtime, /benchmarkRevisionAfter/);
  assert.match(runtime, /classificationRevisionAfter/);
});

test("BUY fails closed when benchmark or classification changes during evaluation", () => {
  assert.match(runtime, /Portfolio benchmark changed during portfolio-risk evaluation/);
  assert.match(runtime, /Instrument classification changed during portfolio-risk evaluation/);
  assert.match(runtime, /!benchmarkStable \|\| !classificationStable/);
});

test("successful portfolio risk seals benchmark symbol and both revisions", () => {
  assert.match(runtime, /benchmark_symbol: benchmarkSymbol/);
  assert.match(runtime, /benchmark_revision: benchmarkRevisionAfter\.revision/);
  assert.match(runtime, /classification_revision: classificationRevisionAfter\.revision/);
});

test("benchmark revision advances only on portfolio creation or benchmark change", () => {
  assert.match(migration, /after insert or update on public\.market_portfolios/);
  assert.match(migration, /old\.benchmark_symbol is distinct from new\.benchmark_symbol/);
});

test("classification revision advances on insert delete or sector industry changes", () => {
  assert.match(migration, /after insert or update or delete on public\.market_instruments/);
  assert.match(migration, /old\.sector is distinct from new\.sector/);
  assert.match(migration, /old\.industry is distinct from new\.industry/);
});

test("BUY database fill requires current benchmark revision and exact symbol", () => {
  assert.match(migration, /PAPER_BENCHMARK_REVISION_REQUIRED/);
  assert.match(migration, /PAPER_BENCHMARK_REVISION_STALE/);
  assert.match(migration, /PAPER_BENCHMARK_SYMBOL_MISMATCH/);
  assert.match(
    migration,
    /from public\.market_portfolio_benchmark_revisions[\s\S]*?for share/,
  );
  assert.match(
    migration,
    /from public\.market_portfolios[\s\S]*?for share/,
  );
});

test("BUY database fill requires current classification revision", () => {
  assert.match(migration, /PAPER_CLASSIFICATION_REVISION_REQUIRED/);
  assert.match(migration, /PAPER_CLASSIFICATION_REVISION_STALE/);
  assert.match(
    migration,
    /from public\.market_instrument_classification_revisions[\s\S]*?for share/,
  );
});

test("metadata revision fences run before portfolio fill mutation", () => {
  const benchmarkIndex = migration.indexOf("PAPER_BENCHMARK_REVISION_STALE");
  const classificationIndex = migration.indexOf("PAPER_CLASSIFICATION_REVISION_STALE");
  const fillIndex = migration.indexOf("v_result := public.market_apply_paper_fill(");
  assert.ok(benchmarkIndex >= 0 && benchmarkIndex < fillIndex);
  assert.ok(classificationIndex >= 0 && classificationIndex < fillIndex);
});

test("SELL de-risking bypasses benchmark and classification database fences", () => {
  assert.match(
    migration,
    /if upper\(coalesce\(v_order\.side, ''\)\) = 'BUY' then[\s\S]*?PAPER_CLASSIFICATION_REVISION_STALE[\s\S]*?end if;/,
  );
});

test("metadata revision helpers are non-public and explicit to service role", () => {
  assert.match(
    migration,
    /revoke all on function public\.market_bump_portfolio_benchmark_revision[\s\S]*?from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.market_bump_portfolio_benchmark_revision[\s\S]*?to service_role/,
  );
  assert.match(
    migration,
    /revoke all on function public\.market_bump_instrument_classification_revision[\s\S]*?from public, anon, authenticated/,
  );
});
