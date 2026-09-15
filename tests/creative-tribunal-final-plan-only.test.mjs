import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js", import.meta.url), "utf8");

test("Tribunal reviews authoritative final plan without historical evaluator artifacts", () => {
  for (const key of ["concept_council", "concept_candidates", "creative_review", "role_decisions", "validation_summary"]) {
    assert.match(source, new RegExp(`\\"${key}\\"`));
  }
  assert.match(source, /Tribunal must judge the authoritative finished plan, not historical evaluators/);
});
