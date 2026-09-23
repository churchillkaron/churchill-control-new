import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ide = await readFile(new URL("../components/creative/code/AvantiqoCodeIDE.jsx", import.meta.url), "utf8");
const route = await readFile(new URL("../app/api/operator/code/mission/route.js", import.meta.url), "utf8");

test("explicit owner continuation extends an exhausted mission without resetting prior calls", () => {
  assert.match(ide, /CODE_AI_EMPLOYEE_REASONING_BUDGET_EXHAUSTED/);
  assert.match(ide, /requestedReasoningBudget[\s\S]{0,120}\? 8[\s\S]{0,80}: 4/);
  assert.match(route, /ownerContinuationBudgetExtension/);
  assert.match(route, /resumedCallsUsed >= resumedBudget/);
  assert.match(route, /reasoningCallBudget > resumedBudget/);
  assert.match(route, /adaptive_reasoning_budget_applied: true/);
  assert.match(route, /prior_reasoning_call_budget: resumedBudget/);
  assert.match(route, /continued_reasoning_call_budget: reasoningCallBudget/);
});
