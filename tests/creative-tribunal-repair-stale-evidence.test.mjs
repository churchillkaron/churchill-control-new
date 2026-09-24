import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js", import.meta.url), "utf8");

test("Tribunal repair must replace exact cited stale blocker evidence before paid re-review", () => {
  assert.match(source, /blockerQuotedEvidenceFragments/);
  assert.match(source, /unresolvedQuotedBlockerEvidence/);
  assert.match(source, /CREATIVE_TRIBUNAL_REPAIR_STALE_BLOCKER_EVIDENCE/);
  assert.match(source, /candidateText\.includes\(fragment\.toLowerCase\(\)\)/);
  assert.match(source, /CREATIVE_TRIBUNAL_REPAIR_STALE_BLOCKER_EVIDENCE/);
});
