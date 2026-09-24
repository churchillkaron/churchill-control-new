import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../lib/code/runtime/CodeAIEmployeeRuntime.js", import.meta.url), "utf8");

test("planner pending yields immediately to the background continuation owner", () => {
  assert.match(source, /if \(text\(lastResult\?\.status, 100\) === "planner_pending"\)/);
  assert.match(source, /continuation boundary owned by the[\s\S]*background mission runner/);
  assert.match(source, /continuation_yield: true/);
  assert.match(source, /return employeeResult\(\{[\s\S]*continuation_yield: true[\s\S]*\}, state, pass\)/);
  assert.doesNotMatch(source, /pending local planner execution[\s\S]*continue;/);
});

test("employee pass budget still bounds non-pending repair and verification loops", () => {
  assert.match(source, /for \(let pass = 1; pass <= maximumPasses; pass \+= 1\)/);
  assert.match(source, /CODE_AI_EMPLOYEE_PASS_BUDGET_EXHAUSTED/);
});
