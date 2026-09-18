import crypto from "node:crypto";

export const AVANTIQO_CMX3600_EDL_HANDOFF_CONTRACT =
  "AVANTIQO_CMX3600_EDL_HANDOFF_V1";

function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function integerFps(value) {
  const fps = finite(value, null);
  if (!fps) return null;
  if (Math.abs(fps - 23.976) < 0.02) return 24;
  if (Math.abs(fps - 29.97) < 0.02) return 30;
  if (Math.abs(fps - 59.94) < 0.02) return 60;
  return Math.round(fps);
}
function tc(seconds, fps) {
  const rate = integerFps(fps);
  if (!rate) throw new Error("CMX3600_FRAME_RATE_REQUIRED");
  const total = Math.max(0, Math.round(finite(seconds, 0) * rate));
  const frames = total % rate;
  const totalSeconds = Math.floor(total / rate);
  const sec = totalSeconds % 60;
  const min = Math.floor(totalSeconds / 60) % 60;
  const hour = Math.floor(totalSeconds / 3600);
  return [hour, min, sec, frames].map((n) => String(n).padStart(2, "0")).join(":");
}
function reel(value, index) {
  const source = text(value).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return (source || ("AVQ" + String(index + 1).padStart(4, "0"))).slice(0, 8);
}
function checksum(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function buildCmx3600EdlHandoff({
  timeline,
  frame_rate = 24,
  title = "AVANTIQO PICTURE LOCK",
  amf_by_asset_node_id = {},
} = {}) {
  const metadata = timeline?.metadata || timeline || {};
  const entries = list(metadata.edit_decision_list);
  const blockers = [];
  if (!entries.length) blockers.push("CMX3600_EDIT_DECISIONS_REQUIRED");
  if (!integerFps(frame_rate)) blockers.push("CMX3600_FRAME_RATE_REQUIRED");
  if (metadata.human_picture_lock_required === true && metadata.picture_lock_approved !== true && timeline?.review?.approved !== true) {
    blockers.push("CMX3600_PICTURE_LOCK_APPROVAL_REQUIRED");
  }
  if (blockers.length) {
    return { contract: AVANTIQO_CMX3600_EDL_HANDOFF_CONTRACT, status: "BLOCKED", blockers };
  }

  const lines = ["TITLE: " + text(title), "FCM: NON-DROP FRAME", ""];
  entries.forEach((entry, index) => {
    const assetId = text(entry.source_asset_node_id);
    const sourceIn = tc(entry.source_in_seconds, frame_rate);
    const sourceOut = tc(entry.source_out_seconds, frame_rate);
    const recordIn = tc(entry.timeline_in_seconds, frame_rate);
    const recordOut = tc(entry.timeline_out_seconds, frame_rate);
    const event = String(index + 1).padStart(3, "0");
    lines.push(event + "  " + reel(assetId, index) + " V     C        " + sourceIn + " " + sourceOut + " " + recordIn + " " + recordOut);
    lines.push("* FROM CLIP NAME: " + assetId);
    const amf = amf_by_asset_node_id?.[assetId];
    if (amf?.amf_uuid) lines.push("* ACES AMF UUID: " + text(amf.amf_uuid));
    if (amf?.amf_checksum) lines.push("* ACES AMF SHA256: " + text(amf.amf_checksum));
    lines.push("");
  });

  const edl = lines.join("\n");
  return {
    contract: AVANTIQO_CMX3600_EDL_HANDOFF_CONTRACT,
    status: "READY",
    blockers: [],
    format: "CMX3600",
    frame_rate,
    event_count: entries.length,
    edl,
    mime_type: "text/plain",
    extension: "edl",
    checksum: checksum(edl),
    policy: {
      source_and_record_timecode_required: true,
      human_picture_lock_required_before_external_handoff: true,
      aces_amf_references_may_follow_each_source_event: true,
      semantic_reselection_after_handoff_forbidden: true,
    },
  };
}

export const CreativeCmx3600EdlHandoffRuntime = Object.freeze({
  contract: AVANTIQO_CMX3600_EDL_HANDOFF_CONTRACT,
  build: buildCmx3600EdlHandoff,
});
