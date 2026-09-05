import {
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import {
  currentCreativePrimaryMaster,
} from "@/lib/creative/release/runtime/CreativeMasterVersionRuntime";
import {
  CreativePublishExecutionRuntime,
} from "@/lib/creative/release/runtime/CreativePublishExecutionRuntime";

export const CreativePublishExecutionRuntimeV2 = Object.freeze({
  contract: "CREATIVE_PUBLISH_EXECUTION_CURRENT_MASTER_V1",

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
    if (!currentMaster?.id) throw new Error("CURRENT_RELEASE_MASTER_REQUIRED");

    if (command.metadata?.release_master_asset_node_id !== currentMaster.id) {
      throw new Error("STALE_PUBLISH_COMMAND_MASTER_VERSION");
    }
    if (
      command.metadata?.release_master_checksum &&
      command.metadata.release_master_checksum !== currentMaster.technical?.checksum
    ) {
      throw new Error("STALE_PUBLISH_COMMAND_MASTER_CHECKSUM");
    }

    const releasePackage = nodes.find((node) =>
      node.id === command.metadata?.release_package_id &&
      node.type === CREATIVE_ASSET_NODE_TYPES.RELEASE_PACKAGE &&
      node.metadata?.certified === true &&
      node.metadata?.immutable === true,
    );
    if (!releasePackage) throw new Error("CURRENT_CERTIFIED_RELEASE_PACKAGE_REQUIRED");
    if (
      releasePackage.metadata?.master_render_asset_node_id !== currentMaster.id ||
      releasePackage.metadata?.master_checksum !== currentMaster.technical?.checksum
    ) {
      throw new Error("STALE_RELEASE_PACKAGE_MASTER_VERSION");
    }
    if (
      command.metadata?.release_package_identity !==
      releasePackage.metadata?.release_package_identity
    ) {
      throw new Error("PUBLISH_COMMAND_RELEASE_PACKAGE_IDENTITY_MISMATCH");
    }

    return CreativePublishExecutionRuntime.execute({
      organization_id,
      publish_command_asset_node_id,
      executed_by,
    });
  },
});
