import assert from "node:assert/strict";
import test from "node:test";

import { CreativeOtioEditorialHandoffRuntime } from
  "../lib/creative/post-production/runtime/CreativeOtioEditorialHandoffRuntime.js";

function timeline(approved = true) {
  return {
    review: { approved },
    metadata: {
      human_picture_lock_required: true,
      timeline_identity: "timeline-identity-1",
      edit_decision_list: [{
        source_asset_node_id: "asset-shot-001",
        source_url: "storage://creative/shot-001.mov",
        source_in_seconds: 1, source_out_seconds: 5,
        duration_seconds: 4,
        timeline_in_seconds: 0, timeline_out_seconds: 4,
        selection_evidence: { source_checksum: "abc123" },
      }],
    },
  };
}

test("OTIO handoff emits Timeline Stack Track Clip hierarchy", () => {
  const result = CreativeOtioEditorialHandoffRuntime.build({
    timeline: timeline(true), frame_rate: 24,
  });
  assert.equal(result.status, "READY");
  assert.equal(result.document.OTIO_SCHEMA, "Timeline.1");
  assert.equal(result.document.tracks.OTIO_SCHEMA, "Stack.1");
  assert.equal(result.document.tracks.children[0].OTIO_SCHEMA, "Track.1");
  assert.equal(result.document.tracks.children[0].children[0].OTIO_SCHEMA, "Clip.2");
});
test("OTIO preserves source trim as RationalTime and ExternalReference media", () => {
  const result = CreativeOtioEditorialHandoffRuntime.build({
    timeline: timeline(true), frame_rate: 24,
  });
  const clip = result.document.tracks.children[0].children[0];
  assert.equal(clip.source_range.start_time.value, 24);
  assert.equal(clip.source_range.duration.value, 96);
  assert.equal(clip.source_range.start_time.rate, 24);
  assert.equal(clip.media_references.DEFAULT_MEDIA.OTIO_SCHEMA, "ExternalReference.1");
  assert.equal(clip.media_references.DEFAULT_MEDIA.target_url, "storage://creative/shot-001.mov");
});

test("OTIO handoff preserves ACES AMF identity in clip metadata", () => {
  const result = CreativeOtioEditorialHandoffRuntime.build({
    timeline: timeline(true), frame_rate: 24,
    amf_by_asset_node_id: { "asset-shot-001": { amf_uuid: "urn:uuid:test", amf_checksum: "deadbeef" } },
  });
  const clip = result.document.tracks.children[0].children[0];
  assert.equal(clip.metadata.aces_amf_uuid, "urn:uuid:test");
  assert.equal(clip.metadata.aces_amf_checksum, "deadbeef");
});

test("OTIO external handoff fails closed before picture lock", () => {
  const result = CreativeOtioEditorialHandoffRuntime.build({
    timeline: timeline(false), frame_rate: 24,
  });
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.blockers.includes("OTIO_PICTURE_LOCK_APPROVAL_REQUIRED"));
});
