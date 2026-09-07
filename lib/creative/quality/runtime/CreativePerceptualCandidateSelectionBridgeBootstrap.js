import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import {
  CreativeGeneratedMediaPerceptualExecutionGate,
} from "./CreativeGeneratedMediaPerceptualExecutionGate";

const FLAG = Symbol.for(
  "avantiqo.creative.perceptual-candidate-selection-bridge.v2",
);
const CONTRACT = "CREATIVE_PERCEPTUAL_CANDIDATE_SELECTION_BRIDGE_V2";
const REVIEW_CONTRACT = "GENERATED_MEDIA_PERCEPTUAL_REVIEW_V1";
const CONTINUITY_QC_CONTRACT = "AVANTIQO_CONTINUITY_QC_GATE_V1";
const CONTINUITY_QC_SEAL_CONTRACT = "AVANTIQO_CONTINUITY_QC_SEAL_V1";
const VFX_CONTRACT = "AVANTIQO_VFX_V1";
const VFX_QC_CONTRACT = "AVANTIQO_VFX_QC_V1";
const VFX_QC_SEAL_CONTRACT = "AVANTIQO_VFX_QC_SEAL_V1";

const SCORE_THRESHOLD_MAP = Object.freeze({
  overall_score: "minimum_overall_score",
  story_score: "minimum_story_score",
  environment_score: "minimum_environment_score",
  camera_score: "minimum_camera_score",
  anatomy_score: "minimum_anatomy_score",
  identity_score: "minimum_identity_score",
  temporal_identity_consistency_score: "minimum_temporal_identity_consistency_score",
  product_fidelity_score: "minimum_product_fidelity_score",
  music_energy_score: "minimum_music_energy_score",
  performance_score: "minimum_performance_score",
  continuity_score: "minimum_continuity_score",
  physics_score: "minimum_physics_score",
  artifact_score: "minimum_artifact_score",
});

const CINEMATIC_WEIGHTS = Object.freeze({
  story_score: 0.22,
  camera_score: 0.18,
  performance_score: 0.18,
  environment_score: 0.10,
  continuity_score: 0.10,
  physics_score: 0.07,
  artifact_score: 0.05,
  identity_score: 0.05,
  anatomy_score: 0.03,
  temporal_identity_consistency_score: 0.02,
});

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function perceptualReview(task = {}) {
  return text(task.metadata?.contract) === REVIEW_CONTRACT;
}

function sourceTaskId(review = {}) {
  return text(
    review.metadata?.source_generation_task_id ||
    review.metadata?.repaired_source_task_id ||
    review.input?.provider_parameters?.source_generation_task_id ||
    list(review.depends_on)[0],
  ) || null;
}

function cinemaSource(source = {}) {
  return text(source.capability || source.service_code || source.service_id)
    .toLowerCase()
    .startsWith("ai.video.");
}

function continuityQcPassed(review = {}, source = {}) {
  if (!cinemaSource(source)) return true;
  const sourceHash = text(source.metadata?.continuity_qc_seal_hash);
  const reviewHash = text(review.metadata?.continuity_qc_seal_hash);
  return source.metadata?.continuity_qc_contract === CONTINUITY_QC_CONTRACT &&
    review.metadata?.continuity_qc_contract === CONTINUITY_QC_CONTRACT &&
    source.metadata?.continuity_qc_seal_contract === CONTINUITY_QC_SEAL_CONTRACT &&
    review.metadata?.continuity_qc_seal_contract === CONTINUITY_QC_SEAL_CONTRACT &&
    source.metadata?.continuity_qc_sealed === true &&
    review.metadata?.continuity_qc_sealed === true &&
    Boolean(sourceHash) &&
    sourceHash === reviewHash;
}

function vfxApplicable(source = {}) {
  const input = object(source.input);
  const requirements = object(input.requirements);
  const contract = object(
    input.vfx_contract ||
    requirements.vfx_contract ||
    source.metadata?.vfx_contract_data,
  );
  return text(contract.contract) === VFX_CONTRACT ||
    text(source.metadata?.vfx_contract) === VFX_CONTRACT;
}

