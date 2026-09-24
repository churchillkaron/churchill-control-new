import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const live = await readFile(new URL("../lib/code/runtime/CodeAIWorkPackageRuntimeLive.js", import.meta.url), "utf8");
const provider = await readFile(new URL("../lib/platform/service-runtime/providers/avantiqo-code/AvantiqoCodeLocalQueueProvider.js", import.meta.url), "utf8");

test("live work-package routing preserves natural owner implementation intent", () => {
  assert.match(live, /const suppliedObjectiveContext = object\(objective_context \|\| resume_state\?\.objective_context\)/);
  assert.match(live, /const normalizedOwnerObjective = text\(suppliedObjectiveContext\.owner_objective, 12000\) \|\| goal/);
  assert.match(live, /implementation_required: objectiveRequiresImplementation\(\{/);
});

test("implementation-required planner passes select the strong local Code model before mutation", () => {
  assert.match(provider, /spec\.implementation_required===true/);
  assert.match(provider, /const runtimeModel=strongModelRequired\?STRONG_MODEL:MODEL/);
});
