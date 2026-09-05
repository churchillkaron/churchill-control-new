import {
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
import {
  creativeStorageReference,
  signCreativeStorageReference,
} from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function timestamp(node = {}) {
  return Date.parse(node.updated_at || node.created_at || 0) || 0;
}

function newest(nodes = [], predicate = () => true) {
  return [...nodes]
    .filter(predicate)
    .sort((left, right) => timestamp(right) - timestamp(left))[0] || null;
}

function targetId(target = {}) {
  return text(target.id || target.key || target.channel || target.provider);
}

function safeTarget(target = {}) {
  return {
    id: targetId(target),
    key: target.key || null,
    name: target.name || null,
    channel: target.channel || null,
    provider: target.provider || null,
    provider_id: target.provider_id || null,
    connector: target.connector || null,
    service_id: target.service_id || null,
    capability: target.capability || null,
    version: target.version || null,
    enabled: target.enabled !== false,
    status: target.status || null,
    media_kind: target.media_kind || null,
    supports_image: target.supports_image === true,
    supports_video: target.supports_video === true,
    supports_audio: target.supports_audio === true,
    page_id: target.page_id || null,
    instagram_business_id: target.instagram_business_id || null,
    author_urn: target.author_urn || null,
    location_id: target.location_id || null,
    account_id: target.account_id || null,
  };
}

function compactApproval(node) {
  if (!node) return null;
  return {
    id: node.id,
    status: node.status,
    scope: node.metadata?.scope || null,
    approver_user_id: node.metadata?.approver_user_id || null,
    approver_staff_account_id: node.metadata?.approver_staff_account_id || null,
    approved_at: node.metadata?.approved_at || node.created_at || null,
    notes: node.review?.notes || "",
  };
}

function compactReadiness(node) {
  if (!node) return null;
  return {
    id: node.id,
    status: node.status,
    passed: node.metadata?.passed === true,
    release_readiness_identity:
      node.metadata?.release_readiness_identity || null,
    final_render_asset_node_id:
      node.metadata?.final_render_asset_node_id || null,
    timeline_asset_node_id:
      node.metadata?.timeline_asset_node_id || null,
    checks: list(node.metadata?.checks),
    failed_checks: list(node.metadata?.failed_checks),
    evaluated_at:
      node.metadata?.evaluated_at ||
      node.updated_at ||
      node.created_at ||
      null,
  };
}

async function signedPreview(organizationId, node) {
  if (!node?.url) return { url: null, error: null };
  if (!creativeStorageReference(node.url)) {
    return { url: node.url, error: null };
  }
  try {
    return {
      url: await signCreativeStorageReference({
        organization_id: organizationId,
        reference: node.url,
      }),
      error: null,
    };
  } catch (error) {
    return {
      url: null,
      error: error?.message || "PUBLISH_MASTER_PREVIEW_SIGNING_FAILED",
    };
  }
}

function compactRender(node, preview = {}) {
  if (!node) return null;
  return {
    id: node.id,
    status: node.status,
    name: node.name || "Final master",
    preview_url: preview.url || null,
    preview_error: preview.error || null,
    technical: {
      mime_type: node.technical?.mime_type || null,
      width: finite(node.technical?.width),
      height: finite(node.technical?.height),
      duration_seconds: finite(node.technical?.duration_seconds),
      frame_rate:
        finite(node.technical?.frame_rate) ??
        finite(node.technical?.fps) ??
        finite(node.technical?.video_frame_rate),
      video_codec: node.technical?.video_codec || null,
      audio_codec: node.technical?.audio_codec || null,
      checksum: node.technical?.checksum || null,
      file_size_bytes: finite(node.technical?.file_size_bytes),
    },
    export_profile: node.metadata?.export_profile || null,
    technical_qc: node.metadata?.technical_qc || null,
    review: node.review || {},
    created_at: node.created_at || null,
    updated_at: node.updated_at || null,
  };
}

function compactCommand(node) {
  if (!node) return null;
  return {
    id: node.id,
    status: node.status,
    execution_status: node.metadata?.execution_status || null,
    publish_target_id: node.metadata?.publish_target_id || null,
    publish_target: node.metadata?.publish_target || null,
    release_readiness_report_id:
      node.metadata?.release_readiness_report_id || null,
    publish_approval_record_id:
      node.metadata?.publish_approval_record_id || null,
    publish_execution_asset_node_id:
      node.metadata?.publish_execution_asset_node_id || null,
    external_publication_id:
      node.metadata?.external_publication_id || null,
    external_publication_url:
      node.metadata?.external_publication_url || null,
    publication_error: node.metadata?.publication_error || null,
    requested_by_user_id:
      node.metadata?.requested_by_user_id || null,
    requested_by_staff_account_id:
      node.metadata?.requested_by_staff_account_id || null,
    requested_at: node.metadata?.requested_at || node.created_at || null,
  };
}

function compactExecution(node) {
  if (!node) return null;
  return {
    id: node.id,
    status: node.status,
    execution_status: node.metadata?.execution_status || null,
    provider_id: node.metadata?.provider_id || node.lineage?.provider_id || null,
    provider_status: node.metadata?.provider_status || null,
    provider_job_id: node.metadata?.provider_job_id || null,
    service_id: node.metadata?.service_id || null,
    settlement: node.metadata?.settlement || null,
    usage_id: node.metadata?.usage_id || null,
    billing_invoice_id: node.metadata?.billing_invoice_id || null,
    external_publication_id:
      node.metadata?.external_publication_id || null,
    external_publication_url:
      node.metadata?.external_publication_url || null,
    error: node.metadata?.error || null,
    started_at: node.metadata?.started_at || node.created_at || null,
    last_polled_at: node.metadata?.last_polled_at || null,
    completed_at: node.metadata?.completed_at || null,
    executed_by_user_id:
      node.metadata?.executed_by_user_id || null,
    executed_by_staff_account_id:
      node.metadata?.executed_by_staff_account_id || null,
  };
}

function compactChannelDelivery(node) {
  if (!node) return null;
  return {
    id: node.id,
    status: node.status,
    passed: node.metadata?.passed === true,
    contract: node.metadata?.contract || null,
    target_channels: list(node.metadata?.deliveries).map((entry) => entry.channel),
    deliveries: list(node.metadata?.deliveries).map((entry) => ({
      channel: entry.channel || null,
      passed: entry.passed === true,
      profile_id: entry.profile_id || null,
      profile_source: entry.profile_source || null,
      width: finite(entry.width),
      height: finite(entry.height),
      frame_rate: finite(entry.frame_rate),
      render_asset_node_id: entry.render_asset_node_id || null,
      render_checksum: entry.render_checksum || null,
      technical_qc_passed: entry.technical_qc_passed === true,
      final_master_audio_verified:
        entry.final_master_audio_verified === true,
      error: entry.error || null,
    })),
    failed_channels: list(node.metadata?.failed_channels),
    evaluated_at:
      node.metadata?.evaluated_at ||
      node.updated_at ||
      node.created_at ||
      null,
  };
}

function deliveryForTarget(report, target) {
  if (!report) return null;
  const candidates = new Set([
    text(target.channel).toLowerCase(),
    text(target.id).toLowerCase(),
    text(target.key).toLowerCase(),
  ].filter(Boolean));
  return report.deliveries.find((entry) =>
    candidates.has(text(entry.channel).toLowerCase()),
  ) || null;
}

function targetConfigurationValid(target) {
  const status = text(target.status).toUpperCase();
  return Boolean(
    target.id &&
    target.enabled !== false &&
    !["DISABLED", "INACTIVE", "SUSPENDED"].includes(status) &&
    (target.provider_id || target.provider || target.connector) &&
    target.service_id,
  );
}

function executionState(command, execution) {
  return (
    execution?.execution_status ||
    command?.execution_status ||
    "NOT_AUTHORIZED"
  );
}

export const CreativePublishingInspectionRuntime = {
  async inspect({ organization_id, creative_project_id } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");

    const [project, nodes] = await Promise.all([
      CreativeProjectRepository.getById(creative_project_id),
      AssetGraphRepository.listByProject({
        organization_id,
        creative_project_id,
      }),
    ]);
    if (!project || text(project.organization_id) !== text(organization_id)) {
      throw new Error("Creative project not found");
    }

    const readinessNode = newest(nodes, (node) =>
      node.type === CREATIVE_ASSET_NODE_TYPES.RELEASE_READINESS_REPORT,
    );
    const readiness = compactReadiness(readinessNode);
    const publishApprovalNode = readinessNode
      ? await CreativeApprovalRuntime.findCurrentApproval({
          organization_id,
          subject_asset_node_id: readinessNode.id,
          scope: "PUBLISH_RELEASE",
        })
      : null;
    const publishApproval = compactApproval(publishApprovalNode);

    const renderNode = readiness?.final_render_asset_node_id
      ? nodes.find((node) =>
          node.id === readiness.final_render_asset_node_id &&
          node.type === CREATIVE_ASSET_NODE_TYPES.FINAL_RENDER,
        ) || null
      : newest(nodes, (node) =>
          node.type === CREATIVE_ASSET_NODE_TYPES.FINAL_RENDER,
        );
    const preview = await signedPreview(organization_id, renderNode);
    const render = compactRender(renderNode, preview);

    const channelDeliveryNode = newest(nodes, (node) =>
      node.type === CREATIVE_ASSET_NODE_TYPES.QUALITY_REPORT &&
      node.lineage?.source === "temporal_channel_delivery" &&
      (!renderNode || node.parent_asset_node_id === renderNode.id),
    );
    const channelDelivery = compactChannelDelivery(channelDeliveryNode);

    const commandNodes = nodes
      .filter((node) => node.type === CREATIVE_ASSET_NODE_TYPES.PUBLISH_COMMAND)
      .filter((node) =>
        !readinessNode ||
        node.parent_asset_node_id === readinessNode.id ||
        node.metadata?.release_readiness_report_id === readinessNode.id,
      );
    const executionNodes = nodes
      .filter((node) => node.type === CREATIVE_ASSET_NODE_TYPES.PUBLISH_EXECUTION);

    const configuredTargets = list(project.metadata?.publish_targets)
      .map(safeTarget)
      .filter((target) => target.id);

    const targets = configuredTargets.map((target) => {
      const commandNode = newest(commandNodes, (node) =>
        text(node.metadata?.publish_target_id) === target.id,
      );
      const command = compactCommand(commandNode);
      const executionNode = commandNode
        ? newest(executionNodes, (node) =>
            node.parent_asset_node_id === commandNode.id ||
            node.metadata?.publish_command_asset_node_id === commandNode.id,
          )
        : null;
      const execution = compactExecution(executionNode);
      const state = executionState(command, execution);
      const configurationValid = targetConfigurationValid(target);
      const delivery = deliveryForTarget(channelDelivery, target);
      const readinessPassed = readiness?.passed === true;
      const authorizationReady = readinessPassed && Boolean(publishApproval);
      const canAuthorize = Boolean(
        authorizationReady &&
        configurationValid &&
        !command,
      );
      const canExecute = Boolean(
        command &&
        ["PENDING_CONNECTOR", "PENDING_PROVIDER"].includes(state),
      );

      return {
        ...target,
        configuration_valid: configurationValid,
        channel_delivery: delivery,
        command,
        execution,
        state,
        can_authorize: canAuthorize,
        can_execute: canExecute,
        can_poll: state === "PENDING_PROVIDER",
        completed: state === "COMPLETED" && Boolean(
          execution?.external_publication_id ||
          execution?.external_publication_url ||
          command?.external_publication_id ||
          command?.external_publication_url,
        ),
        external_publication_id:
          execution?.external_publication_id ||
          command?.external_publication_id ||
          null,
        external_publication_url:
          execution?.external_publication_url ||
          command?.external_publication_url ||
          null,
        error:
          execution?.error ||
          command?.publication_error ||
          delivery?.error ||
          null,
      };
    });

    const completedCount = targets.filter((target) => target.completed).length;
    const pendingCount = targets.filter((target) =>
      ["PENDING_CONNECTOR", "DISPATCHING", "PENDING_PROVIDER"].includes(target.state),
    ).length;
    const failedCount = targets.filter((target) =>
      ["FAILED", "EVIDENCE_REQUIRED"].includes(target.state) ||
      target.configuration_valid === false ||
      target.channel_delivery?.passed === false,
    ).length;

    return {
      contract: "CREATIVE_PUBLISHING_INSPECTION_V1",
      inspected_at: new Date().toISOString(),
      project: {
        id: project.id,
        name: project.name || project.title || "Creative project",
        target_channels: list(project.target_channels),
      },
      master: render,
      release: {
        readiness,
        publish_approval: publishApproval,
        readiness_passed: readiness?.passed === true,
        publication_authorized: Boolean(publishApproval),
        can_approve_publication: Boolean(
          readiness?.passed === true && !publishApproval,
        ),
      },
      channel_delivery: channelDelivery,
      targets,
      summary: {
        target_count: targets.length,
        completed_count: completedCount,
        pending_count: pendingCount,
        failed_count: failedCount,
        unauthorized_count:
          targets.filter((target) => !target.command).length,
      },
      can_publish: Boolean(
        readiness?.passed === true &&
        publishApproval &&
        targets.length > 0,
      ),
    };
  },
};
