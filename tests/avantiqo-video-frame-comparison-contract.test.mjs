import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

const runtime = read("lib/creative/release/runtime/CreativeMasterComparisonRuntime.js");
const route = read("app/api/creative/mastering/compare/route.js");
const ui = read("components/creative/ProductionStudio/workspaces/RenderWorkspaceV4.jsx");

assert.match(runtime, /CREATIVE_MASTER_FRAME_COMPARISON_V1/);
assert.match(runtime, /left_master_checksum/);
assert.match(runtime, /right_master_checksum/);
assert.match(runtime, /master_comparison_identity/);
assert.match(runtime, /creativePrimaryMasters/);
assert.match(runtime, /DIMENSION_MISMATCH_EXACT_COMPARISON_UNAVAILABLE/);
assert.match(runtime, /FRAME_RATE_MISMATCH_EXACT_COMPARISON_UNAVAILABLE/);
assert.match(runtime, /FFMPEG_DECODED_FRAME_SSIM_AND_PROGRAM_AUDIO_RESIDUAL_V1/);
assert.match(runtime, /visual_change_threshold_ssim/);
assert.match(runtime, /changed_intervals/);
assert.match(runtime, /residual_rms_dbfs/);
assert.match(runtime, /not_release_gate:\s*true/);
assert.match(runtime, /does not approve either master/);
assert.match(route, /creative\.quality\.evaluate/);
assert.match(route, /CreativeMasterComparisonRuntime\.analyze/);
assert.match(ui, /\/api\/creative\/mastering\/compare/);
assert.match(ui, /formatTimecode/);
assert.match(ui, /stepFrame/);
assert.match(ui, /togglePlayback/);
assert.match(ui, /monitorSide/);
assert.match(ui, /changed_intervals/);
assert.match(ui, /persisted FFmpeg report is the governed evidence/);

console.log("AVANTIQO_VIDEO_FRAME_COMPARISON_CONTRACT=PASS");
