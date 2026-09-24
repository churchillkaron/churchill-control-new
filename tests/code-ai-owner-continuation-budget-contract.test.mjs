import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  MAX_CODE_AI_LOCAL_REASONING_CALL_BUDGET,
  MAX_CODE_AI_REASONING_CALL_BUDGET,
  assertCodeAIReasoningCallAllowed,
  resolveCodeAIReasoningCallBudget,
} from "../lib/code/runtime/CodeAIPlannerSpendPolicy.js";

const ide = await readFile(new URL("../components/creative/code/AvantiqoCodeIDE.jsx", import.meta.url), "utf8");
const route = await readFile(new URL("../app/api/operator/code/mission/route.js", import.meta.url), "utf8");
const employee = await readFile(new URL("../lib/code/runtime/CodeAIEmployeeRuntime.js", import.meta.url), "utf8");
const live = await readFile(new URL("../lib/code/runtime/CodeAIWorkPackageRuntimeLive.js", import.meta.url), "utf8");

test("local Code uses bounded four-call continuation tranches up to thirty-two", () => {
  assert.equal(MAX_CODE_AI_REASONING_CALL_BUDGET, 8);
  assert.equal(MAX_CODE_AI_LOCAL_REASONING_CALL_BUDGET, 32);
  assert.match(ide, /LOCAL_REASONING_BUDGET_TRANCHE = 4/);
  assert.match(ide, /MAX_LOCAL_REASONING_BUDGET = 32/);
  assert.match(ide, /preservedExhaustedBudget \+ LOCAL_REASONING_BUDGET_TRANCHE/);
  assert.match(ide, /completedOperationCount > lastContinuationCompletedOperationCount/);
  assert.match(ide, /requestedReasoningBudget < MAX_LOCAL_REASONING_BUDGET/);
  assert.match(ide, /requestedReasoningBudget \+ LOCAL_REASONING_BUDGET_TRANCHE/);
});

test("continuation extension remains bound to the same preserved mission", () => {
  assert.match(route, /boundedContinuationBudgetExtension/);
  assert.match(route, /resumedCallsUsed >= resumedBudget/);
  assert.match(route, /reasoningCallBudget > resumedBudget/);
  assert.match(route, /reasoningCallBudget <= reasoningBudgetCeiling/);
  assert.match(route, /adaptive_reasoning_budget_applied: true/);
  assert.match(route, /prior_reasoning_call_budget: resumedBudget/);
  assert.match(route, /continued_reasoning_call_budget: reasoningCallBudget/);
});

test("external planner ceiling stays eight while local DEVICE ceiling may reach thirty-two", () => {
  assert.equal(resolveCodeAIReasoningCallBudget(20), 8);
  assert.equal(resolveCodeAIReasoningCallBudget(40, { max_budget: 32 }), 32);
  assert.doesNotThrow(() => assertCodeAIReasoningCallAllowed({ call_number: 28, budget: 28, max_budget: 32 }));
  assert.throws(() => assertCodeAIReasoningCallAllowed({ call_number: 12, budget: 12 }), /BUDGET_EXHAUSTED/);
  assert.match(employee, /MAX_CODE_AI_LOCAL_REASONING_CALL_BUDGET/);
  assert.match(employee, /workspace_target.*DEVICE/s);
  assert.match(live, /max_budget: text\(objectiveContext\?\.workspace_target/);
});
test("resumed missions cannot preserve a budget below calls already consumed", () => {
  assert.match(live, /const reasoningCallsUsed = nonNegativeInteger\(source\.reasoning_calls_used\)/);
  assert.match(live, /const policyCeiling = localDeviceMission/);
  assert.match(live, /Math\.min\(reasoningCallsUsed, policyCeiling\)/);
  assert.match(live, /reasoning_call_budget: effectiveBudget/);
});
