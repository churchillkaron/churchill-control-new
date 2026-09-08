import fs from "node:fs";
import assert from "node:assert/strict";

const plan = fs.readFileSync("lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime.js", "utf8");
const escalation = fs.readFileSync("lib/creative/director/runtime/CreativeStoryEscalationRuntime.js", "utf8");
const semantic = fs.readFileSync("lib/creative/quality/runtime/CreativeSemanticQualityRuntime.js", "utf8");

for (const field of ["pressure_before", "pressure_after", "audience_question", "withheld_information", "reveal_state", "visual_density", "sonic_pressure"]) {
  assert.match(plan, new RegExp(field));
  assert.match(escalation, new RegExp(field));
}
assert.match(plan, /nearly silent, sparse frame can carry extreme pressure/);
assert.match(plan, /Decorative beauty with no tension function is invalid/);
assert.match(escalation, /AVANTIQO_STORY_ESCALATION_V2/);
assert.match(escalation, /authored_tension_required_for_every_scene_and_shot: true/);
assert.match(escalation, /constant_intensity_forbidden: true/);
assert.match(semantic, /tension_and_reveal_architecture/);
console.log("AVANTIQO_TENSION_ARCHITECTURE_CONTRACT=PASS");
