import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("strict delivery master conformance binds profile requirements to the exact final render", () => {
  const runtime = read("lib/creative/quality/runtime/CreativeDeliveryMasterConformanceRuntime.js");
  assert.match(runtime, /CREATIVE_DELIVERY_MASTER_CONFORMANCE_V1/);
  assert.match(runtime, /render_checksum/);
  assert.match(runtime, /policy_identity/);
  assert.match(runtime, /FFPROBE_EXACT_MASTER_PROFILE_CONFORMANCE/);
  assert.match(runtime, /DELIVERY_MASTER_POLICY_INCOMPLETE/);
  assert.match(runtime, /DELIVERY_MASTER_CONFORMANCE_REQUIRED/);
  assert.match(runtime, /pixel_format/);
  assert.match(runtime, /color_primaries/);
  assert.match(runtime, /color_transfer/);
  assert.match(runtime, /color_space/);
  assert.match(runtime, /frame_rate/);
  assert.match(runtime, /audio_channel_layout/);
  assert.match(runtime, /embedded_subtitle_count/);
});

test("strict delivery master QC is exposed and enforced before final approval", () => {
  const inspect = read("app/api/creative/mastering/inspect/route.js");
  const qcApi = read("app/api/creative/mastering/delivery-qc/route.js");
  const approval = read("app/api/creative/release/approve/route.js");
  const workspace = read("components/creative/ProductionStudio/workspaces/RenderWorkspaceV3.jsx");
  const router = read("components/creative/ProductionStudio/layout/WorkspaceCanvasRouter.jsx");

  assert.match(qcApi, /CreativeDeliveryMasterConformanceRuntime\.analyze/);
  assert.match(qcApi, /creative\.quality\.evaluate/);
  assert.match(inspect, /delivery_master: deliveryMaster/);
  assert.match(inspect, /deliveryMasterReady/);
  assert.match(approval, /DELIVERY_MASTER_CONFORMANCE_REQUIRED/);
  assert.match(approval, /CreativeDeliveryMasterConformanceRuntime\.inspect/);
  assert.match(workspace, /Run conformance/);
  assert.match(workspace, /Exact-file export-profile conformance/);
  assert.match(router, /RenderWorkspaceV3/);
});

console.log("AVANTIQO_VIDEO_DELIVERY_MASTER_CONTRACT=PASS");
