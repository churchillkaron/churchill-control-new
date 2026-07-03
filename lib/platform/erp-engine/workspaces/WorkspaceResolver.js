import {
  getWorkspaceMeta,
  getWorkspaceGroups,
} from "@/lib/platform/registry/erpRegistry";

export function resolveWorkspace(workspaceId) {

  return {

    meta:
      getWorkspaceMeta(workspaceId),

    groups:
      getWorkspaceGroups(workspaceId),

  };

}
