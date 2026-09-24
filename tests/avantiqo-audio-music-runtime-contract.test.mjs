import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const registration = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProviderRegistration.js", "utf8");
const provider = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProvider.js", "utf8");
const policy = fs.readFileSync("lib/platform/service-runtime/providers/AvantiqoOwnedCertificationPolicy.js", "utf8");

test("owned Audio advertises only implemented local capabilities", () => {
  for (const capability of ["ai.music.generate", "ai.sfx.generate", "ai.audio.stems", "ai.audio.vocal-correct", "ai.audio.elastic-warp"]) {
    assert.match(registration, new RegExp(capability.replaceAll(".", "\\.")));
  }
  assert.match(registration, /implemented_capabilities:LOCAL_CAPABILITIES/);
  assert.match(registration, /certified_capabilities:capabilities/);
  assert.match(registration, /local_only_execution:true/);
});

test("active Audio dispatches every implemented capability to a local provider", () => {
  assert.match(provider, /capability === "ai\.music\.generate"/);
  assert.match(provider, /capability === "ai\.sfx\.generate"/);
  assert.match(provider, /capability === "ai\.audio\.stems"/);
  assert.match(provider, /capability === "ai\.audio\.elastic-warp"/);
  assert.match(provider, /capability === "ai\.audio\.vocal-correct"/);
  assert.match(provider, /AVANTIQO_AUDIO_LOCAL_CAPABILITY_NOT_IMPLEMENTED/);
});

test("governed music and stem foundation models remain registered", () => {
  assert.match(registration, /ACE-Step\/Ace-Step1\.5/);
  assert.match(registration, /OpenMOSS-Team\/MOSS-SoundEffect-v2\.0/);
  assert.match(registration, /facebookresearch\/demucs:htdemucs_ft/);
  assert.match(registration, /torchcrepe-full/);
  assert.match(registration, /signalsmith-stretch/);
  assert.match(policy, /facebookresearch\/demucs:htdemucs_ft/);
});
