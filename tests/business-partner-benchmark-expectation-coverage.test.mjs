import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const suite = JSON.parse(fs.readFileSync("benchmarks/business-partner/suite.v1.json", "utf8"));
const expectations = JSON.parse(
  fs.readFileSync("benchmarks/business-partner/expectations.v1.json", "utf8"),
);
const referenceRunner = fs.readFileSync(
  "scripts/run-business-partner-reference-head-to-head.mjs",
  "utf8",
);

test("every benchmark case has exactly one hidden expectation", () => {
  assert.equal(
    expectations.contract,
    "AVANTIQO_BUSINESS_PARTNER_BENCHMARK_EXPECTATIONS_V1",
  );
  const suiteIds = suite.cases.map((item) => item.id).sort();
  const expectationIds = Object.keys(expectations.cases).sort();
  assert.deepEqual(expectationIds, suiteIds);
});

test("hidden expectations are never included in reference prompts", () => {
  assert.equal(referenceRunner.includes("expectations.v1.json"), false);
  assert.equal(referenceRunner.includes("capability_contains"), false);
});

test("every expectation defines core decision semantics", () => {
  for (const item of suite.cases) {
    const expected = expectations.cases[item.id];
    assert.ok(Array.isArray(expected.goal_relation) && expected.goal_relation.length > 0, item.id);
    assert.ok(Array.isArray(expected.action_type) && expected.action_type.length > 0, item.id);
    assert.equal(typeof expected.needs_current_evidence, "boolean", item.id);
    assert.equal(typeof expected.confirmation_required, "boolean", item.id);
    assert.equal(typeof expected.clarification_required, "boolean", item.id);
    assert.equal(typeof expected.would_execute_now, "boolean", item.id);
    assert.ok(Array.isArray(expected.finality) && expected.finality.length > 0, item.id);
  }
});
