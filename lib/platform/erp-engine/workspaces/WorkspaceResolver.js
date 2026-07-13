import {
  getWorkspaceMeta,
  getWorkspaceGroups,
} from "@/lib/platform/registry/erpRegistry";

export function resolveWorkspace(workspaceId) {

  const meta =
    getWorkspaceMeta(workspaceId);


  return {

    meta,

    groups:
      getWorkspaceGroups(workspaceId),


    actions:
      meta?.actions ||
      [],


    topMenu:
      meta?.topMenu ||
      [],


    runtime:
      meta?.runtime ||
      null,


    ui:
      meta?.ui ||
      null,


    create:
      meta?.create ||
      null,

  };

}
