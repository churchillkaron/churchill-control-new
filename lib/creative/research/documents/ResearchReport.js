export function createResearchReport(
  data = {}
) {

  return {

    id:
      crypto.randomUUID(),

    project_id:
      data.project_id,

    brief_id:
      data.brief_id,

    summary:
      "",

    audience: {

      demographics: [],

      psychographics: [],

      buying_triggers: [],

      objections: [],

      motivations: [],

    },

    competitors: [],

    trends: [],

    keywords: [],

    messaging: {

      primary: "",

      secondary: [],

      call_to_action: "",

    },

    visual_direction: {

      mood: [],

      colors: [],

      locations: [],

      wardrobe: [],

      lighting: [],

      camera_style: [],

    },

    recommendations: [],

    confidence: 0,

    reasoning: {

      model: "",

      version: "",

      duration_ms: 0,

    },

    created_at:
      new Date().toISOString(),

  };

}
