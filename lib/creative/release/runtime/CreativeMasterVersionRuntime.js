import crypto from "node:crypto";

import {
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import * as CreativeProjectRepository
from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import {
  creativeStorageReference,
  signCreativeStorageReference,
} from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";

const CONTRACT = "CREATIVE_MASTER_VERSION_HISTORY_V1";

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

export function creativeNodeTimestamp(node = {}) {
  return Date.parse(node.updated_at || node.created_at || 0) || 0;
}

export function newestCreativeNode(nodes = [], predicate = () => true) {
  return [...nodes]
    .filter(predicate)
    .sort((left, right) => creativeNodeTimestamp(right) - creativeNodeTimestamp(left))[0] || null;
}

export function creativeDeliveryDerivativeIds(nodes = []) {
  const ids = new Set();
  for (const node of nodes) {
    if (
      node.type === CREATIVE_ASSET_NODE_TYPES.QUALITY_REPORT &&
      node.lineage?.source === "temporal_channel_delivery"
    ) {
      for (const delivery of list(node.metadata?.deliveries)) {
        if (delivery?.render_asset_node_id) ids.add(delivery.render_asset_node_id);
      }
    }
    if (node.type === CREATIVE_ASSET_NODE_TYPES.RELEASE_PACKAGE) {
      for (const derivative of list(node.metadata?.derivatives)) {
        if (derivative?.render_asset_node_id) ids.add(derivative.render_asset_node_id);
      }
    }
  }
  return ids;
}

export function creativePrimaryMasters(nodes = []) {
  const derivativeIds = creativeDeliveryDerivativeIds(nodes);
  return nodes
    .filter((node) => node.type === CREATIVE_ASSET_NODE_TYPES.FINAL_RENDER)
    .filter((node) => node.metadata?.release_derivative !== true)
    .filter((node) => !derivativeIds.has(node.id))
    .sort((left, right) => creativeNodeTimestamp(left) - creativeNodeTimestamp(right));
}

export function currentCreativePrimaryMaster(nodes = []) {
  return creativePrimaryMasters(nodes).at(-1) || null;
}

export function currentCreativeMasterMatchesReadiness(nodes = [], readiness = null) {
  const current = currentCreativePrimaryMaster(nodes);
  return Boolean(
    current &&
    readiness?.type === CREATIVE_ASSET_NODE_TYPES.RELEASE_READINESS_REPORT &&
    readiness.metadata?.final_render_asset_node_id === current.id,
  );
}

function identityOf(node = {}) {
  return (
    node.metadata?.dossier_hash ||
    node.metadata?.release_gate_identity ||
    node.metadata?.render_identity ||
    node.metadata?.release_readiness_identity ||
    null
  );
}

function currentApprovalFor(nodes, subject, scope) {
  if (!subject) return null;
  return newestCreativeNode(nodes, (node) =>
    node.type === CREATIVE_ASSET_NODE_TYPES.APPROVAL_RECORD &&
    node.status === CREATIVE_ASSET_NODE_STATUS.APPROVED &&
    node.parent_asset_node_id === subject.id &&
    node.metadata?.subject_asset_node_id === subject.id &&
    node.metadata?.subject_updated_at === (subject.updated_at || null) &&
    node.metadata?.subject_identity === identityOf(subject) &&
    node.metadata?.scope === scope &&
    Boolean(node.metadata?.approver_user_id) &&
    Boolean(node.metadata?.approver_staff_account_id),
  );
}

function readinessFor(nodes, masterId) {
  return newestCreativeNode(nodes, (node) =>
    node.type === CREATIVE_ASSET_NODE_TYPES.RELEASE_READINESS_REPORT &&
    node.metadata?.final_render_asset_node_id === masterId,
  );
}

function packageFor(nodes, masterId, readinessId = null) {
  return newestCreativeNode(nodes, (node) =>
    node.type === CREATIVE_ASSET_NODE_TYPES.RELEASE_PACKAGE &&
    node.metadata?.master_render_asset_node_id === masterId &&
    (!readinessId || node.parent_asset_node_id === readinessId) &&
    node.metadata?.certified === true &&
    node.metadata?.immutable === true,
  );
}

function commandsFor(nodes, readinessId) {
  return nodes.filter((node) =>
    node.type === CREATIVE_ASSET_NODE_TYPES.PUBLISH_COMMAND &&
    node.metadata?.release_readiness_report_id === readinessId,
  );
}

function executionFor(nodes, commandId) {
  return newestCreativeNode(nodes, (node) =>
    node.type === CREATIVE_ASSET_NODE_TYPES.PUBLISH_EXECUTION &&
    (
      node.parent_asset_node_id === commandId ||
      node.metadata?.publish_command_asset_node_id === commandId
    ),
  );
}

function compactTechnical(node = {}) {
  return {
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
  };
}

async function signedPreview(organizationId, node) {
  if (!node?.url) return { url: null, error: null };
  if (!creativeStorageReference(node.url)) return { url: node.url, error: null };
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
      error: error?.message || "MASTER_VERSION_PREVIEW_SIGNING_FAILED",
    };
  }
}

