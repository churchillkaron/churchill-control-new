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

export function createScene(data = {}) {

  const now = new Date().toISOString();
  const coveragePlan = Object.keys(object(data.coverage_plan)).length
    ? object(data.coverage_plan)
    : object(data.metadata?.coverage_plan);
  const cinematicCoverage = Object.keys(object(data.cinematic_coverage)).length
    ? object(data.cinematic_coverage)
    : object(data.metadata?.cinematic_coverage);

  return {

    id:
      data.id || crypto.randomUUID(),

    organization_id:
      data.organization_id,

    creative_project_id:
      data.creative_project_id,

    storyboard_id:
      data.storyboard_id ?? null,

    scene_number:
      Number(data.scene_number ?? 1),

    title:
      data.title ?? "",

    objective:
      data.objective ?? "",

    emotion:
      data.emotion ?? "",

    duration_seconds:
      Number(data.duration_seconds ?? 5),

    location:
      data.location ?? {},

    actors:
      data.actors ?? [],

    products:
      data.products ?? [],

    brand_rules:
      data.brand_rules ?? [],

    visual_style:
      data.visual_style ?? {},

    camera_style:
      data.camera_style ?? {},

    audio_style:
      data.audio_style ?? {},

    estimated_cost:
      Number(data.estimated_cost ?? 0),

    estimated_seconds:
      Number(data.estimated_seconds ?? 0),

    status:
      data.status ?? SCENE_STATUS.DRAFT,

    metadata: {
      ...(data.metadata ?? {}),
      coverage_plan: coveragePlan,
      cinematic_coverage: cinematicCoverage,
      coverage_contract:
        cinematicCoverage.contract ||
        data.metadata?.coverage_contract ||
        null,
      cinematic_coverage_preserved: Boolean(Object.keys(coveragePlan).length),
    },

    created_at:
      now,

    updated_at:
      now,

  };

}