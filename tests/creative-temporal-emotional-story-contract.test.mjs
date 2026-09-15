import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const planner = read('lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime.js');
const validator = read('lib/creative/director/validation/CreativeMasterPlanValidator.js');
const registry = read('lib/creative/director/registry/CreativeMasterPlanContractRegistry.js');

test('temporal story writer authors a causal human emotional engine before scene planning', () => {
  for (const field of ['human_desire', 'emotional_contradiction', 'vulnerability_or_risk', 'empathy_path', 'emotional_payoff']) {
    assert.match(planner, new RegExp(`"${field}"`));
    assert.match(registry, new RegExp(`${field}:`));
    assert.match(validator, new RegExp(`"${field}"`));
  }
  assert.match(planner, /Emotion is causal structure, not an adjective layer/);
  assert.match(planner, /Do not manufacture melodrama/);
  assert.match(planner, /emotionally unchanged, it is not finished/);
});

test('scene architecture inherits the emotional engine instead of inventing decorative feeling', () => {
  assert.match(planner, /"emotional_job"/);
  assert.match(planner, /"human_stake"/);
  assert.match(planner, /emotional_job must inherit the master story/);
  assert.match(planner, /human_stake must be observable through behaviour, consequence, environment, choice, sound or withheld information/);
});

test('story validation rejects flat and generic emotional writing', () => {
  assert.match(validator, /STORY_EMOTIONAL_ARC_TOO_FLAT/);
  assert.match(validator, /STORY_GENERIC_EMOTION_REJECTED/);
  assert.match(validator, /STORY_EMOTION_CAUSALITY_REQUIRED/);
  assert.match(validator, /at least four distinct felt states/);
});
