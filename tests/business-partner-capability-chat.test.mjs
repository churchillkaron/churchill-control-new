import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const runtimeSource = fs.readFileSync("lib/operator/runtime/OperatorFastConversationRuntime.js", "utf8");
const policySource = fs.readFileSync("lib/operator/runtime/OperatorFastEvidencePolicy.js", "utf8");
const uiSource = fs.readFileSync("components/operator/HomeAvantiqoIntelligence.jsx", "utf8");

test("self and capability questions stay on immediate front conversation", () => {
  assert.match(policySource, /SELF_CAPABILITY_QUESTION_PATTERN/);
  assert.match(policySource, /if \(SELF_CAPABILITY_QUESTION_PATTERN\.test\(input\)\) return false/);
  assert.match(runtimeSource, /SELF_CAPABILITY_QUESTION_PATTERN\.test\(clean\)/);
  assert.match(runtimeSource, /work through Code Studio/);
});

test("live status renders elapsed time exactly once", () => {
  assert.match(uiSource, /conversationalProgressStatus\(liveExecution, busyElapsedSeconds, activeRequestStartedAt\)/);
  assert.doesNotMatch(uiSource, /<span className="text-white\/20">· \{busyElapsedSeconds\}s<\/span>/);
});
