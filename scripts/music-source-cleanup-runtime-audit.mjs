import fs from "node:fs";
import assert from "node:assert/strict";

const preview = fs.readFileSync("lib/creative/music/client/MusicMultitrackPreviewEngine.js", "utf8");
const runtime = fs.readFileSync("lib/creative/music/runtime/CreativeMusicSourceCleanupRuntime.js", "utf8");
const cleanupPanel = fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicSourceCleanupPanel.jsx", "utf8");
const mixer = fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicMixerSendsPanel.jsx", "utf8");
const meters = fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicLiveEngineeringMeters.jsx", "utf8");

assert.match(runtime, /AVANTIQO_MUSIC_SOURCE_CLEANUP_V1/);
assert.match(runtime, /AVANTIQO_MUSIC_SOURCE_CLEANUP_RECOMMENDATION_V1/);
assert.match(runtime, /auto_apply_forbidden: true/);
assert.match(runtime, /requires_human_enable: true/);
assert.match(runtime, /original_source_preserved: true/);
assert.match(preview, /function connectSourceCleanup/);
assert.match(preview, /source_cleanup_aware: true/);
assert.match(preview, /AVANTIQO_MUSIC_MULTITRACK_BROWSER_PREVIEW_V10/);
assert.match(preview, /AVANTIQO_MUSIC_LIVE_ENGINEERING_METER_V4/);
assert.match(preview, /clipBus\.connect\(sourceDiagnostics\)/);
assert.match(preview, /const cleanedSource = connectSourceCleanup/);
assert.match(cleanupPanel, /Avantiqo never auto-enables cleanup/);
assert.match(cleanupPanel, /Apply/);
assert.match(mixer, /MusicSourceCleanupPanel/);
assert.match(meters, /AVANTIQO_MUSIC_LIVE_ENGINEERING_METER_V4/);
assert.match(meters, /PRE-CLEANUP/);

console.log("AVANTIQO_MUSIC_SOURCE_CLEANUP_RUNTIME_AUDIT=PASS");
