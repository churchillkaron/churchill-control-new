import crypto from "node:crypto";

export const CREATIVE_CROSS_SHOT_FINGERPRINT_CONTRACT =
  "CREATIVE_CROSS_SHOT_FINGERPRINT_V1";

function text(value) {
  return String(value ?? "").trim();
}
function normalize(value) {
  if (value && typeof value === "object") {
    try { return JSON.stringify(value, Object.keys(value).sort()).toLowerCase(); } catch {}
  }
  return text(value).toLowerCase().replace(/\s+/g, " ");
}
function digest(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
function signature(node = {}) {
  const metadata = node.metadata || {};
  const requirements = metadata.requirements || {};
  const camera = metadata.image_camera_authority || requirements.camera || {};
  return {
    composition: normalize(
      metadata.composition_signature || metadata.visual_composition ||
      requirements.signature_frame_design || camera.composition || camera.framing,
    ),
    pose: normalize(
      metadata.pose_signature || metadata.subject_pose ||
      requirements.performance || requirements.action,
    ),
    environment: normalize(
      metadata.environment_signature || metadata.environment_description ||
      metadata.scene_description || requirements.production_design || requirements.world_consistency,
    ),
    lighting: normalize(
      metadata.lighting_signature || metadata.lighting_description ||
      requirements.lighting || camera.lighting,
    ),
    identity: normalize(
      metadata.subject_identity_key || metadata.threat_identity_key ||
      requirements.subject_identity || requirements.subject,
    ),
  };
}
function same(a, b) {
  return Boolean(a && b && a === b);
}

export function evaluateCrossShotFingerprint({
  asset_node = {},
  comparison_nodes = [],
} = {}) {
  const current = signature(asset_node);
  const exact = digest(JSON.stringify(current));
  const matches = [];

  for (const candidate of comparison_nodes) {
    if (!candidate?.id || candidate.id === asset_node.id) continue;
    const other = signature(candidate);
    const repeated = {
      composition: same(current.composition, other.composition),
      pose: same(current.pose, other.pose),
      environment: same(current.environment, other.environment),
      lighting: same(current.lighting, other.lighting),
      identity: same(current.identity, other.identity),
    };
    const comparable = Object.values(current).filter(Boolean).length;
    const repeatedCount = Object.values(repeated).filter(Boolean).length;
    const similarity = comparable ? repeatedCount / comparable : 0;
    if (similarity > 0) {
      matches.push({
        asset_node_id: candidate.id,
        similarity_score: similarity,
        repeated,
      });
    }
  }

  matches.sort((a, b) => b.similarity_score - a.similarity_score);
  const highest = matches[0]?.similarity_score || 0;
  const novelty = Math.max(0, 1 - highest);
  const duplicate = highest >= 0.8;

  return Object.freeze({
    contract: CREATIVE_CROSS_SHOT_FINGERPRINT_CONTRACT,
    asset_node_id: asset_node.id || null,
    fingerprint: exact,
    novelty_score: novelty,
    duplicate_or_near_duplicate: duplicate,
    strongest_match: matches[0] || null,
    matches,
    passed: !duplicate,
    zero_provider_calls: true,
  });
}

export const CreativeCrossShotFingerprintRuntime = Object.freeze({
  contract: CREATIVE_CROSS_SHOT_FINGERPRINT_CONTRACT,
  evaluate: evaluateCrossShotFingerprint,
});
