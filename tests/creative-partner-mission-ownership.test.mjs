import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [partner, route, director, intelligence, taskGate] = await Promise.all([
  readFile("lib/creative/partner/runtime/CreativePartnerMissionRuntime.js", "utf8"),
  readFile("app/api/creative/run-production/route.js", "utf8"),
  readFile("lib/creative/director/runtime/CreativeDirectorRuntime.js", "utf8"),
  readFile("lib/creative/intelligence/runtime/CreativeIntelligenceRuntime.js", "utf8"),
  readFile("lib/creative/execution/runtime/CreativeCapabilityOnlyProductionTaskGate.js", "utf8"),
]);

test("production entrypoint is owned by Creative Partner", () => {
  assert.match(route, /CreativePartnerMissionRuntime/);
  assert.match(route, /CreativePartnerMissionRuntime\.advance/);
  assert.doesNotMatch(route, /CreativeDirectorRuntime\.execute/);
});

test("Creative Partner owns continuation and genuine human gates", () => {
  assert.match(partner, /keep_working/);
  assert.match(partner, /human_decision_required/);
  assert.match(partner, /MONITOR_RUNNING_WORKERS/);
  assert.match(partner, /DIAGNOSE_AND_REPAIR/);
  assert.match(partner, /DISPATCH_NEXT_CAPABILITY/);
  assert.match(partner, /MISSION_COMPLETE/);
  assert.match(partner, /finalisation_passed/);
});

test("mission-facing status hides provider and queue mechanics", () => {
  assert.match(partner, /provider_selection_exposed:\s*false/);
  assert.match(partner, /queue_management_exposed:\s*false/);
  assert.match(partner, /retry_management_exposed:\s*false/);
  assert.match(partner, /raw_reasoning_persisted:\s*false/);
});

test("Avantiqo Intelligence creates the structured Creative mission plan", () => {
  assert.match(intelligence, /AVANTIQO_CREATIVE_INTELLIGENCE_PLAN_V1/);
  assert.match(intelligence, /activated_directors/);
  assert.match(intelligence, /capability_requirements/);
  assert.match(intelligence, /success_criteria/);
  assert.match(intelligence, /human_decisions_needed/);
  assert.match(intelligence, /AVANTIQO_INTELLIGENCE_GOVERNED_REASONING/);
  assert.doesNotMatch(intelligence, /provider_id\s*:/);
});

test("Director loads capability-only persistence gate", () => {
  assert.match(director, /CreativeCapabilityOnlyProductionTaskGate/);
  assert.match(director, /CAPABILITY_ONLY_SERVICE_RUNTIME_OWNED_FIRST/);
});

test("new Creative tasks cannot persist provider pins", () => {
  assert.match(taskGate, /provider_id:\s*null/);
  assert.match(taskGate, /provider_pin_persisted:\s*false/);
  assert.match(taskGate, /provider_pins_allowed:\s*false/);
  assert.match(taskGate, /provider_selection_boundary:\s*"SERVICE_RUNTIME_ONLY"/);
});
