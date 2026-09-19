import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('premium concept calls refuse a truncated budget tail before inference', () => {
  const source = fs.readFileSync('lib/creative/director/runtime/CreativeDirectionCostApprovalRuntime.js','utf8');
  assert.match(source, /isConceptDirectorOperation\(operation\) && bounded\.usage\.output_tokens < 6000/);
  assert.match(source, /CREATIVE_DIRECTION_CONCEPT_STORY_BUDGET_TAIL_TOO_SMALL/);
});

test('fresh story round can resume successful concepts from the same round', () => {
  const source = fs.readFileSync('lib/creative/director/runtime/CreativeConceptCouncilRuntime.js','utf8');
  assert.match(source, /freshStoryRoundStartedAt/);
  assert.match(source, /active_story_round_started_at/);
  assert.match(source, /completedAt >= roundStartedAt/);
});

test('owned deep structured finalizer keeps a large draft excerpt', () => {
  const source = fs.readFileSync('services/avantiqo-intelligence-modal/modal_app.py','utf8');
  assert.match(source, /def _excerpt\(value: Any, limit: int = 48000\)/);
});
