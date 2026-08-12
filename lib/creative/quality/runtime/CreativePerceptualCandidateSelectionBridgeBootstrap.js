import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import {
  CreativeGeneratedMediaPerceptualExecutionGate,
} from "./CreativeGeneratedMediaPerceptualExecutionGate";

const FLAG = Symbol.for(
  "avantiqo.creative.perceptual-candidate-selection-bridge.v1",
);
const CONTRACT = "CREATIVE_PERCEPTUAL_CANDIDATE_SELECTION_BRIDGE_V1";
const REVIEW_CONTRACT = "GENERATED_MEDIA_PERCEPTUAL_REVIEW_V1";

const SCORE_THRESHOLD_MAP = Object.freeze({
  overall_score: "minimum_overall_score",
  story_score: "minimum_story_score",
  environment_score: "minimum_environment_score",
  camera_score: "minimum_camera_score",
  anatomy_score: "minimum_anatomy_score",
  identity_score: "minimum_identity_score",
  product_fidelity_score: "minimum_product_fidelity_score",
  music_energy_score: "minimum_music_energy_score",
  performance_score: "minimum_performance_score",
  continuity_score: "minimum_continuity_score",
  physics_score: "minimum_physics_score",
  artifact_score: "minimum_artifact_score",
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
  const passed =
    text(review.status).toUpperCase() === "COMPLETED" &&
    review.metadata?.automated_perceptual_validation_passed === true &&
    source.metadata?.approved_for_downstream_after_perceptual_review === true;

  return AssetGraphRepository.update(asset.id, {
    intelligence: {
      ...object(asset.intelligence),
      quality_score: scores.overall_score,
    },
    metadata: {
      ...object(asset.metadata),
      perceptual_candidate_selection_bridge_contract: CONTRACT,
      perceptual_review_task_id: review.id,
      shot_candidate_review_report_id: `perceptual-task:${review.id}`,
      shot_candidate_review_passed: passed,
      shot_candidate_review_score: scores.overall_score,
      shot_candidate_weakest_score: scores.weakest_score,
      shot_candidate_failed_checks: scores.failed_checks,
      shot_candidate_repair_instructions: scores.repair_instructions,
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
});
