import {
  resolveWorkspace,
} from "@/lib/platform/erp-engine/workspaces/WorkspaceResolver";


export async function getOrganizationWorkspace({
  userEmail,
  organizationId,
}) {

  return {

    organizationId,

    userEmail,

    workspaces: {

      "supply-chain":
        resolveWorkspace("supply-chain"),

      finance:
        resolveWorkspace("finance"),

    },

  };

}
