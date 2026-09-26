import { executeOwnedImageStudioSemanticMask } from "../runtime/CreativeImageStudioOwnedSemanticMaskRuntime.js";
import { validateImageStudioCommand } from "../runtime/CreativeImageStudioWorkspaceRuntime.js";
import { requestImageStudioSmartMask, materializeImageStudioSmartMask } from "../runtime/CreativeImageStudioSmartMaskRuntime.js";
import {
  createImageStudioComment,
  createImageStudioExport,
  createImageStudioSnapshot,
  resolveImageStudioComment,
  updateImageStudioComment,
  upsertImageStudioArtboard,
  upsertImageStudioLayer,
  upsertImageStudioReference,
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
  const base = baseRecord(command);

  if (command.type === "create_artboard" || command.type === "update_artboard") {
    return upsertImageStudioArtboard({ ...base, ...command.payload });
  }
  if (command.type === "place_asset" || command.type === "update_layer") {
    return upsertImageStudioLayer({ ...base, ...command.payload });
  }
  if (command.type === "snapshot_version") {
    return createImageStudioSnapshot({ ...base, ...command.payload });
  }
  if (command.type === "resolve_comment") {
    return resolveImageStudioComment({ ...base, ...command.payload });
  }
  if (command.type === "update_comment") {
    return updateImageStudioComment({ ...base, ...command.payload });
  }
  if (command.type === "add_reference" || command.type === "update_reference") {
    return upsertImageStudioReference({ ...base, ...command.payload });
  }
  if (command.type === "export_artboard") {
    return createImageStudioExport({ ...base, ...command.payload });
  }
  if (command.type === "execute_semantic_mask") {
    return executeOwnedImageStudioSemanticMask({
      organization_id: command.organization_id,
      creative_project_id: command.project_id,
      project: command.project || null,
      ...command.payload,
    });
  }
  if (command.type === "request_smart_mask") {
    return requestImageStudioSmartMask({
      organization_id: command.organization_id,
      creative_project_id: command.project_id,
      actor_id: command.actor_id || null,
      project: command.project || null,
      ...command.payload,
    });
  }
  if (command.type === "materialize_smart_mask") {
    const layer = materializeImageStudioSmartMask(command.payload || {});
    return upsertImageStudioLayer({ ...base, ...layer });
  }
  if (command.type === "create_comment") {
    return createImageStudioComment({ ...base, ...command.payload });
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
