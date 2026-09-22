import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../lib/code/runtime/CodeAIWorkPackageRuntimeLive.js", import.meta.url), "utf8");

test("planner carries pre-edit inspection from prompt transport into structured specification", () => {
  assert.match(source, /effectiveRepairState,\n\s+preEditInspection,\n\s+prompt:/);
  assert.match(source, /effectiveRepairState,\n\s+preEditInspection,\n\s+prompt,\n\s+} = promptTransport/);
  assert.match(source, /pre_edit_inspection_contract: preEditInspection\.contract/);
});

test("planning failure publishes a failed state instead of stale running state", () => {
  assert.match(source, /const failedState = \{[\s\S]*status: "failed"/);
  assert.match(source, /await safeProgress\(context, failedState, \{[\s\S]*phase: "PLANNING_FAILED"/);
  assert.match(source, /return blocked\(failedState, reason\)/);
});


test("explicit implementation-required context survives normalization and blocks empty completion", () => {
  assert.match(source, /implementation_required: source\.implementation_required === true/);
  assert.match(source, /if \(policy\.implementation_required && !changed\) return false/);
});


test("declared target evidence blocks mutation until loaded", () => {
  assert.match(source, /DECLARED TARGET EVIDENCE MUST BE READ FIRST/);
  assert.match(source, /actionPolicy\.mutation_blocked_by_declared_evidence !== true/);
});


test("undefined symbol verifier evidence targets the failing changed file", () => {
  assert.match(source, /function resolveCodeAIUndefinedSymbolRepairTarget/);
  assert.match(source, /ReferenceError:/);
  assert.match(source, /VERIFIER-TARGETED REPAIR/);
  assert.match(source, /undefined_symbol_repair: undefinedSymbolRepair/);
});


test("plannerInput receives objective contract violations from prompt transport", () => {
  const matches = source.match(/objectiveContractViolations,/g) || [];
  assert.ok(matches.length >= 2);
  assert.match(source, /objective_contract_violations: objectiveContractViolations/);
});
