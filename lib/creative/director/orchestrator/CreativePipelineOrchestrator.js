import {
  ResearchRuntime,
} from "@/lib/creative/research/runtime/ResearchRuntime";

import {
  CreativeStrategyRuntime,
} from "@/lib/creative/strategy/runtime/CreativeStrategyRuntime";

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
  ProductionGraphRuntime,
} from "@/lib/creative/production-graph/runtime/ProductionGraphRuntime";

import {
  ExecutionRuntime,
} from "@/lib/creative/execution/runtime/ExecutionRuntime";

import {
  AssetReuseEngine,
} from "@/lib/creative/assets/reuse/AssetReuseEngine";

import {
  CreativeStateEngine,
  PIPELINE_STAGES,
} from "@/lib/creative/state/CreativeStateEngine";

import {
  CreativeProductionLifecycleRuntime,
} from "@/lib/creative/production/runtime/CreativeProductionLifecycleRuntime";

function resolveMissionId(input = {}) {
  return (
    input.creative_mission_id ||
    input.mission_id ||
    input.creative_project_id
  );
}

function resolveProjectId(input = {}) {
  return (
    input.creative_project_id ||
    input.project_id ||
    input.creative_mission_id ||
    input.mission_id
  );
}

function sumDuration(items = []) {
  return items.reduce(
    (total, item) =>
      total + Number(item.duration_seconds || 0),
    0,
  );
}

async function upsertStrategy({
  organization_id,
  creative_project_id,
  research,
  creativePlan,
}) {
  const existing = await CreativeStrategyRuntime.list({
    organization_id,
    creative_project_id,
  });

  const payload = {
    organization_id,
    creative_project_id,
    research_id: research?.id || null,
    status: "APPROVED",
    title:
      creativePlan.title ||
      creativePlan.selected_concept?.title ||
      "Creative Film Strategy",
    objective: creativePlan.objective || "",
    audience_insight:
      creativePlan.audience_truth || "",
    creative_angle:
      creativePlan.selected_concept?.rationale ||
      creativePlan.story_thesis ||
      "",
    core_message:
      creativePlan.brand_promise ||
      creativePlan.story_thesis ||
      "",
    story_direction:
      creativePlan.logline ||
      creativePlan.story_thesis ||
      "",
    visual_direction: {
      style: "original photorealistic commercial cinema",
      mood:
        creativePlan.emotional_arc?.join(" → ") ||
        "emotionally progressive",
      lighting: "motivated practical light with controlled cinematic contrast",
      color_palette:
        creativePlan.brand_palette || [],
      camera_language: [
        "motivated movement",
        "editorial variety",
        "human observation",
        "stable continuity",
      ],
    },
    production_direction: {
      target_duration:
        sumDuration(creativePlan.scenes || []),
      format_versions: ["16:9", "9:16", "1:1"],
      quality_profile: "world_class_cinematic",
      draft_first: true,
      reuse_assets: true,
    },
    risks: creativePlan.risks || [],
    recommendations: [
      "Generate and approve a reference-grounded master still before every video shot.",
      "Regenerate only failed shots, never the complete film.",
      "Apply text, graphics, sound mixing and color in post-production.",
    ],
    metadata: {
      director_version:
        creativePlan.production_version ||
        "world-class-shot-director-v1",
      concepts: creativePlan.concepts || [],
      selected_concept:
        creativePlan.selected_concept || {},
      emotional_arc:
        creativePlan.emotional_arc || [],
      humor_strategy:
        creativePlan.humor_strategy || {},
      visual_motif:
        creativePlan.visual_motif || "",
      sound_motif:
        creativePlan.sound_motif || "",
      final_quality_standard:
        creativePlan.final_quality_standard || {},
    },
  };

  if (existing[0]) {
    return CreativeStrategyRuntime.update(
      existing[0].id,
      payload,
    );
  }

  return CreativeStrategyRuntime.create(payload);
}

async function upsertStoryboard({
  organization_id,
  creative_project_id,
  strategy,
  creativePlan,
}) {
  const existing = await StoryboardRuntime.list({
    organization_id,
    creative_project_id,
  });

  const payload = {
    organization_id,
    creative_project_id,
    creative_strategy_id: strategy.id,
    status: "IN_PRODUCTION",
    title:
      creativePlan.title ||
      "Original Commercial Film",
    synopsis:
      creativePlan.logline ||
      creativePlan.story_thesis ||
      "",
    total_duration:
      sumDuration(creativePlan.scenes || []),
    estimated_cost: 0,
    estimated_render_minutes: Math.ceil(
      sumDuration(creativePlan.scenes || []) / 60,
    ),
    metadata: {
      director_version:
        creativePlan.production_version ||
        "world-class-shot-director-v1",
      production_bible: creativePlan,
      master_still_first: true,
      atomic_video_shots: true,
    },
  };

  if (existing[0]) {
    return StoryboardRuntime.update(
      existing[0].id,
      payload,
    );
  }

  return StoryboardRuntime.create(payload);
}

