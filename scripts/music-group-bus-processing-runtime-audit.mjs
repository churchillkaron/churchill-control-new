import fs from "node:fs";
import assert from "node:assert/strict";

const runtime = fs.readFileSync("lib/creative/music/runtime/CreativeMusicBusProcessingRuntime.js", "utf8");
const routing = fs.readFileSync("lib/creative/music/runtime/CreativeMusicMixerRoutingRuntime.js", "utf8");
const graph = fs.readFileSync("lib/creative/music/client/MusicGroupBusPreviewGraph.js", "utf8");
const preview = fs.readFileSync("lib/creative/music/client/MusicMultitrackPreviewEngine.js", "utf8");
const panel = fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicGroupBusPanel.jsx", "utf8");
const route = fs.readFileSync("app/api/creative/music/multitrack/route.js", "utf8");

assert.match(runtime, /AVANTIQO_MUSIC_GROUP_BUS_PROCESSING_V1/);
assert.match(runtime, /high_pass_hz/);
assert.match(runtime, /presence_q/);
assert.match(runtime, /compressor/);
assert.match(runtime, /release_render_required: true/);
assert.match(routing, /group_automation_cleanup_on_delete: true/);
assert.match(routing, /CREATIVE_MUSIC_AUX_OUTPUT_UNSUPPORTED/);
assert.match(routing, /CREATIVE_MUSIC_SEND_TARGET_NOT_AUX/);
assert.match(graph, /AVANTIQO_MUSIC_GROUP_BUS_PREVIEW_GRAPH_V3/);
assert.match(graph, /group_processing: true/);
assert.match(graph, /createDynamicsCompressor/);
assert.match(graph, /post_fader_metering: true/);
assert.match(preview, /AVANTIQO_MUSIC_MULTITRACK_BROWSER_PREVIEW_V13/);
assert.match(preview, /group_bus_metering: true/);
assert.match(preview, /AVANTIQO_MUSIC_LIVE_ENGINEERING_METER_V6/);
assert.match(panel, /Bus EQ/);
assert.match(panel, /Bus compressor/);
assert.match(route, /validateMusicGroupProcessing/);
assert.match(route, /mixer_group_processing_ready: true/);

console.log("AVANTIQO_MUSIC_GROUP_BUS_PROCESSING_RUNTIME_AUDIT=PASS");
