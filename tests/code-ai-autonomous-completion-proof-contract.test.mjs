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


test("identical verifier retries are suppressed until evidence or source revision changes", () => {
  assert.match(source, /DUPLICATE_GUARDED_ACTIONS = new Set\(\["read", "search", "run", "verify"\]\)/);
  assert.match(source, /decision\.action === "verify"/);
  assert.match(source, /entry\.source_revision === currentSourceRevision/);
  assert.match(source, /recordGuardedAction\(/);
  assert.match(source, /CODE_AI_AUTONOMOUS_DUPLICATE_ACTION_WITHOUT_NEW_EVIDENCE/);
});


test("failed verification stays unavailable until source revision advances", () => {
  assert.match(source, /failedVerifyAtCurrentSourceRevision/);
  assert.match(source, /entry\.action === "verify"/);
  assert.match(source, /entry\.status === "failed"/);
  assert.match(source, /entry\.source_revision === currentSourceRevision/);
  assert.match(source, /allowedActions = allowedActions\.filter\(\(action\) => action !== "verify"\)/);
});


test("reproduction recording is unavailable until a failing execution is observed", () => {
  assert.match(source, /const observedFailingExecution/);
  assert.match(source, /state\?\.verification.*passed === false/s);
  assert.match(source, /Number\(entry\?\.exit_code\).*!== 0/s);
  assert.match(source, /allowedActions = allowedActions\.filter\(\(action\) => action !== "record_reproduction"\)/);
});


test("implementation missions wait for all declared evidence paths before forming hypotheses", () => {
  assert.match(source, /const namedEvidencePaths = \[/);
  assert.match(source, /state\?\.objective_context\?\.implementation_required === true/);
  assert.match(source, /authoritative_verification_command/);
  assert.match(source, /\? namedEvidencePaths\.length/);
  assert.match(source, /: Math\.min\(2, namedEvidencePaths\.length\)/);
  assert.match(source, /observedNamedEvidenceReads < minimumNamedEvidenceReads/);
  assert.match(source, /allowedActions = allowedActions\.filter\(\(action\) => action !== "record_hypotheses"\)/);
});


test("reproduction can be recorded only once per source revision after a fresh run or verify", () => {
  assert.match(source, /const reproductionExecutionAtCurrentSourceRevision/);
  assert.match(source, /\["verify", "run"\]\.includes\(entry\.action\)/);
  assert.match(source, /const reproductionAlreadyRecordedAtCurrentSourceRevision/);
  assert.match(source, /entry\?\.source_revision.*currentSourceRevision/s);
  assert.match(source, /reproductionAlreadyRecordedAtCurrentSourceRevision/);
});


test("implementation-required missions do not offer diff or complete before the first source change", () => {
  assert.match(source, /state\?\.objective_context\?\.implementation_required === true/);
  assert.match(source, /currentSourceRevision === 0/);
  assert.match(source, /!\["diff", "complete"\]\.includes\(action\)/);
});


test("autonomous planner can use replace_range and successful range edits advance source revision", () => {
  assert.match(source, /"replace_range"/);
  assert.match(source, /decision\.action === "apply_files" \|\| decision\.action === "replace_range"/);
});
