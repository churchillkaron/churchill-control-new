import {
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import {
  CreativeApprovalRuntime,
} from "@/lib/creative/release/runtime/CreativeApprovalRuntime";
import {
  currentCreativePrimaryMaster,
  newestCreativeNode,
} from "@/lib/creative/release/runtime/CreativeMasterVersionRuntime";
import {
  CreativePublishExecutionRuntime,
} from "@/lib/creative/release/runtime/CreativePublishExecutionRuntime";

const CONTRACT = "CREATIVE_PUBLISH_EXECUTION_CURRENT_MASTER_V2";

function normalized(value) {
  return String(value || "").trim().toLowerCase();
}

function currentReadiness(nodes, master) {
  if (!master?.id) return null;
  return newestCreativeNode(nodes, (node) =>
    node.type === CREATIVE_ASSET_NODE_TYPES.RELEASE_READINESS_REPORT &&
    node.metadata?.passed === true &&
    node.metadata?.final_render_asset_node_id === master.id,
  );
}

function packageDerivativeForCommand(releasePackage, command) {
  const derivatives = Array.isArray(releasePackage?.metadata?.derivatives)
    ? releasePackage.metadata.derivatives
    : [];
  const commandChannel = normalized(command.metadata?.certified_derivative_channel);
  const commandRenderId = command.metadata?.final_render_asset_node_id || null;
  return derivatives.find((entry) =>
    entry.render_asset_node_id === commandRenderId &&
    normalized(entry.channel) === commandChannel,
  ) || null;
}

export const CreativePublishExecutionRuntimeV2 = Object.freeze({
  contract: CONTRACT,

  async execute({
    organization_id,
    publish_command_asset_node_id,
    executed_by,
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!publish_command_asset_node_id) {
      throw new Error("publish_command_asset_node_id required");
    }

    const command = await AssetGraphRepository.getById(
      publish_command_asset_node_id,
    );
    if (
      !command ||
      String(command.organization_id) !== String(organization_id) ||
      command.type !== CREATIVE_ASSET_NODE_TYPES.PUBLISH_COMMAND
    ) {
      throw new Error("PUBLISH_COMMAND_REQUIRED");
    }

    const nodes = await AssetGraphRepository.listByProject({
      organization_id,
      creative_project_id: command.creative_project_id,
    });
    const currentMaster = currentCreativePrimaryMaster(nodes);
    if (!currentMaster?.id || !currentMaster.technical?.checksum) {
      throw new Error("CURRENT_RELEASE_MASTER_REQUIRED");
    }

    if (command.metadata?.release_master_asset_node_id !== currentMaster.id) {
      throw new Error("STALE_PUBLISH_COMMAND_MASTER_VERSION");
    }
    if (
      command.metadata?.release_master_checksum !== currentMaster.technical.checksum
    ) {
      throw new Error("STALE_PUBLISH_COMMAND_MASTER_CHECKSUM");
    }

    const readiness = currentReadiness(nodes, currentMaster);
    if (!readiness) throw new Error("CURRENT_MASTER_RELEASE_READINESS_REQUIRED");
    if (
      command.metadata?.release_readiness_report_id !== readiness.id ||
      command.metadata?.release_readiness_identity !==
        readiness.metadata?.release_readiness_identity
    ) {
      throw new Error("STALE_PUBLISH_COMMAND_RELEASE_READINESS");
    }

    const approval = await CreativeApprovalRuntime.findCurrentApproval({
      organization_id,
      subject_asset_node_id: readiness.id,
      scope: "PUBLISH_RELEASE",
    });
    if (!approval) throw new Error("CURRENT_PUBLISH_RELEASE_APPROVAL_REQUIRED");
    if (command.metadata?.publish_approval_record_id !== approval.id) {
      throw new Error("STALE_PUBLISH_COMMAND_APPROVAL");
    }

    const releasePackage = nodes.find((node) =>
      node.id === command.metadata?.release_package_id &&
      node.type === CREATIVE_ASSET_NODE_TYPES.RELEASE_PACKAGE &&
      node.metadata?.certified === true &&
      node.metadata?.immutable === true,
    );
    if (!releasePackage) throw new Error("CURRENT_CERTIFIED_RELEASE_PACKAGE_REQUIRED");
    if (
      releasePackage.parent_asset_node_id !== readiness.id ||
      releasePackage.metadata?.release_readiness_report_id !== readiness.id ||
      releasePackage.metadata?.release_readiness_identity !==
        readiness.metadata?.release_readiness_identity
    ) {
      throw new Error("STALE_RELEASE_PACKAGE_READINESS");
    }
    if (
      releasePackage.metadata?.master_render_asset_node_id !== currentMaster.id ||
      releasePackage.metadata?.master_checksum !== currentMaster.technical.checksum
    ) {
      throw new Error("STALE_RELEASE_PACKAGE_MASTER_VERSION");
    }
    if (
      command.metadata?.release_package_identity !==
      releasePackage.metadata?.release_package_identity
    ) {
      throw new Error("PUBLISH_COMMAND_RELEASE_PACKAGE_IDENTITY_MISMATCH");
    }

    const packageDerivative = packageDerivativeForCommand(releasePackage, command);
    if (!packageDerivative?.render_asset_node_id || !packageDerivative?.checksum) {
      throw new Error("CERTIFIED_TARGET_DERIVATIVE_REQUIRED");
    }
    if (
      packageDerivative.checksum !== command.metadata?.certified_derivative_checksum
    ) {
      throw new Error("PUBLISH_COMMAND_DERIVATIVE_CHECKSUM_MISMATCH");
    }

    const derivative = nodes.find((node) =>
      node.id === packageDerivative.render_asset_node_id &&
      node.type === CREATIVE_ASSET_NODE_TYPES.FINAL_RENDER,
    );
    if (!derivative?.url || !derivative.technical?.checksum) {
      throw new Error("CERTIFIED_TARGET_DERIVATIVE_MEDIA_REQUIRED");
    }
    if (
      derivative.technical.checksum !== packageDerivative.checksum ||
      derivative.technical.checksum !== command.metadata?.certified_derivative_checksum
    ) {
      throw new Error("CERTIFIED_DERIVATIVE_CHANGED_AFTER_AUTHORIZATION");
    }
    if (
      command.metadata?.final_render_asset_node_id !== derivative.id ||
      normalized(command.metadata?.certified_derivative_channel) !==
        normalized(packageDerivative.channel)
    ) {
      throw new Error("PUBLISH_COMMAND_DERIVATIVE_IDENTITY_MISMATCH");
    }

    return CreativePublishExecutionRuntime.execute({
      organization_id,
      publish_command_asset_node_id,
      executed_by,
    });
  },
});
