import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../lib/code/runtime/CodeAIAutonomousRuntime.js", import.meta.url),
  "utf8",
);

test("autonomous objective context preserves implementation scope and exact verifier", () => {
  assert.match(source, /implementation_required: source\.implementation_required === true/);
  assert.match(source, /allowed_edit_paths: list\(source\.allowed_edit_paths\)/);
  assert.match(source, /authoritative_verification_command:/);
  assert.match(source, /authoritative_verification_args: list\(source\.authoritative_verification_args\)/);
});

test("implementation-required missions cannot complete without a mission-owned change", () => {
  assert.match(source, /function implementationCompletionProof/);
  assert.match(source, /CODE_AI_AUTONOMOUS_REQUIRED_IMPLEMENTATION_MISSING/);
  assert.match(source, /CODE_AI_AUTONOMOUS_ALLOWED_EDIT_SCOPE_VIOLATION/);
  assert.match(source, /implementationCompletionProof\(state\)/);
});

test("completion requires the exact declared authoritative verifier", () => {
  assert.match(source, /function authoritativeVerificationProof/);
  assert.match(source, /text\(entry\?\.command, 300\) === command/);
  assert.match(source, /JSON\.stringify\(list\(entry\?\.args\)/);
  assert.match(source, /CODE_AI_AUTONOMOUS_AUTHORITATIVE_VERIFICATION_REQUIRED/);
  assert.match(source, /authoritativeVerificationProof\(state\)/);
});
