import * as AssetGraphRepository from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import { ProductionTaskRuntime } from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

const CONTRACT = "AVANTIQO_CREATIVE_PRODUCTION_LEARNING_V1";
const WORLD_CLASS_FLOOR = 94;

function text(value) { return String(value ?? "").trim(); }
function finite(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function active(task = {}) {
  return !task.metadata?.superseded_by_revision_task_id &&
    !task.metadata?.superseded_by_repair_task_id &&
    !task.metadata?.superseded_by_repair_review_task_id;
}
function customerPrice(task = {}) {
  const cost = object(task.cost);
  return finite(cost.customer_price ?? cost.actual_customer_price ?? task.metadata?.customer_price ?? task.output?.customer_price) || 0;
}
function quality(node = {}) {
  return finite(
    node.metadata?.selection_cinematic_merit_score ??
    node.metadata?.shot_candidate_cinematic_merit_score ??
    node.metadata?.shot_candidate_weakest_score ??
    node.metadata?.shot_candidate_review_score ??
    node.intelligence?.quality_score,
  );
}
function shotId(value = {}) {
  return text(value.metadata?.shot_id || value.shot_id || value.input?.shot_id) || null;
}

export const CreativeProductionLearningRuntime = Object.freeze({
  contract: CONTRACT,
  evidence_is_advisory: true,
  quality_floor_immutable: true,
  provider_routing_override_allowed: false,
  governance_override_allowed: false,
  provider_calls_executed: 0,

  async resolve({ organization_id, creative_project_id } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");
    const [tasks, nodes] = await Promise.all([
      ProductionTaskRuntime.list({ organization_id, creative_project_id }),
      AssetGraphRepository.listByProject({ organization_id, creative_project_id }),
    ]);
    const current = tasks.filter(active);
    const repairs = current.filter((task) =>
      task.metadata?.repair_of_task_id ||
      task.metadata?.repaired_source_task_id ||
      task.metadata?.human_temporal_span_repair_bound === true,
    );
    const selected = nodes.filter((node) => node.metadata?.selected_for_master === true);
    const rejected = nodes.filter((node) => node.metadata?.rejected_by_candidate_competition === true || text(node.status).toUpperCase() === "REJECTED");
    const selectedShotIds = new Set(selected.map(shotId).filter(Boolean));
    const successfulRepairs = repairs.filter((task) => selectedShotIds.has(shotId(task)) || text(task.status).toUpperCase() === "COMPLETED");
    const runtimeFailures = current.filter((task) => text(task.status).toUpperCase() === "FAILED");
    const totalCustomerPrice = current.reduce((sum, task) => sum + customerPrice(task), 0);
    const winnerQualities = selected.map(quality).filter((value) => value !== null);
    const winnerQualityAverage = winnerQualities.length
      ? winnerQualities.reduce((sum, value) => sum + value, 0) / winnerQualities.length
      : null;
    const byCapability = {};
    for (const task of current) {
      const capability = text(task.capability || task.service_code || task.service_id) || "unknown";
      const bucket = byCapability[capability] || { task_count: 0, failed_count: 0, customer_price: 0 };
      bucket.task_count += 1;
      bucket.customer_price += customerPrice(task);
      if (text(task.status).toUpperCase() === "FAILED") bucket.failed_count += 1;
      byCapability[capability] = bucket;
    }
    const recommendations = [];
    if (repairs.length && successfulRepairs.length / repairs.length >= 0.75) {
      recommendations.push({
        code: "SURGICAL_REPAIR_HAS_STRONG_LOCAL_EVIDENCE",
        advisory: true,
        evidence: { repair_count: repairs.length, successful_repair_count: successfulRepairs.length },
      });
    }
    if (runtimeFailures.length) {
      recommendations.push({
        code: "RUNTIME_FAILURE_PATTERN_REQUIRES_RELIABILITY_REVIEW",
        advisory: true,
        evidence: runtimeFailures.map((task) => ({ id: task.id, capability: task.capability || task.service_code || null, failure_class: task.failure_class || null })),
      });
    }
    if (winnerQualityAverage !== null && winnerQualityAverage < WORLD_CLASS_FLOOR) {
      recommendations.push({
        code: "QUALITY_EVIDENCE_BELOW_IMMUTABLE_WORLD_CLASS_FLOOR",
        advisory: true,
        automatic_threshold_change_allowed: false,
        evidence: { winner_quality_average: winnerQualityAverage, floor: WORLD_CLASS_FLOOR },
      });
    }

    return {
      contract: CONTRACT,
      project_id: creative_project_id,
      world_class_floor: WORLD_CLASS_FLOOR,
      evidence: {
        task_count: current.length,
        selected_winner_count: selected.length,
        rejected_candidate_count: rejected.length,
        repair_count: repairs.length,
        successful_repair_count: successfulRepairs.length,
        runtime_failure_count: runtimeFailures.length,
        recorded_customer_price: Number(totalCustomerPrice.toFixed(6)),
        winner_quality_average: winnerQualityAverage === null ? null : Number(winnerQualityAverage.toFixed(3)),
        capability_performance: byCapability,
      },
      recommendations,
      safeguards: {
        evidence_is_advisory: true,
        quality_floor_immutable: true,
        quality_policy_override_allowed: false,
        provider_routing_override_allowed: false,
        approval_gate_override_allowed: false,
        rights_gate_override_allowed: false,
        autonomous_governance_mutation_allowed: false,
      },
      provider_calls_executed: 0,
    };
  },
});