function vfxQcPassed(review = {}, source = {}) {
  if (!vfxApplicable(source)) return true;
  const sourceHash = text(source.metadata?.vfx_qc_seal_hash);
  const reviewHash = text(review.metadata?.vfx_qc_seal_hash);
  return source.metadata?.vfx_qc_contract === VFX_QC_CONTRACT &&
    review.metadata?.vfx_qc_contract === VFX_QC_CONTRACT &&
    source.metadata?.vfx_qc_seal_contract === VFX_QC_SEAL_CONTRACT &&
    review.metadata?.vfx_qc_seal_contract === VFX_QC_SEAL_CONTRACT &&
    source.metadata?.vfx_qc_sealed === true &&
    review.metadata?.vfx_qc_sealed === true &&
    Boolean(sourceHash) &&
    sourceHash === reviewHash;
}

function thresholds(review = {}) {
  return {
    ...object(review.input?.requirements?.expected_contract?.thresholds),
    ...object(review.input?.requirements?.thresholds),
    ...object(review.metadata?.thresholds),
  };
}

function scoreSummary(review = {}) {
  const evidence = CreativeGeneratedMediaPerceptualExecutionGate
    .resultEvidence(review);
  const minimums = thresholds(review);
  const applicable = [];

  for (const [scoreField, thresholdField] of Object.entries(
    SCORE_THRESHOLD_MAP,
  )) {
    const threshold = finite(minimums[thresholdField]);
    const score = finite(evidence[scoreField]);
    if (threshold !== null && threshold > 0 && score !== null) {
      applicable.push({ score_field: scoreField, threshold, score });
    }
  }

  const overall = finite(evidence.overall_score);
  const weakest = applicable.length
    ? Math.min(...applicable.map((item) => item.score))
    : overall;
  const failedChecks = applicable
    .filter((item) => item.score < item.threshold)
    .map((item) => item.score_field.replace(/_score$/, ""));

  return {
    evidence,
    minimums,
    applicable,
    overall_score: overall,
    weakest_score: weakest,
    failed_checks: [
      ...new Set([
        ...failedChecks,
        ...list(evidence.failures).map((item) =>
          typeof item === "string" ? item : item?.code || item?.message,
        ),
      ].filter(Boolean).map(String)),
    ],
    repair_instructions: [
      ...new Set(
        list(evidence.repair_instructions).filter(Boolean).map(String),
      ),
    ],
  };
}

function hardHumanQualityPassed(evidence = {}) {
  return evidence.anatomy_valid !== false &&
    evidence.human_anatomy_valid !== false &&
    evidence.hand_integrity_valid !== false &&
    evidence.limb_topology_valid !== false &&
    evidence.body_proportions_preserved !== false &&
    evidence.face_geometry_preserved !== false &&
    evidence.identity_consistent_across_frames !== false &&
    evidence.natural_pose !== false &&
    evidence.extra_limbs_detected !== true &&
    evidence.missing_limbs_detected !== true &&
    evidence.malformed_hands_detected !== true &&
    evidence.duplicate_subject_detected !== true &&
    evidence.face_identity_drift_detected !== true &&
    evidence.body_identity_drift_detected !== true;
}

function cinematicMerit(evidence = {}) {
  let weighted = 0;
  let totalWeight = 0;
  const dimensions = {};

  for (const [field, weight] of Object.entries(CINEMATIC_WEIGHTS)) {
    const score = finite(evidence[field]);
    if (score === null) continue;
    dimensions[field] = score;
    weighted += score * weight;
    totalWeight += weight;
  }

  const overall = finite(evidence.overall_score);
  if (overall !== null) {
    weighted += overall * 0.15;
    totalWeight += 0.15;
  }

  return {
    score: totalWeight > 0 ? Number((weighted / totalWeight).toFixed(3)) : null,
    dimensions,
    weights: CINEMATIC_WEIGHTS,
  };
}

