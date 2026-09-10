import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const suite = JSON.parse(await readFile("benchmarks/avantiqo-code-frontier-engineering-suite.json", "utf8"));

test("frontier code suite is substantial and provider neutral", () => {
  assert.equal(suite.contract, "AVANTIQO_CODE_FRONTIER_ENGINEERING_SUITE_V1");
  assert.equal(suite.same_case_ids_required_for_all_providers, true);
  assert.equal(suite.production_runtime_effect, "NONE");
  assert.ok(suite.cases.length >= 20);
  assert.equal(new Set(suite.cases.map((item) => item.case_id)).size, suite.cases.length);
});

test("frontier suite covers repository security finance runtime quality and intelligence", () => {
  const categories = new Set(suite.cases.map((item) => item.category));
  for (const required of ["repository","security","finance","database","runtime","agent","quality","performance","intelligence"]) {
    assert.ok(categories.has(required), `missing category ${required}`);
  }
  for (const sample of suite.cases) {
    assert.ok(Array.isArray(sample.required_evidence) && sample.required_evidence.length >= 2);
  }
});
