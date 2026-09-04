import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const directorPlan = fs.readFileSync(
  "lib/creative/studio/runtime/CreativeDirectorPlanRuntime.js",
  "utf8",
);
const planner = fs.readFileSync(
  "lib/creative/studio/capabilities/planStudioShotSetRevision.js",
  "utf8",
);

test("Creative Director Plan keeps AI Creative and Specialist/Pro as separate experiences over one governed change set", () => {
  assert.match(directorPlan, /AVANTIQO_CREATIVE_DIRECTOR_PLAN_V1/);
  assert.match(directorPlan, /AI_CREATIVE/);
  assert.match(directorPlan, /SPECIALIST_PRO/);
  assert.match(directorPlan, /FULL_AI_CREATIVE/);
  assert.match(directorPlan, /SPECIALIST_PRO_STUDIO/);
  assert.match(directorPlan, /OUTCOME_FIRST/);
  assert.match(directorPlan, /CONTROL_FIRST/);
  assert.match(directorPlan, /AVANTIQO_AI_DIRECTOR/);
  assert.match(directorPlan, /HUMAN_SPECIALIST/);
  assert.match(directorPlan, /PLAN_AND_OPERATE_WITHIN_GOVERNED_BOUNDARIES/);
  assert.match(directorPlan, /ASSIST_AND_EXECUTE_WITHIN_HUMAN_DIRECTION/);
});

test("Director Plan carries exact editable, preserved and professional authority boundaries", () => {
  assert.match(directorPlan, /plan_type:\s*"VISUAL_CHANGE_SET"/);
  assert.match(directorPlan, /editable:/);
  assert.match(directorPlan, /preserved:/);
  assert.match(directorPlan, /professional_lock_conflicts:/);
  assert.match(directorPlan, /immutable_during_execution:\s*true/);
  assert.match(directorPlan, /professional_locks_enforced:\s*true/);
  assert.match(directorPlan, /preserved_shots_immutable:\s*true/);
  assert.match(directorPlan, /stale_plan_preflight_required:\s*true/);
  assert.match(directorPlan, /atomic_execution_required:\s*true/);
  assert.match(directorPlan, /publication_separate_authority:\s*true/);
});

test("Director planning is zero-cost and never authorizes generation or publication", () => {
  assert.match(directorPlan, /current_plan_is_read_only:\s*true/);
  assert.match(directorPlan, /media_generation_required_for_current_plan:\s*false/);
  assert.match(directorPlan, /spend_class:\s*"ZERO_COST_PLAN"/);
  assert.match(directorPlan, /qc_required_before_final_delivery:\s*true/);
  assert.match(directorPlan, /media_generation_executed:\s*false/);
  assert.match(directorPlan, /publish_authorized:\s*false/);
});

test("Shot-set planner emits the canonical Director Plan without weakening confirmation", () => {
  assert.match(planner, /CreativeDirectorPlanRuntime/);
  assert.match(planner, /experience_mode/);
  assert.match(planner, /AI_CREATIVE/);
  assert.match(planner, /SPECIALIST_PRO/);
  assert.match(planner, /const directorPlan = CreativeDirectorPlanRuntime\.build/);
  assert.match(planner, /director_plan:\s*directorPlan/);
  assert.match(planner, /confirmation_required:\s*true/);
  assert.match(planner, /media_generation_executed:\s*false/);
  assert.match(planner, /publish_authorized:\s*false/);
});
