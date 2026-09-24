import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const mission = await readFile("lib/code/runtime/CodeAIMissionRuntime.js", "utf8");
const autonomy = await readFile("lib/code/runtime/CodeAIAutonomousRuntime.js", "utf8");
const prompt = await readFile("lib/code/runtime/CodeAIPlannerPromptRuntime.js", "utf8");

test("hypothesis evidence is bound to the current source revision", () => {
  assert.match(mission, /source_revision: Math\.max\(0, Number\(state\?\.autonomy_control\?\.source_revision \|\| 0\)\)/);
});

test("completed hypotheses are suppressed until source revision changes", () => {
  assert.match(autonomy, /const currentHypothesesComplete =/);
  assert.match(autonomy, /hypothesisSourceRevision === currentSourceRevision/);
  assert.match(autonomy, /action !== "record_hypotheses"/);
  assert.match(autonomy, /advanceSourceRevision/);
});

test("planner contract forbids unsupported hypothesis conclusions", () => {
  assert.match(prompt, /ELIMINATED or SUPPORTED only when it includes one or more observed evidence_operation_ids/);
  assert.match(prompt, /otherwise keep it PLAUSIBLE/);
});