async function bridge(review = {}) {
  const sourceId = sourceTaskId(review);
  if (!sourceId) return null;
  const source = await ProductionTaskRuntime.get(sourceId);
  if (!source) return null;
  const assetNodeId = text(source.output?.asset_node_id);
  if (!assetNodeId) return null;
  const asset = await AssetGraphRepository.getById(assetNodeId);
  if (!asset || text(asset.organization_id) !== text(review.organization_id)) {
    return null;
  }

  const scores = scoreSummary(review);
  const humanQualityPassed = hardHumanQualityPassed(scores.evidence);
  const continuityPassed = continuityQcPassed(review, source);
  const vfxPassed = vfxQcPassed(review, source);
  const merit = cinematicMerit(scores.evidence);
  const baseHardGatePassed = continuityPassed && humanQualityPassed;
  const passed =
    text(review.status).toUpperCase() === "COMPLETED" &&
    review.metadata?.automated_perceptual_validation_passed === true &&
    source.metadata?.approved_for_downstream_after_perceptual_review === true &&
    baseHardGatePassed &&
    vfxPassed;
  const failedChecks = [
    ...scores.failed_checks,
    ...(continuityPassed ? [] : ["continuity_qc_seal"]),
    ...(vfxPassed ? [] : ["vfx_qc_seal"]),
  ];

  return AssetGraphRepository.update(asset.id, {
    intelligence: {
      ...object(asset.intelligence),
      quality_score: scores.overall_score,
      cinematic_merit_score: passed ? merit.score : null,
    },
    metadata: {
      ...object(asset.metadata),
      perceptual_candidate_selection_bridge_contract: CONTRACT,
      perceptual_review_task_id: review.id,
      shot_candidate_review_report_id: `perceptual-task:${review.id}`,
      shot_candidate_review_passed: passed,
      shot_candidate_review_score: scores.overall_score,
      shot_candidate_weakest_score: scores.weakest_score,
      shot_candidate_failed_checks: [...new Set(failedChecks)],
      shot_candidate_repair_instructions: scores.repair_instructions,
      shot_candidate_hard_human_quality_passed: humanQualityPassed,
      shot_candidate_continuity_qc_passed: continuityPassed,
      shot_candidate_continuity_qc_contract: CONTINUITY_QC_CONTRACT,
      shot_candidate_continuity_qc_seal_contract: CONTINUITY_QC_SEAL_CONTRACT,
      shot_candidate_continuity_qc_seal_hash:
        continuityPassed ? text(review.metadata?.continuity_qc_seal_hash) : null,
      shot_candidate_vfx_applicable: vfxApplicable(source),
      shot_candidate_vfx_qc_passed: vfxPassed,
      shot_candidate_vfx_qc_contract: VFX_QC_CONTRACT,
      shot_candidate_vfx_qc_seal_contract: VFX_QC_SEAL_CONTRACT,
      shot_candidate_vfx_qc_seal_hash:
        vfxPassed && vfxApplicable(source) ? text(review.metadata?.vfx_qc_seal_hash) : null,
      shot_candidate_cinematic_merit_score: passed ? merit.score : null,
      shot_candidate_cinematic_merit_dimensions: merit.dimensions,
      shot_candidate_cinematic_merit_weights: merit.weights,
      shot_candidate_selection_policy: "HARD_QUALITY_GATE_THEN_CINEMATIC_MERIT",
      shot_candidate_review_source: "GENERATED_MEDIA_PERCEPTUAL_REVIEW_V1",
      shot_candidate_review_provider_calls_added_by_bridge: 0,
      include_in_master: passed ? asset.metadata?.include_in_master : false,
      updated_from_perceptual_review_at: new Date().toISOString(),
    },
  });
}

function install() {
  if (ProductionTaskRuntime[FLAG]) return;

  const dispatch = ProductionTaskRuntime.dispatch.bind(ProductionTaskRuntime);
  Object.defineProperty(ProductionTaskRuntime, FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ProductionTaskRuntime.dispatch = async function dispatchWithCandidateBridge(id) {
    const before = await ProductionTaskRuntime.get(id);
    const isReview = perceptualReview(before);
    const result = await dispatch(id);
    if (!isReview) return result;

    const after = await ProductionTaskRuntime.get(id);
    if (after && ["COMPLETED", "FAILED"].includes(text(after.status).toUpperCase())) {
      await bridge(after);
    }
    return after || result;
  };
}

install();

export const CreativePerceptualCandidateSelectionBridgeBootstrap = Object.freeze({
  installed: true,
  contract: CONTRACT,
  bridge,
  cinematicMerit,
  hardHumanQualityPassed,
  continuityQcPassed,
  vfxApplicable,
  vfxQcPassed,
});
