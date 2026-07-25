import crypto from "node:crypto";

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
    command_updated_at: command.updated_at || null,
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
  return text(target.service_id) || SERVICE_BY_CHANNEL[text(target.channel).toLowerCase()] || null;
}

function providerId(target = {}) {
  return text(target.provider_id || target.provider || target.connector) || null;
}

function providerPayload(target, render) {
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
    quantity: 1,
  };

  if (kind === "image") payload.image_url = render.url;
  if (kind === "video") payload.video_url = render.url;
  if (kind === "audio") payload.audio_url = render.url;
  return payload;
}

function externalEvidence(result = {}) {
  const output = result.output?.output || result.output || {};
  return {
    external_publication_id:
      output.id || output.post_id || output.publication_id || output.media_id || null,
    external_publication_url:
      output.permalink || output.url || output.publication_url || null,
    provider_job_id: result.provider_job_id || output.job_id || output.task_id || null,
    provider_status: result.provider_status || output.status || null,
  };
}

export const CreativePublishExecutionRuntime = {
  async execute({
    organization_id,
    publish_command_asset_node_id,
    executed_by,
    force = false,
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!publish_command_asset_node_id) {
      throw new Error("publish_command_asset_node_id required");
    }
    if (!executed_by?.user_id || !executed_by?.staff_account_id) {
      throw new Error("AUTHENTICATED_PUBLISH_EXECUTOR_REQUIRED");
    }

    const command = await AssetGraphRepository.getById(publish_command_asset_node_id);
    if (
      !command ||
      command.organization_id !== organization_id ||
      command.type !== CREATIVE_ASSET_NODE_TYPES.PUBLISH_COMMAND ||
      command.metadata?.execution_status !== "PENDING_CONNECTOR"
    ) {
      throw new Error("PENDING_PUBLISH_COMMAND_REQUIRED");
    }

    const nodes = await AssetGraphRepository.listByProject({
      organization_id,
      creative_project_id: command.creative_project_id,
    });
    const identity = executionIdentity(command);
    const existing = !force
      ? nodes.find((node) =>
          node.type === CREATIVE_ASSET_NODE_TYPES.PUBLISH_EXECUTION &&
          node.metadata?.publish_execution_identity === identity,
        )
      : null;
    if (existing) return { execution: existing, reused: true };

    const render = nodes.find((node) =>
      node.id === command.metadata?.final_render_asset_node_id &&
      node.type === CREATIVE_ASSET_NODE_TYPES.FINAL_RENDER,
    );
    if (!render?.url) throw new Error("FINAL_RENDER_DELIVERY_URL_REQUIRED");

    const target = command.metadata?.publish_target || {};
    const kind = mediaKind(render);
    if (!accepts(target, kind)) {
      throw new Error(`PUBLISH_TARGET_DOES_NOT_ACCEPT_${String(kind || "UNKNOWN").toUpperCase()}`);
    }

    const resolvedServiceId = serviceId(target);
    const resolvedProviderId = providerId(target);
    if (!resolvedServiceId) throw new Error("PUBLISH_TARGET_SERVICE_ID_REQUIRED");
    if (!resolvedProviderId) throw new Error("PUBLISH_TARGET_PROVIDER_REQUIRED");

    const startedAt = new Date().toISOString();
    let result;
    try {
      result = await ServiceExecutionRuntime.execute({
        organization_id,
        service_id: resolvedServiceId,
        provider_id: resolvedProviderId,
        category: "CREATIVE_PUBLISH",
        input: providerPayload(target, render),
        metadata: {
          creative_project_id: command.creative_project_id,
          publish_command_asset_node_id: command.id,
          final_render_asset_node_id: render.id,
          publish_target_id: command.metadata?.publish_target_id || null,
        },
      });
    } catch (error) {
      const failed = createCreativeAssetNode({
        organization_id,
        creative_project_id: command.creative_project_id,
        parent_asset_node_id: command.id,
        type: CREATIVE_ASSET_NODE_TYPES.PUBLISH_EXECUTION,
        status: CREATIVE_ASSET_NODE_STATUS.REJECTED,
        name: `${command.name || "Publish command"} execution`,
        description: "Publish connector execution failed without external success evidence.",
        lineage: {
          source: "publish_connector_execution",
          provider_id: resolvedProviderId,
          capability: "creative.release.publish.execute",
          generation_version: 1,
        },
        metadata: {
          publish_execution_identity: identity,
          publish_command_asset_node_id: command.id,
          service_id: resolvedServiceId,
          provider_id: resolvedProviderId,
          media_kind: kind,
          execution_status: "FAILED",
          error: error.message,
          started_at: startedAt,
          completed_at: new Date().toISOString(),
          executed_by_user_id: executed_by.user_id,
          executed_by_staff_account_id: executed_by.staff_account_id,
        },
        created_by: executed_by.user_id,
      });
      return {
        execution: await AssetGraphRepository.create(failed),
        reused: false,
      };
    }

    const evidence = externalEvidence(result);
    const pending = result.pending === true;
    const success = result.success === true && !pending;
    const execution = createCreativeAssetNode({
      organization_id,
      creative_project_id: command.creative_project_id,
      parent_asset_node_id: command.id,
      type: CREATIVE_ASSET_NODE_TYPES.PUBLISH_EXECUTION,
      status: success
        ? CREATIVE_ASSET_NODE_STATUS.APPROVED
        : CREATIVE_ASSET_NODE_STATUS.REVIEW,
      name: `${command.name || "Publish command"} execution`,
      description: pending
        ? "Publish connector accepted the request and remains pending provider confirmation."
        : "Publish connector returned completion evidence.",
      lineage: {
        source: "publish_connector_execution",
        provider_id: result.provider || resolvedProviderId,
        capability: "creative.release.publish.execute",
        generation_version: 1,
      },
      metadata: {
        publish_execution_identity: identity,
        publish_command_asset_node_id: command.id,
        service_id: resolvedServiceId,
        provider_id: result.provider || resolvedProviderId,
        media_kind: kind,
        execution_status: pending ? "PENDING_PROVIDER" : "COMPLETED",
        settlement: result.settlement || null,
        usage_id: result.usage?.id || null,
        billing_invoice_id: result.billing?.invoice?.id || null,
        ...evidence,
        started_at: startedAt,
        completed_at: pending ? null : new Date().toISOString(),
        executed_by_user_id: executed_by.user_id,
        executed_by_staff_account_id: executed_by.staff_account_id,
      },
      created_by: executed_by.user_id,
    });

    return {
      execution: await AssetGraphRepository.create(execution),
      reused: false,
    };
  },
};
