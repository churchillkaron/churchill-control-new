import test from "node:test";
import assert from "node:assert/strict";
import { buildMusicPreUiAcceptance } from "../lib/creative/music/runtime/CreativeMusicPreUiAcceptanceRuntime.js";

test("pre-UI acceptance fails closed on uncertified execution lanes", () => {
  const result = buildMusicPreUiAcceptance({ provider: { id: "avantiqo-audio", capabilities: ["ai.music.generate"], metadata: {} } });
  assert.equal(result.ui_ready, false);
  assert.ok(result.blocking_workflows.includes("stem_separation"));
  assert.ok(result.blocking_workflows.includes("pitch_tuning"));
  assert.ok(result.blocking_workflows.includes("sfx"));
  assert.ok(result.deferred_workflows.includes("singing_voice_identity"));
});

test("pre-UI acceptance can become ready while singer identity stays intentionally deferred", () => {
  const result = buildMusicPreUiAcceptance({ provider: { id: "avantiqo-audio", capabilities: ["ai.music.generate", "ai.audio.stems", "ai.audio.edit", "ai.audio.remix", "ai.audio.extend", "ai.sfx.generate"], metadata: { separator_runtime: { production_routing_allowed: true }, sfx_runtime: { production_routing_allowed: true }, vocal_correction_runtime: { production_routing_allowed: true }, elastic_audio_runtime: { production_routing_allowed: true } } } });
  assert.equal(result.ui_ready, true);
  assert.deepEqual(result.blocking_workflows, []);
  assert.deepEqual(result.deferred_workflows, ["singing_voice_identity"]);
});
