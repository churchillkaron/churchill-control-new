import assert from "node:assert/strict";
import test from "node:test";
import {
  compareRepositoryRegressionDelta,
  extractRepositoryTestFailures,
} from "../scripts/code-ai-repository-regression-delta.mjs";

test("repository regression delta extracts spec and TAP failures deterministically", () => {
  const failures = extractRepositoryTestFailures([
    "✖ creative alpha preview stays stable (12.3ms)",
    "not ok 41 - finance posting remains atomic",
    "✖ creative alpha preview stays stable (8.1ms)",
  ].join("\n"));
  assert.deepEqual(failures, [
    "creative alpha preview stays stable",
    "finance posting remains atomic",
  ]);
});

test("green PR head passes without requiring a green base", () => {
  const result = compareRepositoryRegressionDelta({
    headLog: "tests 20\npass 20",
    baseLog: "✖ unrelated existing failure (2ms)",
    headExit: 0,
    baseExit: 1,
  });
  assert.equal(result.success, true);
  assert.equal(result.reason, "HEAD_GREEN");
});

test("red head against green base fails closed", () => {
  const result = compareRepositoryRegressionDelta({
    headLog: "✖ new failure (2ms)",
    baseLog: "tests 20\npass 20",
    headExit: 1,
    baseExit: 0,
  });
  assert.equal(result.success, false);
  assert.equal(result.reason, "BASE_GREEN_HEAD_RED");
  assert.deepEqual(result.new_failures, ["new failure"]);
});

test("existing unrelated failures do not fail a Code PR", () => {
  const result = compareRepositoryRegressionDelta({
    headLog: "✖ existing creative failure (5ms)\n✖ existing music failure (4ms)",
    baseLog: "✖ existing creative failure (9ms)\n✖ existing music failure (3ms)",
    headExit: 1,
    baseExit: 1,
  });
  assert.equal(result.success, true);
  assert.equal(result.reason, "NO_NEW_REPOSITORY_REGRESSIONS");
  assert.deepEqual(result.new_failures, []);
});

test("new failure relative to red base fails the PR", () => {
  const result = compareRepositoryRegressionDelta({
    headLog: "✖ existing creative failure (5ms)\n✖ new Code regression (4ms)",
    baseLog: "✖ existing creative failure (9ms)",
    headExit: 1,
    baseExit: 1,
  });
  assert.equal(result.success, false);
  assert.equal(result.reason, "NEW_REPOSITORY_REGRESSIONS");
  assert.deepEqual(result.new_failures, ["new Code regression"]);
});

test("unparseable red output fails closed", () => {
  const result = compareRepositoryRegressionDelta({
    headLog: "process crashed before reporter output",
    baseLog: "process crashed before reporter output",
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
  assert.match(workflow, /AVANTIQO_CODE_REPOSITORY_REGRESSION_DELTA=PASS/);
});
