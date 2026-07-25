import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

function parseJson(value) {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(String(value || ""));
  } catch {
    return null;
  }
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function text(value, fallback = "") {
  return String(value || fallback).trim();
}

function sceneCount(duration) {
  const seconds = Math.max(5, Number(duration || 30));
  return Math.max(3, Math.min(15, Math.ceil(seconds / 6)));
}

function fallbackPlan({ brief = {}, project = {}, assets = [] }) {
  const duration = Number(
    brief.duration_seconds || project.target_duration || 30,
  );
  const count = sceneCount(duration);
  const perScene = Math.max(3, Math.round(duration / count));
  const objective = text(
    brief.creative_objective ||
    brief.business_goal ||
    project.objective,
    "Create a compelling original production.",
  );

  return {
    concept: {
      title: text(project.name, "Original creative concept"),
      hook: objective,
      message: objective,
      emotion: text(brief.emotion, "attention and trust"),
      visual_style: text(brief.tone, "premium and authentic"),
      narrative: objective,
      camera_style: "Purposeful camera language selected per scene",
      music_style: "Original music selected for the emotional journey",
      voice_style: "Natural voice selected for audience and language",
      call_to_action: text(brief.requested_action),
      target_audience: brief.target_audience || {},
    },
    scenes: Array.from({ length: count }, (_, index) => ({
      title: `Scene ${index + 1}`,
      objective,
      emotion:
        index === 0
          ? "attention"
          : index === count - 1
            ? "resolution and action"
            : "progressive engagement",
      duration_seconds: perScene,
      location: {},
      actors: [],
      products: array(brief.products),
      brand_rules: [],
      visual_style: {
        direction: text(brief.tone, "authentic premium realism"),
      },
      camera_style: {
        intent: "Choose framing and movement to support this scene's purpose",
      },
      audio_style: {
        intent: "Build emotional continuity without overpowering dialogue",
      },
      shots: [
        {
          title: `Scene ${index + 1} establishing shot`,
          purpose: objective,
          duration_seconds: perScene,
          medium: assets.length ? "asset-led-motion" : "generated-video",
          generation: {
            required: true,
            service: "ai.video.generate",
            capability: "ai.video.generate",
          },
        },
      ],
    })),
    quality: {
      minimum_scene_score: 88,
      regenerate_below_score: 80,
      require_brand_fit: true,
      require_non_ai_feel: true,
    },
  };
}

function normalizedPlan(result, input) {
  const output =
    result?.output?.output ||
    result?.output ||
    result ||
    {};
  const parsed = parseJson(output.text || output.content || output);
  const plan = parsed?.result || parsed;

  if (!plan || !array(plan.scenes).length) {
    return fallbackPlan(input);
  }

  return {
    ...fallbackPlan(input),
    ...plan,
    concept: {
      ...fallbackPlan(input).concept,
      ...(plan.concept || {}),
    },
    scenes: array(plan.scenes),
    quality: {
      ...fallbackPlan(input).quality,
      ...(plan.quality || {}),
    },
  };
}

export const CreativeMasterPlanRuntime = {
  async create({
    organization_id,
    mission = {},
    project = {},
    brief = {},
    assets = [],
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!project.id) throw new Error("creative_project_id required");

    const input = { mission, project, brief, assets };
    const prompt = `
You are Avantiqo's accountable executive creative director leading a world-class,
industry-neutral creative studio. Convert the supplied business intent into one
original production plan. The output can be for film, image, audio, document,
menu, presentation, website or mixed media; infer the correct medium from the
request instead of forcing a video template.

Return strict JSON only with this structure:
{
  "concept": {
    "title": "string",
    "hook": "string",
    "message": "string",
    "emotion": "string",
    "visual_style": "string",
    "narrative": "string",
    "camera_style": "string",
    "music_style": "string",
    "voice_style": "string",
    "call_to_action": "string",
    "target_audience": {}
  },
  "scenes": [{
    "title": "string",
    "objective": "string",
    "emotion": "string",
    "duration_seconds": 5,
    "location": {},
    "actors": [],
    "products": [],
    "brand_rules": [],
    "visual_style": {},
    "camera_style": {},
    "audio_style": {},
    "shots": [{
      "title": "string",
      "purpose": "string",
      "duration_seconds": 5,
      "medium": "string",
      "camera": {},
      "lighting": {},
      "actors": [],
      "products": [],
      "location": {},
      "dialogue": [],
      "narration": {},
      "music": {},
      "sound_effects": [],
      "subtitles": [],
      "assets": [],
      "generation": {
        "required": true,
        "service": "ai.video.generate",
        "capability": "ai.video.generate"
      }
    }]
  }],
  "quality": {
    "minimum_scene_score": 88,
    "regenerate_below_score": 80,
    "require_brand_fit": true,
    "require_non_ai_feel": true
  }
}

Rules:
- Use supplied real assets first when suitable.
- Generate missing assets rather than forcing unsuitable material.
- Make every scene and shot purposeful, specific and executable.
- Include sound, dialogue, text, graphics and action only when they improve the work.
- Do not copy a protected campaign, character or living artist's identity or style.
- Avoid generic AI language and generic montage plans.

INPUT:
${JSON.stringify(input)}
`;

    try {
      const result = await ServiceExecutionRuntime.execute({
        organization_id,
        service_id: "ai.reasoning.execute",
        provider_id: null,
        category: "CREATIVE_DIRECTION",
        input: {
          prompt,
          quantity: 1,
        },
        metadata: {
          module: "CREATIVE",
          operation: "MASTER_PLAN",
          creative_mission_id: mission.id || null,
          creative_project_id: project.id,
        },
      });

      return {
        plan: normalizedPlan(result, input),
        provider: result.provider || null,
        model: result.model || null,
        usage: result.usage || null,
        billing: result.billing || null,
        fallback: false,
      };
    } catch (error) {
      return {
        plan: fallbackPlan(input),
        provider: "local-fallback",
        model: "creative-master-plan-fallback-v1",
        usage: null,
        billing: null,
        fallback: true,
        fallback_reason: error?.message || String(error),
      };
    }
  },
};
