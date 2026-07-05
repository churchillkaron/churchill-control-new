import { randomUUID } from "crypto";

export function createCreativeCharacter(data = {}) {

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

    role:
      data.role || "PRIMARY",

    appearance:
      data.appearance || {},

    wardrobe:
      data.wardrobe || {},

    voice_profile:
      data.voice_profile || null,

    model_provider:
      data.model_provider || null,

    reference_assets:
      data.reference_assets || [],

    metadata:
      data.metadata || {},

    created_at:
      data.created_at ||
      new Date().toISOString(),

  };

}
