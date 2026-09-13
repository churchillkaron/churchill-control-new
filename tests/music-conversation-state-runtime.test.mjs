import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  emptyMusicConversationState,
  mergeMusicConversationState,
  musicConversationExecutionContext,
} from "../lib/creative/music/runtime/CreativeMusicConversationStateContract.js";
import { buildWorldClassMusicStudioPlan } from "../lib/creative/music/runtime/CreativeMusicWorldClassStudioRuntime.js";

const executeCapability = fs.readFileSync(
  "lib/creative/music/capabilities/executeWorldClassMusicStudio.js",
  "utf8",
);
const planCapability = fs.readFileSync(
  "lib/creative/music/capabilities/planWorldClassMusicStudio.js",
  "utf8",
);
const inspectCapability = fs.readFileSync(
  "lib/creative/music/capabilities/inspectWorldClassMusicStudio.js",
  "utf8",
);
test("Music conversation state is bounded and keeps structured project decisions", () => {
  const base = emptyMusicConversationState();
  const next = mergeMusicConversationState(base, {
    creative_intent: "Dark cinematic song with a patient build",
    sonic_identity: ["low pulse", "human vocal texture"],
    protected_ranges: [{ start_seconds: 63, end_seconds: 81, label: "approved chorus" }],
    approved_sections: [{ start_seconds: 0, end_seconds: 22, label: "intro" }],
    rejected_ideas: ["festival EDM drop"],
    unresolved_decisions: ["final bridge instrumentation"],
    version_lineage: [{ id: "master-v2", master_asset_id: "master-v2", parent_version_id: "master-v1" }],
    recent_decisions: Array.from({ length: 20 }, (_, i) => `decision-${i}`),
  });
  assert.equal(next.creative_intent, "Dark cinematic song with a patient build");
  assert.equal(next.protected_ranges[0].start_seconds, 63);
  assert.equal(next.version_lineage[0].parent_version_id, "master-v1");
  assert.equal(next.recent_decisions.length, 12);
  assert.equal(next.revision, 1);
  assert.match(next.state_fingerprint, /^[a-f0-9]{24}$/);
});
test("execution context omits raw chat and preserves exact protected ranges", () => {
  const state = mergeMusicConversationState(emptyMusicConversationState(), {
    protected_ranges: [{ start_seconds: 63, end_seconds: 81, label: "chorus" }],
    recent_decisions: ["Keep the female harmonies"],
  });
  const context = musicConversationExecutionContext(state);
  assert.equal(context.raw_chat_transcript_saved, false);
  assert.deepEqual(context.protected_ranges, state.protected_ranges);
  assert.equal(Object.hasOwn(context, "recent_decisions"), false);
});

test("world-class plan carries bounded project context into governance", () => {
  const state = musicConversationExecutionContext(mergeMusicConversationState(emptyMusicConversationState(), {
    creative_intent: "Mystic restrained score",
    protected_ranges: [{ start_seconds: 10, end_seconds: 18, label: "approved motif" }],
  }));
  const plan = buildWorldClassMusicStudioPlan({ objective: "make the chorus darker", music_conversation_context: state });
  assert.equal(plan.conversation_context.creative_intent, "Mystic restrained score");
  assert.equal(plan.conversation_context.protected_ranges[0].label, "approved motif");
  assert.equal(plan.governance.raw_chat_transcript_saved_to_project, false);
  assert.equal(plan.governance.protected_ranges_require_explicit_change_scope, true);
});
test("Business Partner Music project reference is conversation-stable, not objective-stable", () => {
  assert.match(executeCapability, /\[context\.organizationId, conversationId, "music-studio"\]/);
  assert.doesNotMatch(executeCapability, /text\(payload\.objective\)\.toLowerCase\(\)/);
  assert.match(executeCapability, /loadMusicConversationState/);
  assert.match(executeCapability, /music_conversation_context: musicConversationContext/);
  assert.match(executeCapability, /conversation_state_patch/);
  assert.match(executeCapability, /decision_summary/);
  assert.match(executeCapability, /music_conversation_state_persisted/);
  assert.match(executeCapability, /conversationStatePersisted = false/);
});

test("Business Partner can inspect and plan with an existing Music project state", () => {
  assert.match(planCapability, /creative_project_id/);
  assert.match(planCapability, /loadMusicConversationState/);
  assert.match(planCapability, /musicConversationExecutionContext/);
  assert.match(inspectCapability, /what did we decide about the music/);
  assert.match(inspectCapability, /project_context: projectContext/);
  assert.match(inspectCapability, /loadMusicConversationState/);
});
