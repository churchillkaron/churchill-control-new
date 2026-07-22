import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

const UNIVERSAL_WORKSPACES = new Set([
  "mission",
  "brief",
  "research",
  "strategy",
  "concept",
  "assets",
  "storyboard",
  "production",
  "timeline",
  "documents",
  "render",
  "publishing",
  "learning",
]);

const DEFAULT_WORKFLOW = [
  {
    id: "mission",
    workspace_id: "mission",
    title: "Mission",
    stage: "MISSION_CREATED",
    description: "Understand what should exist and why it matters.",
  },
  {
    id: "brief",
    workspace_id: "brief",
    title: "Understanding",
    stage: "UNDERSTANDING",
    description: "Turn the request into a complete production brief.",
  },
  {
    id: "research",
    workspace_id: "research",
    title: "Discovery",
    stage: "RESEARCHING",
    description: "Research the world, audience, references, constraints, and opportunity.",
  },
  {
    id: "strategy",
    workspace_id: "strategy",
    title: "Creative Direction",
    stage: "BUILDING_STRATEGY",
    description: "Choose the strongest creative direction and production logic.",
  },
  {
    id: "concept",
    workspace_id: "concept",
    title: "Concept Development",
    stage: "BUILDING_CONCEPT",
    description: "Develop original ideas, systems, worlds, and executions.",
  },
  {
    id: "assets",
    workspace_id: "assets",
    title: "Source Material",
    stage: "PREPARING_ASSETS",
    description: "Evaluate, improve, create, and organize all required source material.",
  },
  {
    id: "production",
    workspace_id: "production",
    title: "Production",
    stage: "PRODUCING",
    description: "Produce every required component through the appropriate specialist capabilities.",
  },
  {
    id: "render",
    workspace_id: "render",
    title: "Finish & Quality",
    stage: "RENDERING",
    description: "Finish, inspect, correct, and prepare the work for release.",
  },
  {
    id: "publishing",
    workspace_id: "publishing",
    title: "Release",
    stage: "PUBLISHING",
    description: "Deliver or publish each output through its intended channel or environment.",
  },
  {
    id: "learning",
    workspace_id: "learning",
    title: "Learning",
    stage: "LEARNING",
    description: "Measure the result and preserve reusable creative intelligence.",
  },
];

