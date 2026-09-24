import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("lib/operator/runtime/OperatorReasoningRuntime.js", "utf8");

test("current-state evidence gate requires current wording, read capabilities and ranked business-read evidence", () => {
  assert.match(source, /export function fastCurrentStateEvidenceRequired/);
  assert.match(source, /CURRENT_STATE_EVIDENCE_PATTERN\.test\(message\)/);
  assert.match(source, /capability\?\.mode\)\.toLowerCase\(\) === "read"/);
  assert.match(source, /resolveOperatorBusinessRead\(\{/);
  assert.match(source, /Number\(top\.score \|\| 0\) >= 0\.16/);
  assert.match(source, /Number\(top\.phrase_affinity \|\| 0\) >= 0\.35/);
  assert.match(source, /Number\(top\.primary_coverage \|\| 0\) >= 0\.25/);
});

test("fast reasoning must execute matching current reads instead of answering from stale model context", () => {
  assert.match(source, /currentStateEvidenceRequired && intent !== "execute"/);
  assert.match(source, /When the request explicitly asks for current, live, latest, status, or verified business state/);
});
