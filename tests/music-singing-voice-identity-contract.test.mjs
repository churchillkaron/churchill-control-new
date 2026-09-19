import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildWorldClassMusicStudioPlan, listWorldClassMusicCapabilities } from "../lib/creative/music/runtime/CreativeMusicWorldClassStudioRuntime.js";

const voiceLibrary = new URL("../lib/platform/service-runtime/providers/avantiqo-voice/AvantiqoVoiceLibrary.js", import.meta.url);
const singingRuntime = new URL("../lib/creative/music/runtime/CreativeMusicSingingVoiceIdentityRuntime.js", import.meta.url);

test("Music Studio recognizes authorized singing voice identity work", () => {
  const plan = buildWorldClassMusicStudioPlan({ objective: "Use her voice and make her sing this song" });
  assert.ok(plan.selected_capabilities.some((item) => item.id === "singing_voice_identity"));
  assert.ok(plan.workers.some((item) => item.id === "voice_identity_producer"));
  assert.ok(plan.workers.some((item) => item.id === "vocal_producer"));
  assert.ok(plan.workers.some((item) => item.id === "stem_specialist"));
  const capability = listWorldClassMusicCapabilities().find((item) => item.id === "singing_voice_identity");
  assert.equal(capability.capability, "ai.audio.singing-voice-convert");
  assert.equal(capability.status, "RESEARCH_GATED");
});

test("Voice Library carries explicit speech or singing use scopes", async () => {
  const source = await readFile(voiceLibrary, "utf8");
  assert.match(source, /VOICE_USE_SCOPES = new Set\(\["SPEECH", "SINGING"\]\)/);
  assert.match(source, /useScopes = \["SPEECH"\]/);
  assert.match(source, /purpose = "SPEECH"/);
  assert.match(source, /AVANTIQO_VOICE_LIBRARY_USE_SCOPE_REQUIRED/);
  assert.match(source, /use_scope: requestedPurpose/);
});

test("Singing identity plan is rights scoped and certification gated", async () => {
  const source = await readFile(singingRuntime, "utf8");
  assert.match(source, /purpose: "SINGING"/);
  assert.match(source, /MUSIC_SINGING_VOICE_EXPLICIT_CONSENT_REQUIRED/);
  assert.match(source, /VOCAL_ISOLATION_REQUIRED/);
  assert.match(source, /MODEL_LICENSE_VERIFICATION_REQUIRED/);
  assert.match(source, /OWNED_RUNTIME_CERTIFICATION_REQUIRED/);
  assert.match(source, /demucs-htdemucs-ft/);
  assert.match(source, /Plachtaa\/seed-vc/);
  assert.match(source, /cross_organization_reuse_forbidden: true/);
  assert.match(source, /paid_execution_started: false/);
});