function versionRecord(nodes, master, index, currentMasterId) {
  const readiness = readinessFor(nodes, master.id);
  const finalApproval = currentApprovalFor(nodes, master, "FINAL_RENDER");
  const releasePackage = packageFor(nodes, master.id, readiness?.id || null);
  const publishApproval = readiness
    ? currentApprovalFor(nodes, readiness, "PUBLISH_RELEASE")
    : null;
  const commands = readiness ? commandsFor(nodes, readiness.id) : [];
  const executions = commands.map((command) => executionFor(nodes, command.id)).filter(Boolean);
  const published = executions.filter((execution) =>
    execution.metadata?.execution_status === "COMPLETED" &&
    (
      execution.metadata?.external_publication_id ||
      execution.metadata?.external_publication_url
    ),
  );

  return {
    version: index + 1,
    label: `V${index + 1}`,
    current: master.id === currentMasterId,
    master_asset_node_id: master.id,
    master_render_identity: master.metadata?.render_identity || null,
    status: master.status,
    technical: compactTechnical(master),
    export_profile: master.metadata?.export_profile || null,
    final_render_approval: finalApproval ? {
      id: finalApproval.id,
      approved_at: finalApproval.metadata?.approved_at || finalApproval.created_at || null,
    } : null,
    release_readiness: readiness ? {
      id: readiness.id,
      passed: readiness.metadata?.passed === true,
      identity: readiness.metadata?.release_readiness_identity || null,
      evaluated_at: readiness.metadata?.evaluated_at || readiness.created_at || null,
    } : null,
    release_package: releasePackage ? {
      id: releasePackage.id,
      certified: releasePackage.metadata?.certified === true,
      identity: releasePackage.metadata?.release_package_identity || null,
      derivative_count: finite(releasePackage.metadata?.derivative_count, 0),
      channels: list(releasePackage.metadata?.channels),
      certified_at: releasePackage.metadata?.certified_at || releasePackage.created_at || null,
    } : null,
    publish_approval: publishApproval ? {
      id: publishApproval.id,
      approved_at: publishApproval.metadata?.approved_at || publishApproval.created_at || null,
    } : null,
    publication_count: published.length,
    published_targets: commands
      .filter((command) => published.some((execution) =>
        execution.parent_asset_node_id === command.id ||
        execution.metadata?.publish_command_asset_node_id === command.id,
      ))
      .map((command) => command.metadata?.publish_target_id)
      .filter(Boolean),
    created_at: master.created_at || null,
    updated_at: master.updated_at || null,
  };
}

function compareValue(left, right) {
  return left === right ? null : { from: left ?? null, to: right ?? null };
}

