import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  buildMusicTransformationPlan,
  MUSIC_SOURCE_AUDIO_RIGHTS_ATTESTATION_CONTRACT,
  MUSIC_VOCAL_REMOVAL_MODES,
  MUSIC_VOCAL_ROLE_SEPARATOR_CAPABILITY,
} from "../lib/creative/runtime/engines/MusicEngine.js";

const registration = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProviderRegistration.js", "utf8");
const panel = fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicBackingTrackPanel.jsx", "utf8");
const source = "storage://creative-assets/example/song.wav";
const rights = { contract: MUSIC_SOURCE_AUDIO_RIGHTS_ATTESTATION_CONTRACT, confirmed: true };
test("ordinary backing tracks remain on certified all-vocals removal", () => {
  const previous = { certified: process.env.AVANTIQO_AUDIO_CERTIFIED_CAPABILITIES, audio: process.env.AVANTIQO_AUDIO_ENGINE_ENABLED, localQueue: process.env.AVANTIQO_LOCAL_COMPUTE_QUEUE_ENABLED, separator: process.env.AVANTIQO_MUSIC_SEPARATOR_ENGINE_ENABLED, separatorCertified: process.env.AVANTIQO_MUSIC_SEPARATOR_ENGINE_CERTIFIED };
  Object.assign(process.env, { AVANTIQO_AUDIO_CERTIFIED_CAPABILITIES: "ai.music.generate,ai.audio.stems", AVANTIQO_AUDIO_ENGINE_ENABLED: "true", AVANTIQO_LOCAL_COMPUTE_QUEUE_ENABLED: "true", AVANTIQO_MUSIC_SEPARATOR_ENGINE_ENABLED: "true", AVANTIQO_MUSIC_SEPARATOR_ENGINE_CERTIFIED: "true" });
  try {
    const plan = buildMusicTransformationPlan("backing_track", { source_audio: source, source_duration_seconds: 180, rights_attestation: rights });
    assert.equal(plan.session.processing.vocal_removal_mode, MUSIC_VOCAL_REMOVAL_MODES.ALL_VOCALS);
    assert.equal(plan.session.processing.preserve_backing_vocals, false);
    assert.equal(plan.executable, true);
  } finally {
    process.env.AVANTIQO_AUDIO_CERTIFIED_CAPABILITIES = previous.certified; process.env.AVANTIQO_AUDIO_ENGINE_ENABLED = previous.audio; process.env.AVANTIQO_LOCAL_COMPUTE_QUEUE_ENABLED = previous.localQueue; process.env.AVANTIQO_MUSIC_SEPARATOR_ENGINE_ENABLED = previous.separator; process.env.AVANTIQO_MUSIC_SEPARATOR_ENGINE_CERTIFIED = previous.separatorCertified;
  }
});

test("lead-only removal never falls back to four-stem Demucs", () => {
  const previous = { certified: process.env.AVANTIQO_AUDIO_CERTIFIED_CAPABILITIES, audio: process.env.AVANTIQO_AUDIO_ENGINE_ENABLED, localQueue: process.env.AVANTIQO_LOCAL_COMPUTE_QUEUE_ENABLED, separator: process.env.AVANTIQO_MUSIC_SEPARATOR_ENGINE_ENABLED, separatorCertified: process.env.AVANTIQO_MUSIC_SEPARATOR_ENGINE_CERTIFIED };
  Object.assign(process.env, { AVANTIQO_AUDIO_CERTIFIED_CAPABILITIES: "ai.music.generate,ai.audio.stems", AVANTIQO_AUDIO_ENGINE_ENABLED: "true", AVANTIQO_LOCAL_COMPUTE_QUEUE_ENABLED: "true", AVANTIQO_MUSIC_SEPARATOR_ENGINE_ENABLED: "true", AVANTIQO_MUSIC_SEPARATOR_ENGINE_CERTIFIED: "true" });
  try {
    const plan = buildMusicTransformationPlan("backing_track", { source_audio: source, source_duration_seconds: 180, rights_attestation: rights, vocal_removal_mode: "LEAD_ONLY_KEEP_BACKING" });
    assert.equal(plan.session.processing.preserve_backing_vocals, true);
    assert.equal(plan.session.separator.vocal_role_separation_required, true);
    assert.equal(plan.session.separator.vocal_role_capability, MUSIC_VOCAL_ROLE_SEPARATOR_CAPABILITY);
    assert.equal(plan.executable, false);
  } finally {
    process.env.AVANTIQO_AUDIO_CERTIFIED_CAPABILITIES = previous.certified; process.env.AVANTIQO_AUDIO_ENGINE_ENABLED = previous.audio; process.env.AVANTIQO_LOCAL_COMPUTE_QUEUE_ENABLED = previous.localQueue; process.env.AVANTIQO_MUSIC_SEPARATOR_ENGINE_ENABLED = previous.separator; process.env.AVANTIQO_MUSIC_SEPARATOR_ENGINE_CERTIFIED = previous.separatorCertified;
  }
});
test("provider registry keeps vocal-role separation research-gated", () => {
  assert.match(registration, /VOCAL_ROLE_SEPARATOR_CAPABILITY = "ai\.audio\.vocal-role-separate"/);
  assert.match(registration, /RESEARCH_RUNTIME_IMPLEMENTED_CERTIFICATION_REQUIRED/);
  assert.match(registration, /production_routing_allowed:\s*false/);
  assert.match(registration, /ordinary_stem_separator_substitution_forbidden:\s*true/);
  assert.match(registration, /UVR_MDXNET_KARA_2\.onnx/);
  assert.match(registration, /model_license_verified:\s*true/);
  assert.match(registration, /replace_certified_demucs_automatically:\s*false/);
});

test("Backing Track UI exposes the honest vocal-removal choice", () => {
  assert.match(panel, /Remove all vocals/);
  assert.match(panel, /Remove lead · keep backing vocals/);
  assert.match(panel, /Ordinary 4-stem separation will not be substituted/);
});
