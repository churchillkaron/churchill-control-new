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
import {
  CreativeApprovalRuntime,
} from "@/lib/creative/release/runtime/CreativeApprovalRuntime";

function targetId(target = {}) {
  return String(target.id || target.key || target.channel || target.provider || "").trim();
}

function commandIdentity(readiness, target, requestedBy) {
  return crypto.createHash("sha256").update(JSON.stringify({
    readiness_id: readiness.id,
    readiness_identity: readiness.metadata?.release_readiness_identity || null,
    target_id: targetId(target),
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

    const targets = Array.isArray(project.metadata?.publish_targets)
      ? project.metadata.publish_targets
      : [];
    const target = targets.find((candidate) => targetId(candidate) === publish_target_id);
    if (!target) throw new Error("CONFIGURED_PUBLISH_TARGET_REQUIRED");
    if (target.enabled === false || target.status === "DISABLED") {
      throw new Error("PUBLISH_TARGET_DISABLED");
    }
    if (!target.provider && !target.connector && !target.channel) {
      throw new Error("PUBLISH_TARGET_CONNECTOR_REQUIRED");
    }

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
      description: "Connector-neutral approved publish command awaiting execution.",
      lineage: {
        source: "authenticated_publish_request",
        capability: "creative.release.publish.command",
        generation_version: 1,
      },
      review: {
        ai_reviewed: false,
        human_reviewed: true,
        approved: true,
        approved_by: requested_by.staff_account_id,
        notes: "Publication has not executed; command is pending connector delivery.",
      },
      metadata: {
        publish_command_identity: identity,
        release_readiness_report_id: readiness.id,
        release_readiness_identity:
          readiness.metadata?.release_readiness_identity || null,
        publish_approval_record_id: approval.id,
        final_render_asset_node_id:
          readiness.metadata?.final_render_asset_node_id || null,
        publish_target_id,
        publish_target: target,
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
