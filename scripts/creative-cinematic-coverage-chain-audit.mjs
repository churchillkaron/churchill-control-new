import {
  buildProductionGraph,
} from "../lib/creative/production-graph/planner/ProductionGraphPlanner.js";
import {
  serializeCreativeProviderInstruction,
} from "../lib/creative/execution/runtime/CreativeProviderInstructionSerializer.js";
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

const plan = temporalBasePlan();
plan.story_lineage = {
  story_contract_hash: "a".repeat(16),
  master_plan_hash: "b".repeat(16),
};
plan.cinematic_coverage = {
  contract: "AVANTIQO_CINEMATIC_COVERAGE_V1",
  authoring_contract: "AVANTIQO_CINEMATIC_COVERAGE_AUTHORING_V1",
  spatial_map: long(80),
  dominant_axis: long(80),
  axis_strategy: long(80),
  lens_progression: long(80),
  shot_size_rhythm: long(80),
  movement_rhythm: long(80),
  reveal_hierarchy: long(80),
  edit_strategy: long(80),
  continuity_strategy: long(80),
};

const scene = {
  ...temporalScene("scene-1"),
  coverage_plan: {
    spatial_map: long(80),
    dominant_axis: long(80),
    axis_strategy: long(80),
    lens_progression: long(80),
    shot_size_rhythm: long(80),
    movement_rhythm: long(80),
    reveal_hierarchy: long(80),
    edit_strategy: long(80),
    reestablish_strategy: long(80),
  },
};
const shot = {
  ...temporalShot("scene-1-shot-1"),
  scene_id: scene.id,
  coverage: {
    coverage_role: "reaction that reveals the character has understood the consequence",
    camera_height: "eye level to preserve an equal conversational relationship",
    camera_position: "camera remains on the established near side of the table axis",
    subject_distance: "close conversational distance with shoulder context retained",
    axis_relationship: "same side of the established two-person axis as the previous setup",
    axis_break: false,
    axis_break_motivation: "the established axis is held because disorientation would weaken the reaction",
    reestablish_strategy: "geography remains legible through the unchanged table and doorway anchors",
    eyeline: "subject looks camera-right toward the off-screen partner",
    eyeline_match_required: true,
    eyeline_match_status: "MATCHED",
    screen_direction: "subject remains camera-left facing camera-right",
    screen_direction_status: "MATCHED",
    intentional_screen_direction_break: false,
    screen_direction_break_motivation: "screen direction is preserved for conversational continuity",
    entry_exit_direction: "no entrance or exit occurs during this held reaction",
    match_action: "the incoming cut lands after the partner lowers the glass and this reaction begins",
    shot_to_shot_contrast: "moves from wider two-shot information to a tighter held reaction without repeating lens perspective",
    edit_compatibility_status: "COMPATIBLE",
    edit_relationship: "incoming action motivates the cut and the closing eyeline carries into the next reverse",
    continuity_consequence: "following reverse must preserve the partner on camera-right and the same table geography",
    intentional_stillness: false,
    directorial_reasoning: "the tighter reaction earns attention because the story has just shifted from action to consequence",
  },
};
plan.scenes = [{ ...scene, shots: [shot] }];

let graph = null;
let error = "";
try {
  graph = buildProductionGraph({
    organization_id: "00000000-0000-0000-0000-000000000001",
    creative_project_id: "project-coverage-audit",
    storyboard: {
      id: "storyboard-coverage-audit",
      title: "Coverage Audit",
      synopsis: "Zero-cost coverage transport proof",
    },
    scenes: [scene],
    shots: [shot],
    creative_plan: plan,
  });
} catch (caught) {
  error = String(caught?.message || caught);
}

check("coverage graph builds", Boolean(graph), error);
if (graph) {
  const node = (graph.nodes || []).find((candidate) => candidate.id === shot.id);
  check("shot node exists", Boolean(node));
  check(
    "film coverage survives into shot requirements",
    node?.requirements?.cinematic_coverage?.contract === "AVANTIQO_CINEMATIC_COVERAGE_V1",
  );
  check(
    "scene coverage survives into shot requirements",
    Boolean(node?.requirements?.scene_coverage_plan?.dominant_axis),
  );
  check(
    "shot coverage survives into shot requirements",
    node?.requirements?.coverage?.edit_compatibility_status === "COMPATIBLE",
  );
  check(
    "shot coverage survives into shot intent",
    node?.intent?.coverage?.coverage_role === shot.coverage.coverage_role,
  );

  const instruction = serializeCreativeProviderInstruction(node || {});
  check(
    "film coverage reaches provider instruction",
    instruction.includes("cinematic_coverage") && instruction.includes("AVANTIQO_CINEMATIC_COVERAGE_V1"),
  );
  check(
    "scene coverage reaches provider instruction",
    instruction.includes("scene_coverage_plan") && instruction.includes("dominant_axis"),
  );
  check(
    "shot coverage reaches provider instruction",
    instruction.includes("coverage_role") && instruction.includes("edit_compatibility_status"),
  );
}

console.log("AVANTIQO_CREATIVE_CINEMATIC_COVERAGE_CHAIN_AUDIT");
console.log(`CHECKS_PASSED=${passes.length}`);
console.log(`CHECKS_FAILED=${failures.length}`);
for (const failure of failures) console.error(`FAIL ${failure}`);
if (failures.length) process.exit(1);
