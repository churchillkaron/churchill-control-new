import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  deriveRecurringCodeAIContractFailureLessons,
} from "../lib/code/runtime/CodeAIContractFailureLearningRuntime.js";

function match(id, kinds) {
  return {
    mission_id: id,
    failures: [{
      message: "CODE_AI_OBSERVED_CONTRACT_VIOLATION",
      contract_violations: kinds.map((kind) => ({ kind })),
    }],
  };
}

test("single verified contract failure does not become recurring negative memory", () => {
  const result = deriveRecurringCodeAIContractFailureLessons([
    match("m1", ["OBSERVED_RETURN_FIELD_REMOVED"]),
  ]);
  assert.equal(result.recurring, false);
  assert.equal(result.pattern_count, 0);
  assert.equal(result.minimum_distinct_verified_missions, 2);
});

test("same contract failure across verified missions becomes normalized preventive memory", () => {
  const result = deriveRecurringCodeAIContractFailureLessons([
    match("m1", ["OBSERVED_RETURN_FIELD_REMOVED"]),
    match("m2", ["OBSERVED_RETURN_FIELD_REMOVED"]),
  ]);
  assert.equal(result.recurring, true);
  assert.equal(result.pattern_count, 1);
  assert.equal(result.patterns[0].verified_mission_count, 2);
  assert.match(result.negative_engineering_lessons[0], /Preserve statically observed returned fields/i);
  assert.equal(result.current_head_revalidation_required, true);
  assert.equal(result.patch_replay_allowed, false);
});

test("different contract failure classes are counted independently across missions", () => {
  const result = deriveRecurringCodeAIContractFailureLessons([
    match("m1", ["OBSERVED_CALL_ARITY_INCOMPATIBLE", "BUSINESS_CONTEXT_INVARIANT_REMOVED"]),
    match("m2", ["OBSERVED_CALL_ARITY_INCOMPATIBLE"]),
    match("m3", ["BUSINESS_CONTEXT_INVARIANT_REMOVED"]),
  ]);
  assert.equal(result.pattern_count, 2);
  assert.ok(result.patterns.every((item) => item.verified_mission_count === 2));
});

test("verified-memory and world-class paths consume recurring contract learning", async () => {
  const memory = await readFile("lib/code/runtime/CodeAIVerifiedEngineeringMemoryRuntime.js", "utf8");
  const workPackage = await readFile("lib/code/runtime/CodeAIWorkPackageRuntime.js", "utf8");
  const worldClass = await readFile("lib/code/runtime/CodeAIWorldClassIntelligenceRuntime.js", "utf8");
  const history = await readFile("lib/code/runtime/CodeAIMissionHistoryRuntime.js", "utf8");
  assert.match(history, /contract_violations/);
  assert.match(memory, /deriveRecurringCodeAIContractFailureLessons/);
  assert.match(memory, /recurring_contract_failure_lessons/);
  assert.match(workPackage, /recurring_contract_failure_lessons/);
  assert.match(worldClass, /recurringContractLessons/);
});

import { prepareCodeAIWorldClassMission } from "../lib/code/runtime/CodeAIWorldClassIntelligenceRuntime.js";

test("recurring verified contract lesson reaches future world-class planning", () => {
  const prepared = prepareCodeAIWorldClassMission({
    objective: "Refactor invoice runtime safely.",
    resume_state: {
      verified_engineering_memory: {
        matches: [],
        recurring_contract_failure_lessons: [
          "Recurring verified contract failure (3 missions): Preserve observed business-context requirements such as organization/entity/period keys across runtime refactors.",
        ],
      },
    },
  });
  assert.ok(prepared.control.negative_engineering_memory.some((item) =>
    item.includes("business-context requirements")
  ));
  assert.match(prepared.options.objective, /KNOWN FAILED\/NEGATIVE APPROACHES/);
  assert.match(prepared.options.objective, /business-context requirements/);
});
