import fs from "node:fs";
import assert from "node:assert/strict";

const preview = fs.readFileSync("lib/creative/music/client/MusicMultitrackPreviewEngine.js", "utf8");
const meter = fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicLiveEngineeringMeters.jsx", "utf8");
const worklet = fs.readFileSync("public/audio/avantiqo-music-source-diagnostics-worklet.js", "utf8");

assert.match(preview, /SOURCE_DIAGNOSTICS_MODULE/);
assert.match(preview, /pre_insert_source_diagnostics: sourceDiagnosticsAvailable/);
assert.match(preview, /background_floor_estimation: sourceDiagnosticsAvailable/);
assert.match(preview, /mains_hum_detection: sourceDiagnosticsAvailable/);
assert.match(preview, /dc_offset_detection: sourceDiagnosticsAvailable/);
assert.match(preview, /AVANTIQO_MUSIC_LIVE_ENGINEERING_METER_V6/);
assert.match(preview, /clipBus\.connect\(sourceDiagnostics\)/);
assert.match(preview, /preTrim = sourceDiagnostics/);
assert.match(preview, /const cleanedSource = connectSourceCleanup\(context, preTrim, track\)/);
assert.match(worklet, /background_floor_estimate_dbfs/);
assert.match(worklet, /hum_50_relative_db/);
assert.match(worklet, /hum_60_relative_db/);
assert.match(worklet, /dc_offset_warning/);
assert.match(worklet, /floor_is_estimate: true/);
assert.match(meter, /Source diagnostics/);
assert.match(meter, /PRE-CLEANUP/);
assert.match(meter, /Background floor is an estimate/);
assert.match(meter, /Mains hum is elevated before cleanup/);

console.log("AVANTIQO_MUSIC_SOURCE_DIAGNOSTICS_RUNTIME_AUDIT=PASS");
console.log("AVANTIQO_MUSIC_SOURCE_DIAGNOSTICS_METER=V6");
console.log("AVANTIQO_MUSIC_SOURCE_DIAGNOSTICS_STAGE=PRE_CLEANUP");
