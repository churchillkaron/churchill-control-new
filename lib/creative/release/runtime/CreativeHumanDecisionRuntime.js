import crypto from "node:crypto";

import {
  createCreativeAssetNode,
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";

export const CREATIVE_HUMAN_DECISION_CONTRACT =
  "CREATIVE_HUMAN_DECISION_V1";

const SCOPE_BY_TYPE = Object.freeze({
  [CREATIVE_ASSET_NODE_TYPES.PRODUCTION_DOSSIER]: "PRODUCTION_DOSSIER",
  [CREATIVE_ASSET_NODE_TYPES.RELEASE_GATE_REPORT]: "RELEASE_GATE",
  [CREATIVE_ASSET_NODE_TYPES.FINAL_RENDER]: "FINAL_RENDER",
  [CREATIVE_ASSET_NODE_TYPES.RELEASE_READINESS_REPORT]: "PUBLISH_RELEASE",
});

function text(value, maximum = 1200) {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized.slice(0, maximum) : "";
}

function subjectIdentity(subject = {}) {
  return (
    subject.metadata?.dossier_hash ||
    subject.metadata?.release_gate_identity ||
    subject.metadata?.render_identity ||
    subject.metadata?.release_readiness_identity ||
    null
  );
}

function decisionIdentity({
  subject,
  scope,
  actor,
  reasonCode,
  feedback,
}) {
  return crypto.createHash("sha256").update(JSON.stringify({
    contract: CREATIVE_HUMAN_DECISION_CONTRACT,
    decision: "REJECTED",
    subject_id: subject.id,
    subject_updated_at: subject.updated_at || null,
    subject_identity: subjectIdentity(subject),
    scope,
    actor_user_id: actor.user_id,
    actor_staff_account_id: actor.staff_account_id,
    reason_code: reasonCode,
    feedback,
  })).digest("hex");
}

function isMatchingDecision(node = {}, subject = {}, scope = "") {
  return Boolean(
    node.type === CREATIVE_ASSET_NODE_TYPES.APPROVAL_RECORD &&
    node.parent_asset_node_id === subject.id &&
    node.metadata?.subject_asset_node_id === subject.id &&
    node.metadata?.scope === scope
  );
}

function newest(nodes = []) {
  return [...nodes].sort((left, right) =>
    Date.parse(right.created_at || right.updated_at || 0) -
    Date.parse(left.created_at || left.updated_at || 0),
  )[0] || null;
}

export const CreativeHumanDecisionRuntime = Object.freeze({
  async latest({
    organization_id,
    subject_asset_node_id,
    scope,
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!subject_asset_node_id) throw new Error("subject_asset_node_id required");
    if (!scope) throw new Error("decision scope required");

    const subject = await AssetGraphRepository.getById(subject_asset_node_id);
    if (
      !subject ||
      String(subject.organization_id) !== String(organization_id) ||
      SCOPE_BY_TYPE[subject.type] !== scope
    ) {
      return null;
    }

    const nodes = await AssetGraphRepository.listByProject({
      organization_id,
      creative_project_id: subject.creative_project_id,
    });
    return newest(nodes.filter((node) =>
      isMatchingDecision(node, subject, scope),
    ));
  },

  async reject({
    organization_id,
    subject_asset_node_id,
    scope,
    rejector,
    reason_code = "OWNER_REJECTED",
    feedback = "",
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!subject_asset_node_id) throw new Error("subject_asset_node_id required");
    if (!scope) throw new Error("decision scope required");
    if (!rejector?.user_id || !rejector?.staff_account_id) {
      throw new Error("AUTHENTICATED_REJECTOR_REQUIRED");
    }

    const subject = await AssetGraphRepository.getById(subject_asset_node_id);
    if (!subject || String(subject.organization_id) !== String(organization_id)) {
      throw new Error("Creative decision subject not found");
    }
    if (SCOPE_BY_TYPE[subject.type] !== scope) {
      throw new Error("CREATIVE_DECISION_SCOPE_SUBJECT_MISMATCH");
    }

    const normalizedReason = text(reason_code, 120) || "OWNER_REJECTED";
    const normalizedFeedback = text(feedback, 1200);
    const decisionId = decisionIdentity({
      subject,
      scope,
      actor: rejector,
      reasonCode: normalizedReason,
      feedback: normalizedFeedback,
    });
    const nodes = await AssetGraphRepository.listByProject({
      organization_id,
      creative_project_id: subject.creative_project_id,
    });
    const existing = nodes.find((node) =>
      node.type === CREATIVE_ASSET_NODE_TYPES.APPROVAL_RECORD &&
      node.metadata?.decision_identity === decisionId,
    );
    if (existing) {
      return { decision: existing, subject, reused: true };
    }

    const decidedAt = new Date().toISOString();
    const decision = createCreativeAssetNode({
      organization_id,
      creative_project_id: subject.creative_project_id,
      parent_asset_node_id: subject.id,
      type: CREATIVE_ASSET_NODE_TYPES.APPROVAL_RECORD,
      status: CREATIVE_ASSET_NODE_STATUS.REJECTED,
      name: `${subject.name || subject.type} rejection`,
      description: "Authenticated immutable Creative human rejection record.",
      lineage: {
        source: "authenticated_staff_decision",
        capability: "creative.release.reject",
        generation_version: 1,
      },
      review: {
        ai_reviewed: false,
        human_reviewed: true,
        approved: false,
        approved_by: null,
        notes: normalizedFeedback,
      },
      metadata: {
        contract: CREATIVE_HUMAN_DECISION_CONTRACT,
        decision_identity: decisionId,
        decision: "REJECTED",
        subject_asset_node_id: subject.id,
        subject_type: subject.type,
        subject_updated_at: subject.updated_at || null,
        subject_identity: subjectIdentity(subject),
        scope,
        reason_code: normalizedReason,
        feedback: normalizedFeedback,
        actor_user_id: rejector.user_id,
        actor_staff_account_id: rejector.staff_account_id,
        actor_email: rejector.email || null,
        decided_at: decidedAt,
        evidence_only: true,
        provider_execution: false,
        provider_prompts_persisted: false,
        quality_floor_immutable: true,
      },
      created_by: rejector.user_id,
    });

    const stored = await AssetGraphRepository.create(decision);
    return { decision: stored, subject, reused: false };
  },
});
