import { randomUUID } from "crypto";

export function createCreativeBrand(data = {}) {

  return {

    id:
      data.id ||
      randomUUID(),

    organization_id:
      data.organization_id,

    creative_project_id:
      data.creative_project_id,

    name:
      data.name || "",

    logo_asset_id:
      data.logo_asset_id || null,

    colors:
      data.colors || [],

    fonts:
      data.fonts || [],

    voice_tone:
      data.voice_tone || "",

    style_keywords:
      data.style_keywords || [],

    prohibited_keywords:
      data.prohibited_keywords || [],

    reference_assets:
      data.reference_assets || [],

    metadata:
      data.metadata || {},

    created_at:
      data.created_at ||
      new Date().toISOString(),

  };

}
