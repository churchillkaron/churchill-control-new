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

const WORKSPACE_ORDER = [
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
];

const DEFAULT_WORKFLOW = [
  { id: "mission", workspace_id: "mission", title: "Mission", stage: "MISSION_CREATED", description: "Understand what should exist and why it matters." },
  { id: "brief", workspace_id: "brief", title: "Understanding", stage: "UNDERSTANDING", description: "Turn the request into a complete production brief." },
  { id: "research", workspace_id: "research", title: "Discovery", stage: "RESEARCHING", description: "Research the world, audience, references, constraints, and opportunity." },
  { id: "strategy", workspace_id: "strategy", title: "Creative Direction", stage: "BUILDING_STRATEGY", description: "Choose the strongest creative direction and production logic." },
  { id: "concept", workspace_id: "concept", title: "Concept Development", stage: "BUILDING_CONCEPT", description: "Develop original ideas, systems, worlds, and executions." },
  { id: "assets", workspace_id: "assets", title: "Source Material", stage: "PREPARING_ASSETS", description: "Evaluate, improve, create, and organize all required source material." },
  { id: "production", workspace_id: "production", title: "Production", stage: "PRODUCING", description: "Produce every required component through the appropriate specialist capabilities." },
  { id: "render", workspace_id: "render", title: "Finish & Quality", stage: "RENDERING", description: "Finish, inspect, correct, and prepare the work for release." },
  { id: "publishing", workspace_id: "publishing", title: "Release", stage: "PUBLISHING", description: "Deliver or publish each output through its intended channel or environment." },
  { id: "learning", workspace_id: "learning", title: "Learning", stage: "LEARNING", description: "Measure the result and preserve reusable creative intelligence." },
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
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function inferredMedium(request = "") {
  const text = String(request).toLowerCase();
  if (/\b(film|video|movie|cinematic|trailer|commercial|reel|cutdown)\b/.test(text)) return "FILM";
  if (/\b(menu)\b/.test(text)) return "MENU";
  if (/\b(website|webpage|landing page|web builder)\b/.test(text)) return "WEBSITE";
  if (/\b(image|photo|poster|banner|visual)\b/.test(text)) return "IMAGE";
  if (/\b(audio|music|song|voice|sound)\b/.test(text)) return "AUDIO";
  return "OPEN";
}

function deliverableTitle(item = {}, index = 0) {
  const supplied = compactText(item.title, 100);
  if (supplied && !/^deliverable\s*\d*$/i.test(supplied)) return supplied;

  const medium = String(item.medium || item.form || "").toLowerCase();
  const channels = stringArray(item.channels).join(" ").toLowerCase();

  if (/film|cinema|movie/.test(medium)) return "Cinematic Hero Film";
  if (/video|reel|cutdown/.test(medium) && /instagram|facebook|tiktok|social/.test(channels)) {
    return "Social Campaign Cutdowns";
  }
  if (/video|reel|cutdown/.test(medium)) return "Campaign Video Variants";
  if (/image|photo|poster|key art|still/.test(medium)) return "Campaign Key Art & Channel Stills";
  if (/audio|music|sound|voice/.test(medium)) return "Campaign Music & Sound Package";
  if (/website|web|landing/.test(medium)) return "Campaign Web Experience";
  if (/menu/.test(medium)) return "Campaign Menu System";
  return `Creative Deliverable ${index + 1}`;
}

function deliverableFormats(item = {}) {
  const supplied = stringArray(item.formats);
  if (supplied.length) return supplied;

  const specifications = item.specifications && typeof item.specifications === "object"
    ? item.specifications
    : {};

  if (Array.isArray(specifications.sizes)) {
    return stringArray(specifications.sizes);
  }

  const medium = String(item.medium || item.form || "").toLowerCase();
  const channels = stringArray(item.channels).join(" ").toLowerCase();

  if (/film|cinema|movie/.test(medium)) return ["16:9 master"];
  if (/video|reel|cutdown/.test(medium) && /instagram|facebook|tiktok|social/.test(channels)) {
    return ["9:16 vertical", "4:5 feed", "1:1 square"];
  }

  return [];
}

function normalizeDeliverables(value, request) {
  const source = Array.isArray(value) && value.length
    ? value
    : [{
        title: compactText(request, 80) || "Creative Production",
        description: request,
        medium: inferredMedium(request),
        capabilities: ["creative_direction", "production", "quality_control"],
      }];

  return source.map((item, index) => ({
    id: String(item?.id || `deliverable_${index + 1}`),
    title: deliverableTitle(item, index),
    description: String(item?.description || item?.objective || request || "").trim(),
    medium: String(item?.medium || item?.form || inferredMedium(request)).trim(),
    formats: deliverableFormats(item),
    channels: stringArray(item?.channels),
    capabilities: stringArray(item?.capabilities),
    dependencies: stringArray(item?.dependencies),
    success_criteria: stringArray(item?.success_criteria),
    specifications: item?.specifications && typeof item.specifications === "object" ? item.specifications : {},
    metadata: item?.metadata && typeof item.metadata === "object" ? item.metadata : {},
  }));
}

function workspaceFromText(value = "") {
  const text = String(value).trim().toLowerCase();
  if (!text) return null;
  if (UNIVERSAL_WORKSPACES.has(text)) return text;
  if (/mission|intake|kickoff/.test(text)) return "mission";
  if (/brief|understand|requirements|scope/.test(text)) return "brief";
  if (/research|discover|insight|reference|audience|location scout/.test(text)) return "research";
  if (/strategy|direction|art direction|creative direction/.test(text)) return "strategy";
  if (/concept|idea|treatment|world building/.test(text)) return "concept";
  if (/asset|source material|casting|talent|preparation|pre-production/.test(text)) return "assets";
  if (/storyboard|shot list|animatic|previs/.test(text)) return "storyboard";
  if (/timeline|edit plan|assembly/.test(text)) return "timeline";
  if (/document|script|copy|caption|release form/.test(text)) return "documents";
  if (/render|finish|quality|grade|mix|master|post-production/.test(text)) return "render";
  if (/publish|release|distribution|delivery|launch/.test(text)) return "publishing";
  if (/learn|measure|analytics|performance/.test(text)) return "learning";
  if (/production|shoot|film|record|generate|create/.test(text)) return "production";
  return null;
}

function workflowItem(item, index) {
  const object = item && typeof item === "object" && !Array.isArray(item)
    ? item
    : {};
  const sourceText = typeof item === "string"
    ? item
    : object.workspace_id || object.workspace || object.id || object.title || object.name || "";
  const workspaceId = workspaceFromText(sourceText);
  if (!workspaceId) return null;

  return {
    id: String(object.id || workspaceId),
    workspace_id: workspaceId,
    title: compactText(object.title || object.name || (typeof item === "string" ? item : ""), 80) || workspaceId.replace(/_/g, " "),
    stage: String(object.stage || "").trim() || null,
    description: String(object.description || "").trim() || null,
    capabilities: stringArray(object.capabilities),
    required: object.required !== false,
    source_index: index,
  };
}

function normalizeWorkflow(value) {
  const aiItems = Array.isArray(value)
    ? value.map(workflowItem).filter(Boolean)
    : [];
  const aiByWorkspace = new Map();

  for (const item of aiItems) {
    if (!aiByWorkspace.has(item.workspace_id)) {
      aiByWorkspace.set(item.workspace_id, item);
    }
  }

  const defaults = new Map(DEFAULT_WORKFLOW.map((item) => [item.workspace_id, item]));

  return WORKSPACE_ORDER
    .filter((workspaceId) => defaults.has(workspaceId) || aiByWorkspace.has(workspaceId))
    .map((workspaceId) => {
      const fallback = defaults.get(workspaceId) || {
        id: workspaceId,
        workspace_id: workspaceId,
        title: workspaceId.replace(/_/g, " "),
        stage: null,
        description: null,
      };
      const ai = aiByWorkspace.get(workspaceId) || {};

      return {
        id: String(ai.id || fallback.id || workspaceId),
        workspace_id: workspaceId,
        title: compactText(ai.title || fallback.title, 80),
        stage: ai.stage || fallback.stage || null,
        description: ai.description || fallback.description || null,
        capabilities: ai.capabilities || [],
        required: ai.required !== false,
      };
    });
}

function normalizeAudience(value) {
  if (Array.isArray(value)) return { segments: stringArray(value) };
  return value && typeof value === "object" ? value : {};
}

function normalizeConfidence(value) {
  const confidence = Number(value);
  if (!Number.isFinite(confidence)) return 70;
  if (confidence > 0 && confidence <= 1) return Math.round(confidence * 100);
  return Math.max(0, Math.min(100, Math.round(confidence)));
}

function fallbackBlueprint({ request, reason = null }) {
  return {
    title: compactText(request, 90) || "New Creative Mission",
    business_goal: request,
    objective: request,
    creative_thesis: "Create the strongest original response to the request without forcing it into a predefined product category.",
    audience: {},
    channels: [],
    languages: [],
    deliverables: normalizeDeliverables([], request),
    workflow: DEFAULT_WORKFLOW,
    departments: ["creative_direction", "research", "design", "production", "quality_control"],
    production_principles: [
      "Choose the medium and production method from the mission, not from a fixed product list.",
      "Use supplied assets as evidence and references; improve or regenerate inadequate material before final production.",
      "Preserve originality, realism, craft, coherence, and release readiness across every output.",
    ],
    quality_policy: { ambition: "world_class", review_mode: "evidence_based", regenerate_when_below_standard: true },
    assumptions: [],
    blocking_questions: [],
    confidence: 45,
    composition_source: "DETERMINISTIC_FALLBACK",
    fallback_reason: reason,
  };
}

function normalizeBlueprint(value, request) {
  const source = value?.result || value || {};
  const fallback = fallbackBlueprint({ request });
  return {
    title: compactText(source.title, 100) || fallback.title,
    business_goal: String(source.business_goal || source.goal || request).trim(),
    objective: String(source.objective || source.desired_outcome || request).trim(),
    creative_thesis: String(source.creative_thesis || source.thesis || fallback.creative_thesis).trim(),
    audience: normalizeAudience(source.audience),
    channels: stringArray(source.channels),
    languages: stringArray(source.languages),
    deliverables: normalizeDeliverables(source.deliverables, request),
    workflow: normalizeWorkflow(source.workflow),
    departments: stringArray(source.departments),
    production_principles: stringArray(source.production_principles).length ? stringArray(source.production_principles) : fallback.production_principles,
    quality_policy: source.quality_policy && typeof source.quality_policy === "object" ? source.quality_policy : fallback.quality_policy,
    assumptions: stringArray(source.assumptions),
    blocking_questions: stringArray(source.blocking_questions),
    confidence: normalizeConfidence(source.confidence ?? value?.confidence),
    composition_source: "AI_DIRECTOR",
    fallback_reason: null,
  };
}

function directorText(execution = {}) {
  return execution?.output?.output?.text ||
    execution?.output?.text ||
    execution?.output?.content ||
    execution?.output?.result?.text ||
    execution?.result?.output?.text ||
    "";
}

export async function composeCreativeMission({ organization_id, request, context = {} }) {
  if (!organization_id) throw new Error("organization_id required");
  const creativeRequest = String(request || "").trim();
  if (!creativeRequest) throw new Error("creative request required");

  try {
    const execution = await ServiceExecutionRuntime.execute({
      organization_id,
      service_id: "ai.reasoning.execute",
      category: "AI",
      input: {
        model: process.env.AVANTIQO_CREATIVE_DIRECTOR_MODEL || process.env.AVANTIQO_REASONING_MODEL || "gpt-4.1",
        prompt: `
You are Avantiqo's executive creative producer and mission architect.
Interpret the request on its own terms. Be imaginative, specific, commercially intelligent, culturally aware, physically believable, and production-ready. Use supplied assets as references and evidence. When source assets are inadequate, plan how to improve, recreate, extend, or replace them before final production.
Return strict JSON only with: title, business_goal, objective, creative_thesis, audience, channels, languages, deliverables, workflow, departments, production_principles, quality_policy, assumptions, blocking_questions, confidence.
Every deliverable must have a descriptive title, concrete medium, formats, channels, capabilities, dependencies, success criteria, specifications and metadata. Never use generic titles such as Deliverable 1. Never return OPEN when the request clearly names film, video, image, menu, website, banner or another concrete medium.
Every workflow item must be an object with a distinct workspace_id chosen from mission, brief, research, strategy, concept, assets, storyboard, production, timeline, documents, render, publishing, learning. Do not repeat the same workspace_id. Include the complete path needed to make and release the work.
Confidence must be an integer from 0 to 100.
USER REQUEST:\n${creativeRequest}\nAVAILABLE CONTEXT:\n${JSON.stringify(context || {})}
        `.trim(),
      },
      metadata: { module: "CREATIVE", operation: "COMPOSE_MISSION", creative_request: creativeRequest },
    });

    const text = directorText(execution);
    const parsed = parseJson(text);
    if (!parsed) return fallbackBlueprint({ request: creativeRequest, reason: "AI_DIRECTOR_INVALID_JSON" });
    return normalizeBlueprint(parsed, creativeRequest);
  } catch (error) {
    console.error("creative mission composition fallback", error);
    return fallbackBlueprint({ request: creativeRequest, reason: error?.message || "AI_DIRECTOR_EXECUTION_FAILED" });
  }
}

export const CreativeMissionComposerRuntime = { compose: composeCreativeMission };
