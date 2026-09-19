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
function dimensionScores(node = {}) {
  return object(node.metadata?.shot_candidate_dimension_scores);
}
function craftProfile(node = {}) {
  return object(node.metadata?.shot_candidate_craft_profile);
}
function compactCraftProfile(node = {}) {
  const profile = craftProfile(node);
  const camera = object(profile.camera);
  const signature = object(profile.signature_frame_design);
  return {
    production_stage: text(profile.production_stage) || null,
    coverage_role: text(profile.coverage_role) || null,
    camera: {
      platform: text(camera.platform) || null,
      framing: text(camera.framing) || null,
      angle: text(camera.angle) || null,
      camera_distance: text(camera.camera_distance) || null,
      lens_intent: text(camera.lens_intent) || null,
      movement_path: text(camera.movement_path) || null,
      movement_speed: text(camera.movement_speed) || null,
      stabilization: text(camera.stabilization) || null,
      focus_target: text(camera.focus_target) || null,
    },
    performance_direction: text(
      typeof profile.performance_direction === "string"
        ? profile.performance_direction
        : profile.performance_direction?.direction || profile.performance_direction?.performance_intent,
    ) || null,
    signature_frame: {
      hero_frame: text(signature.hero_frame) || null,
      graphic_silhouette: text(signature.graphic_silhouette) || null,
      material_light_event: text(signature.material_light_event) || null,
      optical_character: text(signature.optical_character) || null,
      performance_microtruth: text(signature.performance_microtruth) || null,
      anti_game_camera_rule: text(signature.anti_game_camera_rule) || null,
    },
  };
}
function dimensionDelta(accepted = {}, rejected = {}) {
  const a = dimensionScores(accepted);
  const r = dimensionScores(rejected);
  const keys = new Set([...Object.keys(a), ...Object.keys(r)]);
  const delta = {};
  for (const key of keys) {
    const av = finite(a[key]);
    const rv = finite(r[key]);
    if (av === null && rv === null) continue;
    delta[key] = {
      accepted: av,
      rejected: rv,
      delta: av !== null && rv !== null ? Number((av - rv).toFixed(3)) : null,
    };
  }
  return delta;
}
function shotId(value = {}) {
  return text(value.metadata?.shot_id || value.shot_id || value.input?.shot_id) || null;
}
function rejectionReasons(node = {}) {
  const report = object(node.metadata?.dailies_report);
  const learning = object(node.metadata?.dailies_learning_signal || report.learning_signal);
  const failures = [
    ...list(node.metadata?.candidate_failures),
    ...list(node.metadata?.perceptual_failures),
    ...list(node.metadata?.review_failures),
    ...list(report.failures),
    ...list(learning.failure_codes),
    ...list(learning.rejected_families).map((family) => `DAILIES_FAMILY_REJECTED:${text(family)}`),
  ];
  return [...new Set(failures.map((value) => text(value)).filter(Boolean))].slice(0, 12);
}
function imageStudioExplorationPairs(nodes = []) {
  const groups = new Map();
  for (const node of nodes) {
    const group = text(node.metadata?.image_asset_exploration_group_id);
    if (!group) continue;
    const bucket = groups.get(group) || [];
    bucket.push(node);
    groups.set(group, bucket);
  }
  const pairs = [];
  for (const [group, assets] of groups) {
    const winner = assets.find((node) => node.metadata?.image_asset_exploration_selected === true);
    if (!winner) continue;
    for (const loser of assets.filter((node) =>
      node.id !== winner.id &&
      (node.metadata?.image_asset_exploration_rejected === true ||
       text(node.status).toUpperCase() === "REJECTED")
    )) {
      pairs.push({
        exploration_group_id: group,
        asset_class: winner.metadata?.image_asset_class || null,
        accepted_asset_node_id: winner.id,
        rejected_asset_node_id: loser.id,
        accepted_variation_axis: winner.metadata?.image_asset_variation_axis || null,
        rejected_variation_axis: loser.metadata?.image_asset_variation_axis || null,
        accepted_selection_score: finite(winner.metadata?.image_asset_exploration_selection_score),
        rejection_reasons: rejectionReasons(loser),
        evidence_only: true,
      });
      if (pairs.length >= 40) return pairs;
    }
  }
  return pairs;
}
function imageStudioFailureFrequency(tasks = []) {
  const counts = {};
  for (const task of tasks) {
    const relevant =
      task.metadata?.image_asset_pack_review === true ||
      task.metadata?.image_asset_multiview_qc === true ||
      task.metadata?.image_asset_derivative_qc === true ||
      task.metadata?.material_truth_qc === true ||
      task.metadata?.image_asset_localized_repair_review === true;
    if (!relevant || text(task.status).toUpperCase() !== "FAILED") continue;
    const output = object(task.output);
    const candidates = [
      ...list(output.image_asset_pack_consistency?.failures),
      ...list(output.image_multiview_consistency?.failures),
      ...list(output.image_asset_derivative_qc?.failures),
      ...list(output.material_truth_qc?.failures),
      ...list(output.result?.failures),
      text(task.error),
    ];
    for (const reason of candidates.map(text).filter(Boolean)) {
      counts[reason] = Number(counts[reason] || 0) + 1;
    }
  }
  return counts;
}
function acceptedRejectedPairs(selected = [], rejected = []) {
  const byShot = new Map();
  for (const node of rejected) {
    const id = shotId(node);
    if (!id) continue;
    if (!byShot.has(id)) byShot.set(id, []);
    byShot.get(id).push(node);
  }
  const pairs = [];
  for (const winner of selected) {
    const id = shotId(winner);
    if (!id) continue;
    for (const loser of byShot.get(id) || []) {
      pairs.push({
        shot_id: id,
        accepted_asset_node_id: winner.id,
        rejected_asset_node_id: loser.id,
        accepted_quality: quality(winner),
        rejected_quality: quality(loser),
        dimension_scores: dimensionDelta(winner, loser),
        accepted_craft_profile: compactCraftProfile(winner),
        rejected_craft_profile: compactCraftProfile(loser),
        rejection_reasons: rejectionReasons(loser),
        evidence_only: true,
      });
      if (pairs.length >= 40) return pairs;
    }
  }
  return pairs;
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
    const pairs = acceptedRejectedPairs(selected, rejected);
    const imageExplorationPairs = imageStudioExplorationPairs(nodes);
    const imageFailureFrequency = imageStudioFailureFrequency(current);
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
    for (const [reason, count] of Object.entries(imageFailureFrequency)) {
      if (count < 2) continue;
      recommendations.push({
        code: "IMAGE_STUDIO_RECURRING_FAILURE_PATTERN",
        advisory: true,
        automatic_threshold_change_allowed: false,
        evidence: { failure_reason: reason, occurrence_count: count },
      });
    }
    if (imageExplorationPairs.length) {
      recommendations.push({
        code: "IMAGE_STUDIO_ACCEPTED_REJECTED_DESIGN_EVIDENCE_AVAILABLE",
        advisory: true,
        automatic_style_copy_allowed: false,
        evidence: { pair_count: imageExplorationPairs.length },
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
        accepted_rejected_pair_count: pairs.length,
        accepted_rejected_pairs: pairs,
        image_studio_exploration_pair_count: imageExplorationPairs.length,
        image_studio_exploration_pairs: imageExplorationPairs,
        image_studio_failure_frequency: imageFailureFrequency,
        rejection_reason_frequency: pairs.reduce((acc, pair) => {
          for (const reason of pair.rejection_reasons) acc[reason] = Number(acc[reason] || 0) + 1;
          return acc;
        }, {}),
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