function comparison(left, right) {
  if (!left || !right) return null;
  const leftTech = left.technical || {};
  const rightTech = right.technical || {};
  const changes = {
    checksum: compareValue(leftTech.checksum, rightTech.checksum),
    duration_seconds: compareValue(leftTech.duration_seconds, rightTech.duration_seconds),
    resolution: compareValue(
      leftTech.width && leftTech.height ? `${leftTech.width}x${leftTech.height}` : null,
      rightTech.width && rightTech.height ? `${rightTech.width}x${rightTech.height}` : null,
    ),
    frame_rate: compareValue(leftTech.frame_rate, rightTech.frame_rate),
    video_codec: compareValue(leftTech.video_codec, rightTech.video_codec),
    audio_codec: compareValue(leftTech.audio_codec, rightTech.audio_codec),
    export_profile: compareValue(
      left.export_profile?.id || left.export_profile?.name || null,
      right.export_profile?.id || right.export_profile?.name || null,
    ),
    final_render_approved: compareValue(Boolean(left.final_render_approval), Boolean(right.final_render_approval)),
    readiness_passed: compareValue(Boolean(left.release_readiness?.passed), Boolean(right.release_readiness?.passed)),
    package_certified: compareValue(Boolean(left.release_package?.certified), Boolean(right.release_package?.certified)),
    publish_approved: compareValue(Boolean(left.publish_approval), Boolean(right.publish_approval)),
    publication_count: compareValue(left.publication_count || 0, right.publication_count || 0),
  };
  return {
    identity: crypto.createHash("sha256").update(JSON.stringify({
      contract: CONTRACT,
      left_master_id: left.master_asset_node_id,
      left_checksum: leftTech.checksum || null,
      right_master_id: right.master_asset_node_id,
      right_checksum: rightTech.checksum || null,
    })).digest("hex"),
    left_version: left.version,
    right_version: right.version,
    changed_fields: Object.entries(changes)
      .filter(([, value]) => value)
      .map(([key]) => key),
    changes: Object.fromEntries(Object.entries(changes).filter(([, value]) => value)),
  };
}

export const CreativeMasterVersionRuntime = Object.freeze({
  contract: CONTRACT,

  async inspect({
    organization_id,
    creative_project_id,
    left_master_asset_node_id = null,
    right_master_asset_node_id = null,
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");

    const [project, nodes] = await Promise.all([
      CreativeProjectRepository.getById(creative_project_id),
      AssetGraphRepository.listByProject({ organization_id, creative_project_id }),
    ]);
    if (!project || text(project.organization_id) !== text(organization_id)) {
      throw new Error("Creative project not found");
    }

    const masters = creativePrimaryMasters(nodes);
    const current = masters.at(-1) || null;
    const versions = masters.map((master, index) =>
      versionRecord(nodes, master, index, current?.id || null),
    );
    const right = right_master_asset_node_id
      ? versions.find((item) => item.master_asset_node_id === right_master_asset_node_id)
      : versions.at(-1) || null;
    const left = left_master_asset_node_id
      ? versions.find((item) => item.master_asset_node_id === left_master_asset_node_id)
      : versions.length > 1
        ? versions.at(-2)
        : null;

    const previewNodes = [left, right]
      .filter(Boolean)
      .map((item) => masters.find((master) => master.id === item.master_asset_node_id))
      .filter(Boolean);
    const previews = new Map();
    await Promise.all(previewNodes.map(async (node) => {
      previews.set(node.id, await signedPreview(organization_id, node));
    }));

    const withPreview = (item) => item ? {
      ...item,
      preview_url: previews.get(item.master_asset_node_id)?.url || null,
      preview_error: previews.get(item.master_asset_node_id)?.error || null,
    } : null;

    return {
      contract: CONTRACT,
      current_master_asset_node_id: current?.id || null,
      current_version: versions.at(-1)?.version || 0,
      version_count: versions.length,
      versions,
      compare: {
        left: withPreview(left),
        right: withPreview(right),
        diff: comparison(left, right),
      },
    };
  },
});

export const CREATIVE_MASTER_VERSION_HISTORY_CONTRACT = CONTRACT;
