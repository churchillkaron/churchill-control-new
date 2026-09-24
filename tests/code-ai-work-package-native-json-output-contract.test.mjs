import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workPackage = await readFile(new URL("../lib/code/runtime/CodeAIWorkPackageRuntimeLive.js", import.meta.url), "utf8");
const localProvider = await readFile(new URL("../lib/platform/service-runtime/providers/avantiqo-code/AvantiqoCodeLocalQueueProvider.js", import.meta.url), "utf8");

test("work-package planner requests native JSON and compact repair output cap", () => {
  assert.match(workPackage, /response_format: \{ type: "json_object" \}/);
  assert.match(workPackage, /max_output_tokens: plannerMaxOutputTokens/);
  assert.match(workPackage, /resolveCodeAIPlannerOutputTokenBudget/);
  assert.match(workPackage, /temperature: plannerOutputRepair\.compact_json_only === true \|\| plannerOutputRepair\.mutation_shape_invalid === true \|\| plannerOutputRepair\.operation_limit_exceeded === true \|\| plannerOutputRepair\.protected_test_mutation === true \|\| plannerOutputRepair\.partial_source_replacement === true \? 0 : 0\.1/);
});

test("owned local Code queue preserves JSON mode and output controls", () => {
  assert.match(localProvider, /input\.response_format\|\|input\.responseFormat/);
  assert.match(localProvider, /response_format:\{type:"json_object"\}/);
  assert.match(localProvider, /Number\.isFinite\(Number\(input\.temperature\)\)/);
});

test("owned local Code queue binds canonical instruction without object stringification", () => {
  assert.match(localProvider, /function scalarText\(v\)/);
  assert.match(localProvider, /scalarText\(input\.instruction\)\|\|scalarText\(input\.provider_prompt\)/);
  assert.match(localProvider, /scalarText\(input\.input\)/);
  assert.doesNotMatch(localProvider, /text\(input\.input\)/);
  assert.match(localProvider, /AVANTIQO_CODE_LOCAL_INSTRUCTION_REQUIRED/);
});
