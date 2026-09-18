import assert from "node:assert/strict";
import test from "node:test";

import { CreativeCmx3600EdlHandoffRuntime } from
  "../lib/creative/post-production/runtime/CreativeCmx3600EdlHandoffRuntime.js";
import { CreativeCinemaEngineCertificationRuntime } from
  "../lib/creative/certification/runtime/CreativeCinemaEngineCertificationRuntime.js";

function timeline(approved = true) {
  return {
    review: { approved },
    metadata: {
      human_picture_lock_required: true,
      edit_decision_list: [{
        source_asset_node_id: "asset-shot-001",
        source_in_seconds: 1, source_out_seconds: 5,
        timeline_in_seconds: 0, timeline_out_seconds: 4,
      }],
    },
  };
}

test("CMX3600 handoff emits source and record timecodes", () => {
  const result = CreativeCmx3600EdlHandoffRuntime.build({
    timeline: timeline(true), frame_rate: 24,
  });
  assert.equal(result.status, "READY");
  assert.match(result.edl, /TITLE: AVANTIQO PICTURE LOCK/);
  assert.match(result.edl, /00:00:01:00 00:00:05:00 00:00:00:00 00:00:04:00/);
});
test("CMX3600 external handoff is blocked before picture lock approval", () => {
  const result = CreativeCmx3600EdlHandoffRuntime.build({
    timeline: timeline(false), frame_rate: 24,
  });
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.blockers.includes("CMX3600_PICTURE_LOCK_APPROVAL_REQUIRED"));
});

test("CMX3600 can attach ACES AMF identity to each source event", () => {
  const result = CreativeCmx3600EdlHandoffRuntime.build({
    timeline: timeline(true), frame_rate: 24,
    amf_by_asset_node_id: {
      "asset-shot-001": {
        amf_uuid: "urn:uuid:11111111-1111-4111-8111-111111111111",
        amf_checksum: "deadbeef",
      },
    },
  });
  assert.match(result.edl, /ACES AMF UUID/);
  assert.match(result.edl, /ACES AMF SHA256: deadbeef/);
});

test("editorial certification requires professional external handoff", () => {
  const editorial = CreativeCinemaEngineCertificationRuntime.engine_specs
    .find((engine) => engine.id === "EDITORIAL_PICTURE_LOCK");
  assert.ok(editorial.contracts.includes("AVANTIQO_CMX3600_EDL_HANDOFF_V1"));
});
