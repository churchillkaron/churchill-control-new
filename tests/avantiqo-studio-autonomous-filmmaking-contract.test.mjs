import fs from "node:fs";
import assert from "node:assert/strict";

const read = (path) => fs.readFileSync(path, "utf8");

const escalation = read("lib/creative/director/runtime/CreativeStoryEscalationRuntime.js");
const selection = read("lib/creative/quality/runtime/CreativeAutonomousShotSelectionBootstrap.js");
const budget = read("lib/creative/director/runtime/CreativeBudgetQualityOptimizationRuntime.js");
const budgetBootstrap = read("lib/creative/director/runtime/CreativeBudgetQualityPlanningBootstrap.js");
const audience = read("lib/creative/director/runtime/CreativeAudienceVersioningRuntime.js");
const audienceBootstrap = read("lib/creative/director/runtime/CreativeAudienceVersioningPlanningBootstrap.js");
const videoDispatch = read("lib/creative/video/runtime/CreativeVideoProductionDispatchBootstrap.js");
const instrumentation = read("instrumentation.js");

assert.match(escalation, /AVANTIQO_STORY_ESCALATION_V1/);
assert.match(escalation, /causal_state_change_required_for_every_scene: true/);
assert.match(escalation, /unique_story_information_required_for_every_shot: true/);
assert.match(escalation, /fixed_act_template_required: false/);
assert.match(escalation, /monotonic_tension_curve_required: false/);
assert.match(escalation, /STORY_ESCALATION_STAGNANT_SCENE/);
assert.match(escalation, /STORY_ESCALATION_UNIQUE_SHOT_PURPOSE_REQUIRED/);

assert.match(selection, /AVANTIQO_AUTONOMOUS_SHOT_SELECTION_V1/);
assert.match(selection, /HARD_GATES_THEN_CINEMATIC_MERIT_THEN_DETERMINISTIC_TIE_BREAK/);
assert.match(selection, /beauty_score_cannot_override_gate_failure: true/);
assert.match(selection, /automatic_selection_authorized/);
assert.match(selection, /automatic_rejection_authorized: true/);

assert.match(budget, /AVANTIQO_BUDGET_QUALITY_OPTIMIZATION_V1/);
assert.match(budget, /never_lower_quality_floor_to_meet_budget: true/);
assert.match(budget, /stop_spending_after_world_class_winner_exists: true/);
assert.match(budget, /provider_selection_owner: "SERVICE_RUNTIME"/);
assert.match(budgetBootstrap, /budget_quality_optimization_contract/);
assert.match(videoDispatch, /AVANTIQO_BUDGET_QUALITY_SHOT_POLICY_V1/);
assert.match(videoDispatch, /budget_quality_selection_weights/);

assert.match(audience, /AVANTIQO_MULTI_VERSION_AUDIENCE_OUTPUT_V1/);
assert.match(audience, /creative_reframe_required_for_aspect_ratio_change: true/);
assert.match(audience, /blind_crop_or_stretch_forbidden: true/);
assert.match(audience, /publication_authorized: false/);
assert.match(audience, /identity_continuity_must_survive: true/);
assert.match(audience, /world_continuity_must_survive: true/);
assert.match(audienceBootstrap, /audience_versioning_matrix_hash/);

assert.match(instrumentation, /CreativeStoryEscalationPlanningBootstrap/);
assert.match(instrumentation, /CreativeBudgetQualityPlanningBootstrap/);
assert.match(instrumentation, /CreativeAudienceVersioningPlanningBootstrap/);
assert.match(instrumentation, /CreativeAutonomousShotSelectionBootstrap/);

console.log("Avantiqo autonomous filmmaking phases 15-18 contract: PASS");
