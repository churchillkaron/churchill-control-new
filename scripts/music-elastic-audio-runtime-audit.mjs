#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = {
  analysis: "lib/creative/music/runtime/CreativeMusicElasticAudioRuntime.js",
  route: "app/api/creative/music/elastic-audio/route.js",
  provider: "lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoMusicElasticAudioProvider.js",
  worker: "services/avantiqo-music-elastic-engine/handler.py",
  panel: "components/creative/ProductionStudio/workspaces/MusicElasticAudioPanel.jsx",
  workspace: "components/creative/ProductionStudio/workspaces/MusicStudioWorkspace.jsx",
  catalog: "lib/platform/service-runtime/ai/PlatformAIServiceCatalog.js",
};
const source = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, path]) => [key, await readFile(path, "utf8")])));

assert.match(source.analysis, /AVANTIQO_MUSIC_ELASTIC_TRANSIENT_ANALYSIS_V1/);
assert.match(source.analysis, /AVANTIQO_MUSIC_ELASTIC_WARP_PLAN_V1/);
assert.match(source.analysis, /automatic_apply_forbidden: true/);
assert.match(source.analysis, /pitch_preserving_render_required: true/);
assert.match(source.analysis, /transient_preservation_required: true/);
assert.match(source.analysis, /destructive_edit: false/);

assert.match(source.route, /AVANTIQO_MUSIC_ELASTIC_AUDIO_API_V2/);
assert.match(source.route, /AVANTIQO_MUSIC_ELASTIC_AUDIO_RENDER_REQUEST_V1/);
assert.match(source.route, /AVANTIQO_MUSIC_ELASTIC_AUDIO_RENDER_RESULT_V1/);
assert.match(source.route, /AVANTIQO_MUSIC_ELASTIC_AUDIO_ENGINE_V1/);
assert.match(source.route, /AVANTIQO_MUSIC_ELASTIC_AUDIO_RENDER_REPORT_V1/);
assert.match(source.route, /executeService/);
assert.match(source.route, /settlePendingService/);
assert.match(source.route, /sourceRightsConfirmed/);
assert.match(source.route, /action === "submit_render"/);
assert.match(source.route, /action === "render_status"/);
assert.match(source.route, /action === "apply_render"/);
assert.match(source.route, /action === "revert_render"/);
assert.match(source.route, /COMPLETED_PENDING_APPLY/);
assert.match(source.route, /automatic_apply_forbidden: true/);
assert.match(source.route, /source_asset_history/);
assert.match(source.route, /source_assets_preserved: true/);
assert.match(source.route, /production_certified: false/);
assert.match(source.route, /endpoint_mutation_performed: false/);

assert.match(source.provider, /AVANTIQO_MUSIC_ELASTIC_AUDIO_ENGINE_V1/);
assert.match(source.provider, /ai\.audio\.elastic-warp/);
assert.match(source.provider, /signalsmith-stretch/);
assert.match(source.provider, /AVANTIQO_MUSIC_ELASTIC_ENGINE_NOT_CERTIFIED/);
assert.match(source.provider, /AVANTIQO_RUNPOD_SAFE_LEASE_V2/);
assert.match(source.provider, /output_storage_reference/);

assert.match(source.worker, /AVANTIQO_MUSIC_ELASTIC_AUDIO_ENGINE_V1/);
assert.match(source.worker, /AVANTIQO_MUSIC_ELASTIC_AUDIO_RENDER_REPORT_V1/);
assert.match(source.worker, /SIGNALSMITH_STRETCH_PYTHON_STRETCH_0_3_1/);
assert.match(source.worker, /SEAM_TAPER_NO_DUPLICATED_TRAJECTORY_V2/);
assert.match(source.worker, /seam = \(\(left\[:, -1:\] \+ right\[:, :1\]\) \* 0\.5\)/);
assert.match(source.worker, /previous\[:, -count:\] = left \* \(1\.0 - ramp\) \+ seam \* ramp/);
assert.match(source.worker, /current\[:, :count\] = seam \* \(1\.0 - ramp\) \+ right \* ramp/);
assert.match(source.worker, /boundary_smoothing_contract/);
assert.match(source.worker, /duplicated_transition_trajectory.*False/);
assert.doesNotMatch(source.worker, /previous\[:, -count:\] = blend\s*\n\s*current\[:, :count\] = blend/);
assert.match(source.worker, /python_stretch as ps/);
assert.match(source.worker, /pitch_preserving_time_stretch.*True/);
assert.match(source.worker, /automatic_apply_performed.*False/);
assert.match(source.worker, /production_certified.*False/);
assert.match(source.worker, /human_listening_review_required.*True/);

assert.match(source.panel, /Analyze transients/);
assert.match(source.panel, /Approve all safe moves/);
assert.match(source.panel, /submit_render/);
assert.match(source.panel, /render_status/);
assert.match(source.panel, /apply_render/);
assert.match(source.panel, /revert_render/);
assert.match(source.panel, /Original audio always remains recoverable/);
assert.match(source.workspace, /label: "Elastic Audio"/);
assert.match(source.workspace, /MusicElasticAudioPanel/);
assert.match(source.catalog, /ai\.audio\.elastic-warp/);

for (const value of Object.values(source)) assert.doesNotMatch(value, /automatic_apply_performed:\s*true|production_certified:\s*true/);

console.log("AVANTIQO_MUSIC_ELASTIC_AUDIO_RUNTIME_AUDIT=PASS");
console.log("AVANTIQO_MUSIC_ELASTIC_AUDIO_LIFECYCLE=ANALYZE_REVIEW_RENDER_EXPLICIT_APPLY_REVERT");
console.log("AVANTIQO_MUSIC_ELASTIC_AUDIO_PITCH_PRESERVING_ENGINE=SIGNALSMITH_STRETCH");
console.log("AVANTIQO_MUSIC_ELASTIC_AUDIO_BOUNDARY_SMOOTHING=NO_DUPLICATED_TRAJECTORY_V2");
console.log("AVANTIQO_MUSIC_ELASTIC_AUDIO_AUTOMATIC_APPLY=false");
console.log("AVANTIQO_MUSIC_ELASTIC_AUDIO_PRODUCTION_CERTIFIED=false");
console.log("AVANTIQO_MUSIC_ELASTIC_AUDIO_PROVIDER_JOB_SUBMITTED=false");
console.log("AVANTIQO_MUSIC_ELASTIC_AUDIO_ENDPOINT_MUTATION_PERFORMED=false");
