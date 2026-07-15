import {
  getWorkspaceItemByRoute,
} from "@/lib/platform/registry/erpRegistry";

import {
  CreativeMissionRuntime,
} from "@/lib/creative/missions/runtime/CreativeMissionRuntime";

import {
  CreativeProjectRuntime,
} from "@/lib/creative/projects/runtime/CreativeProjectRuntime";

import {
  CreativeBriefRuntime,
} from "@/lib/creative/brief/runtime/CreativeBriefRuntime";

import {
  ResearchRuntime,
} from "@/lib/creative/research/runtime/ResearchRuntime";

import {
  CreativeStrategyRuntime,
} from "@/lib/creative/strategy/runtime/CreativeStrategyRuntime";

import {
  CreativeConceptRuntime,
} from "@/lib/creative/concepts/runtime/CreativeConceptRuntime";

import {
  StoryboardRuntime,
} from "@/lib/creative/storyboard/runtime/StoryboardRuntime";

import {
  SceneRuntime,
} from "@/lib/creative/scenes/runtime/SceneRuntime";

import {
  ShotRuntime,
} from "@/lib/creative/shots/runtime/ShotRuntime";

import {
  CreativeAssetsRuntime,
} from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";

import {
  ProductionRuntime,
} from "@/lib/creative/production/runtime/ProductionRuntime";

import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

import {
  ProductionQueueRuntime,
} from "@/lib/creative/production/queue/runtime/ProductionQueueRuntime";

import {
  CreativeTimelineRuntime,
} from "@/lib/creative/timeline/runtime/CreativeTimelineRuntime";

import {
  RenderingRuntime,
} from "@/lib/creative/rendering/runtime/RenderingRuntime";

import {
  PublishingRuntime,
} from "@/lib/creative/publishing/runtime/PublishingRuntime";


import {
  CreativeDirectorRuntime,
} from "@/lib/creative/director/runtime/CreativeDirectorRuntime";

import {
  CreativeIntelligenceRuntime,
} from "@/lib/creative/intelligence/runtime/CreativeIntelligenceRuntime";

import {
  CreativeStateEngine,
} from "@/lib/creative/state/CreativeStateEngine";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const EMPTY_QUEUE = {
  waiting: [],
  ready: [],
  running: [],
  review: [],
  completed: [],
  total: 0,
};

function isDatabaseOrganizationId(value) {
  return (
    typeof value === "string" &&
    UUID_PATTERN.test(value)
  );
}

function resolveOrganizationId(value) {
  if (typeof value === "string") {
    return value;
  }

  return (
    value?.id ||
    value?.organization_id ||
    value?.organizationId ||
    null
  );
}

function runtimeCommands(runtime) {
  return Object.keys(runtime || {})
    .filter(
      key =>
        typeof runtime[key] === "function",
    );
}

function runtimeState({
  current = null,
  items = [],
  runtime = null,
  status = null,
  permissions = [],
  extra = {},
} = {}) {
  return {
    current,
    items:
      Array.isArray(items)
        ? items
        : [],
    commands:
      runtimeCommands(runtime),
    status:
      status ||
      current?.status ||
      "ready",
    permissions,
    ...extra,
  };
}

function normalizeMissionList(result) {
  if (Array.isArray(result)) {
    return result;
  }

  if (Array.isArray(result?.missions)) {
    return result.missions;
  }

  if (Array.isArray(result?.items)) {
    return result.items;
  }

  return [];
}

function selectMissionAndProject({
  missions = [],
  projects = [],
  requestedId = null,
}) {
  const requestedProject =
    projects.find(
      project =>
        project.id === requestedId,
    ) || null;

  const requestedMission =
    missions.find(
      mission =>
        mission.id === requestedId,
    ) || null;

  const activeMission =
    requestedMission ||
    missions.find(
      mission =>
        mission.id ===
        requestedProject?.creative_mission_id,
    ) ||
    missions[0] ||
    null;

  const missionProjects =
    activeMission
      ? projects.filter(
          project =>
            project.creative_mission_id ===
            activeMission.id,
        )
      : projects;

  const activeProject =
    requestedProject ||
    missionProjects[0] ||
    null;

  return {
    activeMission,
    activeProject,
    missionProjects,
  };
}

function filterConcepts({
  items = [],
  activeMission = null,
  activeProject = null,
}) {
  if (activeProject) {
    return items.filter(
      concept =>
        concept.creative_project_id ===
        activeProject.id,
    );
  }

  if (activeMission) {
    return items.filter(
      concept =>
        concept.creative_mission_id ===
        activeMission.id,
    );
  }

  return [];
}

