import crypto from "node:crypto";

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
  ASSET: "ASSET",
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
  MOMENT: "MOMENT",
  TIMELINE: "TIMELINE",
  QUALITY_REPORT: "QUALITY_REPORT",
  PRODUCTION_DOSSIER: "PRODUCTION_DOSSIER",
  RELEASE_GATE_REPORT: "RELEASE_GATE_REPORT",
  RELEASE_READINESS_REPORT: "RELEASE_READINESS_REPORT",
  RELEASE_PACKAGE: "RELEASE_PACKAGE",
  APPROVAL_RECORD: "APPROVAL_RECORD",
  PUBLISH_COMMAND: "PUBLISH_COMMAND",
  PUBLISH_EXECUTION: "PUBLISH_EXECUTION",
  PUBLICATION_EVIDENCE: "PUBLICATION_EVIDENCE",
  REPAIR_PLAN: "REPAIR_PLAN",
  FINAL_RENDER: "FINAL_RENDER",
};

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function createCreativeAssetNode(data = {}) {
  const now = new Date().toISOString();
  const technical = data.technical || {};
  const intelligence = data.intelligence || {};

  return {
    id: data.id || crypto.randomUUID(),
    organization_id: data.organization_id,
    creative_project_id: data.creative_project_id ?? null,
    creative_asset_id: data.creative_asset_id ?? null,
    production_task_id: data.production_task_id ?? null,
    parent_asset_node_id: data.parent_asset_node_id ?? null,
    type: data.type ?? CREATIVE_ASSET_NODE_TYPES.ASSET,
    status: data.status ?? CREATIVE_ASSET_NODE_STATUS.IMPORTED,
    name: data.name ?? "",
    description: data.description ?? "",
    url: data.url ?? null,
    storage_path: data.storage_path ?? null,
    lineage: {
      ...(data.lineage || {}),
      source: data.lineage?.source ?? "manual",
      provider_id: data.lineage?.provider_id ?? null,
      capability: data.lineage?.capability ?? null,
      generation_version: data.lineage?.generation_version ?? 1,
    },
    technical: {
      ...technical,
      mime_type: technical.mime_type ?? null,
      width: finite(technical.width),
      height: finite(technical.height),
      duration_seconds: finite(technical.duration_seconds),
      checksum: technical.checksum ?? technical.checksum_sha256 ?? null,
    },
    intelligence: {
      ...intelligence,
      quality_score: finite(intelligence.quality_score),
      brand_match_score: finite(intelligence.brand_match_score),
      reuse_score: finite(intelligence.reuse_score),
      safety_status: intelligence.safety_status ?? "UNKNOWN",
      tags: Array.isArray(intelligence.tags) ? intelligence.tags : [],
      detected_products: Array.isArray(intelligence.detected_products)
        ? intelligence.detected_products
        : [],
      detected_people: Array.isArray(intelligence.detected_people)
        ? intelligence.detected_people
        : [],
      detected_locations: Array.isArray(intelligence.detected_locations)
        ? intelligence.detected_locations
        : [],
    },
    cost: {
      ...(data.cost || {}),
      currency: data.cost?.currency ?? null,
      estimated: finite(data.cost?.estimated, 0),
      actual: finite(data.cost?.actual, 0),
      saved_by_reuse: finite(data.cost?.saved_by_reuse, 0),
    },
    reuse: {
      ...(data.reuse || {}),
      reusable: data.reuse?.reusable ?? false,
      reuse_count: finite(data.reuse?.reuse_count, 0),
      approved_for_reuse: data.reuse?.approved_for_reuse ?? false,
    },
    review: {
      ...(data.review || {}),
      ai_reviewed: data.review?.ai_reviewed ?? false,
      human_reviewed: data.review?.human_reviewed ?? false,
      approved: data.review?.approved ?? false,
      approved_by: data.review?.approved_by ?? null,
      notes: data.review?.notes ?? "",
    },
    metadata: data.metadata ?? {},
    created_by: data.created_by ?? null,
    created_at: data.created_at || now,
    updated_at: now,
  };
}
