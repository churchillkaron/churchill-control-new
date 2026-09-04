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
const shotDocument = fs.readFileSync(
  "lib/creative/shots/documents/Shot.js",
  "utf8",
);

test("Creative Director Plan keeps AI Creative and Specialist/Pro as separate experiences over one governed change set", () => {
  assert.match(directorPlan, /AVANTIQO_CREATIVE_DIRECTOR_PLAN_V2/);
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

test("Director Plan derives full production intent from canonical shot truth", () => {
  for (const canonicalField of [
    "duration_seconds",
    "continuity",
    "actors",
    "products",
    "location",
    "dialogue",
    "narration",
    "audio",
    "music",
    "sound_effects",
    "subtitles",
    "reference_assets",
    "shot_bible_source",
  ]) {
    assert.match(shotDocument, new RegExp(canonicalField));
  }

  assert.match(directorPlan, /story:/);
  assert.match(directorPlan, /production_dependencies:/);
  assert.match(directorPlan, /continuity:/);
  assert.match(directorPlan, /identities:/);
  assert.match(directorPlan, /audio:/);
  assert.match(directorPlan, /runtime:/);
  assert.match(directorPlan, /identity_requirements/);
  assert.match(directorPlan, /product_requirements/);
  assert.match(directorPlan, /wardrobe/);
  assert.match(directorPlan, /hair_makeup/);
  assert.match(directorPlan, /props/);
  assert.match(directorPlan, /editable_current_seconds/);
  assert.match(directorPlan, /preserved_current_seconds/);
  assert.match(directorPlan, /governed_current_seconds/);
  assert.match(directorPlan, /duration_change_authorized_by_current_operation:\s*false/);
});

test("Director Plan creates explicit QC targets instead of treating generation as success", () => {
  assert.match(directorPlan, /required_qc_targets/);
  assert.match(directorPlan, /SHOT_SCOPE_FIDELITY/);
  assert.match(directorPlan, /PRESERVED_SHOT_IMMUTABILITY/);
  assert.match(directorPlan, /PROFESSIONAL_LOCK_COMPLIANCE/);
  assert.match(directorPlan, /STALE_PLAN_FRESHNESS/);
  assert.match(directorPlan, /SHOT_TO_SHOT_CONTINUITY/);
  assert.match(directorPlan, /IDENTITY_CONSISTENCY/);
  assert.match(directorPlan, /PRODUCT_FIDELITY/);
  assert.match(directorPlan, /AUDIOVISUAL_CONTINUITY/);
  assert.match(directorPlan, /CINEMATIC_DIRECTION_FIDELITY/);
  assert.match(directorPlan, /PERFORMANCE_DIRECTION_FIDELITY/);
  assert.match(directorPlan, /EDIT_RELATIONSHIP_FIDELITY/);
  assert.match(directorPlan, /SEQUENCE_COHERENCE/);
  assert.match(directorPlan, /automated_qc_executed:\s*false/);
  assert.match(directorPlan, /final_delivery_blocked_until_qc:\s*true/);
});

test("Director planning separates read, direction write, media generation and publication authority", () => {
  assert.match(directorPlan, /read_only_plan:\s*"NO_CONFIRMATION_REQUIRED"/);
  assert.match(directorPlan, /direction_write:\s*"CONVERSATION_CONFIRMATION"/);
  assert.match(directorPlan, /professional_lock_override:\s*"NOT_AUTHORIZED_WHILE_LOCKED"/);
  assert.match(directorPlan, /media_generation:\s*"EXPLICIT_PRODUCTION_CONFIRMATION"/);
  assert.match(directorPlan, /publication:\s*"SEPARATE_PUBLICATION_APPROVAL"/);
  assert.match(directorPlan, /next_direction_write_spend_class:\s*"PAID_REASONING"/);
  assert.match(directorPlan, /media_generation_spend_class:\s*"PAID_MEDIA"/);
  assert.match(directorPlan, /media_generation_authorized:\s*false/);
});

test("Director planning itself is zero-cost and never authorizes generation or publication", () => {
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
