import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  new URL("../lib/intelligence/runtime/AvantiqoExperimentPortfolioPerformanceRuntime.js", import.meta.url),
  "utf8",
);

test("portfolio reads exclude expired receipt and assessment evidence", () => {
  const expiryFilters = source.match(/\.or\(`valid_until\.is\.null,valid_until\.gt\.\$\{nowIso\}`\)/g) || [];
  assert.equal(expiryFilters.length >= 2, true);
  assert.match(source, /loadState\(organizationId, nowIso\)/);
});

test("expired portfolio outcomes are physically bounded", () => {
  assert.match(source, /async function purgeExpiredPortfolioOutcomes/);
  assert.match(source, /experiment_portfolio_performance_outcome/);
  assert.match(source, /\.lte\("valid_until", nowIso\)/);
  assert.match(source, /\.limit\(Math\.max\(1, Math\.min\(100,/);
  assert.match(source, /await purgeExpiredPortfolioOutcomes/);
  assert.match(source, /AVANTIQO_EXPERIMENT_PORTFOLIO_OUTCOME_PURGE_FAILED/);
});