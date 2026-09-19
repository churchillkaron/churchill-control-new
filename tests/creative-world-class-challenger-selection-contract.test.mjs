import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("lib/creative/director/runtime/CreativeWorldClassConceptIntelligenceRuntime.js", "utf8");

test("world-class gate does not misclassify challenger selection as independent council", () => {
  assert.match(source, /CREATIVE_STUDIO_CHALLENGER_SELECTION_V1/);
  assert.match(source, /return null/);
  assert.match(source, /const baseline = universalConceptGate\(result\.plan, policy\)/);
});
