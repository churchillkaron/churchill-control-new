import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync(
  new URL("../lib/operator/runtime/OperatorFastConversationRuntime.js", import.meta.url),
  "utf8",
);

test("voice does not disable semantic current-evidence routing", () => {
  assert.match(runtime, /const evidenceRequired = semanticUnderstanding \? semanticEvidenceRequired : fastConversationNeedsEvidence\(message\)/);
  assert.doesNotMatch(runtime, /const evidenceRequired = !voice/);
});

test("voice evidence presentation stays spoken-friendly without weakening evidence requirements", () => {
  assert.match(runtime, /Keep the answer natural for speech: concise, direct, and easy to hear in one pass/);
  assert.match(runtime, /voice_evidence_parity: voice/);
});
