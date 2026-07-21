import {
  createProductionGraph,
  createProductionNode,
  createProductionEdge,
} from "../documents/ProductionGraph";

function resolveSceneShots(scene, shots = []) {
  return shots
    .filter((shot) => (
      shot.scene_id === scene.id ||
      (
        !shot.scene_id &&
        Number(shot.scene_number) === Number(scene.scene_number)
      )
    ))
    .sort(
      (a, b) =>
        Number(a.shot_number || 0) -
        Number(b.shot_number || 0),
    );
}

function buildShotSpecification(scene, shot) {
  return {
    scene: {
      id: scene.id,
      number: scene.scene_number,
      title: scene.title || "",
      objective: scene.objective || "",
      emotion: scene.emotion || "",
      location: scene.location || {},
      actors: scene.actors || [],
      products: scene.products || [],
      brand_rules: scene.brand_rules || [],
      visual_style: scene.visual_style || {},
      camera_style: scene.camera_style || {},
      audio_style: scene.audio_style || {},
    },
    shot: {
      id: shot.id,
      number: shot.shot_number,
      title: shot.title || "",
      purpose: shot.purpose || "",
      duration_seconds: Number(shot.duration_seconds || 5),
      camera: shot.camera || {},
      lighting: shot.lighting || {},
      actors: shot.actors || [],
      products: shot.products || [],
      location: shot.location || scene.location || {},
      dialogue: shot.dialogue || [],
      narration: shot.narration || {},
      music: shot.music || {},
      sound_effects: shot.sound_effects || [],
      subtitles: shot.subtitles || [],
      assets: shot.assets || [],
      reference_pack:
        shot.reference_pack ||
        shot.metadata?.reference_pack ||
        {},
      continuity:
        shot.continuity ||
        shot.metadata?.continuity ||
        {},
      reality_rules:
        shot.reality_rules ||
        shot.metadata?.reality_rules ||
        {},
      negative_constraints:
        shot.negative_constraints ||
        shot.metadata?.negative_constraints ||
        [],
      quality_requirements:
        shot.quality_requirements ||
        shot.metadata?.quality_requirements ||
        {},
    },
  };
}

