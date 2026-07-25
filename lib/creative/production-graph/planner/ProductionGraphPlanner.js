import {
  createProductionGraph,
  createProductionNode,
  createProductionEdge,
} from "../documents/ProductionGraph";

function compact(values = []) {
  return [...new Set(values.flat().filter(Boolean).map((value) => String(value).trim()).filter(Boolean))];
}

function sceneIntent(scene = {}) {
  return {
    objective: scene.objective || "",
    emotion: scene.emotion || "",
    location: scene.location || {},
    actors: scene.actors || [],
    products: scene.products || [],
    visual_style: scene.visual_style || {},
    camera_style: scene.camera_style || {},
    audio_style: scene.audio_style || {},
    brand_rules: scene.brand_rules || [],
  };
}

function shotRequirements(scene = {}, shot = {}) {
  const actors = shot.actors?.length ? shot.actors : scene.actors || [];
  const products = shot.products?.length ? shot.products : scene.products || [];
  const location = Object.keys(shot.location || {}).length ? shot.location : scene.location || {};
  const mood = shot.lighting?.mood || scene.emotion || "";
  const tags = compact([
    scene.title,
    scene.objective,
    scene.emotion,
    shot.title,
    shot.purpose,
    mood,
    Object.values(location || {}),
    actors.map((actor) => actor.name || actor.id || actor.role || actor),
    products.map((product) => product.name || product.id || product),
  ]);

  return {
    subject: shot.purpose || scene.objective || shot.title || "",
    mood,
    action: shot.purpose || "",
    location,
    actors,
    products,
    camera: shot.camera || {},
    lighting: shot.lighting || {},
    dialogue: shot.dialogue || [],
    narration: shot.narration || {},
    music: shot.music || {},
    sound_effects: shot.sound_effects || [],
    subtitles: shot.subtitles || [],
    brand_rules: scene.brand_rules || [],
    must_avoid: shot.metadata?.must_avoid || scene.metadata?.must_avoid || [],
    minimum_quality: Number(shot.metadata?.minimum_quality || scene.metadata?.minimum_quality || 0),
    tags,
  };
}

export function buildProductionGraph({
  organization_id,
  creative_mission_id = null,
  creative_project_id,
  storyboard,
  scenes = [],
  shots = [],
}) {
  const graph = createProductionGraph({
    organization_id,
    creative_project_id,
    storyboard_id: storyboard?.id,
    title: storyboard?.title || "Production Graph",
    metadata: { creative_mission_id },
  });

  for (const scene of scenes) {
    graph.nodes.push(
      createProductionNode({
        id: scene.id,
        type: "SCENE",
        title: scene.title,
        description: scene.objective || "",
        duration_seconds: scene.duration_seconds,
        intent: sceneIntent(scene),
        requirements: {
          brand_rules: scene.brand_rules || [],
          location: scene.location || {},
          actors: scene.actors || [],
          products: scene.products || [],
        },
        metadata: {
          scene_number: scene.scene_number,
          creative_mission_id,
        },
      }),
    );

    const sceneShots = shots.filter((shot) => shot.scene_id === scene.id);

    for (const shot of sceneShots) {
      const requirements = shotRequirements(scene, shot);
      const existingAssets = compact([shot.assets || []]);

      graph.nodes.push(
        createProductionNode({
          id: shot.id,
          type: "SHOT",
          title: shot.title,
          description: shot.purpose || "",
          duration_seconds: shot.duration_seconds,
          intent: {
            purpose: shot.purpose || "",
            scene_objective: scene.objective || "",
            emotion: scene.emotion || "",
          },
          requirements,
          assets: existingAssets,
          generation: {
            required: existingAssets.length === 0,
            service: "creative.video.generate",
            capability: "creative.video.generate",
            estimated_cost: 0,
            estimated_seconds: shot.duration_seconds,
            status: existingAssets.length ? "ASSET_ASSIGNED" : "WAITING",
          },
          metadata: {
            scene_id: scene.id,
            scene_number: scene.scene_number,
            shot_number: shot.shot_number,
            tags: requirements.tags,
            creative_mission_id,
          },
        }),
      );

      graph.edges.push(
        createProductionEdge({
          from: scene.id,
          to: shot.id,
          type: "CONTAINS",
        }),
      );
    }
  }

  return graph;
}
