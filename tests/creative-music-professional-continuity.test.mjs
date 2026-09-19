import test from "node:test";
import assert from "node:assert/strict";
import { emptyMusicConversationState, mergeMusicConversationState, musicConversationExecutionContext } from "../lib/creative/music/runtime/CreativeMusicConversationStateContract.js";

test("music conversation state persists professional production continuation", () => {
  const nextStage = { status: "NEXT_STAGE_REQUIRED", stage_id: "STEM_SEPARATION", next_action: { capability: "ai.audio.stems" } };
  const manifest = { standard: "PROFESSIONAL_RELEASE", release_ready: false, blockers: ["STEM_SEPARATION"] };
  const state = mergeMusicConversationState(emptyMusicConversationState(), { professional_production: manifest, professional_next_stage: nextStage });
  assert.equal(state.professional_next_stage.stage_id, "STEM_SEPARATION");
  assert.equal(state.professional_production.standard, "PROFESSIONAL_RELEASE");
  const context = musicConversationExecutionContext(state);
  assert.equal(context.professional_next_stage.next_action.capability, "ai.audio.stems");
});
