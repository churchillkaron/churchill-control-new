export function createResearchReport(data = {}) {
  return {
    id: data.id || crypto.randomUUID(),
    organization_id: data.organization_id,
    creative_project_id:
      data.creative_project_id || data.project_id || null,
    creative_brief_id:
      data.creative_brief_id || data.brief_id || null,
    summary: data.summary || "",
    audience: data.audience || {
      demographics: [],
      psychographics: [],
      buying_triggers: [],
      objections: [],
      motivations: [],
    },
    competitors: Array.isArray(data.competitors) ? data.competitors : [],
    trends: Array.isArray(data.trends) ? data.trends : [],
    keywords: Array.isArray(data.keywords) ? data.keywords : [],
    messaging: data.messaging || {
      primary: "",
      secondary: [],
      call_to_action: "",
    },
    visual_direction: data.visual_direction || {
      mood: [],
      colors: [],
      locations: [],
      wardrobe: [],
      lighting: [],
      camera_style: [],
    },
    recommendations: Array.isArray(data.recommendations)
      ? data.recommendations
      : [],
    confidence: Number(data.confidence || 0),
    reasoning: data.reasoning || {
      model: "",
      version: "",
      duration_ms: 0,
    },
    metadata: data.metadata || {},
    created_at: data.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}
