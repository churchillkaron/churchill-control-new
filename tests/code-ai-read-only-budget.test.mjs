import assert from "node:assert/strict";
import test from "node:test";
import { resolveCodeAIEmployeeReasoningBudget } from "../lib/code/runtime/CodeAIEmployeeRuntime.js";

test("explicit read-only missions cannot consume mutation-grade local reasoning budgets", () => {
  assert.equal(resolveCodeAIEmployeeReasoningBudget({
    reasoning_call_budget: 32,
    local_device_mission: true,
    objective: "Read-only inspection of two files. Do not modify source files.",
  }), 2);
});

test("write missions preserve the requested local reasoning budget", () => {
  assert.equal(resolveCodeAIEmployeeReasoningBudget({
    reasoning_call_budget: 12,
    local_device_mission: true,
    objective: "Repair the broken route and verify it.",
  }), 12);
});

test("read-only intent inherited from resume state stays bounded", () => {
  assert.equal(resolveCodeAIEmployeeReasoningBudget({
    reasoning_call_budget: 8,
    local_device_mission: true,
    objective: "Continue the preserved mission.",
    resume_state: { employee_mission: { owner_intent: "Make no source changes; inspect only." } },
  }), 2);
});
