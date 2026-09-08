import assert from "node:assert/strict";
import fs from "node:fs";

const graph = fs.readFileSync(
  "lib/creative/quality/runtime/CreativeGeneratedMediaPerceptualGraphRuntime.js",
  "utf8",
);
const gate = fs.readFileSync(
  "lib/creative/quality/runtime/CreativeGeneratedMediaPerceptualExecutionGate.js",
  "utf8",
);

assert.match(graph, /AVANTIQO_ELITE_VISUAL_MINIMUM_V1/);
assert.match(graph, /LAMBORGHINI_REVUELTO_FROM_NOW_ON/);
assert.match(graph, /worldClassFloor = 94/);
for (const field of [
  "minimum_overall_score",
  "minimum_story_score",
  "minimum_environment_score",
  "minimum_camera_score",
  "minimum_artifact_score",
]) {
  assert.match(graph, new RegExp(`${field}: worldClassFloor`));
}
assert.match(graph, /minimum_anatomy_score: person \? worldClassFloor : 0/);
assert.match(graph, /minimum_identity_score: identity \? worldClassFloor : 0/);
assert.match(graph, /minimum_product_fidelity_score: product \? worldClassFloor : 0/);
assert.match(graph, /minimum_continuity_score: kind === "VIDEO" \? worldClassFloor : 0/);
assert.match(graph, /minimum_physics_score: kind === "VIDEO" \? worldClassFloor : 0/);
assert.match(graph, /authored_composition_and_focal_hierarchy/);
assert.match(graph, /foreground_midground_background_depth/);
assert.match(graph, /flat_cheap_or_uniform_lighting/);
assert.match(graph, /generic_stock_or_ai_composition/);
assert.match(graph, /empty_lifeless_environment_when_people_or_activity_are_story_relevant/);
assert.match(graph, /random_city_or_geography_when_location_identity_matters/);
assert.match(graph, /no_unearned_black_frames_or_dead_air/);
assert.match(graph, /frame_stands_as_premium_key_art_without_motion_to_rescue_it/);
assert.match(graph, /reject_below_elite_visual_minimum: true/);

assert.match(gate, /expected cinematic_minimum contract as a HARD admission gate/);
assert.match(gate, /Lamborghini Revuelto “From Now On”/);
assert.match(gate, /Beauty without physical truth is failure/);
assert.match(gate, /beautiful shot with no story delta/);
assert.match(gate, /random city\/coast\/room/);
assert.match(gate, /premium key art/);
assert.match(gate, /unearned black frames, dead air, overlong static holds/);

console.log("creative elite visual minimum contract: PASS");