export function buildProductionGraph({
  organization_id,
  creative_project_id,
  storyboard,
  scenes = [],
  shots = [],
  creative_plan = null,
}) {
  const graph = createProductionGraph({
    organization_id,
    creative_project_id,
    storyboard_id: storyboard?.id,
    title: storyboard?.title || "Atomic Shot Production Graph",
    description:
      "Reference-grounded master stills and independently directed video shots.",
    production_plan: {
      quality_profile:
        creative_plan?.production_direction?.creative_standard ||
        "world_class_cinematic",
      draft_first: true,
      reuse_assets: true,
      provider_strategy: "capability_and_quality_optimized",
      render_modes: ["master_still", "shot_video", "review", "final"],
    },
    metadata: {
      production_contract: "atomic_reference_grounded_shots_v1",
      no_campaign_level_video_request: true,
    },
  });

  const videoNodeIds = [];

  for (const scene of [...scenes].sort(
    (a, b) =>
      Number(a.scene_number || 0) -
      Number(b.scene_number || 0),
  )) {
    const sceneNodeId = `scene:${scene.id}`;

    graph.nodes.push(
      createProductionNode({
        id: sceneNodeId,
        type: "SCENE",
        title:
          scene.title ||
          `Scene ${scene.scene_number || graph.nodes.length + 1}`,
        duration_seconds: scene.duration_seconds,
        intent: {
          objective: scene.objective || "",
          emotion: scene.emotion || "",
        },
        requirements: {
          location: scene.location || {},
          actors: scene.actors || [],
          products: scene.products || [],
          brand_rules: scene.brand_rules || [],
          visual_style: scene.visual_style || {},
          camera_style: scene.camera_style || {},
          audio_style: scene.audio_style || {},
        },
        generation: {
          required: false,
          status: "NOT_REQUIRED",
        },
        metadata: {
          scene_id: scene.id,
          scene_number: scene.scene_number,
        },
      }),
    );

    const sceneShots = resolveSceneShots(scene, shots);

    for (const shot of sceneShots) {
      const specification = buildShotSpecification(scene, shot);
      const masterNodeId = `shot:${shot.id}:master`;
      const videoNodeId = `shot:${shot.id}:video`;

      graph.nodes.push(
        createProductionNode({
          id: masterNodeId,
          type: "ASSET",
          title:
            `${shot.title || `Shot ${shot.shot_number}`} — Master Still`,
          description:
            "Generate or enhance the approved reference-grounded master frame before motion generation.",
          duration_seconds: 0,
          intent: {
            deliverable: "MASTER_STILL",
            shot_purpose: shot.purpose || "",
            emotion: scene.emotion || "",
          },
          requirements: {
            specification,
            preserve:
              specification.shot.reference_pack?.preserve || [],
            may_change:
              specification.shot.reference_pack?.may_change || [],
            never_change:
              specification.shot.reference_pack?.never_change || [],
            quality_gate: {
              identity_fidelity: true,
              product_fidelity: true,
              venue_fidelity: true,
              brand_fidelity: true,
              anatomy: true,
              physical_reality: true,
              technical_quality: true,
            },
          },
          assets: shot.assets || [],
          generation: {
            required: true,
            service: "ai.image.generate",
            capability: "ai.image.generate",
            estimated_cost: 0,
            estimated_seconds: 60,
            status: "WAITING",
            input: {
              mode: "reference_grounded_master_still",
              specification,
              reference_assets: shot.assets || [],
            },
          },
          metadata: {
            scene_id: scene.id,
            shot_id: shot.id,
            deliverable: "MASTER_STILL",
            requires_quality_approval: true,
          },
        }),
      );

      graph.nodes.push(
        createProductionNode({
          id: videoNodeId,
          type: "SHOT",
          title:
            `${shot.title || `Shot ${shot.shot_number}`} — Video`,
          description:
            "Animate only the approved master still according to the exact shot specification.",
          duration_seconds: Number(shot.duration_seconds || 5),
          intent: {
            deliverable: "VIDEO_SHOT",
            shot_purpose: shot.purpose || "",
            emotion: scene.emotion || "",
          },
          requirements: {
            specification,
            source_node_id: masterNodeId,
            quality_gate: {
              first_frame_match: true,
              identity_stability: true,
              product_stability: true,
              logo_stability: true,
              anatomy: true,
              physical_reality: true,
              camera_accuracy: true,
              duration_accuracy: true,
              continuity: true,
              no_flicker: true,
            },
          },
          assets: [],
          generation: {
            required: true,
            service: "ai.video.generate",
            capability: "ai.video.generate",
            estimated_cost: 0,
            estimated_seconds: Number(shot.duration_seconds || 5),
            status: "WAITING",
            input: {
              mode: "approved_master_still_to_video",
              duration_seconds: Number(shot.duration_seconds || 5),
              specification,
              source_node_id: masterNodeId,
            },
          },
          metadata: {
            scene_id: scene.id,
            shot_id: shot.id,
            deliverable: "VIDEO_SHOT",
            requires_quality_approval: true,
          },
        }),
      );

      graph.edges.push(
        createProductionEdge({
          from: sceneNodeId,
          to: masterNodeId,
          type: "CONTAINS",
        }),
      );

      graph.edges.push(
        createProductionEdge({
          from: masterNodeId,
          to: videoNodeId,
          type: "DEPENDS_ON",
          metadata: {
            condition: "MASTER_STILL_APPROVED",
          },
        }),
      );

      videoNodeIds.push(videoNodeId);
    }
  }

  for (let index = 1; index < videoNodeIds.length; index += 1) {
    graph.edges.push(
      createProductionEdge({
        from: videoNodeIds[index - 1],
        to: videoNodeIds[index],
        type: "FOLLOWS",
        metadata: {
          continuity_only: true,
          blocks_execution: false,
        },
      }),
    );
  }

  graph.status = "PLANNED";
  graph.metadata.total_scenes = scenes.length;
  graph.metadata.total_shots = videoNodeIds.length;
  graph.metadata.total_generated_deliverables = videoNodeIds.length * 2;

  return graph;
}
