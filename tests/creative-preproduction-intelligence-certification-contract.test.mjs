import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const certification = fs.readFileSync("lib/creative/certification/runtime/CreativePreProductionIntelligenceCertificationRuntime.js", "utf8");
const production = fs.readFileSync("lib/creative/production/runtime/ProductionRuntime.js", "utf8");

test("Creative generation is blocked on pre-production intelligence certification", () => {
  assert.match(certification, /AVANTIQO_PREPRODUCTION_INTELLIGENCE_CERTIFICATION_V1/);
  assert.match(certification, /PREPRODUCTION_DIRECTING_AUTHORITY_INCOMPLETE/);
  assert.match(certification, /PREPRODUCTION_AGENCY_CRAFT_INCOMPLETE/);
  assert.match(certification, /PREPRODUCTION_STATIC_OR_EMPTY_SHOT_EVOLUTION/);
  assert.match(certification, /PREPRODUCTION_HUMAN_BEHAVIOR_NOT_DIRECTED/);
  assert.match(certification, /PREPRODUCTION_SOUND_PICTURE_CAUSALITY_INCOMPLETE/);
  assert.match(certification, /PREPRODUCTION_REAL_WORLD_GROUNDING_UNSUPPORTED/);
  assert.match(certification, /PREPRODUCTION_SPATIAL_DIRECTION_UNPROVEN/);
  assert.match(certification, /PREPRODUCTION_UNJUSTIFIED_DEAD_AIR/);
  assert.match(certification, /PREPRODUCTION_REPETITIVE_STORY_DELTAS/);
  assert.match(certification, /PREPRODUCTION_REPETITIVE_SHOT_PURPOSES/);
  assert.match(certification, /PREPRODUCTION_FIRST_MINUTE_DURATION_INVALID/);
  assert.match(certification, /provider_calls_executed: 0/);
  assert.match(certification, /generation_spawned: false/);
  assert.match(production, /CreativePreProductionIntelligenceCertificationRuntime\.inspect\(input\)/);
  assert.match(production, /CREATIVE_PREPRODUCTION_INTELLIGENCE_NOT_CERTIFIED/);
  assert.ok(production.indexOf("CREATIVE_PREPRODUCTION_INTELLIGENCE_NOT_CERTIFIED") < production.indexOf("ProductionQueueRuntime.dispatchAll"));
});

console.log("AVANTIQO_CREATIVE_PREPRODUCTION_INTELLIGENCE_CERTIFICATION=PASS");
