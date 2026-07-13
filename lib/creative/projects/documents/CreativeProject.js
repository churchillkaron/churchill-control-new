export const PRODUCTION_TYPES = {

  VIDEO: "VIDEO",

  IMAGE: "IMAGE",

  DOCUMENT: "DOCUMENT",

  MENU: "MENU",

  WEBSITE: "WEBSITE",

  PRESENTATION: "PRESENTATION",

  AUDIO: "AUDIO",

  WEB_ASSET: "WEB_ASSET",

  MULTIMEDIA: "MULTIMEDIA",

};

export const PROJECT_STATUS = {

  DRAFT: "DRAFT",

  RESEARCH: "RESEARCH",

  DIRECTION: "DIRECTION",

  PRODUCTION: "PRODUCTION",

  RENDERING: "RENDERING",

  QUALITY: "QUALITY",

  PUBLISHED: "PUBLISHED",

  ARCHIVED: "ARCHIVED",

};

export function createCreativeProject(
  data = {}
) {

  const now =
    new Date().toISOString();

  return {

    id:
      crypto.randomUUID(),

    organization_id:
      data.organization_id,

    version: 1,

    production_type:
      data.production_type ??
      PRODUCTION_TYPES.VIDEO,

    status:
      PROJECT_STATUS.DRAFT,

    name:
      data.name ?? "",

    description:
      data.description ?? "",

    objective:
      data.objective ?? "",

    campaign_id:
      data.campaign_id ?? null,

    creative_mission_id:
      data.creative_mission_id ?? null,

    brand_id:
      data.brand_id ?? null,

    target_channels:
      data.target_channels ?? [],

    target_languages:
      data.target_languages ?? ["en"],

    target_duration:
      data.target_duration ?? 30,

    quality_profile:
      data.quality_profile ?? "HIGH",

    budget_profile:
      data.budget_profile ?? "BALANCED",

    metadata:
      data.metadata ?? {},

    created_by:
      data.created_by ?? null,

    archived: false,

    created_at: now,

    updated_at: now,

  };

}
