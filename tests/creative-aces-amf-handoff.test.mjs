import assert from "node:assert/strict";
import test from "node:test";

import {
  CreativeAcesAmfHandoffRuntime,
} from "../lib/creative/color/runtime/CreativeAcesAmfHandoffRuntime.js";
import {
  CreativeCinemaEngineCertificationRuntime,
} from "../lib/creative/certification/runtime/CreativeCinemaEngineCertificationRuntime.js";

const INPUT_ID = "urn:ampas:aces:transformId:v2.0:Input.ARRI_LogC4.a2.v1";
const OUTPUT_ID = "urn:ampas:aces:transformId:v2.0:Output.Rec709.a2.v1";

test("ACES AMF v2 handoff emits required top-level pipeline structures", () => {
  const result = CreativeAcesAmfHandoffRuntime.build({
    clip_name: "shot-010",
    source_checksum: "abc123",
    input_transform_id: INPUT_ID,
    output_transform_id: OUTPUT_ID,
    created_at: "2026-09-18T18:00:00+07:00",
  });
  assert.equal(result.status, "READY");
  assert.match(result.xml, /acesMetadataFile version="2\.0"/);
  assert.match(result.xml, /urn:ampas:aces:amf:v2\.0/);
  assert.match(result.xml, /<aces:amfInfo>/);
  assert.match(result.xml, /<aces:pipeline>/);
  assert.match(result.xml, /<aces:systemVersion>/);
});
test("ACES AMF refuses invented or missing transform identities", () => {
  const result = CreativeAcesAmfHandoffRuntime.build({
    clip_name: "shot-010",
    source_checksum: "abc123",
    input_transform_id: "ARRI_LOGC4_TO_SCENE_LINEAR",
  });
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.blockers.includes("ACES_AMF_INPUT_TRANSFORM_ID_REQUIRED"));
});

test("Color DI certification now requires portable ACES AMF handoff", () => {
  const color = CreativeCinemaEngineCertificationRuntime.engine_specs
    .find((engine) => engine.id === "COLOR_DI");
  assert.ok(color);
  assert.ok(color.contracts.includes("AVANTIQO_ACES_AMF_HANDOFF_V1"));
});

test("AMF output carries a deterministic checksum for archival verification", () => {
  const a = CreativeAcesAmfHandoffRuntime.build({
    clip_name: "shot-010", source_checksum: "abc123",
    input_transform_id: INPUT_ID, output_transform_id: OUTPUT_ID,
    amf_uuid: "urn:uuid:11111111-1111-4111-8111-111111111111",
    pipeline_uuid: "urn:uuid:22222222-2222-4222-8222-222222222222",
    clip_uuid: "urn:uuid:33333333-3333-4333-8333-333333333333",
    created_at: "2026-09-18T18:00:00+07:00",
  });
  const b = CreativeAcesAmfHandoffRuntime.build({
    clip_name: "shot-010", source_checksum: "abc123",
    input_transform_id: INPUT_ID, output_transform_id: OUTPUT_ID,
    amf_uuid: a.amf_uuid, pipeline_uuid: a.pipeline_uuid, clip_uuid: a.clip_uuid,
    created_at: "2026-09-18T18:00:00+07:00",
  });
  assert.equal(a.amf_checksum, b.amf_checksum);
});
