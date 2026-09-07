import * as AssetGraphRepository from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import { ProductionTaskRuntime } from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

const CONTRACT = "AVANTIQO_AUTONOMOUS_RECOVERY_V1";

function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function finite(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function active(task = {}) {
  return !task.metadata?.superseded_by_repair_task_id &&
    !task.metadata?.superseded_by_repair_review_task_id;
}
function isQuality(task = {}) {
  return text(task.type).toUpperCase() === "QUALITY_REVIEW" || task.metadata?.quality_gate === true;
}
function failures(task = {}) {
  return [
    ...list(task.output?.failed_checks),
    ...list(task.output?.failures).map((item) => typeof item === "string" ? item : item?.code || item?.message),
    text(task.error),
  ].map(text).filter(Boolean);
}
function repairInstructions(task = {}) {
  return [
    ...list(task.output?.repair_instructions),
    ...list(task.metadata?.repair_instructions),
  ].map(text).filter(Boolean);
}
function selectedWinner(nodes, shotId) {
  return nodes.find((node) =>
    text(node.metadata?.shot_id) === text(shotId) &&
    node.metadata?.selected_for_master === true &&
    node.metadata?.shot_candidate_review_passed === true &&
    Number(node.metadata?.shot_candidate_weakest_score || 0) >= 94,
  ) || null;
}
function hardAuthorityFailure(items = []) {
  return items.some((item) => /AUTHORITY|SCOPE|ORGANI[ZS]ATION|SEAL|HASH_MISMATCH|RIGHTS|CONSENT|APPROVAL_REQUIRED/.test(item.toUpperCase()));
}
function budgetExhausted(task = {}) {
  const max = finite(task.metadata?.budget_quality_optimization?.maximum_attempts ?? task.input?.requirements?.budget_quality_optimization?.maximum_attempts);
  const attempt = finite(task.metadata?.repair_attempt) || 0;
  return max !== null && attempt >= max;
}

export const CreativeAutonomousRecoveryOrchestratorRuntime = Object.freeze({
  contract: CONTRACT,
  actions: Object.freeze(["REUSE", "SURGICAL_REPAIR", "REGENERATE", "REROUTE", "BLOCK"]),
  quality_floor_may_be_lowered: false,
  governance_may_be_bypassed: false,

  async analyze({ organization_id, creative_project_id } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");
    const [tasks, nodes] = await Promise.all([
      ProductionTaskRuntime.list({ organization_id, creative_project_id }),
      AssetGraphRepository.listByProject({ organization_id, creative_project_id }),
    ]);
    const decisions = [];
    for (const task of tasks.filter(active)) {
      const status = text(task.status).toUpperCase();
      const shotId = text(task.shot_id || task.metadata?.shot_id);
      const winner = shotId ? selectedWinner(nodes, shotId) : null;
      if (winner && ["FAILED", "COMPLETED"].includes(status)) {
        decisions.push({
          task_id: task.id,
          shot_id: shotId || null,
          action: "REUSE",
          reason: "WORLD_CLASS_SELECTED_WINNER_ALREADY_EXISTS",
          selected_asset_node_id: winner.id,
          provider_change_authorized: false,
        });
        continue;
      }
      if (!(["FAILED", "COMPLETED"].includes(status))) continue;
      if (status === "COMPLETED" && !isQuality(task)) continue;

      const failed = failures(task);
      const instructions = repairInstructions(task);
      if (hardAuthorityFailure(failed) || task.review?.required === true && task.review?.approved !== true) {
        decisions.push({
          task_id: task.id,
          shot_id: shotId || null,
          action: "BLOCK",
          reason: hardAuthorityFailure(failed) ? "HARD_AUTHORITY_FAILURE" : "HUMAN_APPROVAL_REQUIRED",
          failures: failed,
          automatic_mutation_allowed: false,
        });
        continue;
      }
      if (budgetExhausted(task)) {
        decisions.push({
          task_id: task.id,
          shot_id: shotId || null,
          action: "BLOCK",
          reason: "RECOVERY_ATTEMPT_BUDGET_EXHAUSTED",
          failures: failed,
          quality_floor_preserved: true,
        });
        continue;
      }
      if (status === "FAILED" && !isQuality(task)) {
        decisions.push({
          task_id: task.id,
          shot_id: shotId || null,
          action: "REROUTE",
          reason: "EXECUTION_OR_PROVIDER_FAILURE",
          failures: failed,
          blocked_provider_id: task.provider_id || null,
          provider_selection_owner: "SERVICE_RUNTIME",
          creative_provider_selection_forbidden: true,
        });
        continue;
      }
      if (instructions.length) {
        decisions.push({
          task_id: task.id,
          shot_id: shotId || null,
          action: "SURGICAL_REPAIR",
          reason: "BOUNDED_FAILED_REQUIREMENTS_AVAILABLE",
          failures: failed,
          repair_instructions: instructions,
          preserve_unaffected_requirements: true,
        });
        continue;
      }
      decisions.push({
        task_id: task.id,
        shot_id: shotId || null,
        action: "REGENERATE",
        reason: "NO_VALID_WINNER_AND_NO_SURGICAL_REPAIR_SPECIFICATION",
        failures: failed,
        provider_selection_owner: "SERVICE_RUNTIME",
        quality_floor_preserved: true,
      });
    }
    return {
      contract: CONTRACT,
      project_id: creative_project_id,
      decisions,
      counts: Object.fromEntries(this.actions.map((action) => [action, decisions.filter((item) => item.action === action).length])),
      quality_floor_may_be_lowered: false,
      governance_may_be_bypassed: false,
      provider_calls_executed: 0,
    };
  },
});
