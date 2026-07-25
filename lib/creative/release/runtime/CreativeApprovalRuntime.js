import crypto from "node:crypto";

import {
  createCreativeAssetNode,
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";

const APPROVABLE_TYPES = new Set([
  CREATIVE_ASSET_NODE_TYPES.RELEASE_GATE_REPORT,
  CREATIVE_ASSET_NODE_TYPES.FINAL_RENDER,
  CREATIVE_ASSET_NODE_TYPES.RELEASE_READINESS_REPORT,
]);

function subjectIdentity(subject) {
  return (
    subject?.metadata?.release_gate_identity ||
    subject?.metadata?.render_identity ||
    subject?.metadata?.release_readiness_identity ||
    null
  );
}

function identity(subject, scope, approver) {
  return crypto.createHash("sha256").update(JSON.stringify({
    subject_id: subject.id,
    subject_updated_at: subject.updated_at || null,
    subject_identity: subjectIdentity(subject),
    scope,
    approver_user_id: approver.user_id,
    approver_staff_account_id: approver.staff_account_id,
  })).digest("hex");
}

function currentApproval(node, subject, scope) {
  return Boolean(
    node &&
    subject &&
    node.type === CREATIVE_ASSET_NODE_TYPES.APPROVAL_RECORD &&
    node.status === CREATIVE_ASSET_NODE_STATUS.APPROVED &&
    node.parent_asset_node_id === subject.id &&
    node.metadata?.subject_asset_node_id === subject.id &&
    node.metadata?.subject_updated_at === (subject.updated_at || null) &&
    node.metadata?.subject_identity === subjectIdentity(subject) &&
    node.metadata?.scope === scope &&
    node.metadata?.approver_user_id &&
    node.metadata?.approver_staff_account_id
  );
}

function newest(nodes = []) {
  return [...nodes].sort((left, right) =>
    Date.parse(right.updated_at || right.created_at || 0) -
    Date.parse(left.updated_at || left.created_at || 0),
  )[0] || null;
}

export const CreativeApprovalRuntime = {
  async findCurrentApproval({
    organization_id,
    subject_asset_node_id,
    scope,
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!subject_asset_node_id) throw new Error("subject_asset_node_id required");
    if (!scope) throw new Error("approval scope required");

    const subject = await AssetGraphRepository.getById(subject_asset_node_id);
    if (
      !subject ||
      subject.organization_id !== organization_id ||
      !APPROVABLE_TYPES.has(subject.type)
    ) {
      return null;
    }

    const nodes = await AssetGraphRepository.listByProject({
      organization_id,
      creative_project_id: subject.creative_project_id,
    });
    return newest(nodes.filter((node) => currentApproval(node, subject, scope)));
  },

  async approve({
    organization_id,
    subject_asset_node_id,
    scope,
    approver,
    notes = "",
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!subject_asset_node_id) throw new Error("subject_asset_node_id required");
    if (!scope) throw new Error("approval scope required");
    if (!approver?.user_id || !approver?.staff_account_id) {
      throw new Error("AUTHENTICATED_APPROVER_REQUIRED");
    }

    const subject = await AssetGraphRepository.getById(subject_asset_node_id);
    if (
      !subject ||
      subject.organization_id !== organization_id ||
      !APPROVABLE_TYPES.has(subject.type)
    ) {
      throw new Error("Approvable creative subject not found");
    }

    if (
      subject.type === CREATIVE_ASSET_NODE_TYPES.RELEASE_GATE_REPORT &&
      subject.metadata?.passed !== true
    ) {
      throw new Error("RELEASE_GATE_REPORT_NOT_PASSED");
    }
    if (
      subject.type === CREATIVE_ASSET_NODE_TYPES.FINAL_RENDER &&
      subject.metadata?.technical_qc?.passed !== true
    ) {
      throw new Error("FINAL_RENDER_TECHNICAL_QC_NOT_PASSED");
    }
    if (
      subject.type === CREATIVE_ASSET_NODE_TYPES.RELEASE_READINESS_REPORT &&
      subject.metadata?.passed !== true
    ) {
      throw new Error("RELEASE_READINESS_NOT_PASSED");
    }

    const approvalIdentity = identity(subject, scope, approver);
    const nodes = await AssetGraphRepository.listByProject({
      organization_id,
      creative_project_id: subject.creative_project_id,
    });
    const existing = nodes.find((node) =>
      node.type === CREATIVE_ASSET_NODE_TYPES.APPROVAL_RECORD &&
      node.metadata?.approval_identity === approvalIdentity,
    );
    if (existing) return { approval: existing, reused: true };

    const approval = createCreativeAssetNode({
      organization_id,
      creative_project_id: subject.creative_project_id,
      parent_asset_node_id: subject.id,
      type: CREATIVE_ASSET_NODE_TYPES.APPROVAL_RECORD,
      status: CREATIVE_ASSET_NODE_STATUS.APPROVED,
      name: `${subject.name || subject.type} approval`,
      description: "Authenticated immutable creative approval record.",
      lineage: {
        source: "authenticated_staff_approval",
        capability: "creative.release.approve",
        generation_version: 1,
      },
      review: {
        ai_reviewed: false,
        human_reviewed: true,
        approved: true,
        approved_by: approver.staff_account_id,
        notes: String(notes || ""),
      },
      metadata: {
        approval_identity: approvalIdentity,
        subject_asset_node_id: subject.id,
        subject_type: subject.type,
        subject_updated_at: subject.updated_at || null,
        subject_identity: subjectIdentity(subject),
        scope,
        approver_user_id: approver.user_id,
        approver_staff_account_id: approver.staff_account_id,
        approver_email: approver.email || null,
        approved_at: new Date().toISOString(),
      },
      created_by: approver.user_id,
    });

    return {
      approval: await AssetGraphRepository.create(approval),
      reused: false,
    };
  },
};
