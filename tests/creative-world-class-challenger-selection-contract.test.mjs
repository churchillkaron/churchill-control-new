import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("lib/creative/director/runtime/CreativeWorldClassConceptIntelligenceRuntime.js", "utf8");

test("world-class gate does not misclassify selection-lineage councils as independent scorecard councils", () => {
  assert.match(source, /CREATIVE_STUDIO_CHALLENGER_SELECTION_V1/);
  assert.match(source, /CREATIVE_STORY_LINEAGE_RECOVERY_COUNCIL_V1/);
  assert.match(source, /\.includes\(text\(council\.contract\)\)\) return null/);
  assert.match(source, /const baseline = universalConceptGate\(result\.plan, policy\)/);
});
