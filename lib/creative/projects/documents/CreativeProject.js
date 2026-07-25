import crypto from "node:crypto";

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

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function createCreativeProject(data = {}) {
  const now = new Date().toISOString();

  return {
    id: data.id || crypto.randomUUID(),
    organization_id: data.organization_id,
    version: finite(data.version) ?? 1,
    production_type: data.production_type ?? null,
    status: data.status ?? PROJECT_STATUS.DRAFT,
    name: data.name ?? "",
    description: data.description ?? "",
    objective: data.objective ?? "",
    campaign_id: data.campaign_id ?? null,
    creative_mission_id: data.creative_mission_id ?? null,
    brand_id: data.brand_id ?? null,
    target_channels: Array.isArray(data.target_channels)
      ? data.target_channels
      : [],
    target_languages: Array.isArray(data.target_languages)
      ? data.target_languages
      : [],
    target_duration: finite(data.target_duration),
    quality_profile: data.quality_profile ?? null,
    budget_profile: data.budget_profile ?? null,
    metadata: data.metadata ?? {},
    created_by: data.created_by ?? null,
    archived: data.archived ?? false,
    created_at: data.created_at || now,
    updated_at: now,
  };
}
