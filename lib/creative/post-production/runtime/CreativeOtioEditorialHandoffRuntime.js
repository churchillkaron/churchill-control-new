import crypto from "node:crypto";

export const AVANTIQO_OTIO_EDITORIAL_HANDOFF_CONTRACT =
  "AVANTIQO_OTIO_EDITORIAL_HANDOFF_V1";

function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function frames(seconds, rate) {
  return Math.round(Math.max(0, finite(seconds, 0)) * rate);
}
function rational(value, rate) {
  return { OTIO_SCHEMA: "RationalTime.1", rate, value };
}
function range(startFrames, durationFrames, rate) {
  return {
    OTIO_SCHEMA: "TimeRange.1",
    duration: rational(durationFrames, rate),
    start_time: rational(startFrames, rate),
  };
}
function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
export function buildOtioEditorialHandoff({
  timeline, frame_rate = 24, name = "Avantiqo Picture Lock",
  amf_by_asset_node_id = {},
} = {}) {
  const metadata = timeline?.metadata || timeline || {};
  const entries = list(metadata.edit_decision_list);
  const blockers = [];
  const rate = finite(frame_rate, null);
  if (!entries.length) blockers.push("OTIO_EDIT_DECISIONS_REQUIRED");
  if (!rate || rate <= 0) blockers.push("OTIO_FRAME_RATE_REQUIRED");
  if (metadata.human_picture_lock_required === true &&
      metadata.picture_lock_approved !== true && timeline?.review?.approved !== true) {
    blockers.push("OTIO_PICTURE_LOCK_APPROVAL_REQUIRED");
  }
  if (blockers.length) {
    return { contract: AVANTIQO_OTIO_EDITORIAL_HANDOFF_CONTRACT, status: "BLOCKED", blockers };
  }

  const children = entries.map((entry, index) => {
    const assetId = text(entry.source_asset_node_id);
    const sourceInFrames = frames(entry.source_in_seconds, rate);
    const durationFrames = frames(entry.duration_seconds ??
      (finite(entry.source_out_seconds, 0) - finite(entry.source_in_seconds, 0)), rate);
    const mediaUrl = text(entry.source_url);
    const amf = amf_by_asset_node_id?.[assetId] || null;
    return {
      OTIO_SCHEMA: "Clip.2",
      active_media_reference_key: "DEFAULT_MEDIA",
      color: null, effects: [], enabled: true, markers: [],
      media_references: {
        DEFAULT_MEDIA: {
          OTIO_SCHEMA: "ExternalReference.1",
          available_image_bounds: null, available_range: null,
          metadata: { avantiqo_asset_node_id: assetId },
          name: assetId || "Source " + (index + 1), target_url: mediaUrl,
        },
      },
      metadata: {
        avantiqo_asset_node_id: assetId,
        source_checksum: entry.selection_evidence?.source_checksum || null,
        aces_amf_uuid: amf?.amf_uuid || null,
        aces_amf_checksum: amf?.amf_checksum || null,
      },
      name: assetId || "Shot " + (index + 1),
      source_range: range(sourceInFrames, durationFrames, rate),
    };
  });

  const document = {
    OTIO_SCHEMA: "Timeline.1",
    metadata: {
      avantiqo_contract: AVANTIQO_OTIO_EDITORIAL_HANDOFF_CONTRACT,
      picture_lock: true,
      source_timeline_identity: metadata.timeline_identity || null,
    },
    name: text(name) || "Avantiqo Picture Lock",
    global_start_time: null,
    tracks: {
      OTIO_SCHEMA: "Stack.1",
      children: [{
        OTIO_SCHEMA: "Track.1",
        children,
        color: null, effects: [], enabled: true, markers: [],
        metadata: { track_role: "picture" },
        name: "V1",
        source_range: null,
        kind: "Video",
      }],
      color: null, effects: [], enabled: true, markers: [],
      metadata: {}, name: "Tracks", source_range: null,
    },
  };
  const json = JSON.stringify(document, null, 2);
  return {
    contract: AVANTIQO_OTIO_EDITORIAL_HANDOFF_CONTRACT,
    status: "READY",
    blockers: [],
    schema: "OpenTimelineIO",
    event_count: children.length,
    frame_rate: rate,
    document,
    json,
    mime_type: "application/json",
    extension: "otio",
    checksum: digest(document),
    policy: {
      picture_lock_required: true,
      external_media_references_only: true,
      aces_amf_identity_preserved_in_metadata: true,
      source_trim_ranges_preserved: true,
    },
  };
}

export const CreativeOtioEditorialHandoffRuntime = Object.freeze({
  contract: AVANTIQO_OTIO_EDITORIAL_HANDOFF_CONTRACT,
  build: buildOtioEditorialHandoff,
});