async function materializeScenesAndShots({
  organization_id,
  creative_project_id,
  storyboard,
  creativePlan,
}) {
  const existingScenes = await SceneRuntime.list({
    organization_id,
    creative_project_id,
  });
  const existingShots = await ShotRuntime.list({
    organization_id,
    creative_project_id,
  });
  const scenesByNumber = new Map(
    existingScenes.map((scene) => [
      Number(scene.scene_number),
      scene,
    ]),
  );
  const shotsByNumber = new Map(
    existingShots.map((shot) => [
      `${Number(shot.scene_number)}:${Number(shot.shot_number)}`,
      shot,
    ]),
  );
  const scenes = [];
  const shots = [];

  for (const directedScene of creativePlan.scenes || []) {
    const sceneNumber = Number(
      directedScene.scene_number || scenes.length + 1,
    );
    const scenePayload = {
      organization_id,
      creative_project_id,
      storyboard_id: storyboard.id,
      scene_number: sceneNumber,
      title:
        directedScene.title ||
        `Scene ${sceneNumber}`,
      objective: directedScene.objective || "",
      emotion: directedScene.emotion || "",
      duration_seconds:
        Number(directedScene.duration_seconds || 5),
      location: directedScene.location || {},
      actors: directedScene.actors || [],
      products: directedScene.products || [],
      brand_rules:
        directedScene.brand_rules || [],
      visual_style:
        directedScene.visual_style || {},
      camera_style:
        directedScene.camera_style || {},
      audio_style:
        directedScene.audio_style || {},
      status: "READY",
      metadata: {
        humor: directedScene.humor || {},
        director_version:
          creativePlan.production_version ||
          "world-class-shot-director-v1",
      },
    };

    const existingScene = scenesByNumber.get(sceneNumber);
    const scene = existingScene
      ? await SceneRuntime.update(
          existingScene.id,
          scenePayload,
        )
      : await SceneRuntime.create(scenePayload);

    scenes.push(scene);

    for (const directedShot of directedScene.shots || []) {
      const shotNumber = Number(
        directedShot.shot_number || shots.length + 1,
      );
      const key = `${sceneNumber}:${shotNumber}`;
      const shotPayload = {
        organization_id,
        creative_project_id,
        scene_id: scene.id,
        storyboard_id: storyboard.id,
        scene_number: sceneNumber,
        shot_number: shotNumber,
        title:
          directedShot.title ||
          `Scene ${sceneNumber} Shot ${shotNumber}`,
        purpose: directedShot.purpose || "",
        duration_seconds:
          Number(directedShot.duration_seconds || 3),
        opening_frame:
          directedShot.opening_frame || "",
        closing_frame:
          directedShot.closing_frame || "",
        action_beats:
          directedShot.action_beats || [],
        performance_direction:
          directedShot.performance_direction || "",
        camera: directedShot.camera || {},
        lighting: directedShot.lighting || {},
        actors:
          directedShot.actors ||
          directedScene.actors ||
          [],
        products:
          directedShot.products ||
          directedScene.products ||
          [],
        location:
          directedShot.location ||
          directedScene.location ||
          {},
        dialogue: directedShot.dialogue || [],
        narration: directedShot.narration || {},
        music: directedShot.music || {},
        sound_effects:
          directedShot.sound_effects || [],
        subtitles: directedShot.subtitles || [],
        assets:
          directedShot.reference_asset_ids || [],
        reference_asset_ids:
          directedShot.reference_asset_ids || [],
        reference_pack:
          directedShot.reference_pack || {},
        continuity:
          directedShot.continuity || {},
        reality_rules:
          directedShot.reality_rules || {},
        negative_constraints:
          directedShot.negative_constraints || [],
        quality_requirements:
          directedShot.quality_requirements || {},
        transition_in:
          directedShot.transition_in || {},
        transition_out:
          directedShot.transition_out || {},
        status: "READY",
        director_version:
          creativePlan.production_version ||
          "world-class-shot-director-v1",
      };

      const existingShot = shotsByNumber.get(key);
      const shot = existingShot
        ? await ShotRuntime.update(
            existingShot.id,
            shotPayload,
          )
        : await ShotRuntime.create(shotPayload);

      shots.push(shot);
    }
  }

  return { scenes, shots };
}

