import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  new URL("../lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js", import.meta.url),
  "utf8",
);

test("Tribunal gives physical-realism and sound-sync reviewers dedicated evidence scopes", () => {
  assert.match(source, /return "PHYSICAL_REALISM"/);
  assert.match(source, /return "SOUND_VISUAL_SYNC"/);
  assert.match(source, /case "PHYSICAL_REALISM"/);
  assert.match(source, /case "SOUND_VISUAL_SYNC"/);
  assert.match(source, /reviewer_scoped_evidence:\s*reviewerPlanEvidence\(reviewer, plan\)/);
  assert.match(source, /Before claiming required evidence is missing/i);
});
