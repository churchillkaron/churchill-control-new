import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const render = fs.readFileSync("lib/creative/music/runtime/CreativeMusicReleaseRenderPlanRuntime.js", "utf8");
const offline = fs.readFileSync("lib/creative/music/client/MusicOfflineMixRenderRuntime.js", "utf8");
const finishing = fs.readFileSync("lib/creative/music/runtime/CreativeMusicFinishingRuntime.js", "utf8");
const ui = fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicWorkspace.jsx", "utf8");

test("Music release precision separates float DSP from 24-bit delivery", () => {
  assert.match(render, /internal_processing_format: "float32"/);
  assert.match(render, /delivery_bit_depth: 24/);
  assert.match(render, /delivery_dither_required: true/);
  assert.match(offline, /internal_processing_format: "float32"/);
  assert.match(offline, /dither_applied: false/);
  assert.match(finishing, /dither_required_for_integer_pcm_delivery: true/);
});

test("Music Studio exposes archival 24\/96 without false native hi-res claim", () => {
  assert.match(render, /sample_rate: 96000/);
  assert.match(render, /upsampled_if_enabled/);
  assert.match(finishing, /native_high_resolution/);
  assert.match(ui, /Archival 24\/96/);
  assert.match(ui, /native-hi-res claim only when source\/render qualifies/);
});
