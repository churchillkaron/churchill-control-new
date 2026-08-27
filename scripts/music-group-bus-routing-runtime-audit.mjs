import fs from "node:fs";
import assert from "node:assert/strict";

const routing = fs.readFileSync("lib/creative/music/runtime/CreativeMusicMixerRoutingRuntime.js", "utf8");
const graph = fs.readFileSync("lib/creative/music/client/MusicGroupBusPreviewGraph.js", "utf8");
const preview = fs.readFileSync("lib/creative/music/client/MusicMultitrackPreviewEngine.js", "utf8");
const panel = fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicGroupBusPanel.jsx", "utf8");
const mixer = fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicMixerSendsPanel.jsx", "utf8");
const route = fs.readFileSync("app/api/creative/music/multitrack/route.js", "utf8");

assert.match(routing, /AVANTIQO_MUSIC_MIXER_ROUTING_V2/);
assert.match(routing, /createMusicGroupBus/);
assert.match(routing, /routeMusicTrackToBus/);
assert.match(routing, /CREATIVE_MUSIC_BUS_ROUTING_CYCLE/);
assert.match(routing, /CREATIVE_MUSIC_TRACK_OUTPUT_BUS_NOT_FOUND/);
assert.match(routing, /CREATIVE_MUSIC_TRACK_DIRECT_AUX_OUTPUT_FORBIDDEN/);
assert.match(graph, /AVANTIQO_MUSIC_GROUP_BUS_PREVIEW_GRAPH_V1/);
assert.match(graph, /destinationForTrack/);
assert.match(graph, /nested_group_routing: true/);
assert.match(preview, /AVANTIQO_MUSIC_MULTITRACK_BROWSER_PREVIEW_V11/);
assert.match(preview, /group_bus_routing: true/);
assert.match(preview, /groupGraph\.destinationForTrack\(track\)/);
assert.match(panel, /Group buses/);
assert.match(panel, /Selected track output/);
assert.match(panel, /Group Solo is intentionally withheld/);
assert.match(mixer, /MusicGroupBusPanel/);
assert.match(route, /validateMusicMixerRouting/);

console.log("AVANTIQO_MUSIC_GROUP_BUS_ROUTING_RUNTIME_AUDIT=PASS");
