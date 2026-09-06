import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const selector = read("lib/creative/quality/runtime/CreativeShotCandidateSelectionRuntime.js");
const bridge = read("lib/creative/quality/runtime/CreativePerceptualCandidateSelectionBridgeBootstrap.js");
const finalGate = read("lib/creative/quality/runtime/CreativeShotCandidateQualityGateBootstrap.js");
const temporalRepair = read("lib/creative/quality/runtime/CreativeHumanTemporalSpanRepairBootstrap.js");
const instrumentation = read("instrumentation.js");

assert.match(selector, /CREATIVE_SHOT_CANDIDATE_SELECTION_V2/);
assert.match(selector, /HARD_QUALITY_GATE_THEN_CINEMATIC_MERIT/);
assert.match(selector, /shot_candidate_cinematic_merit_score/);
assert.match(selector, /shot_candidate_hard_human_quality_passed/);
assert.match(selector, /score\.cinematic > 0/);
const cinematicIndex = selector.indexOf("a.cinematic !== b.cinematic");
const weakestIndex = selector.indexOf("a.weakest !== b.weakest");
const overallIndex = selector.indexOf("a.overall !== b.overall");
assert.ok(cinematicIndex >= 0 && weakestIndex > cinematicIndex && overallIndex > weakestIndex);
assert.match(selector, /selected_for_master:\s*selected/);
assert.match(selector, /include_in_master:\s*selected/);
assert.match(selector, /rejected_by_candidate_competition:\s*!selected/);

assert.match(bridge, /CREATIVE_PERCEPTUAL_CANDIDATE_SELECTION_BRIDGE_V2/);
assert.match(bridge, /hardHumanQualityPassed/);
assert.match(bridge, /cinematicMerit/);
assert.match(bridge, /shot_candidate_cinematic_merit_score/);
assert.match(bridge, /shot_candidate_selection_policy:\s*"HARD_QUALITY_GATE_THEN_CINEMATIC_MERIT"/);
assert.match(bridge, /humanQualityPassed/);

assert.match(finalGate, /CreativeShotCandidateSelectionRuntime\.select/);
assert.match(finalGate, /SHOT_CANDIDATE_QUALITY_BLOCKED/);
assert.match(finalGate, /NO_WORLD_CLASS_CANDIDATE/);
assert.match(finalGate, /CreativeFinalisationRouter\.run/);

assert.match(temporalRepair, /CREATIVE_HUMAN_TEMPORAL_SPAN_REPAIR_V1/);
assert.match(temporalRepair, /SURGICAL_FAILED_SPANS_ONLY/);
assert.match(temporalRepair, /full_shot_rereview_required_after_repair:\s*true/);
assert.match(temporalRepair, /CreativeAutonomousRepairDirectorRuntime\.ensure/);

const worldClassIndex = instrumentation.indexOf("CreativeWorldClassQualityBootstrap");
const bridgeIndex = instrumentation.indexOf("CreativePerceptualCandidateSelectionBridgeBootstrap");
const finalGateIndex = instrumentation.indexOf("CreativeShotCandidateQualityGateBootstrap");
assert.ok(worldClassIndex >= 0);
assert.ok(bridgeIndex > worldClassIndex);
assert.ok(finalGateIndex > bridgeIndex);
assert.match(instrumentation, /CreativeHumanTemporalSpanRepairBootstrap/);

console.log("AVANTIQO_STUDIO_CINEMATIC_CANDIDATE_SELECTION_CONTRACT=PASS");
