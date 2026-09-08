import assert from "node:assert/strict";
import fs from "node:fs";

const coverage = fs.readFileSync(
  "lib/creative/director/runtime/CreativeCinematicCoverageAuthoringRuntime.js",
  "utf8",
);
const directing = fs.readFileSync(
  "lib/creative/director/runtime/CreativeDirectingIntelligenceRuntime.js",
  "utf8",
);
const benchmark = fs.readFileSync(
  "lib/creative/quality/runtime/CreativeWorldClassBenchmarkRuntime.js",
  "utf8",
);

assert.ok(coverage.includes("AVANTIQO_REFERENCE_CALIBRATED_AGENCY_CRAFT_V1"));
assert.ok(coverage.includes("Lamborghini Revuelto “From Now On”"));
assert.ok(coverage.includes("principles only, never imitate"));
for (const field of [
  "creative_device",
  "contrast_architecture",
  "material_world",
  "human_truth_strategy",
  "brand_reveal_strategy",
  "sound_picture_causality",
  "vfx_philosophy",
  "anti_ai_artifact_rules",
  "payoff_design",
  "story_delta",
  "sensory_delta",
  "material_detail",
  "causal_link_in",
  "causal_link_out",
  "sound_sync_point",
  "brand_visibility_reason",
  "generative_risk",
  "reject_if",
]) assert.ok(coverage.includes(`"${field}"`), `missing craft field ${field}`);

assert.ok(directing.includes("DIRECTING_INTELLIGENCE_AGENCY_CRAFT_CONTRACT_REQUIRED"));
assert.ok(directing.includes("DIRECTING_INTELLIGENCE_AGENCY_CRAFT_REQUIRED"));
assert.ok(directing.includes("DIRECTING_INTELLIGENCE_SCENE_AGENCY_CRAFT_REQUIRED"));
assert.ok(directing.includes("agency_craft: agencyCraft"));
assert.ok(directing.includes("beautiful_but_disconnected_shot_forbidden: true"));
assert.ok(directing.includes("generated_feel_forbidden: true"));

assert.ok(benchmark.includes("minimum_case_score: 94"));
assert.ok(benchmark.includes("minimum_overall_score: 94"));
assert.ok(benchmark.includes("maximum_pairwise_direction_similarity: 0.55"));

console.log("AVANTIQO_REFERENCE_CALIBRATED_AGENCY_CRAFT=PASS");