export async function buildCreativePipeline(input = {}) {
  const {
    organization_id,
    brief = {},
    creativePlan,
  } = input;
  const creative_mission_id = resolveMissionId(input);
  const creative_project_id = resolveProjectId(input);

  if (!organization_id) {
    throw new Error("organization_id required");
  }

  if (!creative_mission_id && !creative_project_id) {
    throw new Error(
      "creative_mission_id or creative_project_id required",
    );
  }

  if (!creativePlan?.scenes?.length) {
    throw new Error(
      "Director production bible with scenes required",
    );
  }

  const stateInput = {
    organization_id,
    creative_mission_id,
    creative_project_id,
  };

  let state = await CreativeStateEngine.get(stateInput);
  if (!state) {
    state = await CreativeStateEngine.init(stateInput);
  }

  await CreativeStateEngine.set(
    stateInput,
    PIPELINE_STAGES.UNDERSTANDING,
  );
  await CreativeStateEngine.set(
    stateInput,
    PIPELINE_STAGES.RESEARCHING,
  );

  const research = await ResearchRuntime.runResearch(
    {
      id: creative_project_id,
      creative_mission_id,
    },
    {
      ...brief,
      id: brief.id || creative_project_id,
    },
    {
      run: async () => ({
        summary:
          creativePlan.research_summary || "",
        reasoning: {
          audience_truth:
            creativePlan.audience_truth || "",
          story_thesis:
            creativePlan.story_thesis || "",
          concepts: creativePlan.concepts || [],
          selected_concept:
            creativePlan.selected_concept || {},
        },
      }),
    },
  );

  await CreativeStateEngine.set(
    stateInput,
    PIPELINE_STAGES.BUILDING_STRATEGY,
  );

  const strategy = await upsertStrategy({
    organization_id,
    creative_project_id,
    research,
    creativePlan,
  });

  await CreativeStateEngine.set(
    stateInput,
    PIPELINE_STAGES.BUILDING_CONCEPT,
  );

  const concept = {
    id: `concept_${creative_mission_id || creative_project_id}`,
    organization_id,
    creative_mission_id,
    creative_project_id,
    creative_strategy_id: strategy.id,
    status: "approved",
    source: "world-class-shot-director-v1",
    ...creativePlan.selected_concept,
  };

  await CreativeStateEngine.set(
    stateInput,
    PIPELINE_STAGES.BUILDING_STORYBOARD,
  );

  const storyboard = await upsertStoryboard({
    organization_id,
    creative_project_id,
    strategy,
    creativePlan,
  });

  const materialized = await materializeScenesAndShots({
    organization_id,
    creative_project_id,
    storyboard,
    creativePlan,
  });

  await CreativeStateEngine.set(
    stateInput,
    PIPELINE_STAGES.PLANNING_PRODUCTION,
  );

  const plannedGraph = await ProductionGraphRuntime.plan({
    organization_id,
    creative_mission_id,
    creative_project_id,
    storyboard,
    scenes: materialized.scenes,
    shots: materialized.shots,
    creative_plan: creativePlan,
  });

  const optimizedGraph = await AssetReuseEngine.optimizeGraph({
    organization_id,
    graph: plannedGraph,
  });

  const existingGraphs = await ProductionGraphRuntime.list({
    organization_id,
    creative_project_id,
  });
  const graph = existingGraphs[0]
    ? await ProductionGraphRuntime.update(
        existingGraphs[0].id,
        optimizedGraph,
      )
    : await ProductionGraphRuntime.create(optimizedGraph);

  await CreativeStateEngine.set(
    stateInput,
    PIPELINE_STAGES.READY_FOR_EXECUTION,
  );

  const executionPlan = await ExecutionRuntime.plan({
    organization_id,
    creative_project_id,
    production_graph: graph,
  });
  const execution = await ExecutionRuntime.create(
    executionPlan,
  );

  const productionLifecycle =
    await CreativeProductionLifecycleRuntime.markPlanReady({
      organization_id,
      creative_project_id,
    });

  await CreativeStateEngine.set(
    stateInput,
    PIPELINE_STAGES.EXECUTING,
  );

  return {
    mission_id: creative_mission_id,
    creative_mission_id,
    creative_project_id,
    research,
    strategy,
    concept,
    storyboard,
    scenes: materialized.scenes,
    shots: materialized.shots,
    graph,
    execution,
    production_lifecycle: productionLifecycle,
    creativePlan,
  };
}
