import { accountingWorkspace }
from "@/lib/platform/workspaces/accountingWorkspace";

import { hospitalityWorkspace }
from "@/lib/platform/workspaces/hospitalityWorkspace";

import { pestControlWorkspace }
from "@/lib/platform/workspaces/pestControlWorkspace";

import { entertainmentWorkspace }
from "@/lib/platform/workspaces/entertainmentWorkspace";

import { constructionWorkspace }
from "@/lib/platform/workspaces/constructionWorkspace";

const workspaces = {

  accounting:
    accountingWorkspace,

  hospitality:
    hospitalityWorkspace,

  pest_control:
    pestControlWorkspace,

  entertainment:
    entertainmentWorkspace,

  construction:
    constructionWorkspace,

};

export function getWorkspaceDefinition(
  industry
) {

  return (
    workspaces[
      industry
    ] || null
  );

}
