import crypto from "node:crypto";

import {
  createCreativeAssetNode,
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import * as ProductionGraphRepository
from "@/lib/creative/production-graph/repositories/ProductionGraphRepository";
import {
  currentCreativePrimaryMaster,
} from "@/lib/creative/release/runtime/CreativeMasterVersionRuntime";

const APPROVABLE_TYPES = new Set([
  CREATIVE_ASSET_NODE_TYPES.PRODUCTION_DOSSIER,
  CREATIVE_ASSET_NODE_TYPES.RELEASE_GATE_REPORT,
  CREATIVE_ASSET_NODE_TYPES.FINAL_RENDER,
  CREATIVE_ASSET_NODE_TYPES.RELEASE_READINESS_REPORT,
]);

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function subjectIdentity(subject) {
  return (
    subject?.metadata?.dossier_hash ||
    subject?.metadata?.release_gate_identity ||
    subject?.metadata?.render_identity ||
    subject?.metadata?.release_readiness_identity ||
    null
  );
}

function approvalCostCeiling(node = {}) {
  return finite(node.metadata?.approved_cost_ceiling);
}

function identity(
  subject,
  scope,
  approver,
  approvedCostCeiling = null,
  releaseBinding = null,
) {
  return crypto.createHash("sha256").update(JSON.stringify({
    subject_id: subject.id,
    subject_updated_at: subject.updated_at || null,
    subject_identity: subjectIdentity(subject),
    scope,
    approved_cost_ceiling: approvedCostCeiling,
    release_binding: releaseBinding,
    approver_user_id: approver.user_id,
    approver_staff_account_id: approver.staff_account_id,
  })).digest("hex");
}

function currentApproval(node, subject, scope) {
  const dossier = subject?.type === CREATIVE_ASSET_NODE_TYPES.PRODUCTION_DOSSIER;
  const base = Boolean(
    node &&
    subject &&
    node.type === CREATIVE_ASSET_NODE_TYPES.APPROVAL_RECORD &&
    node.status === CREATIVE_ASSET_NODE_STATUS.APPROVED &&
    node.parent_asset_node_id === subject.id &&
    node.metadata?.subject_asset_node_id === subject.id &&
    (dossier || node.metadata?.subject_updated_at === (subject.updated_at || null)) &&
    node.metadata?.subject_identity === subjectIdentity(subject) &&
    node.metadata?.scope === scope &&
    node.metadata?.approver_user_id &&
    node.metadata?.approver_staff_account_id
  );
  if (!base) return false;
  if (!dossier) return true;

  const ceiling = approvalCostCeiling(node);
  const estimated = finite(subject.metadata?.estimated_cost);
  return Boolean(
    text(node.metadata?.approved_plan_hash) === text(subject.metadata?.plan_hash) &&
    text(node.metadata?.approved_graph_hash) === text(subject.metadata?.graph_hash) &&
    text(node.metadata?.approved_execution_hash) === text(subject.metadata?.execution_hash) &&
    text(node.metadata?.approved_dossier_hash) === text(subject.metadata?.dossier_hash) &&
    ceiling !== null && ceiling >= 0 &&
    estimated !== null && estimated <= ceiling
  );
}

function text(value) {
  return String(value ?? "").trim();
}

function newest(nodes = []) {
  return [...nodes].sort((left, right) =>
    Date.parse(right.updated_at || right.created_at || 0) -
    Date.parse(left.updated_at || left.created_at || 0),
  )[0] || null;
}

function currentReadinessForMaster(nodes, currentMaster) {
  if (!currentMaster?.id) return null;
  return newest(nodes.filter((node) =>
    node.type === CREATIVE_ASSET_NODE_TYPES.RELEASE_READINESS_REPORT &&
    node.metadata?.final_render_asset_node_id === currentMaster.id,
  ));
}

function currentPublishReleaseSubject(subject, nodes) {
  if (subject?.type !== CREATIVE_ASSET_NODE_TYPES.RELEASE_READINESS_REPORT) {
    return { current: false, master: null, readiness: null };
  }
  const master = currentCreativePrimaryMaster(nodes);
  if (!master?.id || !master.technical?.checksum) {
    return { current: false, master, readiness: null };
  }
  const readiness = currentReadinessForMaster(nodes, master);
  const current = Boolean(
    readiness?.id === subject.id &&
    subject.metadata?.passed === true &&
    subject.parent_asset_node_id === master.id &&
    subject.metadata?.final_render_asset_node_id === master.id,
  );
  return { current, master, readiness };
}

function currentPublishReleaseApproval(node, subject, master) {
  return Boolean(
    currentApproval(node, subject, "PUBLISH_RELEASE") &&
    master?.id &&
    master.technical?.checksum &&
    node.metadata?.approved_release_master_asset_node_id === master.id &&
    node.metadata?.approved_release_master_checksum === master.technical.checksum &&
    node.metadata?.approved_release_readiness_identity ===
      subject.metadata?.release_readiness_identity
  );
}

async function approveProductionDossierSubject({ subject, approval, ceiling }) {
  const approvedSubject = await AssetGraphRepository.update(subject.id, {
    status: CREATIVE_ASSET_NODE_STATUS.APPROVED,
    review: {
      ...(subject.review || {}),
      human_reviewed: true,
      approved: true,
      approved_by: approval.metadata?.approver_staff_account_id || null,
      notes: approval.review?.notes || "",
    },
    metadata: {
      ...(subject.metadata || {}),
      approved_plan_hash: subject.metadata?.plan_hash || null,
      approved_graph_hash: subject.metadata?.graph_hash || null,
      approved_execution_hash: subject.metadata?.execution_hash || null,
      approved_dossier_hash: subject.metadata?.dossier_hash || null,
      approved_cost_ceiling: ceiling,
      approval_record_asset_node_id: approval.id,
      approved_at: approval.metadata?.approved_at || new Date().toISOString(),
    },
  });

  const graphId = subject.metadata?.production_graph_id;
  if (!graphId) throw new Error("PRODUCTION_DOSSIER_GRAPH_ID_REQUIRED");
  const graph = await ProductionGraphRepository.getById(graphId);
  if (!graph || String(graph.organization_id) !== String(subject.organization_id)) {
    throw new Error("PRODUCTION_DOSSIER_GRAPH_NOT_FOUND");
  }
  await ProductionGraphRepository.update(graph.id, {
    status: "APPROVED",
    cost_plan: {
      ...(graph.cost_plan || {}),
      approved_cost: ceiling,
      approval_required: true,
      approved: true,
    },
    metadata: {
      ...(graph.metadata || {}),
      production_dossier_asset_node_id: subject.id,
      production_dossier_approval_record_asset_node_id: approval.id,
      production_dossier_hash: subject.metadata?.dossier_hash || null,
      approved_dossier_hash: subject.metadata?.dossier_hash || null,
      approved_plan_hash: subject.metadata?.plan_hash || null,
      approved_graph_hash: subject.metadata?.graph_hash || null,
      approved_execution_hash: subject.metadata?.execution_hash || null,
      approved_cost_ceiling: ceiling,
      production_dossier_human_approved: true,
      production_dossier_approved_at:
        approval.metadata?.approved_at || new Date().toISOString(),
    },
  });
  return approvedSubject;
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
      String(subject.organization_id) !== String(organization_id) ||
      !APPROVABLE_TYPES.has(subject.type)
    ) {
      return null;
    }

    const nodes = await AssetGraphRepository.listByProject({
      organization_id,
      creative_project_id: subject.creative_project_id,
    });
    if (scope === "PUBLISH_RELEASE") {
      const releaseState = currentPublishReleaseSubject(subject, nodes);
      if (!releaseState.current) return null;
      return newest(nodes.filter((node) =>
        currentPublishReleaseApproval(node, subject, releaseState.master),
      ));
    }
    return newest(nodes.filter((node) => currentApproval(node, subject, scope)));
  },

  async approve({
    organization_id,
    subject_asset_node_id,
    scope,
    approver,
    notes = "",
    approved_cost_ceiling = null,
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
      String(subject.organization_id) !== String(organization_id) ||
      !APPROVABLE_TYPES.has(subject.type)
    ) {
      throw new Error("Approvable creative subject not found");
    }

    const nodes = await AssetGraphRepository.listByProject({
      organization_id,
      creative_project_id: subject.creative_project_id,
    });
    let releaseBinding = null;
    if (scope === "PUBLISH_RELEASE") {
      const releaseState = currentPublishReleaseSubject(subject, nodes);
      if (!releaseState.current) {
        throw new Error("STALE_RELEASE_READINESS_MASTER_VERSION");
      }
      releaseBinding = {
        master_asset_node_id: releaseState.master.id,
        master_checksum: releaseState.master.technical.checksum,
        readiness_asset_node_id: subject.id,
        readiness_identity: subject.metadata?.release_readiness_identity || null,
      };
    }

    if (
      subject.type === CREATIVE_ASSET_NODE_TYPES.PRODUCTION_DOSSIER &&
      subject.metadata?.passed !== true
    ) {
      throw new Error("PRODUCTION_DOSSIER_NOT_PASSED");
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

    let ceiling = null;
    if (subject.type === CREATIVE_ASSET_NODE_TYPES.PRODUCTION_DOSSIER) {
      ceiling = finite(approved_cost_ceiling);
      const estimated = finite(subject.metadata?.estimated_cost);
      if (ceiling === null || ceiling < 0) {
        throw new Error("PRODUCTION_DOSSIER_APPROVED_COST_CEILING_REQUIRED");
      }
      if (estimated === null || estimated < 0) {
        throw new Error("PRODUCTION_DOSSIER_ESTIMATED_COST_INVALID");
      }
      if (ceiling < estimated) {
        throw new Error("PRODUCTION_DOSSIER_COST_CEILING_BELOW_ESTIMATE");
      }
      if (
        !text(subject.metadata?.dossier_hash) ||
        !text(subject.metadata?.plan_hash) ||
        !text(subject.metadata?.graph_hash) ||
        !text(subject.metadata?.execution_hash)
      ) {
        throw new Error("PRODUCTION_DOSSIER_IMMUTABLE_HASHES_REQUIRED");
      }
    }

    const approvalIdentity = identity(
      subject,
      scope,
      approver,
      ceiling,
      releaseBinding,
    );
    const existing = nodes.find((node) =>
      node.type === CREATIVE_ASSET_NODE_TYPES.APPROVAL_RECORD &&
      node.metadata?.approval_identity === approvalIdentity,
    );
    if (existing) return { approval: existing, reused: true };

    const approvedAt = new Date().toISOString();
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
        capability:
          subject.type === CREATIVE_ASSET_NODE_TYPES.PRODUCTION_DOSSIER
            ? "creative.production.dossier.approve"
            : "creative.release.approve",
        generation_version: scope === "PUBLISH_RELEASE" ? 2 : 1,
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
        approved_release_master_asset_node_id:
          releaseBinding?.master_asset_node_id || null,
        approved_release_master_checksum:
          releaseBinding?.master_checksum || null,
        approved_release_readiness_identity:
          releaseBinding?.readiness_identity || null,
        approved_dossier_hash:
          subject.type === CREATIVE_ASSET_NODE_TYPES.PRODUCTION_DOSSIER
            ? subject.metadata?.dossier_hash
            : null,
        approved_plan_hash:
          subject.type === CREATIVE_ASSET_NODE_TYPES.PRODUCTION_DOSSIER
            ? subject.metadata?.plan_hash
            : null,
        approved_graph_hash:
          subject.type === CREATIVE_ASSET_NODE_TYPES.PRODUCTION_DOSSIER
            ? subject.metadata?.graph_hash
            : null,
        approved_execution_hash:
          subject.type === CREATIVE_ASSET_NODE_TYPES.PRODUCTION_DOSSIER
            ? subject.metadata?.execution_hash
            : null,
        approved_cost_ceiling: ceiling,
        currency:
          subject.type === CREATIVE_ASSET_NODE_TYPES.PRODUCTION_DOSSIER
            ? subject.metadata?.currency || null
            : null,
        approver_user_id: approver.user_id,
        approver_staff_account_id: approver.staff_account_id,
        approver_email: approver.email || null,
        approved_at: approvedAt,
      },
      created_by: approver.user_id,
    });
    const storedApproval = await AssetGraphRepository.create(approval);

    let approvedSubject = subject;
    if (subject.type === CREATIVE_ASSET_NODE_TYPES.PRODUCTION_DOSSIER) {
      approvedSubject = await approveProductionDossierSubject({
        subject,
        approval: storedApproval,
        ceiling,
      });
    }

    return {
      approval: storedApproval,
      subject: approvedSubject,
      reused: false,
    };
  },
};
