import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('lib/creative/director/runtime/CreativeConceptCouncilRuntime.js','utf8');

test('story room uses structurally divergent long-form director disciplines', () => {
  assert.match(source, /MYTHIC_CAUSAL_ARCHITECT/);
  assert.match(source, /HUMAN_CONSEQUENCE_DIRECTOR/);
  assert.match(source, /SPECULATIVE_EVOLUTION_DIRECTOR/);
});

test('master story contract requires world law, agency, stakes and irreversible turns', () => {
  assert.match(source, /governing_world_rule/);
  assert.match(source, /hero_agency/);
  assert.match(source, /human_stakes/);
  assert.match(source, /irreversible_turns/);
  assert.match(source, /dramatic_question/);
  assert.match(source, /INDEPENDENT_CONCEPT_HERO_AGENCY_REQUIRED/);
  assert.match(source, /INDEPENDENT_CONCEPT_HUMAN_STAKES_REQUIRED/);
  assert.match(source, /INDEPENDENT_CONCEPT_IRREVERSIBLE_TURNS_REQUIRED/);
});

test('master story cannot collapse into a one-minute ad', () => {
  assert.match(source, /INDEPENDENT_CONCEPT_MASTER_STORY_DURATION_COLLAPSE/);
  assert.match(source, /Do not write only a 60-second first chapter/);
});


test('premium investor story requires six-stage brain arc and ~130-shot cinematic system', () => {
  assert.match(source, /brain_arc/);
  assert.match(source, /awakening/);
  assert.match(source, /connects_to_world/);
  assert.match(source, /connects_to_business/);
  assert.match(source, /receives_input/);
  assert.match(source, /works_and_reasons/);
  assert.match(source, /gives_output/);
  assert.match(source, /target_shot_count/);
  assert.match(source, /visual_idea_families/);
  assert.match(source, /hero_image_escalation/);
  assert.match(source, /graphic_design_language/);
  assert.match(source, /vfx_language/);
  assert.match(source, /typography_language/);
  assert.match(source, /transition_language/);
  assert.match(source, /scale_shift_language/);
  assert.match(source, /sound_edit_language/);
  assert.match(source, /INDEPENDENT_CONCEPT_CINEMATIC_SHOT_DENSITY_REQUIRED/);
});