function createStudioRuntime({
  organizationId,
  route,
  studioDefinition,
  activeMission = null,
  missions = [],
  activeProject = null,
  projects = [],
  briefState = null,
  researchState = null,
  strategyState = null,
  conceptState = null,
  storyboardState = null,
  sceneState = null,
  shotState = null,
  productionState = null,
  tasks = [],
  queue = EMPTY_QUEUE,
  assets = [],
  timelineState = null,
  renderState = null,
  publishingState = null,
  directorState = null,
  creativeState = null,
}) {
  const workspaces =
    studioDefinition?.workspaces || [];

  const workspaceId =
    route[0] ||
    studioDefinition?.defaultWorkspace ||
    "mission";

  const workspace =
    workspaces.find(
      item =>
        item.id === workspaceId,
    ) ||
    workspaces.find(
      item =>
        item.id === "mission",
    ) ||
    null;

  const permissions =
    studioDefinition?.permissions || [];

  const filteredConcepts =
    filterConcepts({
      items:
        conceptState?.items || [],
      activeMission,
      activeProject,
    });

  return {
    organizationId,
    route,
    workspace,
    workspaces,
    commands:
      studioDefinition?.commands || [],
    status: "ready",
    permissions,

    missionRuntime:
      runtimeState({
        current:
          activeMission,
        items:
          missions,
        runtime:
          CreativeMissionRuntime,
        permissions,
      }),

    projectRuntime:
      runtimeState({
        current:
          activeProject,
        items:
          projects,
        runtime:
          CreativeProjectRuntime,
        permissions,
      }),

    briefRuntime:
      briefState ||
      runtimeState({
        runtime:
          CreativeBriefRuntime,
        permissions,
      }),

    researchRuntime:
      researchState ||
      runtimeState({
        runtime:
          ResearchRuntime,
        permissions,
      }),

    strategyRuntime:
      strategyState ||
      runtimeState({
        runtime:
          CreativeStrategyRuntime,
        permissions,
      }),

    conceptRuntime:
      runtimeState({
        current:
          filteredConcepts[0] || null,
        items:
          filteredConcepts,
        runtime:
          CreativeConceptRuntime,
        permissions,
      }),

    storyboardRuntime:
      storyboardState ||
      runtimeState({
        runtime:
          StoryboardRuntime,
        permissions,
      }),

    sceneRuntime:
      sceneState ||
      runtimeState({
        runtime:
          SceneRuntime,
        permissions,
      }),

    shotRuntime:
      shotState ||
      runtimeState({
        runtime:
          ShotRuntime,
        permissions,
      }),

    productionRuntime:
      productionState ||
      runtimeState({
        runtime:
          ProductionRuntime,
        permissions,
      }),

    taskRuntime:
      runtimeState({
        current:
          tasks[0] || null,
        items:
          tasks,
        runtime:
          ProductionTaskRuntime,
        permissions,
      }),

    queueRuntime:
      runtimeState({
        current:
          queue || EMPTY_QUEUE,
        items:
          tasks,
        runtime:
          ProductionQueueRuntime,
        permissions,
        extra: {
          ...(queue || EMPTY_QUEUE),
        },
      }),

    assetRuntime:
      runtimeState({
        current:
          assets[0] || null,
        items:
          assets,
        runtime:
          CreativeAssetsRuntime,
        permissions,
      }),

    timelineRuntime:
      timelineState ||
      runtimeState({
        runtime:
          CreativeTimelineRuntime,
        permissions,
      }),

    renderRuntime:
      renderState ||
      runtimeState({
        runtime:
          RenderingRuntime,
        permissions,
      }),

    renderingRuntime:
      renderState ||
      runtimeState({
        runtime:
          RenderingRuntime,
        permissions,
      }),

    publishingRuntime:
      publishingState ||
      runtimeState({
        runtime:
          PublishingRuntime,
        permissions,
      }),

    directorRuntime:
      runtimeState({
        current:
          directorState,
        runtime:
          CreativeDirectorRuntime,
        permissions,
      }),

    intelligenceRuntime:
      runtimeState({
        runtime:
          CreativeIntelligenceRuntime,
        permissions,
      }),

    stateRuntime:
      runtimeState({
        current:
          creativeState,
        permissions,
      }),
  };
}

function createDemoRuntime({
  organizationId,
  route,
  studioDefinition,
}) {
  const activeMission = {
    id: "demo-mission",
    name:
      "Avantiqo Creative Mission",
    title:
      "Avantiqo Creative Mission",
    business_goal:
      "Build a complete creative mission",
    objective:
      "Create, produce, render, and publish creative work.",
    status: "draft",
    mission_type:
      "creative_project",
    currency: "USD",
    budget: 0,
  };

  return createStudioRuntime({
    organizationId,
    route,
    studioDefinition,
    activeMission,
    missions: [
      activeMission,
    ],
  });
}

