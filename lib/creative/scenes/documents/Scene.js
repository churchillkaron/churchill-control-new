export const SCENE_STATUS = {
  DRAFT: "DRAFT",
  READY: "READY",
  PRODUCTION: "PRODUCTION",
  REVIEW: "REVIEW",
  APPROVED: "APPROVED",
};

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

export function createScene(data = {}) {
  const now = new Date().toISOString();
  const coveragePlan = Object.keys(object(data.coverage_plan)).length
    ? object(data.coverage_plan)
    : object(data.metadata?.coverage_plan);
  const cinematicCoverage = Object.keys(object(data.cinematic_coverage)).length
    ? object(data.cinematic_coverage)
    : object(data.metadata?.cinematic_coverage);
  const world = Object.keys(object(data.world)).length
    ? object(data.world)
    : object(data.metadata?.world);

  return {
    id: data.id || crypto.randomUUID(),
    organization_id: data.organization_id,
    creative_project_id: data.creative_project_id,
    storyboard_id: data.storyboard_id ?? null,
    scene_number: Number(data.scene_number ?? 1),
    title: data.title ?? "",
    objective: data.objective ?? "",
    emotion: data.emotion ?? "",
    duration_seconds: Number(data.duration_seconds ?? 5),
    world_id: data.world_id ?? world.world_id ?? null,
    world,
    location: data.location ?? world.location ?? {},
    spatial_geography: data.spatial_geography ?? world.spatial_geography ?? world.geography ?? null,
    architecture_geometry: data.architecture_geometry ?? world.architecture_geometry ?? world.architecture ?? null,
    production_design: data.production_design ?? world.production_design ?? {},
    props: array(data.props ?? world.props ?? world.set_dressing),
    materials_surfaces: data.materials_surfaces ?? world.materials_surfaces ?? world.materials ?? null,
    signage_readable_text: data.signage_readable_text ?? world.signage_readable_text ?? world.signage ?? null,
    lighting: data.lighting ?? world.lighting ?? {},
    time_of_day: data.time_of_day ?? world.time_of_day ?? null,
    weather: data.weather ?? world.weather ?? null,
    atmosphere: data.atmosphere ?? world.atmosphere ?? null,
    background_population: data.background_population ?? world.background_population ?? world.background_activity ?? null,
    scene_scale: data.scene_scale ?? world.scene_scale ?? null,
    world_reference_assets: array(data.world_reference_assets ?? world.reference_assets),
    actors: data.actors ?? [],
    products: data.products ?? [],
    brand_rules: data.brand_rules ?? [],
    visual_style: data.visual_style ?? {},
    camera_style: data.camera_style ?? {},
    audio_style: data.audio_style ?? {},
    estimated_cost: Number(data.estimated_cost ?? 0),
    estimated_seconds: Number(data.estimated_seconds ?? 0),
    status: data.status ?? SCENE_STATUS.DRAFT,
    metadata: {
      ...(data.metadata ?? {}),
      coverage_plan: coveragePlan,
      cinematic_coverage: cinematicCoverage,
      coverage_contract:
        cinematicCoverage.contract ||
        data.metadata?.coverage_contract ||
        null,
      cinematic_coverage_preserved: Boolean(Object.keys(coveragePlan).length),
      world,
      world_state_preserved: true,
    },
    created_at: now,
    updated_at: now,
  };
}
