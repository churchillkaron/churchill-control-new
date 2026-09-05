import {
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import {
  CreativePublishingInspectionRuntimeV2,
} from "@/lib/creative/release/runtime/CreativePublishingInspectionRuntimeV2";

const CONTRACT = "CREATIVE_PUBLISHING_INSPECTION_V3";

function text(value) {
  return String(value ?? "").trim();
}

function newest(nodes, predicate) {
  return [...nodes]
    .filter(predicate)
    .sort((left, right) =>
      Date.parse(right.updated_at || right.created_at || 0) -
      Date.parse(left.updated_at || left.created_at || 0),
    )[0] || null;
}

function compactEvidence(node) {
  if (!node) return null;
  return {
    id: node.id,
    status: node.status,
    provider: node.metadata?.provider || node.lineage?.provider_id || null,
    channel: node.metadata?.channel || null,
    external_publication_id: node.metadata?.external_publication_id || null,
    remote_state: node.metadata?.remote_state || null,
    remote_url: node.metadata?.remote_url || null,
    remote_verified: node.metadata?.remote_verified === true,
    published: node.metadata?.published === true,
    observed_at: node.metadata?.observed_at || node.created_at || null,
    verified_by_staff_account_id:
      node.metadata?.verified_by_staff_account_id || null,
  };
}

function acknowledged(target) {
  const state = text(target.execution?.execution_status || target.command?.execution_status).toUpperCase();
  return Boolean(
    target.external_publication_id &&
    [
      "COMPLETED",
      "REMOTE_ACKNOWLEDGED",
      "REMOTE_ACKNOWLEDGED_LEGACY",
      "REMOTE_VERIFICATION_REQUIRED",
      "PUBLISHED",
    ].includes(state),
  );
}

export const CreativePublishingInspectionRuntimeV3 = Object.freeze({
  contract: CONTRACT,

  async inspect({ organization_id, creative_project_id } = {}) {
    const publishing = await CreativePublishingInspectionRuntimeV2.inspect({
      organization_id,
      creative_project_id,
    });
    const nodes = await AssetGraphRepository.listByProject({
      organization_id,
      creative_project_id,
    });

    const targets = (publishing.targets || []).map((target) => {
      const commandId = target.command?.id || null;
      const executionId = target.execution?.id ||
        target.command?.publish_execution_asset_node_id ||
        null;
      const latestEvidence = commandId
        ? newest(nodes, (node) =>
            node.type === CREATIVE_ASSET_NODE_TYPES.PUBLICATION_EVIDENCE &&
            node.metadata?.publish_command_asset_node_id === commandId &&
            (!executionId || node.parent_asset_node_id === executionId),
          )
        : null;
      const verifiedEvidence = commandId
        ? newest(nodes, (node) =>
            node.type === CREATIVE_ASSET_NODE_TYPES.PUBLICATION_EVIDENCE &&
            node.status === CREATIVE_ASSET_NODE_STATUS.APPROVED &&
            node.metadata?.publish_command_asset_node_id === commandId &&
            (!executionId || node.parent_asset_node_id === executionId) &&
            node.metadata?.remote_verified === true &&
            node.metadata?.published === true,
          )
        : null;
      const remoteAcknowledged = acknowledged(target);
      const published = Boolean(verifiedEvidence);
      const rawState = text(
        target.execution?.execution_status || target.command?.execution_status,
      ).toUpperCase();
      const state = published
        ? "PUBLISHED"
        : rawState === "COMPLETED"
          ? "REMOTE_ACKNOWLEDGED_LEGACY"
          : rawState || target.state;

      return {
        ...target,
        state,
        completed: published,
        published,
        remote_acknowledged: remoteAcknowledged || published,
        remote_verified: published,
        can_verify: Boolean(
          commandId &&
          (remoteAcknowledged || state === "REMOTE_VERIFICATION_REQUIRED") &&
          !published,
        ),
        publication_evidence: compactEvidence(verifiedEvidence || latestEvidence),
        external_publication_url:
          verifiedEvidence?.metadata?.remote_url || null,
        provider_receipt_url:
          target.execution?.external_publication_url ||
          target.command?.external_publication_url ||
          target.command?.publish_target?.provider_receipt_url ||
          null,
      };
    });

    const publishedCount = targets.filter((target) => target.published).length;
    const acknowledgedCount = targets.filter((target) =>
      target.remote_acknowledged && !target.published,
    ).length;
    const pendingCount = targets.filter((target) =>
      ["PENDING_CONNECTOR", "DISPATCHING", "PENDING_PROVIDER"].includes(
        text(target.state).toUpperCase(),
      ),
    ).length;
    const failedCount = targets.filter((target) =>
      ["FAILED", "EVIDENCE_REQUIRED"].includes(text(target.state).toUpperCase()) ||
      target.configuration_valid === false ||
      target.channel_delivery?.passed === false,
    ).length;

    return {
      ...publishing,
      contract: CONTRACT,
      targets,
      summary: {
        ...(publishing.summary || {}),
        completed_count: publishedCount,
        published_count: publishedCount,
        acknowledged_count: acknowledgedCount,
        verification_required_count: acknowledgedCount,
        pending_count: pendingCount,
        failed_count: failedCount,
      },
    };
  },
});
