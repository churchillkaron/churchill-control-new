import {
  createProductionGraph,
  createProductionNode,
  createProductionEdge,
} from "../documents/ProductionGraph";

function compact(values = []) {
  return [
    ...new Set(
      values
        .flat()
        .filter(Boolean)
        .map((value) => String(value).trim())
        .filter(Boolean),
    ),
  ];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function assetId(value) {
  if (typeof value === "string" || typeof value === "number") {
    const id = String(value).trim();
    return /^(?:\[object Object\]|undefined|null)$/i.test(id) ? "" : id;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  return String(
    value.asset_id ||
    value.assetId ||
    value.creative_asset_id ||
    value.creativeAssetId ||
    value.id ||
    "",
  ).trim();
}

function assetIds(values = []) {
  return [...new Set(list(values).map(assetId).filter(Boolean))];
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
    story_function: scene.metadata?.story_function || null,
    continuity_from_previous: scene.metadata?.continuity_from_previous || {},
    continuity_to_next: scene.metadata?.continuity_to_next || {},
  };
}

function shotRequirements(scene = {}, shot = {}) {
  const framePlan = object(shot.frame_plan);
  const audio = object(shot.audio);
  const actors = list(shot.actors).length ? shot.actors : scene.actors || [];
  const products = list(shot.products).length ? shot.products : scene.products || [];
  const location = Object.keys(object(shot.location)).length
    ? shot.location
    : scene.location || {};
  const mood = shot.lighting?.mood || scene.emotion || "";
  const tags = compact([
    scene.title,
    scene.objective,
    scene.emotion,
    shot.title,
    shot.purpose,
    mood,
    Object.values(location || {}),
    actors.map((actor) => actor?.name || actor?.id || actor?.role || actor),
    products.map((product) => product?.name || product?.id || product),
  ]);
  const primarySourceAssetId = assetId(
    shot.primary_source_asset_id ||
    shot.generation?.primary_source_asset_id ||
    shot.metadata?.primary_source_asset_id,
  ) || null;

  return {
    subject: shot.purpose || scene.objective || shot.title || "",
    purpose: shot.purpose || "",
    mood,
    action: shot.action || shot.purpose || "",
    location,
    actors,
    products,
    opening_frame: framePlan.opening_frame || shot.opening_frame || {},
    progression_frames:
      framePlan.progression_frames ||
      framePlan.progression ||
      shot.progression_frames ||
      [],
    closing_frame: framePlan.closing_frame || shot.closing_frame || {},
    camera: shot.camera || {},
    lighting: shot.lighting || {},
    production_design: shot.production_design || {},
    wardrobe: shot.wardrobe || [],
    hair_makeup: shot.hair_makeup || [],
    props: shot.props || [],
    performance_direction: shot.performance_direction || {},
    continuity: shot.continuity || {},
    dialogue: shot.dialogue || [],
    narration: shot.narration || {},
    music: audio.music || shot.music || {},
    sound_effects: audio.sound_effects || shot.sound_effects || [],
    audio: Object.keys(audio).length ? audio : shot.sound_design || {},
    subtitles: shot.subtitles || [],
    graphics: shot.graphics || [],
    typography: shot.typography || {},
    vfx: shot.vfx || [],
    transition_in: shot.transition_in || {},
    transition_out: shot.transition_out || {},
    brand_rules: scene.brand_rules || [],
    must_avoid: shot.must_avoid || shot.metadata?.must_avoid || scene.metadata?.must_avoid || [],
    negative_constraints: shot.negative_constraints || [],
    primary_source_asset_id: primarySourceAssetId,
    source_binding_contract: primarySourceAssetId
      ? "EXPLICIT_SHOT_PRIMARY_SOURCE_V1"
      : null,
    reference_asset_ids: assetIds(shot.reference_asset_ids || []),
    identity_requirements: shot.identity_requirements || {},
    product_requirements: shot.product_requirements || {},
    rights_requirements: shot.rights_requirements || {},
    output_spec: shot.output_spec || shot.generation?.output_spec || {},
    reuse_policy: shot.reuse_policy || shot.metadata?.reuse_policy || {},
    minimum_quality: Number(
      shot.metadata?.minimum_quality ||
      scene.metadata?.minimum_quality ||
      0,
    ),
    tags,
  };
}

function generationContract(scene = {}, shot = {}, existingAssets = []) {
  const generation = object(shot.generation || shot.metadata?.generation);
  const service =
    generation.service ||
    shot.service_id ||
    shot.service_code ||
    scene.service_id ||
    scene.service_code ||
    null;
  const capability =
    generation.capability ||
    shot.capability ||
    scene.capability ||
    service ||
    null;
  const required = generation.required ?? existingAssets.length === 0;
  const primarySourceAssetId = assetId(
    generation.primary_source_asset_id ||
    shot.primary_source_asset_id ||
    shot.metadata?.primary_source_asset_id,
  ) || null;

  if (required && (!service || !capability)) {
    throw new Error(
      `CREATIVE_SHOT_EXECUTION_CAPABILITY_REQUIRED:${shot.id || shot.title || "unknown"}`,
    );
  }
  if (required && existingAssets.length > 1 && !primarySourceAssetId) {
    throw new Error(
      `CREATIVE_SHOT_PRIMARY_SOURCE_REQUIRED:${shot.id || shot.title || "unknown"}`,
    );
  }
  if (
    primarySourceAssetId &&
    existingAssets.length &&
    !existingAssets.includes(primarySourceAssetId)
  ) {
    throw new Error(
      `CREATIVE_SHOT_PRIMARY_SOURCE_NOT_ASSIGNED:${shot.id || shot.title || "unknown"}:${primarySourceAssetId}`,
    );
  }

  return {
    ...generation,
    required,
    service,
    capability,
    provider: generation.provider || null,
    primary_source_asset_id: primarySourceAssetId,
    source_binding_contract: primarySourceAssetId
      ? "EXPLICIT_SHOT_PRIMARY_SOURCE_V1"
      : null,
    provider_prompt: generation.provider_prompt || shot.provider_prompt || null,
    provider_parameters: {
      ...object(generation.provider_parameters || shot.provider_parameters),
      primary_source_asset_id: primarySourceAssetId,
      source_binding_contract: primarySourceAssetId
        ? "EXPLICIT_SHOT_PRIMARY_SOURCE_V1"
        : null,
    },
    output_spec: generation.output_spec || shot.output_spec || {},
    repair_instructions: compact([
      generation.repair_instructions || [],
      shot.repair_instructions || [],
      generation.repair_contract?.instructions || [],
      shot.repair_contract?.instructions || [],
    ]),
    estimated_cost: Number(generation.estimated_cost || 0),
    estimated_seconds:
      generation.estimated_seconds ??
      shot.duration_seconds ??
      null,
    status: existingAssets.length ? "ASSET_ASSIGNED" : "WAITING",
  };
}

export function buildProductionGraph({
  organization_id,
  creative_mission_id = null,
  creative_project_id,
  storyboard,
  scenes = [],
  shots = [],
  creative_plan = {},
}) {
  if (!organization_id) throw new Error("organization_id required");
  if (!creative_project_id) throw new Error("creative_project_id required");
  if (!storyboard?.id) throw new Error("storyboard required");
  if (!list(scenes).length) throw new Error("CREATIVE_PRODUCTION_SCENES_REQUIRED");
  if (!list(shots).length) throw new Error("CREATIVE_PRODUCTION_SHOTS_REQUIRED");

  const graph = createProductionGraph({
    organization_id,
    creative_project_id,
    storyboard_id: storyboard.id,
    title: storyboard.title || creative_plan.concept?.title || "",
    description: storyboard.synopsis || creative_plan.concept?.narrative || "",
    cost_plan: {
      currency: creative_plan.production?.currency || null,
      approval_required: creative_plan.production?.cost_approval_required ?? null,
      approved: creative_plan.production?.cost_approved ?? null,
    },
    production_plan: {
      quality_profile: creative_plan.production?.quality_profile || null,
      draft_first: creative_plan.production?.draft_first ?? null,
      reuse_assets: creative_plan.production?.reuse_assets ?? null,
      provider_strategy: creative_plan.production?.provider_strategy || null,
      render_modes: creative_plan.production?.render_modes || [],
    },
    metadata: {
      creative_mission_id,
      workflow_kind: creative_plan.workflow_kind || null,
      master_plan_validation: creative_plan.validation || null,
      selected_asset_manifest: creative_plan.asset_manifest || [],
      asset_binding_contract:
        creative_plan.asset_binding?.primary_source_contract || null,
      role_decisions:
        creative_plan.role_decisions ||
        creative_plan.agency_decisions ||
        {},
      deliverables: creative_plan.deliverables || [],
    },
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
          visual_style: scene.visual_style || {},
          camera_style: scene.camera_style || {},
          audio_style: scene.audio_style || {},
        },
        metadata: {
          scene_number: scene.scene_number,
          creative_mission_id,
          story_function: scene.metadata?.story_function || null,
          master_plan_index: scene.metadata?.master_plan_index ?? null,
        },
      }),
    );

    const sceneShots = shots.filter((shot) => shot.scene_id === scene.id);
    if (!sceneShots.length) {
      throw new Error(`CREATIVE_SCENE_SHOTS_REQUIRED:${scene.id}`);
    }

    for (const shot of sceneShots) {
      const requirements = shotRequirements(scene, shot);
      const assignedAssets = assetIds(shot.assets || []);
      const referenceAssets = assetIds(shot.reference_asset_ids || []);
      const availableAssets = [...new Set([...assignedAssets, ...referenceAssets])];
      const generation = generationContract(scene, shot, assignedAssets);

      graph.nodes.push(
        createProductionNode({
          id: shot.id,
          type: "SHOT",
          title: shot.title,
          description: shot.purpose || "",
          duration_seconds: shot.duration_seconds,
          intent: {
            purpose: shot.purpose || "",
            action: shot.action || "",
            scene_objective: scene.objective || "",
            emotion: scene.emotion || "",
            medium: shot.medium || scene.medium || null,
            opening_frame:
              shot.frame_plan?.opening_frame ||
              shot.opening_frame ||
              {},
            progression_frames:
              shot.frame_plan?.progression_frames ||
              shot.frame_plan?.progression ||
              shot.progression_frames ||
              [],
            closing_frame:
              shot.frame_plan?.closing_frame ||
              shot.closing_frame ||
              {},
          },
          requirements,
          assets: assignedAssets,
          generation,
          metadata: {
            scene_id: scene.id,
            scene_number: scene.scene_number,
            shot_number: shot.shot_number,
            tags: requirements.tags,
            medium: shot.medium || scene.medium || null,
            creative_mission_id,
            primary_source_asset_id: generation.primary_source_asset_id,
            source_binding_contract: generation.source_binding_contract,
            provider_prompt:
              shot.generation?.provider_prompt ||
              shot.provider_prompt ||
              null,
            provider_parameters: generation.provider_parameters,
            repair_instructions: compact([
              shot.generation?.repair_instructions || [],
              shot.repair_instructions || [],
              shot.generation?.repair_contract?.instructions || [],
              shot.repair_contract?.instructions || [],
            ]),
            frame_plan: {
              opening_frame:
                shot.frame_plan?.opening_frame ||
                shot.opening_frame ||
                {},
              progression_frames:
                shot.frame_plan?.progression_frames ||
                shot.frame_plan?.progression ||
                shot.progression_frames ||
                [],
              closing_frame:
                shot.frame_plan?.closing_frame ||
                shot.closing_frame ||
                {},
            },
            reference_asset_ids: referenceAssets,
            available_asset_ids: availableAssets,
            reuse_policy: requirements.reuse_policy,
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
