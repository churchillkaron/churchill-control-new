import {
  ProductionGraphRuntime,
} from "./ProductionGraphRuntime.js";
import {
  ShotRuntime,
} from "@/lib/creative/shots/runtime/ShotRuntime";
import {
  SceneRuntime,
} from "@/lib/creative/scenes/runtime/SceneRuntime";
import {
  convergeCreativeAssetManifestTargets,
} from "../planner/CreativeAssetManifestConvergence.js";

const PATCH_FLAG = Symbol.for(
  "avantiqo.creative.production-graph.convergence.v1",
);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function expectedShotCount(plan = {}) {
  return list(plan.scenes).reduce(
    (sum, scene) => sum + list(scene?.shots).length,
    0,
  );
}

function persistedPlanIndex(value, field) {
  const number = Number(value?.metadata?.[field]);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function shotMatchesPlan(shot, sceneIndex, shotIndex, shotPlan) {
  return (
    persistedPlanIndex(shot, "master_plan_scene_index") === sceneIndex &&
    persistedPlanIndex(shot, "master_plan_shot_index") === shotIndex &&
    text(shot.metadata?.master_plan_shot_id) === text(shotPlan.id) &&
    text(shot.metadata?.master_plan_repair_version) ===
      text(shotPlan.metadata?.repair_version || "DIRECTION_EXECUTION_REPAIR_V1")
  );
}

function sceneForIndex(scenes, index) {
  return scenes.find(
    (scene) => persistedPlanIndex(scene, "master_plan_index") === index,
  ) || scenes[index] || null;
}

async function updateSceneFromPlan(scene, plan, index) {
  return SceneRuntime.update(scene.id, {
    scene_number: index + 1,
    title: plan.title,
    objective: plan.objective,
    emotion: plan.emotion,
    duration_seconds: Number(plan.duration_seconds || 0),
    location: plan.location || {},
    actors: plan.actors || [],
    products: plan.products || [],
    brand_rules: plan.brand_rules || [],
    visual_style: plan.visual_style || {},
    camera_style: plan.camera_style || {},
    audio_style: plan.audio_style || {},
    metadata: {
      ...object(scene.metadata),
      master_plan_index: index,
      master_plan_scene_id: plan.id || null,
      master_plan_repair_version:
        plan.metadata?.repair_version ||
        plan.metadata?.direction_execution_repaired === true
          ? "DIRECTION_EXECUTION_REPAIR_V1"
          : null,
      production_graph_convergence_version:
        "CREATIVE_PRODUCTION_GRAPH_CONVERGENCE_V1",
    },
  });
}

async function materializeShot({
  organization_id,
  creative_project_id,
  storyboard_id,
  scene,
  scenePlan,
  shotPlan,
  sceneIndex,
  shotIndex,
}) {
  return ShotRuntime.create({
    organization_id,
    creative_project_id,
    scene_id: scene.id,
    storyboard_id,
    scene_number: sceneIndex + 1,
    shot_number: shotIndex + 1,
    title: shotPlan.title,
    purpose: shotPlan.purpose,
    subject: shotPlan.subject,
    action: shotPlan.action || "",
    performance: shotPlan.performance || shotPlan.performance_direction || "",
    duration_seconds: Number(shotPlan.duration_seconds || 0),
    medium: shotPlan.medium || null,
    frame_plan: shotPlan.frame_plan || {},
    camera: shotPlan.camera || {},
    lighting: shotPlan.lighting || {},
    production_design: shotPlan.production_design || {},
    continuity: shotPlan.continuity || {},
    actors: shotPlan.actors || scenePlan.actors || [],
    products: shotPlan.products || scenePlan.products || [],
    location: shotPlan.location || scenePlan.location || {},
    dialogue: shotPlan.dialogue || [],
    narration: shotPlan.narration || {},
    audio: shotPlan.audio || {},
    music: shotPlan.music || {},
    sound_effects: shotPlan.sound_effects || [],
    subtitles: shotPlan.subtitles || [],
    graphics: shotPlan.graphics || {},
    vfx: shotPlan.vfx || {},
    transition_in: shotPlan.transition_in || "",
    transition_out: shotPlan.transition_out || "",
    reference_assets: shotPlan.reference_assets || [],
    reference_asset_ids: shotPlan.reference_asset_ids || [],
    negative_constraints: shotPlan.negative_constraints || [],
    known_failure_modes: shotPlan.known_failure_modes || [],
    repair_instructions: shotPlan.repair_instructions || [],
    assets: shotPlan.assets || [],
    generation: shotPlan.generation || {},
    output_spec: shotPlan.output_spec || shotPlan.generation?.output_spec || {},
    provider_prompt:
      shotPlan.provider_prompt ||
      shotPlan.generation?.provider_prompt ||
      null,
    provider_parameters:
      shotPlan.provider_parameters ||
      shotPlan.generation?.provider_parameters ||
      {},
    metadata: {
      ...object(shotPlan.metadata),
      master_plan_scene_index: sceneIndex,
      master_plan_shot_index: shotIndex,
      master_plan_scene_id: scenePlan.id || null,
      master_plan_shot_id: shotPlan.id || null,
      master_plan_repair_version:
        shotPlan.metadata?.repair_version ||
        "DIRECTION_EXECUTION_REPAIR_V1",
      production_graph_convergence_version:
        "CREATIVE_PRODUCTION_GRAPH_CONVERGENCE_V1",
    },
  });
}

async function reconcileScenesAndShots(input, convergedPlan) {
  const organizationId = input.organization_id;
  const projectId = input.creative_project_id;
  const storyboardId = input.storyboard?.id;
  if (!organizationId) throw new Error("organization_id required");
  if (!projectId) throw new Error("creative_project_id required");
  if (!storyboardId) throw new Error("storyboard required");

  const planScenes = list(convergedPlan.scenes);
  let scenes = list(input.scenes);
  const existingShots = list(input.shots);

  if (scenes.length !== planScenes.length) {
    throw new Error(
      `CREATIVE_SCENE_RECONCILIATION_REQUIRED:expected=${planScenes.length};actual=${scenes.length}`,
    );
  }

  const updatedScenes = [];
  for (const [sceneIndex, scenePlan] of planScenes.entries()) {
    const scene = sceneForIndex(scenes, sceneIndex);
    if (!scene) {
      throw new Error(`CREATIVE_SCENE_RECONCILIATION_MISSING:${sceneIndex}`);
    }
    updatedScenes.push(await updateSceneFromPlan(scene, scenePlan, sceneIndex));
  }
  scenes = updatedScenes;

  const expected = expectedShotCount(convergedPlan);
  const existingMatches =
    existingShots.length === expected &&
    planScenes.every((scenePlan, sceneIndex) => {
      const scene = sceneForIndex(scenes, sceneIndex);
      const sceneShots = existingShots.filter(
        (shot) => text(shot.scene_id) === text(scene?.id),
      );
      const shotPlans = list(scenePlan.shots);
      return (
        sceneShots.length === shotPlans.length &&
        shotPlans.every((shotPlan, shotIndex) =>
          sceneShots.some((shot) =>
            shotMatchesPlan(shot, sceneIndex, shotIndex, shotPlan),
          ),
        )
      );
    });

  if (existingMatches) {
    console.log(`PRODUCTION_GRAPH_SHOT_RECONCILIATION=REUSED:${expected}`);
    return {
      scenes,
      shots: existingShots,
      archived_shot_count: 0,
      created_shot_count: 0,
    };
  }

  for (const shot of existingShots) {
    await ShotRuntime.archive(shot.id);
  }

  const shots = [];
  for (const [sceneIndex, scenePlan] of planScenes.entries()) {
    const scene = sceneForIndex(scenes, sceneIndex);
    for (const [shotIndex, shotPlan] of list(scenePlan.shots).entries()) {
      shots.push(await materializeShot({
        organization_id: organizationId,
        creative_project_id: projectId,
        storyboard_id: storyboardId,
        scene,
        scenePlan,
        shotPlan,
        sceneIndex,
        shotIndex,
      }));
    }
  }

  if (shots.length !== expected) {
    throw new Error(
      `CREATIVE_SHOT_RECONCILIATION_COUNT_MISMATCH:expected=${expected};actual=${shots.length}`,
    );
  }

  console.log(
    `PRODUCTION_GRAPH_SHOT_RECONCILIATION=REBUILT:archived=${existingShots.length};created=${shots.length}`,
  );

  return {
    scenes,
    shots,
    archived_shot_count: existingShots.length,
    created_shot_count: shots.length,
  };
}

export function installCreativeProductionGraphConvergencePatch() {
  if (ProductionGraphRuntime[PATCH_FLAG]) return;

  const originalPlan = ProductionGraphRuntime.plan.bind(ProductionGraphRuntime);

  Object.defineProperty(ProductionGraphRuntime, PATCH_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ProductionGraphRuntime.plan = async function planWithConvergence(input = {}) {
    const converged = convergeCreativeAssetManifestTargets(
      input.creative_plan || {},
    );

    console.log(
      `ASSET_MANIFEST_TARGET_CONVERGENCE=repaired:${converged.repaired_assignment_count};fallback:${converged.fallback_assignment_count};downgraded:${converged.disposition_downgrade_count}`,
    );

    const reconciled = await reconcileScenesAndShots(input, converged.plan);

    return originalPlan({
      ...input,
      scenes: reconciled.scenes,
      shots: reconciled.shots,
      creative_plan: converged.plan,
    });
  };
}

installCreativeProductionGraphConvergencePatch();

export const CreativeProductionGraphConvergencePatch = {
  install: installCreativeProductionGraphConvergencePatch,
};
