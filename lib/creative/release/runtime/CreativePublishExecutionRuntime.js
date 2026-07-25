import crypto from "node:crypto";

import {
  createCreativeAssetNode,
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import {
  CreativeStorageRuntime,
} from "@/lib/creative/storage/runtime/CreativeStorageRuntime";
import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

const SERVICE_BY_CHANNEL = {
  facebook: "facebook",
  instagram: "instagram",
  linkedin: "linkedin",
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
    readiness_identity:
      command.metadata?.release_readiness_identity || null,
    target_id: command.metadata?.publish_target_id || null,
    final_render_asset_node_id:
      command.metadata?.final_render_asset_node_id || null,
  })).digest("hex");
}

function workerId() {
  return [
    "creative-publish",
    process.env.VERCEL_REGION || "local",
    process.pid,
    crypto.randomUUID(),
  ].join(":");
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
  return text(
    target.provider_id || target.provider || target.connector,
  ) || null;
}

function providerPayload(target, render, deliveryUrl, identity) {
  const kind = mediaKind(render);
  const message =
    target.metadata?.message ||
    target.metadata?.caption ||
    target.metadata?.text ||
    "";
  const payload = {
    message,
    text: message,
    summary: message,
    page_id: target.page_id || null,
    instagram_business_id: target.instagram_business_id || null,
    author_urn: target.author_urn || null,
    location_id: target.location_id || null,
    account_id: target.account_id || null,
    quantity: 1,
    idempotency_key: identity,
    client_request_id: identity,
  };

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
      output.permalink ||
      output.url ||
      output.publication_url ||
      null,
    provider_job_id:
      result.provider_job_id ||
      output.job_id ||
      output.task_id ||
      output.request_id ||
      null,
    provider_status:
      result.provider_status || output.status || null,
  };
}

function uniqueViolation(error) {
  return error?.code === "23505" ||
    String(error?.message || "").toLowerCase().includes("duplicate key");
}

async function findExisting(nodes, identity) {
  return nodes.find((node) =>
    node.type === CREATIVE_ASSET_NODE_TYPES.PUBLISH_EXECUTION &&
    node.metadata?.publish_execution_identity === identity,
  ) || null;
}

async function createSubmittingExecution({
  command,
  identity,
  serviceId: resolvedServiceId,
  providerId: resolvedProviderId,
  kind,
  executedBy,
}) {
  const execution = createCreativeAssetNode({
    organization_id: command.organization_id,
    creative_project_id: command.creative_project_id,
    parent_asset_node_id: command.id,
    type: CREATIVE_ASSET_NODE_TYPES.PUBLISH_EXECUTION,
    status: CREATIVE_ASSET_NODE_STATUS.REVIEW,
    name: `${command.name || "Publish command"} execution`,
    description: "Publish connector submission claimed and awaiting durable provider evidence.",
    lineage: {
      source: "publish_connector_execution",
      provider_id: resolvedProviderId,
      capability: "creative.release.publish.execute",
      generation_version: 1,
    },
    review: {
      ai_reviewed: false,
      human_reviewed: true,
      approved: true,
      approved_by: executedBy.staff_account_id,
    },
    metadata: {
      publish_execution_identity: identity,
      publish_command_asset_node_id: command.id,
      service_id: resolvedServiceId,
      provider_id: resolvedProviderId,
      media_kind: kind,
      execution_status: "SUBMITTING",
      connector_submission_state: "CLAIMED",
      connector_submission_idempotency_key: identity,
      provider_job_id: null,
      external_publication_id: null,
      external_publication_url: null,
      started_at: new Date().toISOString(),
      completed_at: null,
      executed_by_user_id: executedBy.user_id,
      executed_by_staff_account_id: executedBy.staff_account_id,
    },
    created_by: executedBy.user_id,
  });

  try {
    return await AssetGraphRepository.create(execution);
  } catch (error) {
    if (!uniqueViolation(error)) throw error;
    const nodes = await AssetGraphRepository.listByProject({
      organization_id: command.organization_id,
      creative_project_id: command.creative_project_id,
    });
    const existing = await findExisting(nodes, identity);
    if (!existing) throw error;
    return existing;
  }
}

