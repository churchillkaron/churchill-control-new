import assert from "node:assert/strict";
import test from "node:test";
import { prepareCodeAIEngineeringOperatingSystem } from "../lib/code/runtime/CodeAIEngineeringOperatingSystemRuntime.js";
import { prepareCodeAIEngineeringPrecisionOS } from "../lib/code/runtime/CodeAIEngineeringPrecisionOperatingSystemRuntime.js";
import { prepareCodeAIWorldClassMission } from "../lib/code/runtime/CodeAIWorldClassIntelligenceRuntime.js";

const readOnlyObjective = "Read-only inspect lib/code/runtime/CodeAIEmployeeRuntime.js. Do not modify files.";
const writeObjective = "Update the Code runtime and verify the implementation.";

test("read-only Engineering OS keeps controls but uses compact planner directive", () => {
  const compact = prepareCodeAIEngineeringOperatingSystem({ objective: readOnlyObjective });
  const full = prepareCodeAIEngineeringOperatingSystem({ objective: writeObjective });
  assert.match(compact.directive, /READ-ONLY FAST PATH/);
  assert.ok(compact.directive.length < full.directive.length);
  assert.equal(compact.control.authority.mutation, false);
  assert.equal(compact.control.engineering_memory.verified_only, true);
  assert.match(full.directive, /MANDATORY MISSION CONSTITUTION/);
});

test("read-only Precision OS keeps requirements but compacts planner text", () => {
  const compact = prepareCodeAIEngineeringPrecisionOS({ objective: readOnlyObjective });
  const full = prepareCodeAIEngineeringPrecisionOS({ objective: writeObjective });
  assert.match(compact.directive, /READ-ONLY FAST PATH/);
  assert.ok(compact.directive.length < full.directive.length);
  assert.equal(compact.control.authority.mutation, false);
  assert.ok(Array.isArray(compact.control.requirements));
});

test("read-only World-Class control preserves control plane with compact objective suffix", () => {
  const compact = prepareCodeAIWorldClassMission({ objective: readOnlyObjective });
  const full = prepareCodeAIWorldClassMission({ objective: writeObjective });
  assert.match(compact.options.objective, /READ-ONLY FAST PATH/);
  assert.ok(compact.options.objective.length < full.options.objective.length);
  assert.equal(compact.control.mutation_authority, false);
  assert.equal(compact.control.commit_authority, false);
  assert.equal(compact.control.deploy_authority, false);
  assert.match(full.options.objective, /AVANTIQO WORLD-CLASS ENGINEERING CONTROL V1/);
});
