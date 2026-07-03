export const ASSET_TYPES = {

  IMAGE: "IMAGE",

  VIDEO: "VIDEO",

  LOGO: "LOGO",

  BRAND_GUIDE: "BRAND_GUIDE",

  FONT: "FONT",

  AUDIO: "AUDIO",

  VOICE: "VOICE",

  DOCUMENT: "DOCUMENT",

  TEMPLATE: "TEMPLATE",

};

export function createCreativeAsset(
  data = {}
) {

  const now =
    new Date().toISOString();

  return {

    id:
      crypto.randomUUID(),

    organization_id:
      data.organization_id,

    project_id:
      data.project_id ?? null,

    deliverable_id:
      data.deliverable_id ?? null,

    type:
      data.type,

    name:
      data.name ?? "",

    description:
      data.description ?? "",

    storage_path:
      data.storage_path ?? "",

    mime_type:
      data.mime_type ?? "",

    size_bytes:
      data.size_bytes ?? 0,

    width:
      data.width ?? null,

    height:
      data.height ?? null,

    duration:
      data.duration ?? null,

    tags:
      data.tags ?? [],

    metadata:
      data.metadata ?? {},

    created_at: now,

    updated_at: now,

  };

}
