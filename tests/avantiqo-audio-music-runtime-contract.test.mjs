import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { AVANTIQO_OWNED_MODEL_CATALOG } from "../lib/platform/service-runtime/providers/AvantiqoOwnedCertificationPolicy.js";

const registration = fs.readFileSync(new URL("../lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProviderRegistration.js", import.meta.url), "utf8");
const provider = fs.readFileSync(new URL("../lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProvider.js", import.meta.url), "utf8");

test("owned Audio is certified only for implemented local capabilities", () => {
  assert.match(registration, /DEFAULT_CERTIFIED_CAPABILITIES = Object\.freeze\(\["ai\.music\.generate"\]\)/);
  assert.match(registration, /LOCAL_IMPLEMENTED_CAPABILITIES/);
  assert.match(registration, /"ai\.sfx\.generate"/);
  assert.match(registration, /"ai\.audio\.stems"/);
  assert.match(registration, /"ai\.audio\.vocal-correct"/);
  assert.match(registration, /"ai\.audio\.elastic-warp"/);
  assert.match(registration, /AVANTIQO_AUDIO_LOCAL_CAPABILITY_NOT_IMPLEMENTED/);
});

test("Audio provider fails closed locally and never falls through to cloud", () => {
  assert.match(provider, /LOCAL_ROUTES/);
  assert.match(provider, /AVANTIQO_AUDIO_LOCAL_CAPABILITY_NOT_IMPLEMENTED/);
  assert.match(provider, /AVANTIQO_AUDIO_LOCAL_JOB_ID_REQUIRED/);
  assert.doesNotMatch(provider, /Modal|modal|RunPod|runpod|FalProvider|fal-ai/);
});

test("ACE-Step owned music model remains governed", () => {
  const model = AVANTIQO_OWNED_MODEL_CATALOG["avantiqo-audio"].models["ACE-Step/Ace-Step1.5"];
  assert.equal(model.license, "mit");
  assert.equal(model.runtime_compatible, true);
  assert.deepEqual(model.capabilities, ["ai.music.generate"]);
});

test("Demucs htdemucs_ft remains the governed four-stem model", () => {
  const model = AVANTIQO_OWNED_MODEL_CATALOG["avantiqo-audio"].models["facebookresearch/demucs:htdemucs_ft"];
  assert.equal(model.runtime_compatible, true);
  assert.deepEqual(model.stems, ["vocals", "drums", "bass", "other"]);
  assert.match(registration, /STEM_SEPARATOR_MODEL/);
});

test("Audio registry is explicitly local-only", () => {
  assert.match(registration, /infrastructure_provider: "AVANTIQO_LOCAL_NODE_V1"/);
  assert.match(registration, /local_only_execution: true/);
  assert.match(registration, /cloud_fallback_allowed: false/);
  assert.match(registration, /runtime_configuration: \{/);
  assert.match(registration, /local_only: true/);
  assert.doesNotMatch(registration, /MODAL_|modalConfigured|modal_fallback/);
});
