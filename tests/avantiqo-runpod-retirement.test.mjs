import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) { return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8"); }

const forbiddenDirectProvider = /api\.runpod|rest\.runpod|RUNPOD_API_KEY|RUNPOD_MANAGEMENT_API_KEY|AVANTIQO_[A-Z0-9_]*RUNPOD[A-Z0-9_]*API_KEY/i;

test("owned provider registrations are Modal-only", () => {
  for (const path of [
    "lib/platform/service-runtime/providers/avantiqo-code/AvantiqoCodeProviderRegistration.js",
    "lib/platform/service-runtime/providers/avantiqo-voice/AvantiqoVoiceProviderRegistration.js",
    "lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProviderRegistration.js",
    "lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProvider.js",
  ]) {
    const source = read(path);
    assert.doesNotMatch(source, forbiddenDirectProvider, path);
  }
});

test("owned execution providers cannot fall back to retired provider runtimes", () => {
  const code = read("lib/platform/service-runtime/providers/avantiqo-code/AvantiqoCodeProviderV2.js");
  const voice = read("lib/platform/service-runtime/providers/avantiqo-voice/AvantiqoVoiceProviderV2.js");
  const video = read("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProviderV2.js");
  assert.match(code, /AVANTIQO_CODE_MODAL_CONFIGURATION_REQUIRED/);
  assert.doesNotMatch(code, /RunpodCodeProvider|AvantiqoCodeProvider\.js/);
  assert.match(voice, /AVANTIQO_VOICE_MODAL_DIRECT_CONFIGURATION_REQUIRED/);
  assert.doesNotMatch(voice, /LegacyVoiceProvider/);
  assert.match(video, /AVANTIQO_VIDEO_LEGACY_JOB_TRANSPORT_RETIRED/);
  assert.doesNotMatch(video, /AvantiqoOwnedRunpodWorker|AvantiqoVideoProvider\.js/);
});

test("new Intelligence experiments cannot select retired GPU execution mode", () => {
  for (const path of [
    "lib/intelligence/runtime/AvantiqoExperimentExecutionGovernanceRuntime.js",
    "lib/intelligence/runtime/AvantiqoExperimentExecutionClaimRuntime.js",
    "lib/intelligence/runtime/AvantiqoExperimentExecutionReceiptRuntime.js",
  ]) {
    assert.doesNotMatch(read(path), /"RUNPOD_GPU"/, path);
  }
});

test("retirement migration removes persisted provider lease infrastructure", () => {
  const migration = read("supabase/migrations/20260910010000_retire_runpod_infrastructure.sql");
  assert.match(migration, /drop table if exists public\.avantiqo_voice_runpod_leases cascade/);
  assert.match(migration, /drop table if exists public\.avantiqo_video_runpod_leases cascade/);
  assert.match(migration, /drop table if exists public\.avantiqo_intelligence_runpod_leases cascade/);
  assert.match(migration, /drop column if exists lease_id/);
});
