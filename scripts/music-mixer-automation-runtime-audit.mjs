import fs from "node:fs";
import assert from "node:assert/strict";

const runtime = fs.readFileSync("lib/creative/music/runtime/CreativeMusicAutomationRuntime.js", "utf8");
const scheduler = fs.readFileSync("lib/creative/music/client/MusicAutomationPreviewRuntime.js", "utf8");
const preview = fs.readFileSync("lib/creative/music/client/MusicMultitrackPreviewEngine.js", "utf8");
const panel = fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicAutomationPanel.jsx", "utf8");
const mixer = fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicMixerSendsPanel.jsx", "utf8");
const workstation = fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicMultitrackStudioPanelV2.jsx", "utf8");
const route = fs.readFileSync("app/api/creative/music/multitrack/route.js", "utf8");

assert.match(runtime, /AVANTIQO_MUSIC_MIXER_AUTOMATION_V1/);
assert.match(runtime, /TARGET_TYPES = Object\.freeze\(\["track", "group", "master"\]\)/);
assert.match(runtime, /PARAMETERS = Object\.freeze\(\["gain_db", "pan"\]\)/);
assert.match(runtime, /CREATIVE_MUSIC_AUTOMATION_DUPLICATE_TARGET/);
assert.match(scheduler, /AVANTIQO_MUSIC_AUTOMATION_PREVIEW_V1/);
assert.match(scheduler, /sample_clock_scheduled: true/);
assert.match(scheduler, /exponentialRampToValueAtTime/);
assert.match(preview, /AVANTIQO_MUSIC_MULTITRACK_BROWSER_PREVIEW_V14/);
assert.match(preview, /synchronized_preload_before_clock: true/);
assert.match(preview, /mixer_automation: true/);
assert.match(preview, /master:bus-master:gain_db/);
assert.match(preview, /group:\$\{groupId\}:gain_db/);
assert.match(preview, /track:\$\{track\.id\}:gain_db/);
assert.match(preview, /if \(!effectiveMute\) automationTargets\.set/);
assert.match(route, /validateMusicAutomation/);
assert.match(route, /mixer_automation_ready: true/);
assert.match(panel, /Write \{writeValue\.toFixed/);
assert.match(panel, /at \{finite\(playhead, 0\)\.toFixed\(2\)\}s/);
assert.match(mixer, /MusicAutomationPanel/);
assert.match(workstation, /playhead=\{playhead\}/);

console.log("AVANTIQO_MUSIC_MIXER_AUTOMATION_RUNTIME_AUDIT=PASS");
console.log("AVANTIQO_MUSIC_MIXER_AUTOMATION_PREVIEW=V14");
