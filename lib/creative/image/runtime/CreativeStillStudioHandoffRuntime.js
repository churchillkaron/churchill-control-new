import crypto from "node:crypto";

export const CREATIVE_STILL_STUDIO_HANDOFF_CONTRACT = "CREATIVE_STILL_STUDIO_HANDOFF_V1";

function text(value){ return String(value ?? "").trim(); }
function bool(value){ return value === true; }
function stable(value){ if(Array.isArray(value)) return value.map(stable); if(!value || typeof value !== "object") return value; return Object.fromEntries(Object.keys(value).sort().map((key)=>[key,stable(value[key])])); }
function hash(value){ return crypto.createHash("sha256").update(JSON.stringify(stable(value))).digest("hex"); }

export function classifyStillStudioHandoff({ asset = {}, requested_destination = null } = {}) {
  const status = text(asset.status || asset.approval_state).toUpperCase();
  const metadata = asset.metadata || {};
  const approved = ["APPROVED","PASSED","RELEASE_READY"].includes(status) || bool(metadata.release_approved);
  const hasSource = Boolean(text(asset.url || asset.image_url || asset.file_url || asset.uri));
  const perceptualSealed = bool(metadata.image_asset_perceptual_qc_sealed) || bool(metadata.perceptual_qc_sealed) || bool(metadata.release_approved);
  const superseded = bool(metadata.localized_repair_superseded) || Boolean(metadata.superseded_by_localized_repair_asset_node_id);
  const approvedForVideo = bool(metadata.approved_for_video_source);
  const imageStudioReady = hasSource && !superseded;
  const videoStudioReady = imageStudioReady && approved && perceptualSealed && approvedForVideo;
  const requested = text(requested_destination).toUpperCase() || null;
  const failures = [];
  if(requested === "IMAGE_STUDIO" && !imageStudioReady) failures.push("IMAGE_STUDIO_SOURCE_NOT_READY");
  if(requested === "VIDEO_STUDIO") {
    if(!hasSource) failures.push("VIDEO_SOURCE_URL_REQUIRED");
    if(!approved) failures.push("VIDEO_SOURCE_APPROVAL_REQUIRED");
    if(!perceptualSealed) failures.push("VIDEO_SOURCE_PERCEPTUAL_QC_REQUIRED");
    if(!approvedForVideo) failures.push("VIDEO_SOURCE_EXPLICIT_APPROVAL_REQUIRED");
    if(superseded) failures.push("VIDEO_SOURCE_SUPERSEDED");
  }
  const lineage = {
    source_asset_id: asset.id || asset.asset_node_id || null,
    source_version: asset.version || asset.revision || null,
    source_url: asset.url || asset.image_url || asset.file_url || asset.uri || null,
    image_foundation_authority_digest: metadata.image_foundation_authority_digest || null,
    image_asset_pack_qc_seal_hash: metadata.image_asset_pack_qc_seal_hash || null,
    perceptual_qc_sealed: perceptualSealed,
    release_approved: approved,
  };
  return Object.freeze({
    contract: CREATIVE_STILL_STUDIO_HANDOFF_CONTRACT,
    requested_destination: requested,
    allowed: failures.length === 0,
    failures,
    destinations: {
      image_studio: { ready: imageStudioReady, purpose: "STILL_EDITING_AND_FINISHING" },
      video_studio: { ready: videoStudioReady, purpose: "IMAGE_TO_VIDEO_SOURCE" },
    },
    ownership: {
      still_master_owner: "IMAGE_STUDIO",
      motion_owner: "VIDEO_STUDIO",
      video_may_mutate_still_master: false,
      source_repair_owner: "IMAGE_STUDIO",
    },
    lineage,
    lineage_digest: hash(lineage),
  });
}

export const CreativeStillStudioHandoffRuntime = Object.freeze({
  contract: CREATIVE_STILL_STUDIO_HANDOFF_CONTRACT,
  classify: classifyStillStudioHandoff,
});

export default CreativeStillStudioHandoffRuntime;
