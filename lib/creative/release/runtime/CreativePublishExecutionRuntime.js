import crypto from "node:crypto";

import {
  signCreativeStorageReference,
} from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";
import {
  createCreativeAssetNode,
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

const SERVICE_BY_CHANNEL = {
  facebook: "facebook",
  instagram: "instagram",
  google_business: "google-business",
  "google-business": "google-business",
};

function text(value) {
  return String(value || "").trim();
}

function executionIdentity(command) {
  return crypto.createHash("sha256").update(JSON.stringify({
    command_id: command.id,
    command_identity: command.metadata?.publish_command_identity || null,
  })).digest("hex");
}

function mediaKind(render = {}) {
  const mime = text(render.technical?.mime_type).toLowerCase();
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  return null;
}

function accepts(target, kind) {
  if (!kind) return false;
  const declared = text(target.media_kind).toLowerCase();
  if (declared && declared !== kind) return false;
  if (target[`supports_${kind}`] === false) return false;
  if (target[`supports_${kind}`] === true) return true;
  return kind === "image";
}

function serviceId(target = {}) {
  return text(target.service_id) ||
    SERVICE_BY_CHANNEL[text(target.channel).toLowerCase()] ||
    null;
}

function providerId(target = {}) {
  return text(target.provider_id || target.provider || target.connector) || null;
}

async function providerPayload(target, render, organizationId, idempotencyKey) {
  const kind = mediaKind(render);
  const payload = {
    message:
      target.metadata?.message ||
      target.metadata?.caption ||
      target.metadata?.text ||
      "",
    page_id: target.page_id || null,
    instagram_business_id: target.instagram_business_id || null,
    author_urn: target.author_urn || null,
    location_id: target.location_id || null,
    account_id: target.account_id || null,
    idempotency_key: idempotencyKey,
    quantity: 1,
  };

  const deliveryUrl = await signCreativeStorageReference({
    organization_id: organizationId,
    reference: render.url,
  });
  if (kind === "image") payload.image_url = deliveryUrl;
  if (kind === "video") payload.video_url = deliveryUrl;
  if (kind === "audio") payload.audio_url = deliveryUrl;
  return payload;
}

function externalEvidence(result = {}) {
  const output = result.output?.output || result.output || {};
  return {
    external_publication_id:
      output.id ||
      output.post_id ||
      output.publication_id ||
      output.media_id ||
      output.name ||
      null,
    external_publication_url:
      output.permalink || output.permalink_url || output.url || output.publication_url || null,
    provider_job_id:
      result.provider_job_id || output.job_id || output.task_id || null,
    provider_status: result.provider_status || output.status || output.state || null,
  };
}

function hasRemoteAcknowledgement(evidence = {}) {
  return Boolean(text(evidence.external_publication_id));
}

async function updateCommand(command, patch) {
  return AssetGraphRepository.update(command.id, {
    metadata: {
      ...(command.metadata || {}),
      ...patch,
    },
  });
}

async function normalizeLegacyCompleted(command, execution) {
  const metadata = execution.metadata || {};
  const acknowledged = hasRemoteAcknowledgement(metadata);
  const executionStatus = acknowledged
    ? "REMOTE_ACKNOWLEDGED"
    : "EVIDENCE_REQUIRED";
  const normalized = await AssetGraphRepository.update(execution.id, {
    status: CREATIVE_ASSET_NODE_STATUS.REVIEW,
    description: acknowledged
      ? "Legacy connector completion normalized to remote acknowledgement; exact remote publication still requires read-back verification."
      : "Legacy connector completion lacks an exact remote publication identifier and cannot be treated as published.",
    metadata: {
      ...metadata,
      execution_status: executionStatus,
      legacy_completed_normalized: true,
      remote_verified: false,
      remote_verified_at: null,
    },
  });
  await updateCommand(command, {
    execution_status: executionStatus,
    publish_execution_asset_node_id: normalized.id,
    remote_verified: false,
    remote_verified_at: null,
  });
  return normalized;
}

async function settleExisting({
  organization_id,
  command,
  execution,
  executed_by,
}) {
  const metadata = execution.metadata || {};
  if (metadata.execution_status === "PUBLISHED") {
    return { execution, reused: true, settled: true };
  }
  if (metadata.execution_status === "COMPLETED") {
    const normalized = await normalizeLegacyCompleted(command, execution);
    return { execution: normalized, reused: true, settled: true };
  }
  if (
    metadata.execution_status === "REMOTE_ACKNOWLEDGED" ||
    metadata.execution_status === "REMOTE_VERIFICATION_REQUIRED"
  ) {
    return { execution, reused: true, settled: true };
  }
  if (
    metadata.execution_status === "FAILED" ||
    metadata.execution_status === "EVIDENCE_REQUIRED"
  ) {
    return { execution, reused: true, settled: false };
  }
  if (metadata.execution_status !== "PENDING_PROVIDER") {
    return { execution, reused: true, settled: false };
  }

  const result = await ServiceExecutionRuntime.settle({
    organization_id,
    provider: metadata.provider_id,
    provider_job_id: metadata.provider_job_id,
    usage_id: metadata.usage_id,
    pricing: metadata.pricing || {},
    quantity: metadata.quantity || 1,
    unit: metadata.unit || metadata.pricing?.unit || "request",
    credential_id: metadata.credential_id || null,
    started_at: metadata.started_at || null,
    provider_status_input:
      command.metadata?.publish_target?.metadata?.provider_status || {},
    metadata: {
      idempotency_key: metadata.idempotency_key || null,
      creative_project_id: command.creative_project_id,
      publish_command_asset_node_id: command.id,
      final_render_asset_node_id:
        command.metadata?.final_render_asset_node_id || null,
      publish_target_id: command.metadata?.publish_target_id || null,
    },
  });

  const evidence = externalEvidence(result);
  if (result.pending === true) {
    const pending = await AssetGraphRepository.update(execution.id, {
      status: CREATIVE_ASSET_NODE_STATUS.REVIEW,
      metadata: {
        ...metadata,
        execution_status: "PENDING_PROVIDER",
        provider_status: evidence.provider_status || "processing",
        settlement: result.settlement || "RESERVED",
        last_polled_at: new Date().toISOString(),
        executed_by_user_id: executed_by.user_id,
        executed_by_staff_account_id: executed_by.staff_account_id,
      },
    });
    return { execution: pending, reused: true, settled: false };
  }

  if (result.failed === true || result.success === false) {
    const failed = await AssetGraphRepository.update(execution.id, {
      status: CREATIVE_ASSET_NODE_STATUS.REJECTED,
      metadata: {
        ...metadata,
        execution_status: "FAILED",
        provider_status: evidence.provider_status || "failed",
        settlement: result.settlement || "RELEASED",
        error: result.error || "Publish provider job failed",
        last_polled_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        executed_by_user_id: executed_by.user_id,
        executed_by_staff_account_id: executed_by.staff_account_id,
      },
    });
    await updateCommand(command, {
      execution_status: "FAILED",
      publish_execution_asset_node_id: failed.id,
      publication_error: result.error || "Publish provider job failed",
    });
    return { execution: failed, reused: true, settled: true };
  }

  const acknowledged = hasRemoteAcknowledgement(evidence);
  const executionStatus = acknowledged
    ? "REMOTE_ACKNOWLEDGED"
    : "EVIDENCE_REQUIRED";
  const updated = await AssetGraphRepository.update(execution.id, {
    status: CREATIVE_ASSET_NODE_STATUS.REVIEW,
    description: acknowledged
      ? "Provider returned an exact remote publication identifier. Remote read-back verification is still required before publication is considered complete."
      : "Publish provider completed without an exact remote publication identifier.",
    metadata: {
      ...metadata,
      ...evidence,
      execution_status: executionStatus,
      settlement: result.settlement || "CHARGED",
      usage_id: result.usage?.id || metadata.usage_id || null,
      billing_invoice_id:
        result.billing?.invoice?.id || metadata.billing_invoice_id || null,
      remote_verified: false,
      remote_verified_at: null,
      last_polled_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      executed_by_user_id: executed_by.user_id,
      executed_by_staff_account_id: executed_by.staff_account_id,
    },
  });
  await updateCommand(command, {
    execution_status: executionStatus,
    publish_execution_asset_node_id: updated.id,
    external_publication_id: evidence.external_publication_id,
    external_publication_url: null,
    provider_receipt_url: evidence.external_publication_url,
    remote_verified: false,
    remote_verified_at: null,
  });
  return { execution: updated, reused: true, settled: true };
}

export const CreativePublishExecutionRuntime = {
  async execute({
    organization_id,
    publish_command_asset_node_id,
    executed_by,
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!publish_command_asset_node_id) {
      throw new Error("publish_command_asset_node_id required");
    }
    if (!executed_by?.user_id || !executed_by?.staff_account_id) {
      throw new Error("AUTHENTICATED_PUBLISH_EXECUTOR_REQUIRED");
    }

    const command = await AssetGraphRepository.getById(
      publish_command_asset_node_id,
    );
    if (
      !command ||
      command.organization_id !== organization_id ||
      command.type !== CREATIVE_ASSET_NODE_TYPES.PUBLISH_COMMAND
    ) {
      throw new Error("PUBLISH_COMMAND_REQUIRED");
    }

    const nodes = await AssetGraphRepository.listByProject({
      organization_id,
      creative_project_id: command.creative_project_id,
    });
    const identity = executionIdentity(command);
    const existing = nodes.find((node) =>
      node.type === CREATIVE_ASSET_NODE_TYPES.PUBLISH_EXECUTION &&
      node.status !== CREATIVE_ASSET_NODE_STATUS.ARCHIVED &&
      node.metadata?.publish_execution_identity === identity,
    );
    if (existing) {
      return settleExisting({
        organization_id,
        command,
        execution: existing,
        executed_by,
      });
    }

    if (command.metadata?.execution_status !== "PENDING_CONNECTOR") {
      throw new Error("PENDING_PUBLISH_COMMAND_REQUIRED");
    }

    const render = nodes.find((node) =>
      node.id === command.metadata?.final_render_asset_node_id &&
      node.type === CREATIVE_ASSET_NODE_TYPES.FINAL_RENDER,
    );
    if (!render?.url) throw new Error("FINAL_RENDER_DELIVERY_URL_REQUIRED");

    const target = command.metadata?.publish_target || {};
    const kind = mediaKind(render);
    if (!accepts(target, kind)) {
      throw new Error(
        `PUBLISH_TARGET_DOES_NOT_ACCEPT_${String(kind || "UNKNOWN").toUpperCase()}`,
      );
    }

    const resolvedServiceId = serviceId(target);
    const resolvedProviderId = providerId(target);
    if (!resolvedServiceId) throw new Error("PUBLISH_TARGET_SERVICE_ID_REQUIRED");
    if (!resolvedProviderId) throw new Error("PUBLISH_TARGET_PROVIDER_REQUIRED");

    const startedAt = new Date().toISOString();
    const claimDocument = createCreativeAssetNode({
      organization_id,
      creative_project_id: command.creative_project_id,
      parent_asset_node_id: command.id,
      type: CREATIVE_ASSET_NODE_TYPES.PUBLISH_EXECUTION,
      status: CREATIVE_ASSET_NODE_STATUS.REVIEW,
      name: `${command.name || "Publish command"} execution`,
      description: "Publication execution claimed before connector dispatch.",
      lineage: {
        source: "publish_connector_execution",
        provider_id: resolvedProviderId,
        capability: "creative.release.publish.execute",
        generation_version: 4,
      },
      metadata: {
        publish_execution_identity: identity,
        idempotency_key: identity,
        publish_command_asset_node_id: command.id,
        service_id: resolvedServiceId,
        provider_id: resolvedProviderId,
        media_kind: kind,
        execution_status: "DISPATCHING",
        started_at: startedAt,
        completed_at: null,
        remote_verified: false,
        remote_verified_at: null,
        executed_by_user_id: executed_by.user_id,
        executed_by_staff_account_id: executed_by.staff_account_id,
      },
      created_by: executed_by.user_id,
    });

    const claimed = await AssetGraphRepository.createOrFindByMetadataIdentity({
      node: claimDocument,
      metadata_key: "publish_execution_identity",
      metadata_value: identity,
    });
    if (!claimed.created) {
      return settleExisting({
        organization_id,
        command,
        execution: claimed.node,
        executed_by,
      });
    }

    const claim = claimed.node;
    await updateCommand(command, {
      execution_status: "DISPATCHING",
      publish_execution_asset_node_id: claim.id,
      publication_error: null,
    });

    let result;
    try {
      result = await ServiceExecutionRuntime.execute({
        organization_id,
        service_id: resolvedServiceId,
        provider_id: resolvedProviderId,
        category: "CREATIVE_PUBLISH",
        input: await providerPayload(
          target,
          render,
          organization_id,
          identity,
        ),
        metadata: {
          idempotency_key: identity,
          creative_project_id: command.creative_project_id,
          publish_command_asset_node_id: command.id,
          publish_execution_asset_node_id: claim.id,
          final_render_asset_node_id: render.id,
          publish_target_id: command.metadata?.publish_target_id || null,
        },
      });
    } catch (error) {
      const failed = await AssetGraphRepository.update(claim.id, {
        status: CREATIVE_ASSET_NODE_STATUS.REJECTED,
        description:
          "Publish connector execution failed without external success evidence.",
        metadata: {
          ...(claim.metadata || {}),
          execution_status: "FAILED",
          error: error.message,
          completed_at: new Date().toISOString(),
        },
      });
      await updateCommand(command, {
        execution_status: "FAILED",
        publish_execution_asset_node_id: failed.id,
        publication_error: error.message,
      });
      return { execution: failed, reused: false, settled: true };
    }

    const evidence = externalEvidence(result);
    const pending = result.pending === true;
    const acknowledged = result.success === true &&
      !pending &&
      hasRemoteAcknowledgement(evidence);
    const executionStatus = pending
      ? "PENDING_PROVIDER"
      : acknowledged
        ? "REMOTE_ACKNOWLEDGED"
        : "EVIDENCE_REQUIRED";

    const updated = await AssetGraphRepository.update(claim.id, {
      status: CREATIVE_ASSET_NODE_STATUS.REVIEW,
      description: pending
        ? "Publish connector accepted the request and remains pending provider acknowledgement."
        : acknowledged
          ? "Provider returned an exact remote publication identifier. Remote read-back verification is required before the publication is considered complete."
          : "Publish connector completed without an exact remote publication identifier.",
      lineage: {
        ...(claim.lineage || {}),
        provider_id: result.provider || resolvedProviderId,
      },
      metadata: {
        ...(claim.metadata || {}),
        provider_id: result.provider || resolvedProviderId,
        execution_status: executionStatus,
        settlement: result.settlement || null,
        pricing: result.pricing || null,
        quantity: result.usage?.quantity || 1,
        unit: result.usage?.unit || result.pricing?.unit || "request",
        credential_id: result.credential_id || null,
        usage_id: result.usage?.id || null,
        billing_invoice_id: result.billing?.invoice?.id || null,
        ...evidence,
        remote_verified: false,
        remote_verified_at: null,
        started_at: result.started_at || startedAt,
        completed_at: pending ? null : new Date().toISOString(),
        executed_by_user_id: executed_by.user_id,
        executed_by_staff_account_id: executed_by.staff_account_id,
      },
    });

    await updateCommand(command, {
      execution_status: executionStatus,
      publish_execution_asset_node_id: updated.id,
      external_publication_id: evidence.external_publication_id,
      external_publication_url: null,
      provider_receipt_url: evidence.external_publication_url,
      remote_verified: false,
      remote_verified_at: null,
    });

    return {
      execution: updated,
      reused: false,
      settled: !pending,
    };
  },
};
