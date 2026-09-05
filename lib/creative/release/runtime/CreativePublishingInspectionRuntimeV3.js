import {
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import {
  CreativePublishingInspectionRuntimeV2,
} from "@/lib/creative/release/runtime/CreativePublishingInspectionRuntimeV2";

const CONTRACT = "CREATIVE_PUBLISHING_INSPECTION_V5";
const LIFECYCLE_CONTRACT = "CREATIVE_PUBLICATION_LIFECYCLE_V1";
const CONTENT_INTEGRITY_CONTRACT = "CREATIVE_PUBLICATION_CONTENT_INTEGRITY_V1";

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
    contract: node.metadata?.contract || null,
    provider: node.metadata?.provider || node.lineage?.provider_id || null,
    channel: node.metadata?.channel || null,
    external_publication_id: node.metadata?.external_publication_id || null,
    remote_state: node.metadata?.remote_state || null,
    remote_url: node.metadata?.remote_url || null,
    remote_verified: node.metadata?.remote_verified === true,
    published: node.metadata?.published === true,
    current_live: node.metadata?.current_live ?? null,
    current_truth: node.metadata?.current_truth || null,
    retryable: node.metadata?.retryable === true,
    definitive_missing: node.metadata?.definitive_missing === true,
    reason: node.metadata?.reason || null,
    content_integrity_status: node.metadata?.content_integrity_status || null,
    content_drift_detected: node.metadata?.content_drift_detected === true,
    text_integrity_status: node.metadata?.text_integrity_status || null,
    media_integrity_status: node.metadata?.media_integrity_status || null,
    byte_identity_verified: node.metadata?.byte_identity_verified === true,
    limitations: Array.isArray(node.metadata?.limitations)
      ? node.metadata.limitations
      : [],
    observed_at: node.metadata?.observed_at || node.created_at || null,
    verified_by_staff_account_id:
      node.metadata?.verified_by_staff_account_id ||
      node.metadata?.checked_by_staff_account_id ||
      null,
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
      const lifecycleEvidence = commandId
        ? newest(nodes, (node) =>
            node.type === CREATIVE_ASSET_NODE_TYPES.PUBLICATION_EVIDENCE &&
            node.metadata?.contract === LIFECYCLE_CONTRACT &&
            node.metadata?.observation_kind === "POST_PUBLICATION_LIFECYCLE" &&
            node.metadata?.publish_command_asset_node_id === commandId &&
            (!executionId || node.parent_asset_node_id === executionId),
          )
        : null;
      const integrityEvidence = commandId
        ? newest(nodes, (node) =>
            node.type === CREATIVE_ASSET_NODE_TYPES.PUBLICATION_EVIDENCE &&
            node.metadata?.contract === CONTENT_INTEGRITY_CONTRACT &&
            node.metadata?.observation_kind === "PUBLICATION_CONTENT_INTEGRITY" &&
            node.metadata?.publish_command_asset_node_id === commandId &&
            (!executionId || node.parent_asset_node_id === executionId),
          )
        : null;
      const remoteAcknowledged = acknowledged(target);
      const wasPublished = Boolean(verifiedEvidence);
      const currentLive = lifecycleEvidence
        ? lifecycleEvidence.metadata?.current_live ?? null
        : wasPublished
          ? true
          : null;
      const currentTruth = lifecycleEvidence?.metadata?.current_truth ||
        (wasPublished ? "LIVE_LAST_VERIFIED" : "NOT_PUBLISHED");
      const contentIntegrityStatus = integrityEvidence?.metadata?.content_integrity_status ||
        (wasPublished ? "NOT_RECHECKED" : "NOT_APPLICABLE");
      const contentDriftDetected = integrityEvidence?.metadata?.content_drift_detected === true;
      const rawState = text(
        target.execution?.execution_status || target.command?.execution_status,
      ).toUpperCase();
      const state = wasPublished
        ? currentLive === false
          ? "NO_LONGER_LIVE"
          : currentLive === null
            ? "PUBLISHED_UNVERIFIABLE"
            : contentDriftDetected
              ? "PUBLISHED_CONTENT_DRIFT"
              : "PUBLISHED"
        : rawState === "COMPLETED"
          ? "REMOTE_ACKNOWLEDGED_LEGACY"
          : rawState || target.state;

      return {
        ...target,
        state,
        completed: wasPublished,
        published: wasPublished,
        was_published: wasPublished,
        current_live: currentLive,
        current_truth: currentTruth,
        content_integrity_status: contentIntegrityStatus,
        content_drift_detected: contentDriftDetected,
        text_integrity_status:
          integrityEvidence?.metadata?.text_integrity_status || null,
        media_integrity_status:
          integrityEvidence?.metadata?.media_integrity_status || null,
        byte_identity_verified:
          integrityEvidence?.metadata?.byte_identity_verified === true,
        remote_acknowledged: remoteAcknowledged || wasPublished,
        remote_verified: wasPublished,
        can_verify: Boolean(
          commandId &&
          (remoteAcknowledged || state === "REMOTE_VERIFICATION_REQUIRED") &&
          !wasPublished,
        ),
        can_revalidate_lifecycle: Boolean(commandId && executionId && wasPublished),
        can_recheck_content_integrity: Boolean(commandId && executionId && wasPublished),
        publication_evidence: compactEvidence(verifiedEvidence || latestEvidence),
        publication_lifecycle: compactEvidence(lifecycleEvidence),
        publication_content_integrity: compactEvidence(integrityEvidence),
        external_publication_url:
          lifecycleEvidence?.metadata?.remote_url ||
          verifiedEvidence?.metadata?.remote_url ||
          null,
        provider_receipt_url:
          target.execution?.external_publication_url ||
          target.command?.external_publication_url ||
          target.command?.publish_target?.provider_receipt_url ||
          null,
      };
    });

    const publishedCount = targets.filter((target) => target.was_published).length;
    const liveNowCount = targets.filter((target) => target.current_live === true).length;
    const noLongerLiveCount = targets.filter((target) => target.current_live === false).length;
    const unverifiableCount = targets.filter((target) =>
      target.was_published && target.current_live === null,
    ).length;
    const contentDriftCount = targets.filter((target) => target.content_drift_detected).length;
    const contentPartialCount = targets.filter((target) =>
      target.content_integrity_status === "PARTIAL",
    ).length;
    const contentMatchedCount = targets.filter((target) =>
      target.content_integrity_status === "MATCHED",
    ).length;
    const contentUnverifiableCount = targets.filter((target) =>
      ["UNVERIFIABLE", "UNVERIFIABLE_BASELINE"].includes(target.content_integrity_status),
    ).length;
    const acknowledgedCount = targets.filter((target) =>
      target.remote_acknowledged && !target.was_published,
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
        live_now_count: liveNowCount,
        no_longer_live_count: noLongerLiveCount,
        unverifiable_count: unverifiableCount,
        content_matched_count: contentMatchedCount,
        content_drift_count: contentDriftCount,
        content_partial_count: contentPartialCount,
        content_unverifiable_count: contentUnverifiableCount,
        acknowledged_count: acknowledgedCount,
        verification_required_count: acknowledgedCount,
        pending_count: pendingCount,
        failed_count: failedCount,
      },
    };
  },
});
