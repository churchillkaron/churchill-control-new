import {
  validateImageStudioCommand,
} from "../runtime/CreativeImageStudioWorkspaceRuntime.js";
import {
  createImageStudioSnapshot,
  upsertImageStudioArtboard,
  upsertImageStudioLayer,
} from "../repositories/CreativeImageStudioWorkspaceRepository.js";

function baseRecord(command) {
  return {
    organization_id: command.organization_id,
    creative_project_id: command.project_id,
    created_by: command.actor_id || null,
  };
}

export async function executeImageStudioWorkspaceAction(input = {}) {
  const command = validateImageStudioCommand(input);

  if (command.type === "create_artboard" || command.type === "update_artboard") {
    return upsertImageStudioArtboard({
      ...baseRecord(command),
      ...command.payload,
    });
  }
  if (command.type === "place_asset" || command.type === "update_layer") {
    return upsertImageStudioLayer({
      ...baseRecord(command),
      ...command.payload,
    });
  }

  if (command.type === "snapshot_version") {
    return createImageStudioSnapshot({
      ...baseRecord(command),
      ...command.payload,
    });
  }
  return {
    delegated: true,
    command,
    execution_surface: "CANONICAL_CREATIVE_PRODUCTION",
  };
}

export const CreativeImageStudioWorkspaceActions = Object.freeze({
  contract: "CREATIVE_IMAGE_STUDIO_WORKSPACE_ACTIONS_V1",
  execute: executeImageStudioWorkspaceAction,
});
