import assert from "node:assert/strict";
import test from "node:test";
import {
  compareRepositoryRegressionDelta,
  extractRepositoryTestFailures,
  extractRepositoryTestSummary,
} from "../scripts/code-ai-repository-regression-delta.mjs";

function withSummary(body, { tests = 20, suites = 0, pass = 18, fail = 2, cancelled = 0, skipped = 0, todo = 0, duration_ms = 10.5 } = {}) {
  return [
    body,
    `ℹ tests ${tests}`,
    `ℹ suites ${suites}`,
    `ℹ pass ${pass}`,
    `ℹ fail ${fail}`,
    `ℹ cancelled ${cancelled}`,
    `ℹ skipped ${skipped}`,
    `ℹ todo ${todo}`,
    `ℹ duration_ms ${duration_ms}`,
  ].join("\n");
}

test("repository regression delta extracts spec and TAP failures deterministically", () => {
  const failures = extractRepositoryTestFailures([
    "✖ creative alpha preview stays stable (12.3ms)",
    "not ok 41 - finance posting remains atomic",
    "test at tests/creative-alpha-preview.test.mjs:21:1",
    "✖ creative alpha preview stays stable (8.1ms)",
  ].join("\n"));
  assert.deepEqual(failures, [
    "creative alpha preview stays stable",
    "creative alpha preview stays stable @ tests/creative-alpha-preview.test.mjs",
    "finance posting remains atomic",
  ]);
});

test("green PR head passes without requiring a green base", () => {
  const result = compareRepositoryRegressionDelta({
    headLog: withSummary("", { tests: 20, pass: 20, fail: 0 }),
    baseLog: withSummary("✖ unrelated existing failure (2ms)"),
    headExit: 0,
    baseExit: 1,
  });
  assert.equal(result.success, true);
  assert.equal(result.reason, "HEAD_GREEN");
});

test("red head against green base fails closed", () => {
  const result = compareRepositoryRegressionDelta({
    headLog: withSummary("✖ new failure (2ms)"),
    baseLog: withSummary("", { tests: 20, pass: 20, fail: 0 }),
    headExit: 1,
    baseExit: 0,
  });
  assert.equal(result.success, false);
  assert.equal(result.reason, "BASE_GREEN_HEAD_RED");
  assert.deepEqual(result.new_failures, ["new failure"]);
});

test("existing unrelated failures do not fail a Code PR", () => {
  const result = compareRepositoryRegressionDelta({
    headLog: withSummary("✖ existing creative failure (5ms)\n✖ existing music failure (4ms)"),
    baseLog: withSummary("✖ existing creative failure (9ms)\n✖ existing music failure (3ms)"),
    headExit: 1,
    baseExit: 1,
  });
  assert.equal(result.success, true);
  assert.equal(result.reason, "NO_NEW_REPOSITORY_REGRESSIONS");
  assert.deepEqual(result.new_failures, []);
});

test("new failure relative to red base fails the PR", () => {
  const result = compareRepositoryRegressionDelta({
    headLog: withSummary("✖ existing creative failure (5ms)\n✖ new Code regression (4ms)"),
    baseLog: withSummary("✖ existing creative failure (9ms)"),
    headExit: 1,
    baseExit: 1,
  });
  assert.equal(result.success, false);
  assert.equal(result.reason, "NEW_REPOSITORY_REGRESSIONS");
  assert.deepEqual(result.new_failures, ["new Code regression"]);
});

test("unparseable red output fails closed", () => {
  const result = compareRepositoryRegressionDelta({
    headLog: withSummary("process crashed before reporter output"),
    baseLog: withSummary("process crashed before reporter output"),
    headExit: 1,
    baseExit: 1,
  });
  assert.equal(result.success, false);
  assert.equal(result.reason, "FAILURE_OUTPUT_UNPARSEABLE");
});


test("workflow keeps push regression absolute and PR regression baseline-aware", async () => {
  const { readFile } = await import("node:fs/promises");
  const workflow = await readFile(".github/workflows/avantiqo-code-worldclass-quality.yml", "utf8");
  assert.match(workflow, /if \[ "\$\{\{ github\.event_name \}\}" != "pull_request" \]; then\n            npm test/);
  assert.match(workflow, /PR_BASE_SHA: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/);
  assert.match(workflow, /code-ai-repository-regression-delta\.mjs/);
  assert.match(workflow, /git worktree add --detach/);
  assert.match(workflow, /Dependency manifests changed; installing exact base dependencies/);
  assert.match(workflow, /code-base-tests\.log/);
  assert.doesNotMatch(workflow, /base comparison is unnecessary/);
});


