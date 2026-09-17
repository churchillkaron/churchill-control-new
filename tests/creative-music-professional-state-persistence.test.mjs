import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyMusicConversationState, mergeMusicConversationState, musicConversationExecutionContext } from '../lib/creative/music/runtime/CreativeMusicConversationStateContract.js';

test('professional continuation state survives project conversation persistence', () => {
  const state = mergeMusicConversationState(emptyMusicConversationState(), {
    professional_production_state: { source_asset_id: 'source-1', next_stage: 'MIX_ENGINEERING', next_action: { action: 'BUILD_AND_RENDER_MIX' } },
  });
  assert.equal(state.professional_production_state.source_asset_id, 'source-1');
  const context = musicConversationExecutionContext(state);
  assert.equal(context.professional_production_state.next_stage, 'MIX_ENGINEERING');
});
