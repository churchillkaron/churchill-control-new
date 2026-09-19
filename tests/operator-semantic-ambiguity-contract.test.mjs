import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const understanding = fs.readFileSync("lib/operator/runtime/OperatorHumanBusinessPartnerUnderstandingRuntime.js", "utf8");
const fast = fs.readFileSync("lib/operator/runtime/OperatorFastConversationRuntime.js", "utf8");
const governed = fs.readFileSync("lib/operator/runtime/OperatorTurnRuntime.js", "utf8");
const clarification = fs.readFileSync("lib/operator/runtime/OperatorSemanticClarificationRuntime.js", "utf8");

test("semantic understanding distinguishes material ambiguity from resolvable context", () => {
  assert.match(understanding, /ambiguity_level/);
  assert.match(understanding, /candidate_interpretations/);
  assert.match(understanding, /clarification_required/);
  assert.match(understanding, /Do not ask for clarification when context resolves the referent well enough/);
});

test("fast conversation stops before evidence when material clarification is required", () => {
  assert.match(fast, /semanticClarificationRequired/);
  assert.match(fast, /semantic-clarification-v1/);
  assert.match(fast, /mutation_executed: false/);
});

test("governed ambiguity is answered before any execution handoff", () => {
  assert.match(governed, /semanticClarificationTurn\(options\)/);
  assert.match(governed, /if \(semanticClarification\) return semanticClarification/);
  assert.match(clarification, /clarification_required !== true/);
  assert.match(clarification, /execution: \{ capability_key: null/);
  assert.match(clarification, /mutation_executed: false/);
});
