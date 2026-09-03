import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const provider = read("components/workspace/finance/FinanceLandingRuntimeProvider.jsx");
const page = read("app/(system)/workspace/[organizationId]/finance/page.jsx");
const overview = read("components/workspace/finance/FinanceAccountantOverview.jsx");
const close = read("components/workspace/finance/FinanceContinuousCloseRail.jsx");
const health = read("components/workspace/finance/FinanceAccountHealthPanel.jsx");

test("Finance landing owns one shared SWR snapshot and one refresh clock", () => {
  assert.match(provider, /useSWR\(key, financeSnapshotFetcher/);
  assert.match(provider, /Promise\.all\(\[/);
  assert.match(provider, /command-center/);
  assert.match(provider, /account-health/);
  assert.match(provider, /keepPreviousData:\s*true/);
  assert.match(provider, /const refresh = useCallback/);
  assert.match(page, /<FinanceLandingRuntimeProvider organizationId=\{organizationId\}>/);
});

test("landing surfaces do not run independent command-center or account-health fetch loops", () => {
  for (const [name, source] of [
    ["overview", overview],
    ["continuous close", close],
    ["account health", health],
  ]) {
    assert.match(source, /useFinanceLandingRuntime\(\)/, `${name} must use shared runtime`);
    assert.doesNotMatch(source, /fetch\([^\n]*(command-center|account-health)/, `${name} must not fetch Finance truth independently`);
    assert.doesNotMatch(source, /new URL\("\/api\/workspace\/finance\/(command-center|account-health)/, `${name} must not build independent Finance truth URLs`);
  }
});

test("shared refresh preserves stale successful data during transient refresh failures", () => {
  assert.match(provider, /stale:\s*Boolean\(error && data\)/);
  assert.match(overview, /error && !data/);
  assert.match(close, /stale/);
  assert.match(health, /stale/);
});
