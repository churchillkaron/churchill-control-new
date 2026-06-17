import { accountingWorkspace }
from "@/lib/platform/workspaces/accountingWorkspace";

import { pestControlWorkspace }
from "@/lib/platform/workspaces/pestControlWorkspace";

import { entertainmentWorkspace }
from "@/lib/platform/workspaces/entertainmentWorkspace";

import { constructionWorkspace }
from "@/lib/platform/workspaces/constructionWorkspace";

import { restaurantWorkspace }
from "@/lib/platform/workspaces/restaurantWorkspace";

import { hotelWorkspace }
from "@/lib/platform/workspaces/hotelWorkspace";

import { healthcareWorkspace }
from "@/lib/platform/workspaces/healthcareWorkspace";

const workspaces = {

  accounting:
    accountingWorkspace,

  pest_control:
    pestControlWorkspace,

  entertainment:
    entertainmentWorkspace,

  construction:
    constructionWorkspace,

  restaurant:
    restaurantWorkspace,

  hotel:
    hotelWorkspace,

  healthcare:
    healthcareWorkspace,

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
