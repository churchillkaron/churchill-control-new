import {
  CreativeMissionRuntime,
} from "@/lib/creative/missions/runtime/CreativeMissionRuntime";
import { CreativeAssetsRuntime } from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isDatabaseOrganizationId(value) {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function createRuntime({
  organizationId,
  route,
  missions = [],
  activeMission = null,
  assets = [],
}) {
  return {

    organizationId,

    route,

    missionRuntime: {

      missions,

      mission:
        activeMission,

      missionId:
        activeMission?.id || null,

    },

    assetRuntime: {

      items:
        assets,

    },

    timelineRuntime: null,

    taskRuntime: {

      items: [],

    },

    queueRuntime: {

      total: 0,

    },

  };
}

function createDemoRuntime({
  organizationId,
  route,
}) {
  const activeMission = {
    id: "demo-mission",
    name: "Avantiqo Creative Mission",
    title: "Avantiqo Creative Mission",
    status: "draft",
    mission_type: "creative_project",
  };

  return createRuntime({
    organizationId,
    route,
    missions: [activeMission],
    activeMission,
    assets: [],
  });
}

export async function resolveCreativeStudioRuntime({
  organizationId,
  pageId = null,
  workspace = [],
} = {}) {

  const route =
    Array.isArray(workspace) && workspace.length
      ? workspace
      : ["campaign"];

  const missionId =
    route[1] || null;

  if (!isDatabaseOrganizationId(organizationId)) {
    return createDemoRuntime({
      organizationId,
      route,
    });
  }

  const {
    missions,
  } =
    await CreativeMissionRuntime.list({
      organizationId,
    });


  const activeMission =
    missionId
      ? missions.find(
          m => m.id === missionId,
        )
      : missions[0] || null;


  const assets =
    activeMission
      ? await CreativeAssetsRuntime.list({
          organization_id:
            organizationId,

          creative_mission_id:
            activeMission.id,
        })
      : [];


  return createRuntime({
    organizationId,
    route,
    missions,
    activeMission,
    assets,
  });

}
