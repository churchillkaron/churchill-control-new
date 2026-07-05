import { CreativeProjectsRuntime } from "@/lib/creative/projects/runtime/CreativeProjectsRuntime";

import { SceneRuntime } from "@/lib/creative/scenes/runtime/SceneRuntime";
import { ShotRuntime } from "@/lib/creative/shots/runtime/ShotRuntime";
import { ProductionTaskRuntime } from "@/lib/creative/production/tasks/runtime/ProductionTaskRuntime";
import { CreativeAssetGraphRuntime } from "@/lib/creative/assets/graph/runtime/CreativeAssetGraphRuntime";

export async function resolveCreativeStudioRuntime({
  organizationId,
  workspace = [],
} = {}) {

  const route =
    Array.isArray(workspace) && workspace.length
      ? workspace
      : ["studio"];

  const workspaceId = route[0];
  const projectId = route[1] || null;

  const assets =
    await CreativeProjectsRuntime.list(organizationId);

  // 🔥 AUTO-SELECT ACTIVE PROJECT (CRITICAL FIX)
  const activeAsset =
    projectId
      ? assets.find(a => a.id === projectId)
      : assets[0] || null;

  const activeProjectId = activeAsset?.id || null;

  const sceneRuntime = activeProjectId
    ? await SceneRuntime.list({
        organization_id: organizationId,
        creative_project_id: activeProjectId,
      })
    : [];

  const shotRuntime = activeProjectId
    ? await ShotRuntime.list({
        organization_id: organizationId,
        creative_project_id: activeProjectId,
      })
    : [];

  const taskRuntime = activeProjectId
    ? await ProductionTaskRuntime.list({
        organization_id: organizationId,
        creative_project_id: activeProjectId,
      })
    : [];

  const assetRuntime = activeProjectId
    ? await CreativeAssetGraphRuntime.list({
        organization_id: organizationId,
        creative_project_id: activeProjectId,
      })
    : [];

  return {
    organizationId,
    route,

    workspace: {
      id: workspaceId,
    },

    projectRuntime: {
      project: activeAsset,
      projectId: activeProjectId,
      projects: assets,
    },

    data: {
      scenes: sceneRuntime,
      shots: shotRuntime,
      tasks: taskRuntime,
      assets: assetRuntime,
    },

    context: {
      organization_id: organizationId,
      workspace_id: workspaceId,
    },
  };
}
