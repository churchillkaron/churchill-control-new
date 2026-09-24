import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../lib/creative/director/runtime/CreativeConceptCouncilRuntime.js", import.meta.url), "utf8");

test("selected concept deterministically replaces stale incumbent creative choices", () => {
  assert.match(source, /function selectedConceptDominance/);
  assert.match(source, /source: "INDEPENDENT_CREATIVE_CONCEPT_COUNCIL_V1"/);
  assert.match(source, /selected_signature_device/);
  assert.match(source, /anti_cliche_rules: selectedUnderRepair/);
  assert.match(source, /\.\.\.list\(plan\.anti_cliche_rules\), \.\.\.list\(selected\.anti_cliche_rules\)/);
  assert.match(source, /visual_system: \{/);
});

test("system governance and registry role decisions survive selected-concept dominance", () => {
  assert.match(source, /current\.derived_from_system_governance === true/);
  assert.match(source, /current\.derived_from_registry === true/);
  assert.match(source, /text\(current\.status\)\.toUpperCase\(\) !== "ACTIVE"/);
});

test("approved council resume validates the already-dominated durable plan without reopening creative mutation", () => {
  assert.match(source, /A durable Council checkpoint is written only after the selected concept has/);
  assert.match(source, /CreativeMasterPlanRuntime\.validateExistingPlan/);
  const resumeStart = source.indexOf("async function resumeApprovedCouncilPlan");
  const resumeEnd = source.indexOf("async function runCouncil", resumeStart);
  const resume = source.slice(resumeStart, resumeEnd);
  assert.doesNotMatch(resume, /selectedConceptDominance\(/);
});
