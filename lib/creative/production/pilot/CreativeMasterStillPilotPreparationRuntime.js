import {
  CreativeProjectRuntime,
} from "@/lib/creative/projects/runtime/CreativeProjectRuntime";

import {
  CreativeMissionRuntime,
} from "@/lib/creative/missions/runtime/CreativeMissionRuntime";

import {
  CreativeAssetsRuntime,
} from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";

import {
  CreativeShotDirectorRuntime,
} from "@/lib/creative/director/runtime/CreativeShotDirectorRuntime";

import {
  ProductionGraphRuntime,
} from "@/lib/creative/production-graph/runtime/ProductionGraphRuntime";

import {
  ExecutionRuntime,
} from "@/lib/creative/execution/runtime/ExecutionRuntime";

const CHECKPOINT_VERSION =
  "CREATIVE_MASTER_STILL_PILOT_CHECKPOINT_V1";
const PILOT_SCOPE =
  "ONE_MASTER_STILL_AND_ITS_QA";
const MASTER_STILL = "MASTER_STILL";
const MASTER_STILL_QA = "MASTER_STILL_QA";

function list(value) {
  if (!value) return [];
  return Array.isArray(value)
    ? value.filter(Boolean)
    : [value];
}

function object(value) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value || "").trim();
}

function positiveNumber(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0
    ? number
    : fallback;
}

function referenceId(value) {
  if (
    typeof value === "string" ||
    typeof value === "number"
  ) {
    return text(value);
  }

  return text(
    value?.id ||
    value?.asset_id ||
    value?.reference_asset_id,
  );
}

function normalizeReferenceIds(value) {
  return [
    ...new Set(
      list(value)
        .map(referenceId)
        .filter(Boolean),
    ),
  ];
}

