import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const semantic = fs.readFileSync(
  "lib/creative/missions/runtime/CreativeHumanIntentUnderstandingRuntime.js",
  "utf8",
);
const command = fs.readFileSync("scripts/creative-command.mjs", "utf8");
const council = fs.readFileSync(
  "lib/creative/director/runtime/CreativeConceptCouncilRuntime.js",
  "utf8",
);
const gate = fs.readFileSync(
  "lib/creative/director/validation/CreativeMasterPlanDecisionGate.js",
  "utf8",
);

test("Creative Studio interprets meaning before deterministic execution", () => {
  assert.match(semantic, /Understand the user's creative meaning/);
  assert.match(semantic, /Do not classify from keywords, regexes, command phrases/);
  assert.match(semantic, /authorization_effect: "NONE"/);
  assert.match(command, /CreativeHumanIntentUnderstandingRuntime\.understand/);
  assert.doesNotMatch(command, /function inferDuration/);
  assert.doesNotMatch(command, /function inferChannels/);
  assert.doesNotMatch(command, /function inferProductionType/);
  assert.doesNotMatch(command, /function verticalRequested/);
});

test("organization scope comes from Business Context, not language matching", () => {
  assert.match(command, /CREATIVE_BUSINESS_CONTEXT_REQUIRED/);
  assert.doesNotMatch(command, /significantTokens/);
  assert.doesNotMatch(command, /CREATIVE_ORGANIZATION_AMBIGUOUS/);
});

test("Council carries semantic mission meaning into resumed and fresh plans", () => {
  assert.match(council, /function withSemanticMissionContract/);
  assert.match(council, /semantic_mission_contract: positiveMissionContract\(input\)/);
  assert.match(council, /withSemanticMissionContract\(\s*selectedConceptDominance/);
  assert.match(council, /withSemanticMissionContract\(mergedPlan, input\)/);
});

test("master story requirement fails closed before production planning", () => {
  assert.match(gate, /function validateSemanticMissionContract/);
  assert.match(gate, /CREATIVE_MASTER_STORY_REQUIRED/);
  assert.match(gate, /story_architecture\.master_story/);
  assert.match(gate, /validateSemanticMissionContract\(normalized, failures\)/);
});
