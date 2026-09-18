import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js", import.meta.url), "utf8");

test("dynamic tribunal repair uses blocker-scoped compact context", () => {
  assert.match(source, /function tribunalRepairPlanView\(plan = \{\}, blocking = \[\]\)/);
  assert.match(source, /function tribunalRepairContextView\(context = \{\}\)/);
  assert.match(source, /plan: tribunalRepairPlanView\(plan, blocking\)/);
  assert.match(source, /context: tribunalRepairContextView\(context\)/);
});

test("dynamic tribunal repair prompt uses structural scene and shot patches", () => {
  assert.match(source, /For scenes, return only blocker-bearing scenes/);
  assert.match(source, /for each returned scene include only id and changed fields/);
  assert.match(source, /for each returned shot include only id and changed fields/);
});

test("dynamic tribunal repair output is capped below legacy 20k ceiling", () => {
  const repairCall = source.slice(source.indexOf('operation: "CREATIVE_DYNAMIC_TRIBUNAL_REPAIR_V1"'), source.indexOf('repairUsage = repair.result.usage'));
  assert.match(repairCall, /max_output_tokens: 6000/);
  assert.doesNotMatch(repairCall, /max_output_tokens: 20000/);
});