function usableReferenceAsset(asset = {}) {
  if (!asset?.id || asset.archived) return false;

  const source = [
    asset.asset_type,
    asset.mime_type,
    asset.metadata?.mime_type,
    asset.file_name,
    asset.file_url,
    asset.image_url,
    asset.url,
  ].filter(Boolean).join(" ").toLowerCase();

  if (/audio\//.test(source)) return false;
  if (/\.(mp3|wav|aac|m4a|flac)(?:\?|$)/.test(source)) {
    return false;
  }

  return Boolean(
    asset.file_url ||
    asset.image_url ||
    asset.thumbnail_url ||
    asset.url,
  );
}

function assetRank(asset = {}) {
  let score = 0;

  if (!asset.ai_generated) score += 100;
  if (asset.favorite) score += 30;
  if (
    asset.analysis &&
    Object.keys(asset.analysis).length
  ) {
    score += 20;
  }
  if (Array.isArray(asset.tags) && asset.tags.length) {
    score += 10;
  }
  if (asset.name || asset.title || asset.file_name) {
    score += 5;
  }

  score += Math.min(
    25,
    Number(
      asset.performance_score ||
      asset.score ||
      0,
    ),
  );

  return score;
}

function mergeAssets(...groups) {
  const byId = new Map();

  for (const group of groups) {
    for (const asset of group || []) {
      if (!usableReferenceAsset(asset)) continue;

      const key = String(asset.id);
      const existing = byId.get(key);

      if (
        !existing ||
        assetRank(asset) > assetRank(existing)
      ) {
        byId.set(key, asset);
      }
    }
  }

  return [...byId.values()]
    .sort(
      (left, right) =>
        assetRank(right) - assetRank(left),
    )
    .slice(0, 200);
}

function projectBrief(project = {}, mission = {}) {
  const specifications =
    project.metadata?.specifications || {};
  const scenePlan =
    project.metadata?.deliverable_metadata
      ?.scene_plan ||
    specifications.structure ||
    specifications.scene_plan ||
    [];

  return {
    objective:
      project.objective ||
      project.description ||
      mission.objective ||
      "",
    business_goal:
      mission.business_goal ||
      "",
    duration_seconds: Number(
      project.target_duration ||
      specifications.duration ||
      30,
    ),
    target_channels:
      project.target_channels ||
      mission.channels ||
      [],
    target_languages:
      project.target_languages ||
      mission.metadata?.languages ||
      [],
    required_story_beats:
      Array.isArray(scenePlan)
        ? scenePlan
        : [],
    specifications,
    quality_policy:
      project.metadata?.quality_policy ||
      mission.metadata?.quality_policy ||
      {},
    production_mode:
      project.metadata?.production_mode ||
      mission.metadata?.production_mode ||
      "AI_NATIVE",
  };
}

async function resolveAssets({
  organization_id,
  creative_mission_id,
  creative_project_id,
}) {
  const [projectAssets, missionAssets] =
    await Promise.all([
      CreativeAssetsRuntime.list({
        organization_id,
        creative_project_id,
        limit: 200,
      }),
      CreativeAssetsRuntime.list({
        organization_id,
        creative_mission_id,
        limit: 200,
      }),
    ]);

  let organizationAssets = [];

  if (!projectAssets.length || !missionAssets.length) {
    organizationAssets =
      await CreativeAssetsRuntime.list({
        organization_id,
        limit: 200,
      });
  }

  return mergeAssets(
    projectAssets,
    missionAssets,
    organizationAssets,
  );
}

function deliverable(value = {}) {
  return String(
    value.metadata?.deliverable ||
    value.intent?.deliverable ||
    "",
  ).toUpperCase();
}

function service(value = {}) {
  return String(
    value.service_code ||
    value.service ||
    value.generation?.service ||
    "",
  ).toLowerCase();
}

function containsVideo(value = {}) {
  return (
    deliverable(value).includes("VIDEO") ||
    service(value).includes("video")
  );
}

function specification(value = {}) {
  const input = object(value.input);
  const requirements = object(input.requirements);

  return (
    input.specification ||
    requirements.specification ||
    requirements.shot_specification ||
    value.requirements?.specification ||
    value.generation?.input?.specification ||
    {}
  );
}

function sceneNumber(value = {}) {
  return Number(
    specification(value).scene?.number ||
    value.metadata?.scene_number ||
    0,
  );
}

function shotNumber(value = {}) {
  return Number(
    specification(value).shot?.number ||
    value.metadata?.shot_number ||
    0,
  );
}

function findPilotPair(values = [], requestedScene, requestedShot) {
  if (values.some(containsVideo)) return null;

  const master = values.find(
    (value) =>
      deliverable(value) === MASTER_STILL &&
      sceneNumber(value) === Number(requestedScene) &&
      shotNumber(value) === Number(requestedShot),
  );

  if (!master) return null;

  const qa = values.find(
    (value) =>
      deliverable(value) === MASTER_STILL_QA &&
      (
        value.metadata?.inspected_node_id ===
          master.node_id ||
        value.input?.inspected_node_id ===
          master.node_id ||
        value.requirements?.inspected_node_id ===
          master.id ||
        list(value.depends_on).includes(master.id)
      ),
  );

  if (!qa) return null;

  return { master, qa };
}

function findExistingPilotPlan(
  plans,
  requestedScene,
  requestedShot,
) {
  for (const plan of plans || []) {
    const pair = findPilotPair(
      list(plan.steps),
      requestedScene,
      requestedShot,
    );

    if (pair) {
      return { plan, pair };
    }
  }

  return null;
}

function findExistingPilotGraph(
  graphs,
  requestedScene,
  requestedShot,
) {
  for (const graph of graphs || []) {
    if (graph.metadata?.pilot_only !== true) {
      continue;
    }

    const pair = findPilotPair(
      list(graph.nodes),
      requestedScene,
      requestedShot,
    );

    if (pair) {
      return { graph, pair };
    }
  }

  return null;
}

function checkpointFromProject(
  project,
  requestedScene,
  requestedShot,
) {
  const checkpoint =
    project.metadata?.master_still_pilot_checkpoint;

  if (
    checkpoint?.contract_version !==
      CHECKPOINT_VERSION ||
    checkpoint.organization_id !==
      project.organization_id ||
    checkpoint.creative_project_id !==
      project.id ||
    Number(checkpoint.scene_number) !==
      Number(requestedScene) ||
    Number(checkpoint.shot_number) !==
      Number(requestedShot) ||
    !checkpoint.scene ||
    !checkpoint.shot
  ) {
    return null;
  }

  return checkpoint;
}

function selectDirectorShot(
  plan,
  requestedScene,
  requestedShot,
) {
  const scenes = list(plan.scenes);
  const selectedScene = scenes.find(
    (scene, sceneIndex) =>
      Number(
        scene.scene_number ||
        sceneIndex + 1,
      ) === Number(requestedScene),
  );

  if (!selectedScene) {
    throw new Error(
      `PILOT_SCENE_${Number(requestedScene)}_NOT_FOUND`,
    );
  }

  const selectedShot = list(selectedScene.shots).find(
    (shot, shotIndex) =>
      Number(
        shot.shot_number ||
        shotIndex + 1,
      ) === Number(requestedShot),
  );

  if (!selectedShot) {
    throw new Error(
      `PILOT_SCENE_${Number(requestedScene)}_SHOT_${Number(requestedShot)}_NOT_FOUND`,
    );
  }

  const {
    shots: ignoredShots,
    ...sceneWithoutShots
  } = selectedScene;

  return {
    scene: sceneWithoutShots,
    shot: selectedShot,
  };
}

function validateCheckpointReferences(
  checkpoint,
  assets,
) {
  const canonical = new Set(
    list(assets).map((asset) => String(asset.id)),
  );
  const references = normalizeReferenceIds(
    checkpoint.shot.reference_asset_ids ||
    checkpoint.shot.assets,
  );
  const unknown = references.filter(
    (id) => !canonical.has(id),
  );

  if (!references.length) {
    const error = new Error(
      "CREATIVE_MASTER_STILL_PILOT_REFERENCE_REQUIRED",
    );
    error.code = error.message;
    throw error;
  }

  if (unknown.length) {
    const error = new Error(
      "CREATIVE_MASTER_STILL_PILOT_CHECKPOINT_REFERENCE_MISSING",
    );
    error.code = error.message;
    error.details = {
      unknown_reference_asset_ids: unknown,
      canonical_reference_asset_ids:
        [...canonical],
    };
    throw error;
  }

  return references;
}

async function createCheckpoint({
  organization_id,
  project,
  mission,
  assets,
  scene_number,
  shot_number,
}) {
  const brief = projectBrief(project, mission);
  const duration = positiveNumber(
    brief.duration_seconds,
    30,
  );
  const directorPlan =
    await CreativeShotDirectorRuntime.direct({
      organization_id,
      organization: {},
      brand: {},
      industry: null,
      objective: brief.objective,
      brief,
      assets,
      requestedOutputs: [
        {
          id: project.id,
          title: project.name,
          medium:
            project.metadata?.creative_medium ||
            project.production_type,
          formats:
            project.metadata?.formats || [],
          channels:
            project.target_channels || [],
        },
      ],
      durationSeconds: duration,
      platform:
        (project.target_channels || []).join(", ") ||
        "multi-channel",
      budgetMode:
        project.budget_profile ||
        "quality-first",
    });

  const selected = selectDirectorShot(
    directorPlan,
    scene_number,
    shot_number,
  );
  const checkpoint = {
    contract_version: CHECKPOINT_VERSION,
    created_at: new Date().toISOString(),
    organization_id,
    creative_mission_id: mission.id,
    creative_project_id: project.id,
    scene_number: Number(scene_number),
    shot_number: Number(shot_number),
    source: "CREATIVE_SHOT_DIRECTOR_RUNTIME",
    director_plan_version:
      directorPlan.production_version || null,
    title:
      directorPlan.title ||
      project.name ||
      "Master Still Pilot",
    logline:
      directorPlan.logline || null,
    objective:
      directorPlan.objective ||
      brief.objective ||
      null,
    selected_concept:
      object(directorPlan.selected_concept),
    visual_motif:
      directorPlan.visual_motif || null,
    scene: selected.scene,
    shot: selected.shot,
    production_specification:
      directorPlan.production_specification || null,
    director_metadata:
      object(directorPlan.metadata),
  };

  await CreativeProjectRuntime.update(
    project.id,
    {
      metadata: {
        ...(project.metadata || {}),
        master_still_pilot_checkpoint:
          checkpoint,
      },
    },
  );

  return checkpoint;
}

async function buildPilotGraph({
  organization_id,
  creative_project_id,
  project,
  checkpoint,
  referenceIds,
}) {
  const scene = {
    ...checkpoint.scene,
    id: null,
    scene_number:
      Number(checkpoint.scene_number),
    duration_seconds:
      Number(
        checkpoint.shot.duration_seconds ||
        checkpoint.scene.duration_seconds ||
        1,
      ),
  };
  const shot = {
    ...checkpoint.shot,
    id: null,
    scene_id: null,
    scene_number:
      Number(checkpoint.scene_number),
    shot_number:
      Number(checkpoint.shot_number),
    assets: referenceIds,
    reference_asset_ids: referenceIds,
  };
  const fullGraph =
    await ProductionGraphRuntime.plan({
      organization_id,
      creative_project_id,
      storyboard: {
        id: null,
        title:
          checkpoint.title ||
          project.name ||
          "Master Still Pilot",
      },
      scenes: [scene],
      shots: [shot],
      creative_plan: {
        production_direction: {
          creative_standard:
            "world_class_cinematic",
        },
      },
    });

  const master = list(fullGraph.nodes).find(
    (node) =>
      deliverable(node) === MASTER_STILL,
  );
  const qa = list(fullGraph.nodes).find(
    (node) =>
      deliverable(node) === MASTER_STILL_QA &&
      node.metadata?.inspected_node_id ===
        master?.id,
  );

  if (!master || !qa) {
    throw new Error(
      "CREATIVE_MASTER_STILL_PILOT_GRAPH_CONTRACT_INCOMPLETE",
    );
  }

  if (
    service(master) !== "ai.image.generate" ||
    service(qa) !== "ai.image.analyze"
  ) {
    throw new Error(
      "CREATIVE_MASTER_STILL_PILOT_SERVICE_CONTRACT_INVALID",
    );
  }

  const selectedNodeIds = new Set([
    master.id,
    qa.id,
  ]);
  const pilotGraph = {
    ...fullGraph,
    status: "PLANNED",
    title:
      `${project.name || "Creative Project"} - Master Still Pilot`,
    description:
      "Pilot-only graph containing one master still and its visual QA. Video execution is forbidden.",
    nodes: [master, qa],
    edges: list(fullGraph.edges).filter(
      (edge) =>
        selectedNodeIds.has(edge.from) &&
        selectedNodeIds.has(edge.to),
    ),
    production_plan: {
      ...object(fullGraph.production_plan),
      render_modes: [
        "master_still",
        "review",
      ],
    },
    metadata: {
      ...object(fullGraph.metadata),
      pilot_only: true,
      pilot_scope: PILOT_SCOPE,
      video_execution_forbidden: true,
      mandatory_master_still_qa: true,
      mandatory_video_shot_qa: false,
      video_shot_quality_gates: 0,
      total_scenes: 1,
      total_shots: 1,
      total_generated_deliverables: 2,
      scene_number:
        Number(checkpoint.scene_number),
      shot_number:
        Number(checkpoint.shot_number),
      checkpoint_contract_version:
        checkpoint.contract_version,
      checkpoint_created_at:
        checkpoint.created_at,
    },
  };

  if (pilotGraph.nodes.some(containsVideo)) {
    throw new Error(
      "CREATIVE_MASTER_STILL_PILOT_VIDEO_NODE_FORBIDDEN",
    );
  }

  return ProductionGraphRuntime.create(pilotGraph);
}

async function createExecutionPlan({
  organization_id,
  creative_project_id,
  graph,
  checkpoint,
}) {
  const planned = await ExecutionRuntime.plan({
    organization_id,
    creative_project_id,
    production_graph: graph,
  });

  if (
    list(planned.steps).length !== 2 ||
    list(planned.steps).some(containsVideo)
  ) {
    throw new Error(
      "CREATIVE_MASTER_STILL_PILOT_EXECUTION_SCOPE_INVALID",
    );
  }

  const pair = findPilotPair(
    planned.steps,
    checkpoint.scene_number,
    checkpoint.shot_number,
  );

  if (!pair) {
    throw new Error(
      "CREATIVE_MASTER_STILL_PILOT_EXECUTION_PAIR_REQUIRED",
    );
  }

  const stored = await ExecutionRuntime.create({
    ...planned,
    execution_mode: "pilot",
    metadata: {
      ...object(planned.metadata),
      pilot_only: true,
      pilot_scope: PILOT_SCOPE,
      video_execution_forbidden: true,
      checkpoint_contract_version:
        checkpoint.contract_version,
      checkpoint_created_at:
        checkpoint.created_at,
    },
  });

  return stored.plan || stored;
}

function summarize({
  organization_id,
  creative_project_id,
  creative_mission_id,
  checkpoint,
  graph,
  plan,
  reused_checkpoint,
  reused_graph,
  reused_plan,
  reasoning_executed,
}) {
  const nodes = list(graph?.nodes);
  const steps = list(plan?.steps);

  return {
    success: true,
    plan_only: true,
    production_dispatched: false,
    organization_id,
    creative_mission_id,
    creative_project_id,
    pilot_scope: PILOT_SCOPE,
    scene_number:
      Number(checkpoint?.scene_number || 0),
    shot_number:
      Number(checkpoint?.shot_number || 0),
    checkpoint: {
      contract_version:
        checkpoint?.contract_version || null,
      created_at:
        checkpoint?.created_at || null,
      source:
        checkpoint?.source || null,
      reference_asset_ids:
        normalizeReferenceIds(
          checkpoint?.shot?.reference_asset_ids ||
          checkpoint?.shot?.assets,
        ),
    },
    production_graph: graph
      ? {
          id: graph.id || null,
          status: graph.status || null,
          node_count: nodes.length,
          deliverables:
            nodes.map(deliverable),
        }
      : null,
    execution_plan: plan
      ? {
          id: plan.id || null,
          status: plan.status || null,
          step_count: steps.length,
          deliverables:
            steps.map(deliverable),
        }
      : null,
    reuse: {
      checkpoint: reused_checkpoint,
      graph: reused_graph,
      plan: reused_plan,
    },
    reasoning_executed,
    video_nodes_persisted:
      nodes.filter(containsVideo).length,
    video_steps_persisted:
      steps.filter(containsVideo).length,
    video_execution_forbidden: true,
  };
}

export const CreativeMasterStillPilotPreparationRuntime = {
  async ensure({
    organization_id,
    creative_project_id,
    scene_number = 1,
    shot_number = 1,
  } = {}) {
    if (!organization_id) {
      throw new Error("organization_id required");
    }

    if (!creative_project_id) {
      throw new Error("creative_project_id required");
    }

    const requestedScene = Number(scene_number || 1);
    const requestedShot = Number(shot_number || 1);
    const plans = await ExecutionRuntime.list({
      organization_id,
      creative_project_id,
    });
    const existingPlan = findExistingPilotPlan(
      plans,
      requestedScene,
      requestedShot,
    );

    if (existingPlan) {
      const checkpoint = {
        contract_version:
          existingPlan.plan.metadata
            ?.checkpoint_contract_version ||
          CHECKPOINT_VERSION,
        created_at:
          existingPlan.plan.metadata
            ?.checkpoint_created_at ||
          null,
        source: "EXISTING_PILOT_PLAN",
        scene_number: requestedScene,
        shot_number: requestedShot,
        shot: {
          reference_asset_ids:
            existingPlan.pair.master.input
              ?.reference_assets ||
            existingPlan.pair.master.input
              ?.assets ||
            [],
        },
      };

      return summarize({
        organization_id,
        creative_project_id,
        creative_mission_id: null,
        checkpoint,
        graph: null,
        plan: existingPlan.plan,
        reused_checkpoint: true,
        reused_graph: true,
        reused_plan: true,
        reasoning_executed: false,
      });
    }

    const project =
      await CreativeProjectRuntime.get(
        creative_project_id,
      );

    if (
      project.organization_id !==
      organization_id
    ) {
      throw new Error(
        "CREATIVE_PROJECT_ORGANIZATION_MISMATCH",
      );
    }

    const creative_mission_id =
      project.creative_mission_id;

    if (!creative_mission_id) {
      throw new Error(
        "creative_mission_id required",
      );
    }

    const [mission, assets, graphs] =
      await Promise.all([
        CreativeMissionRuntime.get(
          creative_mission_id,
        ),
        resolveAssets({
          organization_id,
          creative_mission_id,
          creative_project_id,
        }),
        ProductionGraphRuntime.list({
          organization_id,
          creative_project_id,
        }),
      ]);

    if (
      mission.organization_id !==
      organization_id
    ) {
      throw new Error(
        "CREATIVE_MISSION_ORGANIZATION_MISMATCH",
      );
    }

    const existingGraph = findExistingPilotGraph(
      graphs,
      requestedScene,
      requestedShot,
    );

    let checkpoint = checkpointFromProject(
      project,
      requestedScene,
      requestedShot,
    );
    let reusedCheckpoint = Boolean(checkpoint);
    let reasoningExecuted = false;

    if (!checkpoint) {
      checkpoint = await createCheckpoint({
        organization_id,
        project,
        mission,
        assets,
        scene_number: requestedScene,
        shot_number: requestedShot,
      });
      reusedCheckpoint = false;
      reasoningExecuted = true;
    }

    const referenceIds =
      validateCheckpointReferences(
        checkpoint,
        assets,
      );

    let graph = existingGraph?.graph || null;
    const reusedGraph = Boolean(graph);

    if (!graph) {
      graph = await buildPilotGraph({
        organization_id,
        creative_project_id,
        project,
        checkpoint,
        referenceIds,
      });
    }

    const plan = await createExecutionPlan({
      organization_id,
      creative_project_id,
      graph,
      checkpoint,
    });

    return summarize({
      organization_id,
      creative_project_id,
      creative_mission_id,
      checkpoint,
      graph,
      plan,
      reused_checkpoint: reusedCheckpoint,
      reused_graph: reusedGraph,
      reused_plan: false,
      reasoning_executed: reasoningExecuted,
    });
  },
};
