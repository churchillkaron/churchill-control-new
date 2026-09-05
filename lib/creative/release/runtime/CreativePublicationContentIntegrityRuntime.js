import crypto from "node:crypto";

import {
  createCreativeAssetNode,
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import {
  CreativePublicationLifecycleRuntime,
} from "@/lib/creative/release/runtime/CreativePublicationLifecycleRuntime";

const CONTRACT = "CREATIVE_PUBLICATION_CONTENT_INTEGRITY_V1";
const LIFECYCLE_CONTRACT = "CREATIVE_PUBLICATION_LIFECYCLE_V1";

function text(value) {
  return String(value ?? "").trim();
}

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function newest(nodes, predicate) {
  return [...nodes]
    .filter(predicate)
    .sort((left, right) =>
      Date.parse(right.updated_at || right.created_at || 0) -
      Date.parse(left.updated_at || left.created_at || 0),
    )[0] || null;
}

function currentExecution(nodes, command) {
  const exact = command.metadata?.publish_execution_asset_node_id
    ? nodes.find((node) =>
        node.id === command.metadata.publish_execution_asset_node_id &&
        node.type === CREATIVE_ASSET_NODE_TYPES.PUBLISH_EXECUTION,
      )
    : null;
  return exact || newest(nodes, (node) =>
    node.type === CREATIVE_ASSET_NODE_TYPES.PUBLISH_EXECUTION &&
    node.metadata?.publish_command_asset_node_id === command.id,
  );
}

function historicalPublicationEvidence(nodes, commandId, executionId) {
  return newest(nodes, (node) =>
    node.type === CREATIVE_ASSET_NODE_TYPES.PUBLICATION_EVIDENCE &&
    node.metadata?.publish_command_asset_node_id === commandId &&
    (!executionId || node.parent_asset_node_id === executionId) &&
    node.metadata?.remote_verified === true &&
    node.metadata?.published === true,
  );
}

function latestLifecycleEvidence(nodes, commandId, executionId) {
  return newest(nodes, (node) =>
    node.type === CREATIVE_ASSET_NODE_TYPES.PUBLICATION_EVIDENCE &&
    node.metadata?.contract === LIFECYCLE_CONTRACT &&
    node.metadata?.observation_kind === "POST_PUBLICATION_LIFECYCLE" &&
    node.metadata?.publish_command_asset_node_id === commandId &&
    (!executionId || node.parent_asset_node_id === executionId),
  );
}

function latestIntegrityEvidence(nodes, commandId, executionId) {
  return newest(nodes, (node) =>
    node.type === CREATIVE_ASSET_NODE_TYPES.PUBLICATION_EVIDENCE &&
    node.metadata?.contract === CONTRACT &&
    node.metadata?.observation_kind === "PUBLICATION_CONTENT_INTEGRITY" &&
    node.metadata?.publish_command_asset_node_id === commandId &&
    (!executionId || node.parent_asset_node_id === executionId),
  );
}

function remoteTextDigest(lifecycle) {
  const snapshot = lifecycle?.metadata?.remote_snapshot || {};
  return text(
    snapshot.caption_digest ||
    snapshot.message_digest ||
    snapshot.commentary_digest ||
    snapshot.summary_digest,
  ) || null;
}

function textIntegrity(command, lifecycle) {
  const approvedDigest = text(
    command.metadata?.approved_publication_text_digest ||
    command.metadata?.publication_content_binding?.approved_text_digest,
  ) || null;
  const approvedLength = Number(
    command.metadata?.approved_publication_text_length ??
    command.metadata?.publication_content_binding?.approved_text_length,
  );
  const remoteDigest = remoteTextDigest(lifecycle);

  if (!approvedDigest || !Number.isFinite(approvedLength)) {
    return {
      status: "UNVERIFIABLE_BASELINE",
      approved_digest: approvedDigest,
      remote_digest: remoteDigest,
      reason: "Publish command predates immutable publication-content binding.",
    };
  }
  if (lifecycle?.metadata?.current_live !== true) {
    return {
      status: "NOT_LIVE",
      approved_digest: approvedDigest,
      remote_digest: remoteDigest,
      reason: "Exact text cannot be certified while the publication is not confirmed live.",
    };
  }
  if (!remoteDigest) {
    if (approvedLength === 0) {
      return {
        status: "MATCHED",
        approved_digest: approvedDigest,
        remote_digest: digest(""),
        reason: null,
      };
    }
    return {
      status: "UNVERIFIABLE",
      approved_digest: approvedDigest,
      remote_digest: null,
      reason: "Provider read-back did not expose the live publication text field.",
    };
  }
  return {
    status: remoteDigest === approvedDigest ? "MATCHED" : "DRIFTED",
    approved_digest: approvedDigest,
    remote_digest: remoteDigest,
    reason: remoteDigest === approvedDigest
      ? null
      : "Live publication text no longer matches the immutable approved command text.",
  };
}

function mediaIntegrity(command, lifecycle) {
  const derivativeChecksum = text(command.metadata?.certified_derivative_checksum) || null;
  const derivativeId = text(command.metadata?.final_render_asset_node_id) || null;
  const binding = command.metadata?.publication_content_binding || {};
  if (!derivativeChecksum || !derivativeId) {
    return {
      status: "UNVERIFIABLE_BASELINE",
      derivative_checksum: derivativeChecksum,
      derivative_render_asset_node_id: derivativeId,
      byte_identity_verified: false,
      reason: "Certified derivative identity is unavailable.",
    };
  }
  if (lifecycle?.metadata?.current_live !== true) {
    return {
      status: "NOT_LIVE",
      derivative_checksum: derivativeChecksum,
      derivative_render_asset_node_id: derivativeId,
      byte_identity_verified: false,
      reason: "Remote media cannot be certified while the publication is not confirmed live.",
    };
  }

  return {
    status: "SOURCE_BOUND_REMOTE_BYTES_UNVERIFIABLE",
    derivative_checksum: derivativeChecksum,
    derivative_render_asset_node_id: derivativeId,
    derivative_profile_id:
      command.metadata?.certified_derivative_profile_id ||
      binding.derivative_profile_id ||
      null,
    approved_media_reference_identity: binding.media_reference_identity || null,
    byte_identity_verified: false,
    reason: "Avantiqo proves the exact approved derivative checksum; this provider read-back does not expose a cryptographic checksum for the remote CDN media bytes.",
  };
}

function overallIntegrity({ command, lifecycle }) {
  if (!lifecycle) {
    return {
      status: "UNVERIFIABLE",
      drift_detected: false,
      text: textIntegrity(command, null),
      media: mediaIntegrity(command, null),
      limitations: ["POST_PUBLICATION_LIFECYCLE_EVIDENCE_REQUIRED"],
    };
  }
  if (lifecycle.metadata?.current_live === false) {
    return {
      status: "NOT_LIVE",
      drift_detected: false,
      text: textIntegrity(command, lifecycle),
      media: mediaIntegrity(command, lifecycle),
      limitations: [],
    };
  }
  if (lifecycle.metadata?.current_live !== true) {
    return {
      status: "UNVERIFIABLE",
      drift_detected: false,
      text: textIntegrity(command, lifecycle),
      media: mediaIntegrity(command, lifecycle),
      limitations: ["REMOTE_PUBLICATION_CURRENT_STATE_UNVERIFIABLE"],
    };
  }

  const textResult = textIntegrity(command, lifecycle);
  const mediaResult = mediaIntegrity(command, lifecycle);
  const providerEdited = text(lifecycle.metadata?.remote_state).toUpperCase() === "PUBLISHED_EDITED";
  const driftDetected = textResult.status === "DRIFTED" || providerEdited;
  const baselineMissing = textResult.status === "UNVERIFIABLE_BASELINE";
  const textUnverifiable = ["UNVERIFIABLE", "UNVERIFIABLE_BASELINE"].includes(textResult.status);

  return {
    status: driftDetected
      ? "DRIFTED"
      : baselineMissing
        ? "UNVERIFIABLE_BASELINE"
        : textUnverifiable
          ? "UNVERIFIABLE"
          : mediaResult.byte_identity_verified === true
            ? "MATCHED"
            : "PARTIAL",
    drift_detected: driftDetected,
    text: textResult,
    media: mediaResult,
    provider_edit_state_detected: providerEdited,
    limitations: mediaResult.byte_identity_verified === true
      ? []
      : ["REMOTE_MEDIA_BYTE_CHECKSUM_NOT_EXPOSED_BY_PROVIDER"],
  };
}

function integrityIdentity({ command, execution, lifecycle, result, observedAt }) {
  return digest({
    contract: CONTRACT,
    publish_command_asset_node_id: command.id,
    publish_command_identity: command.metadata?.publish_command_identity || null,
    publication_content_binding_identity:
      command.metadata?.publication_content_binding_identity || null,
    publish_execution_asset_node_id: execution.id,
    publish_execution_identity: execution.metadata?.publish_execution_identity || null,
    lifecycle_evidence_asset_node_id: lifecycle?.id || null,
    lifecycle_evidence_identity:
      lifecycle?.metadata?.publication_lifecycle_evidence_identity || null,
    content_integrity_status: result.status,
    approved_text_digest: result.text.approved_digest || null,
    remote_text_digest: result.text.remote_digest || null,
    text_integrity_status: result.text.status,
    media_integrity_status: result.media.status,
    derivative_checksum: result.media.derivative_checksum || null,
    observed_at: observedAt,
  });
}

function currentPatch(existing, result, evidenceId, observedAt) {
  return {
    ...(existing || {}),
    publication_content_integrity_contract: CONTRACT,
    publication_content_integrity_status: result.status,
    publication_content_drift_detected: result.drift_detected === true,
    publication_text_integrity_status: result.text.status,
    publication_media_integrity_status: result.media.status,
    publication_content_integrity_evidence_asset_node_id: evidenceId,
    last_content_integrity_checked_at: observedAt,
    ...(result.drift_detected === true && !existing?.first_content_drift_observed_at
      ? { first_content_drift_observed_at: observedAt }
      : {}),
  };
}

async function loadContext({ organization_id, publish_command_asset_node_id }) {
  if (!organization_id) throw new Error("organization_id required");
  if (!publish_command_asset_node_id) throw new Error("publish_command_asset_node_id required");
  const command = await AssetGraphRepository.getById(publish_command_asset_node_id);
  if (
    !command ||
    text(command.organization_id) !== text(organization_id) ||
    command.type !== CREATIVE_ASSET_NODE_TYPES.PUBLISH_COMMAND
  ) {
    throw new Error("PUBLISH_COMMAND_REQUIRED");
  }
  const nodes = await AssetGraphRepository.listByProject({
    organization_id,
    creative_project_id: command.creative_project_id,
  });
  const execution = currentExecution(nodes, command);
  if (!execution) throw new Error("PUBLISH_EXECUTION_REQUIRED");
  const historical = historicalPublicationEvidence(nodes, command.id, execution.id);
  if (!historical) throw new Error("VERIFIED_PUBLICATION_HISTORY_REQUIRED");
  return { command, nodes, execution, historical };
}

export const CreativePublicationContentIntegrityRuntime = Object.freeze({
  contract: CONTRACT,

  async inspect({ organization_id, publish_command_asset_node_id } = {}) {
    const context = await loadContext({ organization_id, publish_command_asset_node_id });
    const lifecycle = latestLifecycleEvidence(
      context.nodes,
      context.command.id,
      context.execution.id,
    );
    const latest = latestIntegrityEvidence(
      context.nodes,
      context.command.id,
      context.execution.id,
    );
    const evaluated = overallIntegrity({ command: context.command, lifecycle });
    return {
      contract: CONTRACT,
      command_id: context.command.id,
      execution_id: context.execution.id,
      historical_publication_evidence_id: context.historical.id,
      lifecycle_evidence_id: lifecycle?.id || null,
      latest_integrity_evidence: latest,
      status: latest?.metadata?.content_integrity_status || evaluated.status,
      drift_detected:
        latest?.metadata?.content_drift_detected === true || evaluated.drift_detected,
      text_integrity_status:
        latest?.metadata?.text_integrity_status || evaluated.text.status,
      media_integrity_status:
        latest?.metadata?.media_integrity_status || evaluated.media.status,
      can_recheck: true,
    };
  },

  async recheck({
    organization_id,
    publish_command_asset_node_id,
    checked_by,
  } = {}) {
    if (!checked_by?.user_id || !checked_by?.staff_account_id) {
      throw new Error("AUTHENTICATED_PUBLICATION_CONTENT_CHECKER_REQUIRED");
    }

    await CreativePublicationLifecycleRuntime.revalidate({
      organization_id,
      publish_command_asset_node_id,
      checked_by,
    });
    const context = await loadContext({ organization_id, publish_command_asset_node_id });
    const lifecycle = latestLifecycleEvidence(
      context.nodes,
      context.command.id,
      context.execution.id,
    );
    const result = overallIntegrity({ command: context.command, lifecycle });
    const observedAt = new Date().toISOString();
    const evidenceIdentity = integrityIdentity({
      command: context.command,
      execution: context.execution,
      lifecycle,
      result,
      observedAt,
    });

    const evidence = createCreativeAssetNode({
      organization_id,
      creative_project_id: context.command.creative_project_id,
      parent_asset_node_id: context.execution.id,
      type: CREATIVE_ASSET_NODE_TYPES.PUBLICATION_EVIDENCE,
      status: CREATIVE_ASSET_NODE_STATUS.REVIEW,
      name: `${context.command.name || "Publication"} content integrity`,
      description: result.status === "DRIFTED"
        ? "Remote content drift was detected against the immutable approved publication-content binding."
        : result.status === "PARTIAL"
          ? "Live publication text matches the approved command; remote media bytes remain outside provider checksum visibility."
          : "Post-publication content integrity observation. Historical publication evidence remains immutable.",
      lineage: {
        source: "post_publication_content_integrity",
        provider_id: lifecycle?.metadata?.provider || null,
        capability: "creative.release.publish.content-integrity",
        generation_version: 1,
      },
      intelligence: {
        safety_status: result.status === "DRIFTED" ? "REVIEW_REQUIRED" : "UNKNOWN",
        tags: ["publication", "content-integrity", "drift", "immutable-evidence"],
      },
      reuse: { reusable: false, approved_for_reuse: false },
      review: {
        ai_reviewed: false,
        human_reviewed: true,
        approved: false,
        approved_by: null,
        notes: "Evidence observation only. It does not alter publication history or release approval.",
      },
      metadata: {
        contract: CONTRACT,
        observation_kind: "PUBLICATION_CONTENT_INTEGRITY",
        publication_content_integrity_identity: evidenceIdentity,
        historical_publication_evidence_asset_node_id: context.historical.id,
        lifecycle_evidence_asset_node_id: lifecycle?.id || null,
        publish_command_asset_node_id: context.command.id,
        publish_command_identity: context.command.metadata?.publish_command_identity || null,
        publication_content_binding_identity:
          context.command.metadata?.publication_content_binding_identity || null,
        publish_execution_asset_node_id: context.execution.id,
        publish_execution_identity:
          context.execution.metadata?.publish_execution_identity || null,
        release_master_asset_node_id:
          context.command.metadata?.release_master_asset_node_id || null,
        release_master_checksum:
          context.command.metadata?.release_master_checksum || null,
        derivative_render_asset_node_id:
          context.command.metadata?.final_render_asset_node_id || null,
        derivative_checksum:
          context.command.metadata?.certified_derivative_checksum || null,
        external_publication_id:
          context.execution.metadata?.external_publication_id ||
          context.command.metadata?.external_publication_id ||
          null,
        content_integrity_status: result.status,
        content_drift_detected: result.drift_detected === true,
        provider_edit_state_detected: result.provider_edit_state_detected === true,
        text_integrity_status: result.text.status,
        approved_text_digest: result.text.approved_digest || null,
        remote_text_digest: result.text.remote_digest || null,
        text_integrity_reason: result.text.reason || null,
        media_integrity_status: result.media.status,
        byte_identity_verified: result.media.byte_identity_verified === true,
        approved_derivative_checksum: result.media.derivative_checksum || null,
        approved_media_reference_identity:
          result.media.approved_media_reference_identity || null,
        media_integrity_reason: result.media.reason || null,
        limitations: result.limitations,
        observed_at: observedAt,
        checked_by_user_id: checked_by.user_id,
        checked_by_staff_account_id: checked_by.staff_account_id,
        not_release_approval: true,
      },
      created_by: checked_by.user_id,
    });
    const stored = await AssetGraphRepository.create(evidence);

    await AssetGraphRepository.update(context.execution.id, {
      metadata: currentPatch(
        context.execution.metadata,
        result,
        stored.id,
        observedAt,
      ),
    });
    await AssetGraphRepository.update(context.command.id, {
      metadata: currentPatch(
        context.command.metadata,
        result,
        stored.id,
        observedAt,
      ),
    });

    return {
      contract: CONTRACT,
      evidence: stored,
      status: result.status,
      drift_detected: result.drift_detected === true,
      text_integrity_status: result.text.status,
      media_integrity_status: result.media.status,
      byte_identity_verified: result.media.byte_identity_verified === true,
      limitations: result.limitations,
    };
  },
});

export const CREATIVE_PUBLICATION_CONTENT_INTEGRITY_CONTRACT = CONTRACT;
