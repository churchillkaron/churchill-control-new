#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = {
  engine: "services/avantiqo-music-vocal-correction-engine/handler_v2.py",
  provider: "lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoMusicVocalCorrectionProvider.js",
  registration: "lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProviderRegistration.js",
  certification: "lib/platform/service-runtime/providers/AvantiqoOwnedCertificationPolicy.js",
  serviceCatalog: "lib/platform/service-runtime/ai/PlatformAIServiceCatalog.js",
  route: "app/api/creative/music/vocal-tuning-render/route.js",
  plan: "lib/creative/music/runtime/CreativeMusicVocalTuningPlanRuntime.js",
  panel: "components/creative/ProductionStudio/workspaces/MusicVocalTuningPlanPanel.jsx",
};

const source = Object.fromEntries(
  await Promise.all(Object.entries(files).map(async ([key, path]) => [key, await readFile(path, "utf8")])),
);

assert.match(source.engine, /AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_V2/);
assert.match(source.engine, /AVANTIQO_MUSIC_VOCAL_TUNING_PLAN_V1/);
assert.match(source.engine, /MUSICIAN_APPROVED_PLAN/);
assert.match(source.engine, /APPROVED_PLAN_SOURCE_CHECKSUM_MISMATCH/);
assert.match(source.engine, /APPROVED_PLAN_SEGMENT_NOT_APPROVED/);
assert.match(source.engine, /TIMING_REQUIRES_SEPARATE_MUSICIAN_REVIEW/);
assert.match(source.engine, /setTransposeSemitones\(float\(semitones\), tonality_limit\)/);
assert.match(source.engine, /formant_preservation_claimed": False/);
assert.match(source.engine, /human_listening_review_required_for_certification/);
assert.match(source.engine, /production_certified": False/);

assert.match(source.provider, /approved_tuning_plan: approvedTuningPlan/);
assert.match(source.provider, /source_window: sourceWindow/);
assert.match(source.provider, /APPROVED_PLAN_SOURCE_WINDOW_REQUIRED/);
assert.match(source.provider, /MUSICIAN_APPROVED_PLAN/);
assert.match(source.provider, /AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_NOT_CERTIFIED/);
assert.match(source.provider, /AVANTIQO_RUNPOD_SAFE_LEASE_V2/);

assert.match(source.registration, /ai\.audio\.vocal-correct/);
assert.match(source.registration, /torchcrepe-full/);
assert.match(source.registration, /vocalCorrectionRuntimeAvailable/);
assert.match(source.registration, /formant_preservation_claimed: false/);
assert.match(source.certification, /"torchcrepe-full"/);
assert.match(source.certification, /https:\/\/github\.com\/maxrmorrison\/torchcrepe/);
assert.match(source.certification, /Signalsmith Stretch/);
assert.match(source.certification, /ai\.audio\.vocal-correct/);
assert.match(source.serviceCatalog, /id: "ai\.audio\.vocal-correct"/);

assert.match(source.plan, /auto_apply_forbidden: true/);
assert.match(source.plan, /musician_approval_required: true/);
assert.match(source.route, /executeService/);
assert.match(source.route, /settlePendingService/);
assert.match(source.route, /sourceRightsConfirmed/);
assert.match(source.route, /VOCAL_TUNING_RENDER/);
assert.match(source.route, /source_asset_history/);
assert.match(source.route, /CURRENT_CLIP_SOURCE_CHANGED/);
assert.match(source.route, /CURRENT_TUNING_PLAN_CHANGED/);
assert.match(source.route, /formant_preservation_claimed: false/);
assert.match(source.route, /timing_correction_applied: false/);
assert.match(source.panel, /Render reviewed tuning/);
assert.match(source.panel, /Check render/);
assert.match(source.panel, /formant preservation is not claimed/);

for (const value of Object.values(source)) {
  assert.doesNotMatch(value, /direct[_ -]?runpod[_ -]?call/i);
}

console.log("MUSIC_VOCAL_TUNING_RENDER_RUNTIME_AUDIT=PASS");
console.log("MUSIC_VOCAL_TUNING_RENDER_PROVIDER_JOB_SUBMITTED=false");
console.log("MUSIC_VOCAL_TUNING_RENDER_ENDPOINT_MUTATION_PERFORMED=false");
