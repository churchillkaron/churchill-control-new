import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync(
  new URL("../lib/markets/runtime/MarketPortfolioRiskRuntime.js", import.meta.url),
  "utf8",
);
const migration = fs.readFileSync(
  new URL("../supabase/migrations/20260919011456_markets_daily_bar_revision_fence.sql", import.meta.url),
  "utf8",
);

test("portfolio risk ensures a lockable daily-bar revision row", () => {
  assert.match(runtime, /market_daily_bar_revisions/);
  assert.match(runtime, /revision: 0/);
  assert.match(runtime, /ignoreDuplicates: true/);
});

test("portfolio risk reads daily-bar revision before and after data", () => {
  assert.match(runtime, /const dailyBarRevisionBefore = await readDailyBarRevision/);
  assert.match(runtime, /from\("market_bars"\)/);
  assert.match(
    runtime,
    /\[dailyBarRevisionAfter, benchmarkRevisionAfter, classificationRevisionAfter\] = await Promise\.all/,
  );
  assert.match(runtime, /readDailyBarRevision\(\{ organizationId, portfolioId \}\)/);
  assert.match(runtime, /CHANGED_DURING_EVALUATION/);
});

test("BUY fails closed if daily bars change during risk evaluation", () => {
  assert.match(
    runtime,
    /if \(\(!dailyBarStable \|\| !benchmarkStable \|\| !classificationStable\) && side === "BUY"\)[\s\S]*?approved: false/,
  );
  assert.match(runtime, /!dailyBarStable \? \["Daily historical bar dataset changed during portfolio-risk evaluation\."\]/);
});

test("stable portfolio risk seals exact daily-bar revision", () => {
  assert.match(runtime, /daily_bar_revision: dailyBarRevisionAfter\.revision/);
  assert.match(runtime, /daily_bar_revision_updated_at: dailyBarRevisionAfter\.updated_at/);
  assert.match(runtime, /daily_bar_consistency_status: dailyBarStable \? "STABLE"/);
});

test("revision trigger only advances for 1Day bars", () => {
  assert.match(migration, /new\.timeframe = '1Day'/);
  assert.match(migration, /old\.timeframe = '1Day'/);
  assert.match(
    migration,
    /after insert or update or delete on public\.market_bars/,
  );
});

test("existing daily bars are backfilled into portfolio revision state", () => {
  assert.match(migration, /from public\.market_bars/);
  assert.match(migration, /timeframe = '1Day'/);
  assert.match(migration, /count\(\*\)::bigint/);
});

test("BUY fill requires exact locked daily-bar revision", () => {
  assert.match(migration, /PAPER_DAILY_BAR_REVISION_REQUIRED/);
  assert.match(migration, /PAPER_DAILY_BAR_REVISION_ROW_REQUIRED/);
  assert.match(migration, /PAPER_DAILY_BAR_REVISION_STALE/);
  assert.match(
    migration,
    /from public\.market_daily_bar_revisions[\s\S]*?for share/,
  );
});

test("daily-bar revision fence runs before portfolio fill mutation", () => {
  const revisionIndex = migration.indexOf("PAPER_DAILY_BAR_REVISION_STALE");
  const fillIndex = migration.indexOf("v_result := public.market_apply_paper_fill(");
  assert.ok(revisionIndex >= 0 && revisionIndex < fillIndex);
});

test("SELL de-risking bypasses the daily-bar database fence", () => {
  assert.match(
    migration,
    /if upper\(coalesce\(v_order\.side, ''\)\) = 'BUY' then[\s\S]*?PAPER_DAILY_BAR_REVISION_STALE[\s\S]*?end if;/,
  );
});

test("daily-bar revision helper is not public and service-role mutation stays explicit", () => {
  assert.match(
    migration,
    /revoke all on function public\.market_bump_daily_bar_revision[\s\S]*?from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.market_bump_daily_bar_revision[\s\S]*?to service_role/,
  );
});
