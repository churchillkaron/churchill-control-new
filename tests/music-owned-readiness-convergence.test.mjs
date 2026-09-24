import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const readiness = fs.readFileSync("app/api/creative/music/readiness/route.js", "utf8");
const registration = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProviderRegistration.js", "utf8");

test("Music readiness probes the same local providers used by execution", () => {
  for (const provider of ["AvantiqoMusicGenerationLocalQueueProvider", "AvantiqoSfxLocalQueueProvider", "AvantiqoMusicSeparatorLocalQueueProvider", "AvantiqoMusicElasticLocalQueueProvider", "AvantiqoMusicVocalCorrectionLocalQueueProvider"]) assert.match(readiness, new RegExp(provider));
  assert.match(readiness, /Promise\.all\(/);
  assert.match(readiness, /preferred_execution_surface: music === true \? "AVANTIQO_LOCAL_NODE_V1"/);
  assert.doesNotMatch(readiness, /modal_runtime_available|RunPod|runpod/);
});

test("Music readiness combines local runtime with certification authority", () => {
  assert.match(readiness, /const stemsReady = stems\.ready === true && separatorRuntimeReady/);
  assert.match(readiness, /AVANTIQO_MUSIC_SEPARATOR_ENGINE_CERTIFIED/);
  assert.match(readiness, /const elasticReady = elastic\.ready === true && elasticRuntimeReady/);
  assert.match(readiness, /const vocalCorrectionReady = vocalCorrection\.ready === true && vocalCorrectionRuntimeReady/);
  assert.match(readiness, /AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_CERTIFIED/);
  assert.match(readiness, /const sfxReady = sfx\.ready === true && sfxRuntimeReady/);
});

test("Audio provider registration is local-only and bounded to implemented capabilities", () => {
  assert.match(registration, /local_only_execution:true/);
  assert.match(registration, /modal_fallback_allowed:false/);
  assert.match(registration, /implemented_capabilities:LOCAL_CAPABILITIES/);
  assert.match(registration, /external_provider_fallback_allowed:false/);
});

test("readiness rejects stale database certification when the current local runtime is unavailable", () => {
  assert.match(readiness, /stale_database_certification_ignored: elastic\.ready === true && !elasticRuntimeReady/);
  assert.match(readiness, /stale_database_certification_ignored: vocalCorrection\.ready === true && !vocalCorrectionRuntimeReady/);
});

test("local Music acceptance stays separate from production certification", () => {
  assert.match(readiness, /local_node_live_acceptance/);
  assert.match(readiness, /benchmark_review_preview_allowed/);
  assert.match(readiness, /live_acceptance_ready:/);
  assert.match(readiness, /live_acceptance_only:/);
  assert.match(readiness, /LOCAL_ACCEPTANCE_READY/);
});
