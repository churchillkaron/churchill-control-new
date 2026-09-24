import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ide = await readFile(new URL("../components/creative/code/AvantiqoCodeIDE.jsx", import.meta.url), "utf8");
const route = await readFile(new URL("../app/api/operator/code/mission/route.js", import.meta.url), "utf8");

test("client continuation budget advances beyond calls already used", () => {
  assert.match(ide, /CODE_AI_EMPLOYEE_REASONING_BUDGET_EXHAUSTED:\(\\d\+\):\(\\d\+\)/);
  assert.match(ide, /minimumBudgetBeyondUsedCalls/);
  assert.match(ide, /Math\.ceil\(\(preservedReasoningCallsUsed \+ 1\) \/ LOCAL_REASONING_BUDGET_TRANCHE\)/);
});

test("server enforces a monotonic local continuation floor", () => {
  assert.match(route, /resumedBudgetExhausted/);
  assert.match(route, /const nextBudgetBeyondUsedCalls = Math\.ceil\(\(resumedCallsUsed \+ 1\) \/ 4\) \* 4/);
  assert.match(route, /reasoningCallBudget = Math\.min\(/);
  assert.match(route, /Math\.max\([\s\S]*reasoningCallBudget,[\s\S]*resumedBudget \+ 4[\s\S]*nextBudgetBeyondUsedCalls/);
});
