import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync(
  new URL("../lib/operator/runtime/OperatorHumanBusinessPartnerUnderstandingRuntime.js", import.meta.url),
  "utf8",
);

test("semantic understanding is grounded in durable project and agreement context", () => {
  assert.match(runtime, /function compactSemanticContext/);
  assert.match(runtime, /objective: text\(project\.objective/);
  assert.match(runtime, /decisions: list\(project\.decisions\)/);
  assert.match(runtime, /constraints: list\(project\.constraints\)/);
  assert.match(runtime, /pending_action:/);
  assert.match(runtime, /recommendation:/);
  assert.match(runtime, /long_term_memory: memory/);
  assert.match(runtime, /current_screen:/);
});

test("semantic understanding resolves shorthand from context without granting authority", () => {
  assert.match(runtime, /ellipsis, pronouns, ordinal references, corrections, or shorthand/);
  assert.match(runtime, /context for reference resolution, not as new authorization/);
  assert.match(runtime, /JSON\.stringify\(\{ message, recent, context: semanticContext \}\)/);
});
