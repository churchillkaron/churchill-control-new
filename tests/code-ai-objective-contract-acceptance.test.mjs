import test from "node:test";
import assert from "node:assert/strict";
import { resolveCodeAIObjectiveContractViolations } from "../lib/code/runtime/CodeAIWorkPackageRuntimeLive.js";

const objective = "Update lib/code/runtime/CodeAIAutonomyActionIdentity.js to add and export codeAIGuardedActionInputsEquivalent(action, left, right). The helper must implement equivalence by returning codeAIGuardedActionFingerprint(action, left) === codeAIGuardedActionFingerprint(action, right), and expose it as equivalent on CodeAIAutonomyActionIdentity. Create tests/code-ai-autonomy-action-identity-equivalence.test.mjs. The test file must import CodeAIAutonomyActionIdentity from ../lib/code/runtime/CodeAIAutonomyActionIdentity.js and must exercise CodeAIAutonomyActionIdentity.equivalent(...) to prove: reordered literal-search paths are equivalent, omitted read end_line equals the canonical default read window, and materially different read inputs are not equivalent.";

test("rejects passing-looking implementation missing public API binding and API test use", () => {
  const source = `export function codeAIGuardedActionFingerprint(action, input) { return String(input); }
export const CodeAIAutonomyActionIdentity = Object.freeze({ fingerprint: codeAIGuardedActionFingerprint });
export function codeAIGuardedActionInputsEquivalent(action, left, right) { return codeAIGuardedActionFingerprint(action, left) === codeAIGuardedActionFingerprint(action, right); }`;
  const testSource = `import { CodeAIAutonomyActionIdentity } from '../lib/code/runtime/CodeAIAutonomyActionIdentity.js';
CodeAIAutonomyActionIdentity.fingerprint('read', {});`;
  const violations = resolveCodeAIObjectiveContractViolations({ owner_objective: objective }, { source_changes: [
    { path: "lib/code/runtime/CodeAIAutonomyActionIdentity.js", operation: "write", content: source },
    { path: "tests/code-ai-autonomy-action-identity-equivalence.test.mjs", operation: "write", content: testSource },
  ]});
  assert.ok(violations.some((v) => v.kind === "PUBLIC_API_BINDING_MISSING"));
  assert.ok(violations.some((v) => v.kind === "PUBLIC_API_TEST_COVERAGE_MISSING"));
  assert.ok(!violations.some((v) => v.kind === "EXPLICIT_IMPLEMENTATION_EXPRESSION_MISSING"));
});

test("rejects shallow tests that name scenarios without proving them", () => {
  const source = `export function codeAIGuardedActionFingerprint(action, input) { return String(input); }
export function codeAIGuardedActionInputsEquivalent(action, left, right) { return codeAIGuardedActionFingerprint(action, left) === codeAIGuardedActionFingerprint(action, right); }
export const CodeAIAutonomyActionIdentity = Object.freeze({ equivalent: codeAIGuardedActionInputsEquivalent });`;
  const testSource = `import { CodeAIAutonomyActionIdentity } from '../lib/code/runtime/CodeAIAutonomyActionIdentity.js';
CodeAIAutonomyActionIdentity.equivalent('search', { mode: 'literal', query: 'x' }, { mode: 'literal', query: 'x' });
CodeAIAutonomyActionIdentity.equivalent('read', { file_path: 'file.js', start_line: 1 }, { file_path: 'file.js', start_line: 1, end_line: undefined });`;
  const violations = resolveCodeAIObjectiveContractViolations({ owner_objective: objective }, { source_changes: [
    { path: "lib/code/runtime/CodeAIAutonomyActionIdentity.js", operation: "write", content: source },
    { path: "tests/code-ai-autonomy-action-identity-equivalence.test.mjs", operation: "write", content: testSource },
  ]});
  assert.ok(violations.some((v) => v.scenario === "reordered_literal_search_paths"));
  assert.ok(violations.some((v) => v.scenario === "canonical_default_read_window"));
});

test("accepts explicit export, exact implementation, public binding and public API test", () => {
  const source = `export function codeAIGuardedActionFingerprint(action, input) { return String(input); }
export function codeAIGuardedActionInputsEquivalent(action, left, right) { return codeAIGuardedActionFingerprint(action, left) === codeAIGuardedActionFingerprint(action, right); }
export const CodeAIAutonomyActionIdentity = Object.freeze({ equivalent: codeAIGuardedActionInputsEquivalent });`;
  const testSource = `import { CodeAIAutonomyActionIdentity } from '../lib/code/runtime/CodeAIAutonomyActionIdentity.js';
CodeAIAutonomyActionIdentity.equivalent('search', { mode: 'literal', query: 'x', paths: ['a.js', 'b.js'] }, { mode: 'literal', query: 'x', paths: ['b.js', 'a.js'] });
CodeAIAutonomyActionIdentity.equivalent('read', { file_path: 'file.js', start_line: 1 }, { file_path: 'file.js', start_line: 1, end_line: 400 });
CodeAIAutonomyActionIdentity.equivalent('read', { file_path: 'file.js', start_line: 1, end_line: 5 }, { file_path: 'file.js', start_line: 1, end_line: 10 });`;
  assert.deepEqual(resolveCodeAIObjectiveContractViolations({ owner_objective: objective }, { source_changes: [
    { path: "lib/code/runtime/CodeAIAutonomyActionIdentity.js", operation: "write", content: source },
    { path: "tests/code-ai-autonomy-action-identity-equivalence.test.mjs", operation: "write", content: testSource },
  ]}), []);
});