function cleanJsonText(value) {
  return String(value || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function parseJson(value) {
  try {
    return JSON.parse(cleanJsonText(value));
  } catch {
    return null;
  }
}

function compactText(value, maximum = 120) {
  const normalized = String(value || "")
    .replace(/\s+/g, " ")
    .trim();

  if (normalized.length <= maximum) return normalized;
  return `${normalized.slice(0, maximum - 1).trim()}…`;
}

function stringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function normalizeDeliverables(value, request) {
  const source = Array.isArray(value) && value.length
    ? value
    : [
        {
          title: compactText(request, 80) || "Creative Production",
          description: request,
          medium: "OPEN",
          capabilities: ["creative_direction", "production", "quality_control"],
        },
      ];

  return source.map((item, index) => ({
    id: String(item?.id || `deliverable_${index + 1}`),
    title:
      compactText(item?.title, 100) ||
      `Deliverable ${index + 1}`,
    description:
      String(item?.description || item?.objective || request || "").trim(),
    medium:
      String(item?.medium || item?.form || "OPEN").trim(),
    formats: stringArray(item?.formats),
    channels: stringArray(item?.channels),
    capabilities: stringArray(item?.capabilities),
    dependencies: stringArray(item?.dependencies),
    success_criteria: stringArray(item?.success_criteria),
    specifications:
      item?.specifications && typeof item.specifications === "object"
        ? item.specifications
        : {},
    metadata:
      item?.metadata && typeof item.metadata === "object"
        ? item.metadata
        : {},
  }));
}

function normalizeWorkflow(value) {
  if (!Array.isArray(value) || !value.length) {
    return DEFAULT_WORKFLOW;
  }

  const workflow = value
    .map((item, index) => {
      const workspaceId = String(
        item?.workspace_id || item?.workspace || item?.id || "production",
      ).trim().toLowerCase();

      if (!UNIVERSAL_WORKSPACES.has(workspaceId)) return null;

      return {
        id: String(item?.id || `${workspaceId}_${index + 1}`),
        workspace_id: workspaceId,
        title:
          compactText(item?.title || item?.name, 80) ||
          workspaceId.replace(/_/g, " "),
        stage: String(item?.stage || "").trim() || null,
        description: String(item?.description || "").trim() || null,
        capabilities: stringArray(item?.capabilities),
        required: item?.required !== false,
      };
    })
    .filter(Boolean);

  const hasMission = workflow.some((item) => item.workspace_id === "mission");
  if (!hasMission) {
    workflow.unshift(DEFAULT_WORKFLOW[0]);
  }

  return workflow.length ? workflow : DEFAULT_WORKFLOW;
}

function fallbackBlueprint({ request }) {
  const title = compactText(request, 90) || "New Creative Mission";

  return {
    title,
    business_goal: request,
    objective: request,
    creative_thesis:
      "Create the strongest original response to the request without forcing it into a predefined product category.",
    audience: {},
    channels: [],
    languages: [],
    deliverables: normalizeDeliverables([], request),
    workflow: DEFAULT_WORKFLOW,
    departments: [
      "creative_direction",
      "research",
      "design",
      "production",
      "quality_control",
    ],
    production_principles: [
      "Choose the medium and production method from the mission, not from a fixed product list.",
      "Use supplied assets as evidence and references; improve or regenerate inadequate material before final production.",
      "Preserve originality, realism, craft, coherence, and release readiness across every output.",
    ],
    quality_policy: {
      ambition: "world_class",
      review_mode: "evidence_based",
      regenerate_when_below_standard: true,
    },
    assumptions: [],
    blocking_questions: [],
    confidence: 45,
  };
}

function normalizeBlueprint(value, request) {
  const source = value?.result || value || {};
  const fallback = fallbackBlueprint({ request });

  return {
    title:
      compactText(source.title, 100) ||
      fallback.title,
    business_goal:
      String(source.business_goal || source.goal || request).trim(),
    objective:
      String(source.objective || source.desired_outcome || request).trim(),
    creative_thesis:
      String(source.creative_thesis || source.thesis || fallback.creative_thesis).trim(),
    audience:
      source.audience && typeof source.audience === "object"
        ? source.audience
        : {},
    channels: stringArray(source.channels),
    languages: stringArray(source.languages),
    deliverables: normalizeDeliverables(source.deliverables, request),
    workflow: normalizeWorkflow(source.workflow),
    departments: stringArray(source.departments),
    production_principles:
      stringArray(source.production_principles).length
        ? stringArray(source.production_principles)
        : fallback.production_principles,
    quality_policy:
      source.quality_policy && typeof source.quality_policy === "object"
        ? source.quality_policy
        : fallback.quality_policy,
    assumptions: stringArray(source.assumptions),
    blocking_questions: stringArray(source.blocking_questions),
    confidence: Number(source.confidence || value?.confidence || 70),
  };
}

export async function composeCreativeMission({
  organization_id,
  request,
  context = {},
}) {
  if (!organization_id) {
    throw new Error("organization_id required");
  }

  const creativeRequest = String(request || "").trim();
  if (!creativeRequest) {
    throw new Error("creative request required");
  }

  const fallback = fallbackBlueprint({ request: creativeRequest });

  try {
    const execution = await ServiceExecutionRuntime.execute({
      organization_id,
      service_id: "ai.reasoning.execute",
      category: "AI",
      input: {
        model:
          process.env.AVANTIQO_CREATIVE_DIRECTOR_MODEL ||
          process.env.AVANTIQO_REASONING_MODEL ||
          "gpt-4.1",
        prompt: `
You are Avantiqo's executive creative producer and mission architect.

The user can ask for anything that belongs to art, communication, design, entertainment, culture, experience, storytelling, environments, products, events, publishing, digital work, physical work, or a hybrid that has never existed before.

Interpret the request on its own terms. Do not force it into a predefined product category. Do not reduce it to a single asset when the strongest response requires a system of connected outputs. Choose the medium, specialists, workflow, source material, production methods, finishing, quality evidence, and release path that the mission genuinely needs.

Be imaginative, specific, commercially intelligent, culturally aware, physically believable, and production-ready. Use supplied assets as references and evidence. When source assets are inadequate, plan how to improve, recreate, extend, or replace them before final production.

Return strict JSON only with this shape:
{
  "title": "concise mission title",
  "business_goal": "why this matters",
  "objective": "what should be achieved",
  "creative_thesis": "the unifying creative idea",
  "audience": {},
  "channels": [],
  "languages": [],
  "deliverables": [
    {
      "id": "stable semantic id",
      "title": "free-form deliverable name",
      "description": "what must be made",
      "medium": "free-form medium or hybrid",
      "formats": [],
      "channels": [],
      "capabilities": [],
      "dependencies": [],
      "success_criteria": [],
      "specifications": {},
      "metadata": {}
    }
  ],
  "workflow": [
    {
      "id": "semantic phase id",
      "workspace_id": "one of mission, brief, research, strategy, concept, assets, storyboard, production, timeline, documents, render, publishing, learning",
      "title": "mission-specific phase title",
      "stage": "runtime stage when known",
      "description": "what this phase accomplishes",
      "capabilities": [],
      "required": true
    }
  ],
  "departments": [],
  "production_principles": [],
  "quality_policy": {},
  "assumptions": [],
  "blocking_questions": [],
  "confidence": 0
}

USER REQUEST:
${creativeRequest}

AVAILABLE CONTEXT:
${JSON.stringify(context || {})}
`,
      },
      metadata: {
        module: "CREATIVE",
        operation: "COMPOSE_MISSION",
        creative_request: creativeRequest,
      },
    });

    const text =
      execution?.output?.text ||
      execution?.output?.content ||
      execution?.output?.result?.text ||
      "";
    const parsed = parseJson(text);

    if (!parsed) return fallback;
    return normalizeBlueprint(parsed, creativeRequest);
  } catch (error) {
    console.error("creative mission composition fallback", error);
    return fallback;
  }
}

export const CreativeMissionComposerRuntime = {
  compose: composeCreativeMission,
};