export async function resolveCreativeStudioRuntime({
  organizationId,
  pageId = null,
  workspace = [],
} = {}) {
  const resolvedOrganizationId =
    resolveOrganizationId(
      organizationId,
    );

  const route =
    Array.isArray(workspace) &&
    workspace.length
      ? workspace
      : ["mission"];

  const studioDefinition =
    getWorkspaceItemByRoute(
      "/commercial/design",
    ) || {};

  if (
    !isDatabaseOrganizationId(
      resolvedOrganizationId,
    )
  ) {
    return createDemoRuntime({
      organizationId:
        resolvedOrganizationId,
      route,
      studioDefinition,
    });
  }

  const [
    missionResult,
    allProjects,
  ] =
    await Promise.all([
      CreativeMissionRuntime.list({
        organizationId:
          resolvedOrganizationId,
      }),

      CreativeProjectRuntime.list({
        organizationId:
          resolvedOrganizationId,
      }),
    ]);

  const missions =
    normalizeMissionList(
      missionResult,
    );

  console.log(
    "MISSION RESULT",
    missionResult,
  );

  console.log(
    "MISSIONS",
    missions,
  );

  const {
    activeMission,
    activeProject,
    missionProjects,
  } =
    selectMissionAndProject({
      missions,
      projects:
        Array.isArray(allProjects)
          ? allProjects
          : [],
      requestedId:
        route[1] ||
        pageId ||
        null,
    });

  const permissions =
    studioDefinition?.permissions || [];

  const missionInput =
    activeMission
      ? {
          organization_id:
            resolvedOrganizationId,
          creative_mission_id:
            activeMission.id,
          mission_id:
            activeMission.id,
        }
      : null;

  const projectInput =
    activeProject
      ? {
          organization_id:
            resolvedOrganizationId,
          creative_mission_id:
            activeMission?.id ||
            activeProject.creative_mission_id ||
            null,
          creative_project_id:
            activeProject.id,
          project_id:
            activeProject.id,
        }
      : null;

  const [
    briefState,
    researchState,
    strategyState,
    conceptState,
    storyboardState,
    sceneState,
    shotState,
    productionState,
    tasks,
    queue,
    assets,
    timelineState,
    renderState,
    publishingState,
    creativeState,
  ] =
    await Promise.all([
      CreativeBriefRuntime.resolve(
        {
          ...(projectInput || {}),
          ...(missionInput || {}),
        },
        permissions,
      ),

      projectInput
        ? ResearchRuntime.resolve(
            projectInput,
            permissions,
          )
        : null,

      projectInput
        ? CreativeStrategyRuntime.resolve(
            projectInput,
            permissions,
          )
        : null,

      CreativeConceptRuntime.resolve(
        resolvedOrganizationId,
        permissions,
      ),

      projectInput
        ? StoryboardRuntime.resolve(
            projectInput,
            permissions,
          )
        : null,

      projectInput
        ? SceneRuntime.resolve(
            projectInput,
            permissions,
          )
        : null,

      projectInput
        ? ShotRuntime.resolve(
            projectInput,
            permissions,
          )
        : null,

      projectInput
        ? ProductionRuntime.resolve(
            projectInput,
            permissions,
          )
        : null,

      projectInput
        ? ProductionTaskRuntime.list(
            projectInput,
          )
        : [],

      projectInput
        ? ProductionQueueRuntime.build(
            projectInput,
          )
        : EMPTY_QUEUE,

      activeMission
        ? CreativeAssetsRuntime.list({
            organization_id:
              resolvedOrganizationId,
            creative_mission_id:
              activeMission.id,
            creative_project_id:
              activeProject?.id ||
              null,
          })
        : [],

      projectInput
        ? CreativeTimelineRuntime.resolve(
            projectInput,
            permissions,
          )
        : null,

      projectInput
        ? RenderingRuntime.resolve(
            projectInput,
            permissions,
          )
        : null,

      projectInput
        ? PublishingRuntime.resolve(
            projectInput,
            permissions,
          )
        : null,

      CreativeStateEngine.get(
        (() => {

          const input = {
            ...(projectInput || {}),
            ...(missionInput || {}),
          };

          console.log(
            "CREATIVE STATE INPUT",
            input
          );

          return input;

        })()
      ),
    ]);

  console.log(
    "CREATIVE STATE RESULT",
    creativeState
  );

  return createStudioRuntime({
    organizationId:
      resolvedOrganizationId,
    route,
    studioDefinition,
    activeMission,
    missions,
    activeProject,
    projects:
      missionProjects,
    briefState,
    researchState,
    strategyState,
    conceptState,
    storyboardState,
    sceneState,
    shotState,
    productionState,
    tasks:
      Array.isArray(tasks)
        ? tasks
        : [],
    queue:
      queue || EMPTY_QUEUE,
    assets:
      Array.isArray(assets)
        ? assets
        : [],
    timelineState,
    renderState,
    publishingState,
    directorState: null,
    creativeState,
  });
}
