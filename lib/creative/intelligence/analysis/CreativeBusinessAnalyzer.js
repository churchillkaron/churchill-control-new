function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function explicitTone(organization = {}, brand = {}) {
  return (
    text(brand.voice_tone) ||
    text(brand.tone) ||
    text(organization.brand_voice_tone) ||
    text(organization.voice_tone) ||
    null
  );
}

function explicitVisualStyle(organization = {}, brand = {}) {
  const values = [
    ...list(brand.style_keywords),
    ...list(brand.visual_style_keywords),
    ...list(organization.style_keywords),
  ];
  return [...new Set(values.map(text).filter(Boolean))];
}

function explicitAudiences(organization = {}, brand = {}) {
  const values = [
    ...list(brand.audiences),
    ...list(brand.target_audiences),
    ...list(organization.audiences),
    ...list(organization.target_audiences),
  ];
  return values.filter(Boolean);
}

export function analyzeCreativeBusiness({
  organization = {},
  brand = {},
  industry = null,
  objective = "",
  assets = [],
}) {
  const suppliedAssets = list(assets);
  const audiences = explicitAudiences(organization, brand);
  const tone = explicitTone(organization, brand);
  const visualStyle = explicitVisualStyle(organization, brand);

  return {
    business_context: {
      organization,
      industry: industry || null,
      objective: text(objective),
    },
    brand_direction: {
      tone,
      visual_style: visualStyle,
      evidence_status:
        tone || visualStyle.length ? "EXPLICIT_EVIDENCE" : "UNRESOLVED",
    },
    audience_hypothesis: audiences,
    audience_evidence_status: audiences.length
      ? "EXPLICIT_EVIDENCE"
      : "UNRESOLVED",
    creative_opportunity: {
      asset_first: suppliedAssets.length > 0,
      missing_assets: suppliedAssets.length === 0,
      recommended_formats: [],
      format_decision_source: "CREATIVE_DIRECTOR",
    },
    confidence: null,
    confidence_source: "NOT_INVENTED_WITHOUT_EVIDENCE",
  };
}
