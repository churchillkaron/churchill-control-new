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

const PRODUCTION_TYPE_VALUES = new Set(Object.values(PRODUCTION_TYPES));
const PROJECT_STATUS_VALUES = new Set(Object.values(PROJECT_STATUS));
const PRODUCTION_TYPE_ALIASES = new Map([
  ["MASTER_VIDEO", PRODUCTION_TYPES.VIDEO],
  ["VIDEO_MASTER", PRODUCTION_TYPES.VIDEO],
  ["MASTER_IMAGE", PRODUCTION_TYPES.IMAGE],
  ["IMAGE_MASTER", PRODUCTION_TYPES.IMAGE],
  ["WEBPAGE", PRODUCTION_TYPES.WEBSITE],
  ["WEB_PAGE", PRODUCTION_TYPES.WEBSITE],
  ["SLIDES", PRODUCTION_TYPES.PRESENTATION],
  ["SLIDE_DECK", PRODUCTION_TYPES.PRESENTATION],
]);

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function profile(value) {
  if (value === null || value === undefined || value === "") return {};
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  if (typeof value === "string") {
    const id = value.trim();
    return id ? { id } : {};
  }
  throw new Error("CREATIVE_PROJECT_PROFILE_INVALID");
}

function normalizedEnum(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

export function normalizeCreativeProductionType(value) {
  const normalized = normalizedEnum(value);
  if (!normalized) return null;
  const resolved = PRODUCTION_TYPE_ALIASES.get(normalized) || normalized;
  if (!PRODUCTION_TYPE_VALUES.has(resolved)) {
    throw new Error(
      `CREATIVE_PROJECT_PRODUCTION_TYPE_INVALID:${normalized};` +
      `allowed=${[...PRODUCTION_TYPE_VALUES].join(",")}`,
    );
  }
  return resolved;
}

export function normalizeCreativeProjectStatus(value) {
  const normalized = normalizedEnum(value || PROJECT_STATUS.DRAFT);
  if (!PROJECT_STATUS_VALUES.has(normalized)) {
    throw new Error(
      `CREATIVE_PROJECT_STATUS_INVALID:${normalized};` +
      `allowed=${[...PROJECT_STATUS_VALUES].join(",")}`,
    );
  }
  return normalized;
}

export function createCreativeProject(data = {}) {
  const now = new Date().toISOString();
  const name = String(data.name ?? "").trim();
  if (!data.organization_id) throw new Error("organization_id required");
  if (!name) throw new Error("Project name required");

  return {
    id: data.id || crypto.randomUUID(),
    organization_id: data.organization_id,
    version: finite(data.version) ?? 1,
    production_type: normalizeCreativeProductionType(data.production_type),
    status: normalizeCreativeProjectStatus(data.status),
    name,
    description: String(data.description ?? ""),
    objective: String(data.objective ?? ""),
    campaign_id: data.campaign_id ?? null,
    creative_mission_id: data.creative_mission_id ?? null,
    brand_id: data.brand_id ?? null,
    target_channels: Array.isArray(data.target_channels)
      ? data.target_channels.filter(Boolean)
      : [],
    target_languages: Array.isArray(data.target_languages)
      ? data.target_languages.filter(Boolean)
      : [],
    target_duration: finite(data.target_duration),
    quality_profile: profile(data.quality_profile),
    budget_profile: profile(data.budget_profile),
    metadata: object(data.metadata),
    created_by: data.created_by ?? null,
    archived: data.archived === true,
    created_at: data.created_at || now,
    updated_at: now,
  };
}