test("same-title failure in a different file is detected as new", () => {
  const baseLog = withSummary([
    "test at tests/a.test.mjs:10:1",
    "✖ shared title (2ms)",
  ].join("\n"));
  const headLog = withSummary([
    "test at tests/a.test.mjs:10:1",
    "✖ shared title (2ms)",
    "test at tests/b.test.mjs:20:1",
    "✖ shared title (3ms)",
  ].join("\n"));
  const result = compareRepositoryRegressionDelta({ headLog, baseLog, headExit: 1, baseExit: 1 });
  assert.equal(result.success, false);
  assert.deepEqual(result.new_failures, ["shared title @ tests/b.test.mjs"]);
});


test("test inventory parser reads Node summary counts", () => {
  const summary = extractRepositoryTestSummary(withSummary("", { tests: 100, pass: 90, fail: 8, skipped: 1, todo: 1 }));
  assert.equal(summary.complete, true);
  assert.equal(summary.tests, 100);
  assert.equal(summary.executed, 98);
});

test("green head cannot pass by shrinking executed test inventory", () => {
  const headLog = withSummary("", { tests: 99, pass: 99, fail: 0 });
  const baseLog = withSummary("✖ existing failure", { tests: 100, pass: 98, fail: 2 });
  const result = compareRepositoryRegressionDelta({ headLog, baseLog, headExit: 0, baseExit: 1 });
  assert.equal(result.success, false);
  assert.equal(result.reason, "TEST_INVENTORY_SHRANK");
});

test("turning active tests into skipped coverage fails inventory gate", () => {
  const headLog = withSummary("✖ existing failure", { tests: 100, pass: 88, fail: 2, skipped: 10 });
  const baseLog = withSummary("✖ existing failure", { tests: 100, pass: 97, fail: 3 });
  const result = compareRepositoryRegressionDelta({ headLog, baseLog, headExit: 1, baseExit: 1 });
  assert.equal(result.success, false);
  assert.equal(result.reason, "TEST_INVENTORY_SHRANK");
});


test("missing Node summary fails inventory closed", () => {
  const result = compareRepositoryRegressionDelta({
    headLog: "process crashed before reporter summary",
    baseLog: "process crashed before reporter summary",
    headExit: 1,
    baseExit: 1,
  });
  assert.equal(result.success, false);
  assert.equal(result.reason, "TEST_INVENTORY_UNPARSEABLE");
});

test("internally inconsistent Node summary fails inventory closed", () => {
  const headLog = withSummary("✖ existing failure", { tests: 20, pass: 17, fail: 2 });
  const baseLog = withSummary("✖ existing failure");
  const result = compareRepositoryRegressionDelta({ headLog, baseLog, headExit: 1, baseExit: 1 });
  assert.equal(result.success, false);
  assert.equal(result.reason, "TEST_INVENTORY_INCONSISTENT");
});

test("increasing skipped coverage fails inventory gate even when total tests grow", () => {
  const headLog = withSummary("✖ existing failure", { tests: 102, pass: 98, fail: 2, skipped: 2 });
  const baseLog = withSummary("✖ existing failure", { tests: 100, pass: 98, fail: 2 });
  const result = compareRepositoryRegressionDelta({ headLog, baseLog, headExit: 1, baseExit: 1 });
  assert.equal(result.success, false);
  assert.equal(result.reason, "TEST_NONEXECUTED_COVERAGE_INCREASED");
});


test("scattered summary-looking lines cannot spoof test inventory", () => {
  const fake = [
    "ℹ tests 9999",
    "some test output",
    "ℹ suites 0",
    "ℹ pass 9999",
    "ℹ fail 0",
    "ℹ cancelled 0",
    "ℹ skipped 0",
    "ℹ todo 0",
    "ℹ duration_ms 1",
  ].join("\n");
  const summary = extractRepositoryTestSummary(fake);
  assert.equal(summary.complete, false);
  assert.equal(summary.canonical_block_count, 0);
});

test("last canonical Node reporter block wins over earlier lookalike block", () => {
  const early = withSummary("test-emitted lookalike", { tests: 999, pass: 999, fail: 0, duration_ms: 1 });
  const real = withSummary("real reporter", { tests: 100, pass: 98, fail: 2, duration_ms: 250 });
  const summary = extractRepositoryTestSummary(`${early}\nnoise between blocks\n${real}`);
  assert.equal(summary.complete, true);
  assert.equal(summary.canonical_block_count, 2);
  assert.equal(summary.tests, 100);
  assert.equal(summary.pass, 98);
  assert.equal(summary.duration_ms, 250);
});

test("isolated fake inventory line after canonical summary cannot override it", () => {
  const log = `${withSummary("", { tests: 100, pass: 98, fail: 2 })}\nℹ tests 1`;
  const summary = extractRepositoryTestSummary(log);
  assert.equal(summary.tests, 100);
  assert.equal(summary.pass, 98);
});
