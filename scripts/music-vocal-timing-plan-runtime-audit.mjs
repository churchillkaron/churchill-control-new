#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = {
  analysis: "lib/creative/music/runtime/CreativeMusicVocalTimingAnalysisRuntime.js",
  plan: "lib/creative/music/runtime/CreativeMusicVocalTimingPlanRuntime.js",
  api: "app/api/creative/music/vocal-timing-plan/route.js",
  panel: "components/creative/ProductionStudio/workspaces/MusicVocalTimingPlanPanel.jsx",
  stack: "components/creative/ProductionStudio/workspaces/MusicVocalPitchAnalysisPanel.jsx",
  timing: "services/avantiqo-music-vocal-correction-engine/timing.py",
  engine: "services/avantiqo-music-vocal-correction-engine/handler_v2.py",
  provider: "lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoMusicVocalCorrectionProvider.js",
};

const source = Object.fromEntries(
  await Promise.all(Object.entries(paths).map(async ([key, path]) => [key, await readFile(path, "utf8")])),
);

assert.match(source.analysis, /AVANTIQO_MUSIC_VOCAL_TIMING_ANALYSIS_V1/);
assert.match(source.analysis, /grid_division: "EIGHTH_NOTE"/);
assert.match(source.analysis, /NEIGHBOR_PHRASE_COLLISION_RISK/);
assert.match(source.analysis, /auto_apply_forbidden: true/);
assert.match(source.analysis, /whole_phrase_translation_only: true/);
assert.match(source.analysis, /time_stretch_used: false/);
assert.match(source.analysis, /syllable_warp_forbidden: true/);
assert.match(source.analysis, /provider_job_submitted: false/);

assert.match(source.plan, /AVANTIQO_MUSIC_VOCAL_TIMING_PLAN_V1/);
assert.match(source.plan, /MUSICIAN_SHIFT_EXCEEDS_MAXIMUM/);
assert.match(source.plan, /NEIGHBOR_PHRASE_COLLISION_RISK/);
assert.match(source.plan, /musician_approval_required: true/);
assert.match(source.plan, /all_phrases_reviewed/);
assert.match(source.plan, /time_stretch_used: false/);

assert.match(source.api, /action === "analyze"/);
assert.match(source.api, /action === "build"/);
assert.match(source.api, /action === "review_phrase"/);
assert.match(source.api, /audio_changed: false/);
assert.match(source.api, /timing_applied: false/);
assert.match(source.api, /provider_job_submitted: false/);

assert.match(source.panel, /Analyze timing/);
assert.match(source.panel, /Build review plan/);
assert.match(source.panel, /Timing render is not connected yet/);
assert.match(source.panel, /Internal consonant, note, vibrato and syllable timing remain unchanged/);
assert.match(source.stack, /MusicVocalTimingPlanPanel/);

assert.match(source.timing, /APPROVED_TIMING_CONTRACT = "AVANTIQO_MUSIC_VOCAL_TIMING_PLAN_V1"/);
assert.match(source.timing, /apply_approved_phrase_timing_plan/);
assert.match(source.timing, /EXACT_MUSICIAN_APPROVED_WHOLE_PHRASE_TRANSLATION_WITH_LOCAL_COLLISION_GUARDS/);
assert.match(source.timing, /time_stretch_used": False/);
assert.match(source.timing, /syllable_warp_applied": False/);
assert.match(source.timing, /PHRASE_NOT_APPROVED/);
assert.match(source.timing, /UNSAFE_MOVE/);

assert.match(source.engine, /approved_timing_plan/);
assert.match(source.engine, /AVANTIQO_MUSIC_VOCAL_TIMING_PLAN_V1/);
assert.match(source.engine, /apply_approved_phrase_timing_plan/);
assert.match(source.engine, /approved_timing_plan_exact_moves_required_when_supplied/);
assert.match(source.engine, /automatic_timing_forbidden_with_musician_plans/);
assert.match(source.provider, /approved_timing_plan: approvedTimingPlan/);
assert.match(source.provider, /timing_plan_contract/);

console.log("MUSIC_VOCAL_TIMING_PLAN_RUNTIME_AUDIT=PASS");
console.log("MUSIC_VOCAL_TIMING_PLAN_AUDIO_CHANGED=false");
console.log("MUSIC_VOCAL_TIMING_PLAN_PROVIDER_JOB_SUBMITTED=false");
console.log("MUSIC_VOCAL_TIMING_PLAN_ENDPOINT_MUTATION_PERFORMED=false");
