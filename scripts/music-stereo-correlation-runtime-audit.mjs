import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const preview = read("lib/creative/music/client/MusicMultitrackPreviewEngine.js");
const masterGraph = read("lib/creative/music/client/MusicMasterBusPreviewGraph.js");
const worklet = read("public/audio/avantiqo-music-stereo-meter-worklet.js");
const meters = read("components/creative/ProductionStudio/workspaces/MusicLiveEngineeringMeters.jsx");

assert.match(preview, /avantiqo-music-stereo-meter-worklet\.js/);
assert.match(preview, /createStereoMeterNode/);
assert.match(preview, /masterStereoNode\.connect\(analyser\)/);
assert.match(preview, /masterOutputDestination = masterStereoNode/);
assert.match(preview, /createMusicMasterBusPreviewGraph\(context, masterBus, masterOutputDestination\)/);
assert.match(preview, /pan\.connect\(stereoMeter\)/);
assert.match(preview, /stereoMeter\.connect\(postFaderAnalyser\)/);
assert.match(preview, /stereo_correlation_metering: stereoMeteringAvailable/);
assert.match(preview, /mono_compatibility_metering: stereoMeteringAvailable/);
assert.match(preview, /AVANTIQO_MUSIC_LIVE_ENGINEERING_METER_V6/);
assert.match(masterGraph, /AVANTIQO_MUSIC_MASTER_BUS_PREVIEW_GRAPH_V1/);
assert.match(worklet, /correlation/);
assert.match(worklet, /mono_compatibility_warning: correlation < 0\.15/);
assert.match(worklet, /phase_risk: correlation < 0/);
assert.match(worklet, /balance_db/);
assert.match(meters, /PHASE RISK/);
assert.match(meters, /CHECK MONO/);
assert.match(meters, /stereo_correlation/);
assert.match(meters, /balance_db/);
assert.doesNotMatch(preview, /production_deploy_performed\s*:\s*true/);

console.log("AVANTIQO_MUSIC_STEREO_CORRELATION_RUNTIME_AUDIT=PASS");
console.log("AVANTIQO_MUSIC_STEREO_CORRELATION_METER=V6");
console.log("AVANTIQO_MUSIC_MASTER_STEREO_STAGE=POST_MASTER_GRAPH_DESTINATION");
