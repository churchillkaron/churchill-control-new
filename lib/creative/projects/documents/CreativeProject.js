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
      data.id ?? crypto.randomUUID(),

    organization_id:
      data.organization_id,

    creative_mission_id:
      data.creative_mission_id ?? null,

    campaign_id:
      data.campaign_id ?? null,

    version_number:
      data.version_number ?? data.version ?? 1,

    version_parent_id:
      data.version_parent_id ?? null,

    revision_reason:
      data.revision_reason ?? null,

    version_created_at:
      data.version_created_at ?? now,

    production_type:
      data.production_type ??
      PRODUCTION_TYPES.VIDEO,

    status:
      data.status ?? PROJECT_STATUS.DRAFT,

    name:
      data.name ?? "",

    description:
      data.description ?? "",

    objective:
      data.objective ?? "",

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

    archived:
      data.archived ?? false,

    created_at:
      data.created_at ?? now,

    updated_at: now,

  };

}
