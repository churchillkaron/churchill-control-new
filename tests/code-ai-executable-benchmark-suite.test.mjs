import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const suite = JSON.parse(await readFile("benchmarks/avantiqo-code-executable-engineering-suite.json", "utf8"));

test("executable benchmark has eight independent engineering fixtures", () => {
  assert.equal(suite.contract, "AVANTIQO_CODE_EXECUTABLE_ENGINEERING_SUITE_V1");
  assert.equal(suite.hidden_verification_required, true);
  assert.equal(suite.candidate_cannot_edit_tests, true);
  assert.ok(suite.cases.length >= 8);
  assert.equal(new Set(suite.cases.map((item) => item.case_id)).size, suite.cases.length);
});

test("every executable case has bounded editable scope public verification and hidden verification", () => {
  for (const item of suite.cases) {
    assert.ok(item.objective.length >= 40, item.case_id);
    assert.ok(Array.isArray(item.allowed_edit_paths) && item.allowed_edit_paths.length > 0, item.case_id);
    assert.equal(item.public_verifier.command, "node", item.case_id);
    assert.ok(Array.isArray(item.public_verifier.args) && item.public_verifier.args.length > 0, item.case_id);
    assert.ok(item.files["package.json"], item.case_id);
    assert.ok(item.files["tests/public.test.mjs"], item.case_id);
    assert.ok(item.hidden_verifier_source.includes("BENCHMARK_ROOT"), item.case_id);
    assert.ok(item.allowed_edit_paths.every((path) => !path.startsWith("tests/")), item.case_id);
  }
});

test("executable suite covers correctness security finance runtime agent performance and backend semantics", () => {
  const categories = new Set(suite.cases.map((item) => item.category));
  for (const category of ["debug", "refactor", "security", "finance", "runtime", "agent", "performance", "backend"]) {
    assert.ok(categories.has(category), category);
  }
});
