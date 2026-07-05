export const CREATIVE_ASSET_NODE_STATUS = {
  IMPORTED: "IMPORTED",
  GENERATED: "GENERATED",
  DERIVED: "DERIVED",
  REVIEW: "REVIEW",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  ARCHIVED: "ARCHIVED",
};

export const CREATIVE_ASSET_NODE_TYPES = {
  IMAGE: "IMAGE",
  VIDEO: "VIDEO",
  AUDIO: "AUDIO",
  VOICE: "VOICE",
  MUSIC: "MUSIC",
  SFX: "SFX",
  SUBTITLE: "SUBTITLE",
  LOGO: "LOGO",
  FONT: "FONT",
  TEMPLATE: "TEMPLATE",
  FINAL_RENDER: "FINAL_RENDER",
};

export function createCreativeAssetNode(data = {}) {
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),

    organization_id: data.organization_id,
    creative_project_id: data.creative_project_id ?? null,
    creative_asset_id: data.creative_asset_id ?? null,
    production_task_id: data.production_task_id ?? null,
    parent_asset_node_id: data.parent_asset_node_id ?? null,

    type: data.type ?? CREATIVE_ASSET_NODE_TYPES.IMAGE,
    status: data.status ?? CREATIVE_ASSET_NODE_STATUS.IMPORTED,

    name: data.name ?? "",
    description: data.description ?? "",
    url: data.url ?? null,
    storage_path: data.storage_path ?? null,

    lineage: {
      source: data.lineage?.source ?? "manual",
      provider_id: data.lineage?.provider_id ?? null,
      capability: data.lineage?.capability ?? null,
      generation_version: data.lineage?.generation_version ?? 1,
    },

    technical: {
      mime_type: data.technical?.mime_type ?? null,
      width: data.technical?.width ?? null,
      height: data.technical?.height ?? null,
      duration_seconds: data.technical?.duration_seconds ?? null,
      checksum: data.technical?.checksum ?? null,
    },

    intelligence: {
      quality_score: Number(data.intelligence?.quality_score ?? 0),
      brand_match_score: Number(data.intelligence?.brand_match_score ?? 0),
      reuse_score: Number(data.intelligence?.reuse_score ?? 0),
      safety_status: data.intelligence?.safety_status ?? "UNKNOWN",
      tags: data.intelligence?.tags ?? [],
      detected_products: data.intelligence?.detected_products ?? [],
      detected_people: data.intelligence?.detected_people ?? [],
      detected_locations: data.intelligence?.detected_locations ?? [],
    },

    cost: {
      currency: data.cost?.currency ?? "USD",
      estimated: Number(data.cost?.estimated ?? 0),
      actual: Number(data.cost?.actual ?? 0),
      saved_by_reuse: Number(data.cost?.saved_by_reuse ?? 0),
    },

    reuse: {
      reusable: data.reuse?.reusable ?? true,
      reuse_count: Number(data.reuse?.reuse_count ?? 0),
      approved_for_reuse: data.reuse?.approved_for_reuse ?? false,
    },

    review: {
      ai_reviewed: data.review?.ai_reviewed ?? false,
      human_reviewed: data.review?.human_reviewed ?? false,
      approved: data.review?.approved ?? false,
      approved_by: data.review?.approved_by ?? null,
      notes: data.review?.notes ?? "",
    },

    metadata: data.metadata ?? {},

    created_by: data.created_by ?? null,
    created_at: now,
    updated_at: now,
  };
}
