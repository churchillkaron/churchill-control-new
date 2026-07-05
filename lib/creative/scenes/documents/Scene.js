export const SCENE_STATUS = {
  DRAFT: "DRAFT",
  READY: "READY",
  PRODUCTION: "PRODUCTION",
  REVIEW: "REVIEW",
  APPROVED: "APPROVED",
};

export function createScene(data = {}) {

  const now = new Date().toISOString();

  return {

    id:
      crypto.randomUUID(),

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

    metadata:
      data.metadata ?? {},

    created_at:
      now,

    updated_at:
      now,

  };

}