async function settle({
  command,
  claimedCommand,
  execution,
  identity,
  status,
  evidence,
}) {
  const updated = await AssetGraphRepository.update(execution.id, {
    status: status === "COMPLETED"
      ? CREATIVE_ASSET_NODE_STATUS.APPROVED
      : status === "FAILED"
        ? CREATIVE_ASSET_NODE_STATUS.REJECTED
        : CREATIVE_ASSET_NODE_STATUS.REVIEW,
    metadata: {
      ...(execution.metadata || {}),
      ...evidence,
      execution_status: status,
      completed_at:
        status === "PENDING_PROVIDER" ||
        status === "RECONCILIATION_REQUIRED"
          ? null
          : new Date().toISOString(),
    },
  });

  const commandResult = await AssetGraphRepository.settlePublishCommand({
    command_id: command.id,
    organization_id: command.organization_id,
    execution_identity: identity,
    lease_token: claimedCommand.metadata?.execution_lease_token,
    execution_asset_node_id: updated.id,
    status,
    evidence: {
      provider_id: updated.metadata?.provider_id || null,
      provider_job_id: updated.metadata?.provider_job_id || null,
      external_publication_id:
        updated.metadata?.external_publication_id || null,
      external_publication_url:
        updated.metadata?.external_publication_url || null,
    },
  });
  if (!commandResult) throw new Error("PUBLISH_COMMAND_LEASE_LOST");
  return updated;
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
    const existing = await findExisting(nodes, identity);
    if (existing) return { execution: existing, reused: true };

    if (command.metadata?.execution_status !== "PENDING_CONNECTOR") {
      throw new Error("PENDING_PUBLISH_COMMAND_REQUIRED");
    }

    const render = nodes.find((node) =>
      node.id === command.metadata?.final_render_asset_node_id &&
      node.type === CREATIVE_ASSET_NODE_TYPES.FINAL_RENDER,
    );
    if (!render?.storage_path || !render.technical?.checksum) {
      throw new Error("PRIVATE_FINAL_RENDER_EVIDENCE_REQUIRED");
    }

    const target = command.metadata?.publish_target || {};
    const kind = mediaKind(render);
    if (!accepts(target, kind)) {
      throw new Error(
        `PUBLISH_TARGET_DOES_NOT_ACCEPT_${String(kind || "UNKNOWN").toUpperCase()}`,
      );
    }

    const resolvedServiceId = serviceId(target);
    const resolvedProviderId = providerId(target);
    if (!resolvedServiceId) {
      throw new Error("PUBLISH_TARGET_SERVICE_ID_REQUIRED");
    }
    if (!resolvedProviderId) {
      throw new Error("PUBLISH_TARGET_PROVIDER_REQUIRED");
    }

    const claimedCommand = await AssetGraphRepository.claimPublishCommand({
      command_id: command.id,
      organization_id,
      execution_identity: identity,
      worker_id: workerId(),
      lease_seconds: 900,
    });
    if (!claimedCommand) {
      const refreshedNodes = await AssetGraphRepository.listByProject({
        organization_id,
        creative_project_id: command.creative_project_id,
      });
      const recovered = await findExisting(refreshedNodes, identity);
      if (recovered) return { execution: recovered, reused: true };
      throw new Error("PUBLISH_COMMAND_ALREADY_CLAIMED");
    }

    const execution = await createSubmittingExecution({
      command,
      identity,
      serviceId: resolvedServiceId,
      providerId: resolvedProviderId,
      kind,
      executedBy: executed_by,
    });

    const delivery = await CreativeStorageRuntime.createSignedUrl(
      render.storage_path,
      900,
    );

    let result;
    try {
      result = await ServiceExecutionRuntime.execute({
        organization_id,
        service_id: resolvedServiceId,
        provider_id: resolvedProviderId,
        category: "CREATIVE_PUBLISH",
        input: providerPayload(
          target,
          render,
          delivery.signed_url,
          identity,
        ),
        metadata: {
          creative_project_id: command.creative_project_id,
          publish_command_asset_node_id: command.id,
          publish_execution_asset_node_id: execution.id,
          publish_execution_identity: identity,
          final_render_asset_node_id: render.id,
          final_render_checksum: render.technical.checksum,
          publish_target_id: command.metadata?.publish_target_id || null,
        },
      });
    } catch (error) {
      const ambiguous = await settle({
        command,
        claimedCommand,
        execution,
        identity,
        status: "RECONCILIATION_REQUIRED",
        evidence: {
          connector_submission_state: "OUTCOME_UNKNOWN",
          error: error.message,
          interrupted_at: new Date().toISOString(),
        },
      });
      return {
        execution: ambiguous,
        reused: false,
        reconciliation_required: true,
      };
    }

    const evidence = externalEvidence(result);
    const pending = result.pending === true;
    const hasTerminalEvidence = Boolean(
      evidence.external_publication_id ||
      evidence.external_publication_url,
    );
    const status = pending
      ? "PENDING_PROVIDER"
      : result.success === true && hasTerminalEvidence
        ? "COMPLETED"
        : "RECONCILIATION_REQUIRED";

    const settledExecution = await settle({
      command,
      claimedCommand,
      execution,
      identity,
      status,
      evidence: {
        connector_submission_state: pending
          ? "ACCEPTED_PENDING"
          : status === "COMPLETED"
            ? "CONFIRMED"
            : "OUTCOME_UNKNOWN",
        settlement: result.settlement || null,
        usage_id: result.usage?.id || null,
        billing_invoice_id: result.billing?.invoice?.id || null,
        ...evidence,
        provider_id: result.provider || resolvedProviderId,
        provider_result_received_at: new Date().toISOString(),
      },
    });

    return {
      execution: settledExecution,
      reused: false,
      reconciliation_required: status === "RECONCILIATION_REQUIRED",
    };
  },
};
