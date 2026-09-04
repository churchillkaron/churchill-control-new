import {
  validateAuthoredCinematicCoverage,
} from "../lib/creative/director/runtime/CreativeCinematicCoverageAuthoringRuntime.js";
import {
  temporalBasePlan,
  temporalScene,
  temporalShot,
  long,
} from "./creative-temporal-contract-fixture.mjs";

const failures = [];
const passes = [];

function check(name, condition, detail = "") {
  if (condition) passes.push(name);
  else failures.push(`${name}${detail ? `: ${detail}` : ""}`);
}

function coverage(overrides = {}) {
  return {
    coverage_role: "reaction that converts the prior action into emotional consequence",
    camera_height: "eye-level camera height preserves equal status between the subjects",
    camera_position: "camera stays on the established near side of the conversational axis",
    subject_distance: "close conversational distance with enough shoulder context for geography",
    axis_relationship: "same side of the established axis as the preceding setup",
    axis_break: false,
    axis_break_motivation: "the axis remains held because geography is more important than novelty",
    reestablish_strategy: "the table edge and doorway remain stable anchors across the cut",
    eyeline: "subject looks camera-right toward the off-screen partner",
    eyeline_match_required: true,
    eyeline_match_status: "MATCHED",
    screen_direction: "subject remains camera-left and faces camera-right",
    screen_direction_status: "MATCHED",
    intentional_screen_direction_break: false,
    screen_direction_break_motivation: "screen direction remains stable through this exchange",
    entry_exit_direction: "no entry or exit occurs during this held reaction",
    match_action: "incoming cut lands after the partner lowers the glass and the reaction begins",
    shot_to_shot_contrast: "tighter framing and held camera contrast the wider moving setup before it",
    edit_compatibility_status: "COMPATIBLE",
    edit_relationship: "the action motivates the incoming cut and the eyeline carries the outgoing reverse",
    continuity_consequence: "the following reverse must preserve the partner on camera-right",
    intentional_stillness: false,
    directorial_reasoning: "the tighter reaction earns attention because the story has shifted from action to consequence",
    ...overrides,
  };
}

const plan = temporalBasePlan();
const sourceScene = {
  ...temporalScene("scene-1"),
  shots: [temporalShot("scene-1-shot-1")],
};
plan.scenes = [sourceScene];

const authored = {
  contract: "AVANTIQO_CINEMATIC_COVERAGE_AUTHORING_V1",
  film_coverage: {
    spatial_map: long(60),
    dominant_axis: long(60),
    axis_strategy: long(60),
    lens_progression: long(60),
    shot_size_rhythm: long(60),
    movement_rhythm: long(60),
    reveal_hierarchy: long(60),
    edit_strategy: long(60),
    continuity_strategy: long(60),
  },
  scenes: [{
    id: "scene-1",
    coverage_plan: {
      spatial_map: long(50),
      dominant_axis: long(50),
      axis_strategy: long(50),
      lens_progression: long(50),
      shot_size_rhythm: long(50),
      movement_rhythm: long(50),
      reveal_hierarchy: long(50),
      edit_strategy: long(50),
      reestablish_strategy: long(50),
    },
    shots: [{ id: "scene-1-shot-1", coverage: coverage() }],
  }],
};

const valid = validateAuthoredCinematicCoverage(plan, authored);
check("valid authored coverage passes", valid.passed, JSON.stringify(valid.failures));
check("valid authored coverage has no failures", valid.failures.length === 0);

const inventedShot = structuredClone(authored);
inventedShot.scenes[0].shots[0].id = "invented-shot";
const invented = validateAuthoredCinematicCoverage(plan, inventedShot);
check("invented shot id is rejected", !invented.passed);
check(
  "invented shot emits identity mismatch",
  invented.failures.some((item) => item.code === "COVERAGE_SHOT_IDENTITY_MISMATCH"),
);

const axisBreak = structuredClone(authored);
axisBreak.scenes[0].shots[0].coverage = coverage({
  axis_break: true,
  axis_break_motivation: "",
  reestablish_strategy: "",
});
const axis = validateAuthoredCinematicCoverage(plan, axisBreak);
check("unmotivated authored axis break is rejected", !axis.passed);

const incompatible = structuredClone(authored);
incompatible.scenes[0].shots[0].coverage = coverage({
  edit_compatibility_status: "INCOMPATIBLE",
});
const edit = validateAuthoredCinematicCoverage(plan, incompatible);
check("edit-incompatible authored shot is rejected", !edit.passed);
check(
  "edit incompatibility emits deterministic code",
  edit.failures.some((item) => item.code === "COVERAGE_EDIT_INCOMPATIBLE"),
);

const movingPlan = structuredClone(plan);
movingPlan.scenes[0].shots[0].camera.movement_path = "slow dolly push toward the subject";
const falseStillness = structuredClone(authored);
falseStillness.scenes[0].shots[0].coverage = coverage({ intentional_stillness: true });
const stillness = validateAuthoredCinematicCoverage(movingPlan, falseStillness);
check("false intentional stillness is rejected", !stillness.passed);
check(
  "stillness contradiction emits deterministic code",
  stillness.failures.some((item) => item.code === "COVERAGE_STILLNESS_MOVEMENT_CONTRADICTION"),
);

console.log("AVANTIQO_CREATIVE_CINEMATIC_COVERAGE_AUTHORING_AUDIT");
console.log(`CHECKS_PASSED=${passes.length}`);
console.log(`CHECKS_FAILED=${failures.length}`);
for (const failure of failures) console.error(`FAIL ${failure}`);
if (failures.length) process.exit(1);
