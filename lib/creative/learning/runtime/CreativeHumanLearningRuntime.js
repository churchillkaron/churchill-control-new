import {
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";

export const CREATIVE_HUMAN_LEARNING_CONTRACT =
  "CREATIVE_HUMAN_LEARNING_V1";

function text(value, maximum = 240) {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized.slice(0, maximum) : null;
}

function decisionOf(node = {}) {
  if (node.metadata?.decision === "REJECTED") return "REJECTED";
  if (node.status === CREATIVE_ASSET_NODE_STATUS.REJECTED) return "REJECTED";
  if (
    node.status === CREATIVE_ASSET_NODE_STATUS.APPROVED &&
    node.review?.human_reviewed === true &&
    node.review?.approved === true
  ) {
    return "APPROVED";
  }
  return null;
}

function timestamp(node = {}) {
  return (
    node.metadata?.decided_at ||
    node.metadata?.approved_at ||
    node.created_at ||
    node.updated_at ||
    null
  );
}

function learningRecord(node = {}) {
  const decision = decisionOf(node);
  if (!decision) return null;

  return {
    id: node.id,
    decision,
    scope: text(node.metadata?.scope, 80),
    subject_type: text(node.metadata?.subject_type, 100),
    subject_asset_node_id:
      node.metadata?.subject_asset_node_id || node.parent_asset_node_id || null,
    reason_code:
      decision === "REJECTED"
        ? text(node.metadata?.reason_code, 120) || "OWNER_REJECTED"
        : "OWNER_APPROVED",
    feedback:
      decision === "REJECTED"
        ? text(node.metadata?.feedback || node.review?.notes, 240)
        : null,
    decided_at: timestamp(node),
    human_reviewed: true,
    evidence_only: true,
  };
}

function countBy(items = [], field) {
  const counts = {};
  for (const item of items) {
    const key = item[field] || "UNKNOWN";
    counts[key] = Number(counts[key] || 0) + 1;
  }
  return counts;
}

function summary(items = []) {
  const approvals = items.filter((item) => item.decision === "APPROVED");
  const rejections = items.filter((item) => item.decision === "REJECTED");

  return {
    contract: CREATIVE_HUMAN_LEARNING_CONTRACT,
    evidence_status:
      items.length > 0 ? "HUMAN_DECISIONS_AVAILABLE" : "AWAITING_HUMAN_DECISIONS",
    decision_count: items.length,
    approval_count: approvals.length,
    rejection_count: rejections.length,
    by_scope: countBy(items, "scope"),
    rejection_reasons: countBy(rejections, "reason_code"),
    latest_decision_at: items[0]?.decided_at || null,
    latest_decisions: items.slice(0, 12),
    interpretation: {
      evidence_role: "OWNER_PREFERENCE_EVIDENCE_NOT_EXECUTION_INSTRUCTION",
      quality_floor_immutable: true,
      quality_policy_override_allowed: false,
      rights_gate_override_allowed: false,
      approval_gate_override_allowed: false,
      provider_routing_override_allowed: false,
      imitation_of_prior_work_allowed: false,
      feedback_must_be_interpreted_in_current_business_context: true,
      provider_prompts_persisted: false,
    },
  };
}

export const CreativeHumanLearningRuntime = Object.freeze({
  async resolve({
    organization_id,
    creative_project_id,
    limit = 100,
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");

    const nodes = await AssetGraphRepository.listByProject({
      organization_id,
      creative_project_id,
    });

    const items = nodes
      .filter((node) =>
        node.type === CREATIVE_ASSET_NODE_TYPES.APPROVAL_RECORD &&
        node.review?.human_reviewed === true,
      )
      .map(learningRecord)
      .filter(Boolean)
      .sort((left, right) =>
        Date.parse(right.decided_at || 0) - Date.parse(left.decided_at || 0),
      )
      .slice(0, Math.min(Math.max(Number(limit) || 100, 1), 250));

    const resolved = summary(items);
    return {
      current: resolved,
      summary: resolved,
      items,
      status: resolved.evidence_status,
      read_only_learning: true,
      provider_execution: false,
    };
  },
});
