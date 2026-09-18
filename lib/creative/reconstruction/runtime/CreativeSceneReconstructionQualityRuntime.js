import crypto from "node:crypto";

export const CREATIVE_SCENE_RECONSTRUCTION_QC_CONTRACT =
  "CREATIVE_SCENE_RECONSTRUCTION_QC_V1";

const REQUIRED_ARTIFACTS = Object.freeze([
  "DEPTH_MAP",
  "IMAGE_SEGMENTATION_MASK",
  "SURFACE_NORMAL_MAP",
  "GEOMETRY_PROXY_OBJ",
  "SINGLE_VIEW_CAMERA_PROXY",
  "PRACTICAL_LIGHT_MAP",
  "SURFACE_MATERIAL_MAP",
]);

const REQUIRED_SEMANTIC_TRUE = Object.freeze([
  "source_identity_preserved",
  "architecture_preserved",
  "layout_preserved",
  "distinctive_materials_preserved",
  "signage_brand_marks_preserved",
  "major_object_placement_preserved",
  "depth_order_plausible",
  "segmentation_plausible",
  "material_regions_plausible",
  "practical_light_evidence_plausible",
  "camera_proxy_within_safe_motion_bounds",
  "hallucinated_architecture_absent",
]);

function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function digest(value) { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

function artifactRows(manifest = {}) {
  return Object.values(object(manifest.artifacts)).map((item) => object(item));
}

function artifactByKind(manifest = {}, kind) {
  return artifactRows(manifest).find((item) => text(item.artifact_kind).toUpperCase() === kind) || null;
}

export function reconstructionReviewContract({ manifest = {}, source_truth = {} } = {}) {
  return {
    contract: "CREATIVE_SCENE_RECONSTRUCTION_SEMANTIC_REVIEW_V1",
    shot_id: manifest.shot_id || null,
    reconstruction_contract_hash: manifest.reconstruction_contract_hash || null,
    review_target: "ACTUAL_RECONSTRUCTION_EVIDENCE_AGAINST_SOURCE_TRUTH",
    source_truth: object(source_truth),
    required_booleans: REQUIRED_SEMANTIC_TRUE,
    minimum_scores: {
      source_fidelity_score: 94,
      architecture_score: 94,
      geometry_consistency_score: 90,
      material_grounding_score: 90,
      lighting_grounding_score: 88,
      overall_score: 92,
    },
    fail_closed: true,
    beauty_cannot_override_geometry_or_identity_failure: true,
    single_view_truth_limits_binding: true,
  };
}

export function evaluateSceneReconstruction({
  manifest = {},
  semantic_review = {},
} = {}) {
  const failures = [];
  if (text(manifest.contract) !== "CREATIVE_SCENE_RECONSTRUCTION_ASSEMBLER_V1") {
    failures.push("RECONSTRUCTION_ASSEMBLER_MANIFEST_REQUIRED");
  }
  if (!text(manifest.reconstruction_contract_hash)) failures.push("RECONSTRUCTION_CONTRACT_HASH_REQUIRED");
  if (!text(manifest.shot_id)) failures.push("RECONSTRUCTION_SHOT_ID_REQUIRED");

  for (const kind of REQUIRED_ARTIFACTS) {
    const artifact = artifactByKind(manifest, kind);
    if (!artifact) {
      failures.push(`RECONSTRUCTION_ARTIFACT_MISSING:${kind}`);
      continue;
    }
    if (!text(artifact.node_id)) failures.push(`RECONSTRUCTION_NODE_ID_MISSING:${kind}`);
    if (!text(artifact.storage_reference)) failures.push(`RECONSTRUCTION_STORAGE_REFERENCE_MISSING:${kind}`);
    if (!/^[a-f0-9]{64}$/i.test(text(artifact.checksum_sha256))) {
      failures.push(`RECONSTRUCTION_CHECKSUM_INVALID:${kind}`);
    }
  }

  const limits = object(manifest.truth_limits);
  if (limits.single_view_source !== true) failures.push("RECONSTRUCTION_SINGLE_VIEW_TRUTH_REQUIRED");
  if (limits.metric_scale_resolved !== false) failures.push("RECONSTRUCTION_METRIC_SCALE_MUST_REMAIN_UNRESOLVED");
  if (limits.full_hidden_geometry_reconstructed !== false) failures.push("RECONSTRUCTION_HIDDEN_GEOMETRY_OVERCLAIMED");
  if (limits.large_orbit_allowed !== false) failures.push("RECONSTRUCTION_LARGE_ORBIT_FORBIDDEN");
  if (limits.reverse_angle_allowed !== false) failures.push("RECONSTRUCTION_REVERSE_ANGLE_FORBIDDEN");

  const review = object(semantic_review);
  if (text(review.contract) !== "CREATIVE_SCENE_RECONSTRUCTION_SEMANTIC_REVIEW_V1") {
    failures.push("RECONSTRUCTION_SEMANTIC_REVIEW_REQUIRED");
  } else {
    for (const key of REQUIRED_SEMANTIC_TRUE) {
      if (review[key] !== true) failures.push(`RECONSTRUCTION_SEMANTIC_FAILURE:${key}`);
    }
    const thresholds = reconstructionReviewContract({ manifest }).minimum_scores;
    for (const [key, minimum] of Object.entries(thresholds)) {
      const actual = Number(review[key]);
      if (!Number.isFinite(actual) || actual < minimum) {
        failures.push(`RECONSTRUCTION_SCORE_BELOW_FLOOR:${key}:${Number.isFinite(actual) ? actual : "missing"}:${minimum}`);
      }
    }
    if (list(review.failures).length) {
      failures.push(...list(review.failures).map((failure) => `RECONSTRUCTION_REVIEW:${text(failure)}`));
    }
    if (review.passed !== true) failures.push("RECONSTRUCTION_SEMANTIC_REVIEW_NOT_PASSED");
  }

  const uniqueFailures = [...new Set(failures)];
  const certification = {
    contract: CREATIVE_SCENE_RECONSTRUCTION_QC_CONTRACT,
    shot_id: manifest.shot_id || null,
    reconstruction_contract_hash: manifest.reconstruction_contract_hash || null,
    passed: uniqueFailures.length === 0,
    failures: uniqueFailures,
    artifact_node_ids: artifactRows(manifest).map((item) => text(item.node_id)).filter(Boolean),
    required_artifacts: REQUIRED_ARTIFACTS,
    semantic_review_contract: review.contract || null,
    truth_limits_preserved: uniqueFailures.every((failure) => !failure.includes("OVERCLAIMED") && !failure.includes("FORBIDDEN") && !failure.includes("TRUTH")),
    base_plate_unlock_allowed: uniqueFailures.length === 0,
    certified_at: uniqueFailures.length === 0 ? new Date().toISOString() : null,
  };
  return { ...certification, certification_hash: digest(certification) };
}

export async function persistSceneReconstructionCertification({
  manifest = {},
  semantic_review = {},
} = {}) {
  const result = evaluateSceneReconstruction({ manifest, semantic_review });
  if (!result.passed) return result;

  const AssetGraphRepository = await import(
    "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository"
  );
  const nodeIds = result.artifact_node_ids;
  for (const nodeId of nodeIds) {
    const node = await AssetGraphRepository.getById(nodeId);
    if (!node) throw new Error(`RECONSTRUCTION_CERTIFICATION_NODE_NOT_FOUND:${nodeId}`);
    await AssetGraphRepository.update(nodeId, {
      status: "APPROVED",
      review: {
        ...object(node.review),
        ai_reviewed: true,
        approved: true,
        notes: `Approved by ${CREATIVE_SCENE_RECONSTRUCTION_QC_CONTRACT}; certification ${result.certification_hash}.`,
      },
      metadata: {
        ...object(node.metadata),
        reconstruction_qc_contract: CREATIVE_SCENE_RECONSTRUCTION_QC_CONTRACT,
        reconstruction_qc_certification_hash: result.certification_hash,
        reconstruction_qc_passed: true,
        release_approved: true,
      },
    });
  }
  return { ...result, persisted: true };
}

export function applyReconstructionCertificationToGraph({ graph = {}, shot_id, certification = {} } = {}) {
  if (certification.passed !== true || certification.base_plate_unlock_allowed !== true) {
    throw new Error(`RECONSTRUCTION_CERTIFICATION_REQUIRED:${shot_id}`);
  }
  const passId = `pass:${shot_id}:scene-reconstruction`;
  let found = false;
  const nodes = list(graph.nodes).map((node) => {
    if (text(node.id) !== passId) return node;
    found = true;
    return {
      ...node,
      quality: {
        ...object(node.quality),
        score: 100,
        issues: [],
        approved: true,
      },
      metadata: {
        ...object(node.metadata),
        artifact_evidence_complete: true,
        execution_completed: true,
        reconstruction_qc_passed: true,
        reconstruction_qc_certification_hash: certification.certification_hash,
        reconstruction_artifact_node_ids: certification.artifact_node_ids,
      },
    };
  });
  if (!found) throw new Error(`RECONSTRUCTION_PASS_NODE_NOT_FOUND:${shot_id}`);
  return {
    ...graph,
    nodes,
    metadata: {
      ...object(graph.metadata),
      reconstruction_certified_shot_ids: [
        ...new Set([...list(graph.metadata?.reconstruction_certified_shot_ids), text(shot_id)]),
      ],
    },
  };
}

export const CreativeSceneReconstructionQualityRuntime = Object.freeze({
  contract: CREATIVE_SCENE_RECONSTRUCTION_QC_CONTRACT,
  required_artifacts: REQUIRED_ARTIFACTS,
  required_semantic_true: REQUIRED_SEMANTIC_TRUE,
  reviewContract: reconstructionReviewContract,
  evaluate: evaluateSceneReconstruction,
  persist: persistSceneReconstructionCertification,
  applyToGraph: applyReconstructionCertificationToGraph,
});
