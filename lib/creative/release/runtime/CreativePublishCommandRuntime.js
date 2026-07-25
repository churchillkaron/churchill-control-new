import crypto from "node:crypto";

import {
  createCreativeAssetNode,
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import * as CreativeProjectRepository
from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import * as MarketingPublishTargetRepository
from "@/lib/marketing/distribution/repositories/MarketingPublishTargetRepository";
import {
  CreativeApprovalRuntime,
} from "@/lib/creative/release/runtime/CreativeApprovalRuntime";

function targetSnapshot(target = {}) {
  const account = target.account_reference || {};
  const media = target.media_policy || {};
  return {
    id: target.id,
    key: target.id,
    name: target.name,
    channel: target.channel,
    service_id: target.service_id,
    provider_id: target.provider_id || null,
    capability: target.capability || null,
    version: target.version,
    page_id: account.page_id || null,
    instagram_business_id: account.instagram_business_id || null,
    author_urn: account.author_urn || null,
    location_id: account.location_id || null,
    account_id: account.account_id || null,
    media_kind: media.media_kind || null,
    supports_image: media.supports_image,
    supports_video: media.supports_video,
    supports_audio: media.supports_audio,
    metadata: target.metadata || {},
    source: "marketing_publish_targets",
  };
}

function commandIdentity(readiness, target, requestedBy) {
  return crypto.createHash("sha256").update(JSON.stringify({
    readiness_id: readiness.id,
    readiness_identity: readiness.metadata?.release_readiness_identity || null,
    marketing_publish_target_id: target.id,
    target_version: target.version || null,
    requested_by_user_id: requestedBy.user_id,
    requested_by_staff_account_id: requestedBy.staff_account_id,
  })).digest("hex");
}

export const CreativePublishCommandRuntime = {
  async create({
    organization_id,
    release_readiness_report_id,
    publish_target_id,
    requested_by,
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!release_readiness_report_id) {
      throw new Error("release_readiness_report_id required");
    }
    if (!publish_target_id) throw new Error("publish_target_id required");
    if (!requested_by?.user_id || !requested_by?.staff_account_id) {
      throw new Error("AUTHENTICATED_PUBLISHER_REQUIRED");
    }

    const readiness = await AssetGraphRepository.getById(
      release_readiness_report_id,
    );
    if (
      !readiness ||
      readiness.organization_id !== organization_id ||
      readiness.type !== CREATIVE_ASSET_NODE_TYPES.RELEASE_READINESS_REPORT ||
      readiness.metadata?.passed !== true
    ) {
      throw new Error("CURRENT_PASSED_RELEASE_READINESS_REQUIRED");
    }

    const approval = await CreativeApprovalRuntime.findCurrentApproval({
      organization_id,
      subject_asset_node_id: readiness.id,
      scope: "PUBLISH_RELEASE",
    });
    if (!approval) throw new Error("CURRENT_PUBLISH_RELEASE_APPROVAL_REQUIRED");

    const project = await CreativeProjectRepository.getById(
      readiness.creative_project_id,
    );
    if (!project || project.organization_id !== organization_id) {
      throw new Error("Creative project not found");
    }

    const target = await MarketingPublishTargetRepository.getActiveById({
      organization_id,
      id: publish_target_id,
    });
    if (!target) throw new Error("ACTIVE_MARKETING_PUBLISH_TARGET_REQUIRED");
    if (!target.organization_service_id) {
      throw new Error("MARKETING_PUBLISH_TARGET_SERVICE_CONNECTION_REQUIRED");
    }

    const immutableTarget = targetSnapshot(target);
    const identity = commandIdentity(readiness, target, requested_by);
    const nodes = await AssetGraphRepository.listByProject({
      organization_id,
      creative_project_id: readiness.creative_project_id,
    });
    const existing = nodes.find((node) =>
      node.type === CREATIVE_ASSET_NODE_TYPES.PUBLISH_COMMAND &&
      node.metadata?.publish_command_identity === identity,
    );
    if (existing) return { command: existing, reused: true };

    const command = createCreativeAssetNode({
      organization_id,
      creative_project_id: readiness.creative_project_id,
      parent_asset_node_id: readiness.id,
      type: CREATIVE_ASSET_NODE_TYPES.PUBLISH_COMMAND,
      status: CREATIVE_ASSET_NODE_STATUS.REVIEW,
      name: `${project.name || "Creative project"} publish command`,
      description: "Approved creative release handed to Marketing for channel execution.",
      lineage: {
        source: "marketing_publish_target_handoff",
        capability: "creative.release.publish.command",
        generation_version: 2,
      },
      review: {
        ai_reviewed: false,
        human_reviewed: true,
        approved: true,
        approved_by: requested_by.staff_account_id,
        notes: "Studio supplies approved creative evidence; Marketing owns target and publishing execution.",
      },
      metadata: {
        publish_command_identity: identity,
        release_readiness_report_id: readiness.id,
        release_readiness_identity:
          readiness.metadata?.release_readiness_identity || null,
        publish_approval_record_id: approval.id,
        final_render_asset_node_id:
          readiness.metadata?.final_render_asset_node_id || null,
        marketing_publish_target_id: target.id,
        marketing_publish_target_version: target.version,
        marketing_publish_target: immutableTarget,
        publish_target_id: target.id,
        publish_target: immutableTarget,
        execution_status: "PENDING_CONNECTOR",
        external_publication_id: null,
        external_publication_url: null,
        requested_by_user_id: requested_by.user_id,
        requested_by_staff_account_id: requested_by.staff_account_id,
        requested_at: new Date().toISOString(),
      },
      created_by: requested_by.user_id,
    });

    return {
      command: await AssetGraphRepository.create(command),
      reused: false,
    };
  },
};
