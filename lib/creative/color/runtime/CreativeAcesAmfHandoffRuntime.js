import crypto from "node:crypto";

export const AVANTIQO_ACES_AMF_HANDOFF_CONTRACT =
  "AVANTIQO_ACES_AMF_HANDOFF_V1";

const TRANSFORM_ID =
  /^urn:ampas:aces:transformId:v(?:1\.5|2\.0):[A-Za-z0-9_.-]+$/;

function text(value) { return String(value ?? "").trim(); }
function escapeXml(value) {
  return text(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
function uuid(value) {
  const source = text(value);
  return /^urn:uuid:[0-9a-fA-F-]{36}$/.test(source)
    ? source
    : "urn:uuid:" + crypto.randomUUID();
}
function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
export function buildAcesAmfHandoff(input = {}) {
  const inputTransformId = text(input.input_transform_id);
  const outputTransformId = text(input.output_transform_id);
  const blockers = [];
  if (!text(input.clip_name)) blockers.push("ACES_AMF_CLIP_NAME_REQUIRED");
  if (!TRANSFORM_ID.test(inputTransformId)) blockers.push("ACES_AMF_INPUT_TRANSFORM_ID_REQUIRED");
  if (outputTransformId && !TRANSFORM_ID.test(outputTransformId)) blockers.push("ACES_AMF_OUTPUT_TRANSFORM_ID_INVALID");
  if (!text(input.source_checksum)) blockers.push("ACES_AMF_SOURCE_CHECKSUM_REQUIRED");
  if (blockers.length) {
    return { contract: AVANTIQO_ACES_AMF_HANDOFF_CONTRACT, status: "BLOCKED", blockers };
  }

  const created = text(input.created_at) || new Date().toISOString();
  const amfUuid = uuid(input.amf_uuid);
  const pipelineUuid = uuid(input.pipeline_uuid);
  const clipUuid = uuid(input.clip_uuid);
  const description = escapeXml(input.description || "Avantiqo ACES pipeline handoff");
  const clipName = escapeXml(input.clip_name);
  const sourceChecksum = escapeXml(input.source_checksum);
  const lookTransformId = text(input.look_transform_id);
  if (lookTransformId && !TRANSFORM_ID.test(lookTransformId)) {
    return { contract: AVANTIQO_ACES_AMF_HANDOFF_CONTRACT, status: "BLOCKED", blockers: ["ACES_AMF_LOOK_TRANSFORM_ID_INVALID"] };
  }
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<aces:acesMetadataFile version="2.0" xmlns:aces="urn:ampas:aces:amf:v2.0">',
    "  <aces:amfInfo>",
    "    <aces:description>" + description + "</aces:description>",
    "    <aces:dateTime>",
    "      <aces:creationDateTime>" + escapeXml(created) + "</aces:creationDateTime>",
    "      <aces:modificationDateTime>" + escapeXml(created) + "</aces:modificationDateTime>",
    "    </aces:dateTime>",
    "    <aces:uuid>" + amfUuid + "</aces:uuid>",
    "  </aces:amfInfo>",
    "  <aces:clipId>",
    "    <aces:clipName>" + clipName + "</aces:clipName>",
    "    <aces:uuid>" + clipUuid + "</aces:uuid>",
    "  </aces:clipId>",
    "  <aces:pipeline>",
    "    <aces:pipelineInfo>",
    "      <aces:description>Avantiqo scene-linear VFX and finishing pipeline</aces:description>",
    "      <aces:dateTime>",
    "        <aces:creationDateTime>" + escapeXml(created) + "</aces:creationDateTime>",
    "        <aces:modificationDateTime>" + escapeXml(created) + "</aces:modificationDateTime>",
    "      </aces:dateTime>",
    "      <aces:uuid>" + pipelineUuid + "</aces:uuid>",
    "      <aces:systemVersion><aces:majorVersion>2</aces:majorVersion><aces:minorVersion>0</aces:minorVersion><aces:patchVersion>0</aces:patchVersion></aces:systemVersion>",
    "    </aces:pipelineInfo>",
  ];  lines.push(
    '    <aces:inputTransform applied="false">',
    "      <aces:description>Source to ACES pipeline input transform</aces:description>",
    "      <aces:transformId>" + escapeXml(inputTransformId) + "</aces:transformId>",
    "    </aces:inputTransform>",
  );
  if (lookTransformId) {
    lines.push(
      '    <aces:lookTransform applied="false">',
      "      <aces:description>Approved creative look transform</aces:description>",
      "      <aces:transformId>" + escapeXml(lookTransformId) + "</aces:transformId>",
      "    </aces:lookTransform>",
    );
  }
  if (outputTransformId) {
    lines.push(
      '    <aces:outputTransform applied="false">',
      "      <aces:description>Master viewing output transform</aces:description>",
      "      <aces:transformId>" + escapeXml(outputTransformId) + "</aces:transformId>",
      "    </aces:outputTransform>",
    );
  }
  lines.push("  </aces:pipeline>", "</aces:acesMetadataFile>");
  const xml = lines.join("\n");
  return {
    contract: AVANTIQO_ACES_AMF_HANDOFF_CONTRACT,
    status: "READY",
    blockers: [],
    amf_version: "2.0",
    namespace: "urn:ampas:aces:amf:v2.0",
    source_checksum: sourceChecksum,
    input_transform_id: inputTransformId,
    look_transform_id: lookTransformId || null,
    output_transform_id: outputTransformId || null,
    amf_uuid: amfUuid,
    pipeline_uuid: pipelineUuid,
    clip_uuid: clipUuid,
    xml,
    mime_type: "application/xml",
    extension: "amf",
    amf_checksum: hash(xml),
    policy: {
      color_recipe_must_travel_with_vfx_and_finishing_media: true,
      internal_color_labels_must_not_be_serialized_as_fake_aces_transform_ids: true,
      shot_color_handoff_requires_explicit_aces_transform_ids: true,
    },
  };
}

export const CreativeAcesAmfHandoffRuntime = Object.freeze({
  contract: AVANTIQO_ACES_AMF_HANDOFF_CONTRACT,
  build: buildAcesAmfHandoff,
});
