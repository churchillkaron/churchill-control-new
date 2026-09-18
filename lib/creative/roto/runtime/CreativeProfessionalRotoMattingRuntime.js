import crypto from "node:crypto";

export const AVANTIQO_PROFESSIONAL_ROTO_MATTING_CONTRACT =
  "AVANTIQO_PROFESSIONAL_ROTO_MATTING_V1";

function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function hash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
export function authorProfessionalRotoMatting({
  subject_id,
  layers = [],
  keyframes = [],
  tracking_asset_node_id,
  trimap_asset_node_id = null,
  hair_detail_required = false,
  transparency_required = false,
  decontamination_required = true,
  motion_blur_required = true,
  manual_correction_frames = [],
} = {}) {
  const blockers = [];
  const normalizedLayers = list(layers).map((layer, index) => ({
    id: text(layer.id) || "layer-" + (index + 1),
    role: text(layer.role || "FOREGROUND").toUpperCase(),
    seed_matte_asset_node_id: text(layer.seed_matte_asset_node_id) || null,
    spline_keyframes: list(layer.spline_keyframes),
    holdout: layer.holdout === true,
    garbage: layer.garbage === true,
  }));
  if (!text(subject_id)) blockers.push("ROTO_PRO_SUBJECT_REQUIRED");
  if (!text(tracking_asset_node_id)) blockers.push("ROTO_PRO_TRACKING_REQUIRED");
  if (!normalizedLayers.length) blockers.push("ROTO_PRO_LAYER_REQUIRED");
  if (normalizedLayers.some((layer) => !layer.seed_matte_asset_node_id && !layer.spline_keyframes.length)) {
    blockers.push("ROTO_PRO_LAYER_SEED_OR_SPLINE_REQUIRED");
  }
  if (!list(keyframes).length && normalizedLayers.every((layer) => !layer.spline_keyframes.length)) {
    blockers.push("ROTO_PRO_KEYFRAME_AUTHORITY_REQUIRED");
  }
  if (hair_detail_required && !text(trimap_asset_node_id)) blockers.push("ROTO_PRO_HAIR_TRIMAP_REQUIRED");
  if (transparency_required && !text(trimap_asset_node_id)) blockers.push("ROTO_PRO_TRANSPARENCY_TRIMAP_REQUIRED");
  const body = {
    contract: AVANTIQO_PROFESSIONAL_ROTO_MATTING_CONTRACT,
    subject_id: text(subject_id),
    tracking_asset_node_id: text(tracking_asset_node_id) || null,
    trimap_asset_node_id: text(trimap_asset_node_id) || null,
    layers: normalizedLayers,
    keyframes: list(keyframes),
    manual_correction_frames: list(manual_correction_frames),
    operations: {
      temporal_propagation: true,
      layered_occlusion: true,
      spline_roto: true,
      trimap_matting: Boolean(trimap_asset_node_id),
      hair_detail: hair_detail_required === true,
      transparency: transparency_required === true,
      foreground_color_decontamination: decontamination_required === true,
      motion_blur_reconstruction: motion_blur_required === true,
      defocus_aware_edges: true,
      chatter_repair: true,
    },
    qc: {
      alpha_halo_forbidden: true,
      edge_boiling_forbidden: true,
      temporal_chatter_forbidden: true,
      lost_detail_forbidden: true,
      matte_layer_overlap_must_be_deterministic: true,
      manual_corrections_override_propagation: true,
    },
  };
  return {
    ...body,
    status: blockers.length ? "BLOCKED" : "READY",
    blockers,
    plan_hash: hash(body),
  };
}

export const CreativeProfessionalRotoMattingRuntime = Object.freeze({
  contract: AVANTIQO_PROFESSIONAL_ROTO_MATTING_CONTRACT,
  author: authorProfessionalRotoMatting,
});
