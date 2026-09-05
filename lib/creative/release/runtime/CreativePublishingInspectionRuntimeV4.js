import {
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import {
  CreativePublishingInspectionRuntimeV3,
} from "@/lib/creative/release/runtime/CreativePublishingInspectionRuntimeV3";

const CONTRACT = "CREATIVE_PUBLISHING_INSPECTION_V6";
const MEDIA_IDENTITY_CONTRACT = "CREATIVE_PUBLICATION_REMOTE_MEDIA_IDENTITY_V1";

function newest(nodes, predicate) {
  return [...nodes]
    .filter(predicate)
    .sort((left, right) =>
      Date.parse(right.updated_at || right.created_at || 0) -
      Date.parse(left.updated_at || left.created_at || 0),
    )[0] || null;
}

function compactMediaIdentity(node) {
  if (!node) return null;
  return {
    id: node.id,
    status: node.status,
    contract: node.metadata?.contract || null,
    provider: node.metadata?.provider || node.lineage?.provider_id || null,
    channel: node.metadata?.channel || null,
    remote_media_object_id: node.metadata?.remote_media_object_id || null,
    remote_media_kind: node.metadata?.remote_media_kind || null,
    remote_representation_kind: node.metadata?.remote_representation_kind || null,
    media_identity_status: node.metadata?.media_identity_status || null,
    byte_identity_verified: node.metadata?.byte_identity_verified === true,
    perceptual_identity_verified:
      node.metadata?.perceptual_identity_verified === true,
    perceptual_match_detected:
      node.metadata?.perceptual_match_detected === true,
    visual_signature_method: node.metadata?.visual_signature_method || null,
    whole_video_matching: node.metadata?.whole_video_matching === true,
    matching_sequence_count: node.metadata?.matching_sequence_count || 0,
    maximum_matching_frames: node.metadata?.maximum_matching_frames || 0,
    analysis_seconds: node.metadata?.analysis_seconds || null,
    analysis_capped: node.metadata?.analysis_capped === true,
    source_duration_seconds: node.metadata?.source_duration_seconds || null,
    remote_duration_seconds: node.metadata?.remote_duration_seconds || null,
    source_dimensions: node.metadata?.source_dimensions || null,
    remote_dimensions: node.metadata?.remote_dimensions || null,
    audio_identity_status: node.metadata?.audio_identity_status || null,
    limitation: node.metadata?.limitation || null,
    observed_at: node.metadata?.observed_at || node.created_at || null,
  };
}

export const CreativePublishingInspectionRuntimeV4 = Object.freeze({
  contract: CONTRACT,

  async inspect({ organization_id, creative_project_id } = {}) {
    const publishing = await CreativePublishingInspectionRuntimeV3.inspect({
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
      const mediaIdentityEvidence = commandId
        ? newest(nodes, (node) =>
            node.type === CREATIVE_ASSET_NODE_TYPES.PUBLICATION_EVIDENCE &&
            node.metadata?.contract === MEDIA_IDENTITY_CONTRACT &&
            node.metadata?.observation_kind === "PUBLICATION_REMOTE_MEDIA_IDENTITY" &&
            node.metadata?.publish_command_asset_node_id === commandId &&
            (!executionId || node.parent_asset_node_id === executionId),
          )
        : null;
      const mediaIdentityStatus =
        mediaIdentityEvidence?.metadata?.media_identity_status ||
        target.command?.publication_remote_media_identity_status ||
        "NOT_CHECKED";
      const mediaMismatchDetected = mediaIdentityStatus === "MISMATCHED";
      const contentDriftDetected = target.content_drift_detected === true || mediaMismatchDetected;
      const state = target.was_published && target.current_live === true && mediaMismatchDetected
        ? "PUBLISHED_MEDIA_MISMATCH"
        : target.state;

      return {
        ...target,
        state,
        content_drift_detected: contentDriftDetected,
        media_mismatch_detected: mediaMismatchDetected,
        remote_media_identity_status: mediaIdentityStatus,
        remote_media_byte_identity_verified:
          mediaIdentityEvidence?.metadata?.byte_identity_verified === true,
        remote_media_perceptual_identity_verified:
          mediaIdentityEvidence?.metadata?.perceptual_identity_verified === true,
        remote_media_perceptual_match_detected:
          mediaIdentityEvidence?.metadata?.perceptual_match_detected === true,
        can_recheck_remote_media_identity: Boolean(
          commandId &&
          executionId &&
          target.was_published &&
          target.current_live === true,
        ),
        publication_remote_media_identity: compactMediaIdentity(mediaIdentityEvidence),
      };
    });

    const mediaMatchedCount = targets.filter((target) =>
      ["MATCHED_BYTES", "MATCHED_FULL"].includes(target.remote_media_identity_status),
    ).length;
    const mediaPartialCount = targets.filter((target) =>
      target.remote_media_identity_status === "MATCHED_PARTIAL",
    ).length;
    const mediaMismatchCount = targets.filter((target) =>
      target.remote_media_identity_status === "MISMATCHED",
    ).length;
    const mediaReferenceOnlyCount = targets.filter((target) =>
      target.remote_media_identity_status === "REMOTE_MEDIA_REFERENCE_ONLY",
    ).length;
    const mediaUnverifiableCount = targets.filter((target) =>
      [
        "NOT_CHECKED",
        "UNVERIFIABLE",
        "REMOTE_STATE_UNVERIFIABLE",
        "UNSUPPORTED_MEDIA_KIND_V1",
      ].includes(target.remote_media_identity_status),
    ).length;

    return {
      ...publishing,
      contract: CONTRACT,
      targets,
      summary: {
        ...(publishing.summary || {}),
        remote_media_matched_count: mediaMatchedCount,
        remote_media_partial_count: mediaPartialCount,
        remote_media_mismatch_count: mediaMismatchCount,
        remote_media_reference_only_count: mediaReferenceOnlyCount,
        remote_media_unverifiable_count: mediaUnverifiableCount,
        content_drift_count: targets.filter((target) =>
          target.content_drift_detected,
        ).length,
      },
    };
  },
});
