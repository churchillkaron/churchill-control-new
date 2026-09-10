import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const planner = read('lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime.js');
const validator = read('lib/creative/director/validation/CreativeMasterPlanValidator.js');
const cueSheet = read('lib/creative/audio/runtime/CreativeTemporalSoundtrackCueSheetRuntime.js');
const review = read('lib/creative/quality/runtime/CreativeMasterFilmDirectorReviewRuntime.js');

test('new temporal plans carry dynamic rhythm and picture-locked audio direction', () => {
  assert.match(planner, /dynamic_rhythm_required:\s*true/);
  assert.match(planner, /shot_energy_curve_required:\s*true/);
  assert.match(planner, /picture_locked_audio_direction_required:\s*true/);
  assert.match(planner, /cinematic_spatial_soundfield_required:\s*true/);
  assert.match(planner, /"energy_level": 0/);
  assert.match(planner, /"tempo_role": "HOLD\|BUILD\|ACCELERATE\|PEAK\|RELEASE\|SILENCE"/);
  assert.match(planner, /"sync_events":/);
  assert.match(planner, /"spatial_field":/);
});

test('temporal validation rejects metronomic pacing and flat energy', () => {
  assert.match(validator, /TEMPORAL_RHYTHM_TOO_UNIFORM/);
  assert.match(validator, /TEMPORAL_ENERGY_CURVE_TOO_FLAT/);
  assert.match(validator, /TEMPORAL_TEMPO_CONTRAST_REQUIRED/);
  assert.match(validator, /TEMPORAL_DURATION_SCALE_CONTRAST_REQUIRED/);
  assert.match(validator, /duration_scale_ratio/);
  assert.match(validator, /SHOT_ENERGY_LEVEL_REQUIRED/);
  assert.match(validator, /SHOT_TEMPO_ROLE_REQUIRED/);
  assert.match(validator, /SHOT_BLACK_FRAME_AUDIO_BEHAVIOR_REQUIRED/);
  assert.match(validator, /maximum_uniform_run/);
  assert.match(validator, /coefficient_of_variation/);
});

test('soundtrack cue sheet preserves exact sync and spatial-film intent', () => {
  assert.match(cueSheet, /sync_events:/);
  assert.match(cueSheet, /picture_locked_sfx_required:\s*true/);
  assert.match(cueSheet, /music_intensity_must_follow_energy_curve:\s*true/);
  assert.match(cueSheet, /sfx_density_must_follow_energy_curve:\s*true/);
  assert.match(cueSheet, /spatial_soundfield_required_for_premium_temporal:\s*true/);
  assert.match(cueSheet, /surround_derivatives_must_preserve_same_spatial_cue_graph:\s*true/);
});

test('master film review blocks flat or disconnected final audio', () => {
  assert.match(review, /cinematic_dynamic_rhythm_verified/);
  assert.match(review, /picture_locked_audio_verified/);
  assert.match(review, /spatial_soundfield_verified/);
  assert.match(review, /require_cinematic_dynamic_rhythm_review:\s*true/);
  assert.match(review, /require_picture_locked_audio_review:\s*true/);
  assert.match(review, /require_spatial_soundfield_review:\s*true/);
});

test('whole-film review rejects AI-montage rhythm and brand contamination', () => {
  const semanticReview = read('lib/creative/quality/runtime/CreativeAutonomousSemanticReviewRuntime.js');
  assert.match(semanticReview, /Reject metronomic pacing/);
  assert.match(semanticReview, /Reject decorative face holds/);
  assert.match(semanticReview, /Constant-bed scoring/);
  assert.match(semanticReview, /extra generated globes/);
  assert.match(review, /canonical_brand_lockup_exclusive/);
  assert.match(review, /generated_brand_substitution_detected/);
});
