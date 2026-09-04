import {
  inspectCreativeCoverageQueue,
  CREATIVE_CINEMATIC_COVERAGE_CONTRACT,
} from "../lib/creative/director/runtime/CreativeCinematicCoverageRuntime.js";

const failures = [];
const passes = [];

function check(name, condition, detail = "") {
  if (condition) passes.push(name);
  else failures.push(`${name}${detail ? `: ${detail}` : ""}`);
}

function task(overrides = {}) {
  return {
    id: overrides.id || "task-1",
    shot_id: overrides.shot_id || "shot-1",
    scene_id: overrides.scene_id || "scene-1",
    input: {
      intent: {
        camera: {
          framing: "medium close shot preserving shoulder context",
          angle: "eye level with a slight three-quarter bias",
          camera_distance: "close conversational distance",
          lens_intent: "natural perspective with gentle background separation",
          movement_path: "locked off on sticks, the frame does not move",
          movement_speed: "none because the camera is intentionally static",
          stabilization: "locked tripod",
          movement_motivation: "stillness lets the performance carry the beat",
          focus_target: "eyes",
          focus_transition: "hold focus on the eyes through the shot",
          ...overrides.camera,
        },
        continuity: {
          screen_direction: "subject maintains camera-left orientation",
          spatial_geography: "subject remains on the near side of the table, door behind camera-right",
          ...overrides.continuity,
        },
        coverage: {
          coverage_role: "reaction",
          axis_break: false,
          eyeline_match_required: true,
          eyeline_match_status: "MATCHED",
          screen_direction_status: "MATCHED",
          edit_compatibility_status: "COMPATIBLE",
          intentional_stillness: true,
          ...overrides.coverage,
        },
      },
    },
  };
}

function queue(...tasks) {
  return {
    total: tasks.length,
    ready: tasks,
    waiting: [],
    running: [],
    review: [],
    completed: [],
    failed: [],
    blocked: [],
  };
}

check(
  "contract version is explicit",
  CREATIVE_CINEMATIC_COVERAGE_CONTRACT.contract === "AVANTIQO_CINEMATIC_COVERAGE_V1",
);

const healthy = inspectCreativeCoverageQueue(queue(task()));
check("healthy coverage is ready", healthy.status === "READY", JSON.stringify(healthy.issues));
check("healthy coverage has no blockers", healthy.blocking_issues === 0);
check("healthy coverage is explicit", healthy.explicit_coverage_ratio === 1);

const legacy = inspectCreativeCoverageQueue(queue(task({
  id: "legacy",
  coverage: null,
})));
// Explicitly remove coverage because spreading null into the fixture would retain defaults.
delete legacy.__unused;
const legacyTask = task({ id: "legacy-2" });
delete legacyTask.input.intent.coverage;
const legacyResult = inspectCreativeCoverageQueue(queue(legacyTask));
check("legacy camera-only task remains executable", legacyResult.status === "NEEDS_COVERAGE_ENRICHMENT");
check("legacy task is not blocked", legacyResult.blocking_issues === 0);

const axisBreak = inspectCreativeCoverageQueue(queue(task({
  id: "axis-break",
  coverage: { axis_break: true, axis_break_motivation: "" },
})));
check("unmotivated axis break blocks", axisBreak.status === "BLOCKED");
check(
  "axis break emits deterministic code",
  axisBreak.issues.some((item) => item.code === "UNMOTIVATED_AXIS_BREAK"),
);

const eyeline = inspectCreativeCoverageQueue(queue(task({
  id: "eyeline",
  coverage: { eyeline_match_required: true, eyeline_match_status: "MISMATCHED" },
})));
check("required eyeline mismatch blocks", eyeline.status === "BLOCKED");

const direction = inspectCreativeCoverageQueue(queue(task({
  id: "screen-direction",
  coverage: { screen_direction_status: "REVERSED" },
})));
check("unmotivated screen-direction reversal blocks", direction.status === "BLOCKED");

const edit = inspectCreativeCoverageQueue(queue(task({
  id: "edit",
  coverage: { edit_compatibility_status: "INCOMPATIBLE" },
})));
check("edit-incompatible shot blocks", edit.status === "BLOCKED");

const movement = inspectCreativeCoverageQueue(queue(task({
  id: "movement",
  camera: { movement_path: "slow dolly push toward the subject" },
  coverage: { intentional_stillness: true },
})));
check("stillness versus movement contradiction blocks", movement.status === "BLOCKED");

console.log("AVANTIQO_CREATIVE_CINEMATIC_COVERAGE_AUDIT");
console.log(`CHECKS_PASSED=${passes.length}`);
console.log(`CHECKS_FAILED=${failures.length}`);
for (const failure of failures) console.error(`FAIL ${failure}`);
if (failures.length) process.exit(1);
