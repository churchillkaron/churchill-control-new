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
  assert.match(source, /\["apply_files", "replace_range"\]\.includes\(decision\.action\)/);
});


test("implementation missions hydrate declared evidence before the first planner call", () => {
  assert.match(source, /async function hydrateDeclaredEvidence/);
  assert.match(source, /autonomy_declared_evidence_/);
  assert.match(source, /Read declared mission evidence before planner reasoning/);
  assert.match(source, /const hydration = await hydrateDeclaredEvidence/);
  assert.match(source, /declared_evidence: list\(source\.evidence\)/);
});

test("preloaded declared evidence reads cannot be redundantly repeated before a source change", () => {
  assert.match(source, /function duplicateActionGuard\(state, control, decision\)/);
  assert.match(source, /decision\.action === "read" && currentSourceRevision === 0/);
  assert.match(source, /duplicate_match_mode: "HYDRATED_READ_COVERED"/);
  assert.match(source, /duplicateActionGuard\(state, control, decision\)/);
});


test("hydrated EOF reads cover later wider numeric ranges on the unchanged file", () => {
  assert.match(source, /const previousTotalLines = Number\(previousInput\?\.total_lines\)/);
  assert.match(source, /const previousReachedEof/);
  assert.match(source, /Number\(previousInput\?\.end_line\) >= previousTotalLines/);
  assert.match(source, /previous\.end_line >= requested\.end_line \|\| previousReachedEof/);
});


test("fresh implementation missions inspect and hydrate declared evidence in one initial workspace", () => {
  assert.match(source, /const initialDeclaredEvidencePaths/);
  assert.match(source, /objectiveContext\?\.implementation_required === true/);
  assert.match(source, /operations: \[/);
  assert.match(source, /id: "autonomy_initial_inspect"/);
  assert.match(source, /\.\.\.initialDeclaredEvidencePaths\.map/);
  assert.match(source, /id: `autonomy_declared_evidence_\$\{index \+ 1\}`/);
  assert.match(source, /objective_context: objectiveContext/);
});


test("controller-hydrated declared reads are promoted into planner source evidence", () => {
  assert.match(source, /const declaredEvidencePathSet = new Set/);
  assert.match(source, /declaredEvidencePaths\(source\.objective_context\)/);
  assert.match(source, /currentReadOperationIds\.has\(operationId\) \|\|/);
  assert.match(source, /declaredEvidencePathSet\.has\(filePath\)/);
});


test("evidence-complete failing implementation missions enter a mutation-focused phase", () => {
  assert.match(source, /const repairReadyForMutation/);
  assert.match(source, /declaredEvidenceHydrated/);
  assert.match(source, /observedFailingExecution/);
  assert.match(source, /reproductionAlreadyRecordedAtCurrentSourceRevision/);
  assert.match(source, /currentHypothesesComplete/);
  assert.match(source, /const mutationPhaseActions = new Set/);
  assert.match(source, /"apply_files"/);
  assert.match(source, /"replace_range"/);
  assert.match(source, /const mutationPhaseActions = new Set\(\[\s*"apply_files",\s*"replace_range",\s*"block",\s*\]\)/);
  assert.doesNotMatch(
    source.match(/const mutationPhaseActions = new Set\(\[[\s\S]*?\]\);/)?.[0] || "",
    /"precision_analyze"|"history"|"run"|"verify"|"read"/,
  );
  assert.match(source, /allowedActions = allowedActions\.filter\(\(action\) => mutationPhaseActions\.has\(action\)\)/);
});


test("observed failure enters a reproduction-capture phase before mutation", () => {
  assert.match(source, /const reproductionCaptureRequired/);
  assert.match(source, /reproductionExecutionAtCurrentSourceRevision/);
  assert.match(source, /!reproductionAlreadyRecordedAtCurrentSourceRevision/);
  assert.match(source, /const reproductionPhaseActions = new Set\(\["record_reproduction", "block"\]\)/);
  assert.match(source, /allowedActions = allowedActions\.filter\(\(action\) => reproductionPhaseActions\.has\(action\)\)/);
});


test("every source revision must be verified before another edit is allowed", () => {
  assert.match(source, /const successfulVerifyAtCurrentSourceRevision/);
  assert.match(source, /const verificationObservedAtCurrentSourceRevision/);
  assert.match(source, /const postEditVerificationActions = new Set\(\["verify", "block"\]\)/);
  assert.match(source, /!verificationObservedAtCurrentSourceRevision/);
  assert.match(source, /const postVerifyRepairActions = new Set\(\["apply_files", "replace_range", "block"\]\)/);
  assert.match(source, /failedVerifyAtCurrentSourceRevision/);
});
