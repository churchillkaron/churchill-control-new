function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function optional(value) {
  return value === undefined || value === "" ? null : value;
}

export function createCreativeBrief(data = {}) {
  const business = object(data.business);
  const campaign = object(data.campaign);
  const audience = object(data.audience);
  const brand = object(data.brand);
  const production = object(data.production);
  const assets = object(data.assets);

  return {
    project_id: data.project_id || null,

    business: {
      company: optional(business.company),
      context: optional(
        business.context ||
        business.description ||
        business.business_context,
      ),
      products: list(business.products),
      services: list(business.services),
      strengths: list(business.strengths),
      competitors: list(business.competitors),
      evidence: list(business.evidence),
    },

    campaign: {
      objective: optional(campaign.objective),
      call_to_action: optional(campaign.call_to_action),
      offer: optional(campaign.offer),
      channels: list(campaign.channels || campaign.platforms),
      constraints: list(campaign.constraints),
    },

    audience: {
      primary: optional(audience.primary),
      secondary: optional(audience.secondary),
      location: optional(audience.location),
      language: optional(audience.language),
      evidence: list(audience.evidence),
    },

    brand: {
      tone: optional(brand.tone),
      personality: optional(brand.personality),
      colors: list(brand.colors),
      fonts: list(brand.fonts),
      logo: brand.logo || null,
      restrictions: list(brand.restrictions),
      protected_asset_ids: list(brand.protected_asset_ids),
    },

    production: {
      workflow_kind: optional(
        production.workflow_kind ||
        production.type,
      ),
      duration: optional(production.duration),
      output_spec: object(production.output_spec),
      budget: optional(production.budget),
      currency: optional(production.currency),
      constraints: list(production.constraints),
    },

    assets: {
      images: list(assets.images),
      videos: list(assets.videos),
      documents: list(assets.documents),
      logos: list(assets.logos),
      audio: list(assets.audio || assets.music),
      other: list(assets.other),
    },

    created_at: data.created_at || new Date().toISOString(),
  };
}
