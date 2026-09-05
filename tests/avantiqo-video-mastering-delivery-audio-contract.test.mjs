import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function source(path) {
  return fs.readFileSync(path, "utf8");
}

const policy = source("lib/creative/quality/runtime/CreativeDeliveryAudioPolicy.js");
const meter = source("lib/creative/quality/runtime/CreativeDeliveryAudioQualityRuntime.js");
const inspectRoute = source("app/api/creative/mastering/inspect/route.js");
const audioRoute = source("app/api/creative/mastering/audio-qc/route.js");
const approvalRoute = source("app/api/creative/release/approve/route.js");
const workspace = source("components/creative/ProductionStudio/workspaces/RenderWorkspaceV2.jsx");

test("delivery audio policy is profile-governed and fail-closed", () => {
  assert.match(policy, /CREATIVE_DELIVERY_AUDIO_POLICY_V1/);
  assert.match(policy, /target_integrated_lufs/);
  assert.match(policy, /loudness_tolerance_lu/);
  assert.match(policy, /max_true_peak_dbtp/);
  assert.match(policy, /minimum_loudness_range_lu/);
  assert.match(policy, /maximum_loudness_range_lu/);
  assert.match(policy, /missing_requirements/);
  assert.doesNotMatch(policy, /Netflix|YouTube|Spotify/i);
});

test("master meter binds LUFS LRA and true peak to render and policy identity", () => {
  assert.match(meter, /CREATIVE_DELIVERY_AUDIO_QUALITY_V1/);
  assert.match(meter, /ebur128=peak=true/);
  assert.match(meter, /integrated_lufs/);
  assert.match(meter, /loudness_range_lu/);
  assert.match(meter, /true_peak_dbtp/);
  assert.match(meter, /render_identity/);
  assert.match(meter, /checksum/);
  assert.match(meter, /policy_identity/);
  assert.match(meter, /delivery_audio_qc_passed/);
});

test("Mastering inspection and UI expose governed delivery audio evidence", () => {
  assert.match(inspectRoute, /CreativeDeliveryAudioQualityRuntime\.inspect/);
  assert.match(inspectRoute, /delivery_audio:/);
  assert.match(inspectRoute, /can_approve_final_render: canApproveFinalRender/);
  assert.match(audioRoute, /creative\.quality\.evaluate/);
  assert.match(audioRoute, /action === "analyze"/);
  assert.match(workspace, /Delivery audio/);
  assert.match(workspace, /LUFS/);
  assert.match(workspace, /LRA/);
  assert.match(workspace, /true peak/);
});

test("final render approval cannot bypass required delivery audio QC", () => {
  assert.match(approvalRoute, /scope === "FINAL_RENDER"/);
  assert.match(approvalRoute, /CreativeDeliveryAudioQualityRuntime\.inspect/);
  assert.match(approvalRoute, /deliveryAudio\.required && deliveryAudio\.passed !== true/);
  assert.match(approvalRoute, /status: 409/);
});

console.log("AVANTIQO_VIDEO_MASTERING_DELIVERY_AUDIO_CONTRACT=PASS");
