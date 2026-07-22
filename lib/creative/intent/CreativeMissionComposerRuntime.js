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
  { id: "mission", workspace_id: "mission", title: "Mission", stage: "MISSION_CREATED", description: "Understand what should exist, why it matters, and what evidence is available." },
  { id: "brief", workspace_id: "brief", title: "Understanding", stage: "UNDERSTANDING", description: "Turn the request and business truth into a complete production brief." },
  { id: "research", workspace_id: "research", title: "Discovery", stage: "RESEARCHING", description: "Research the audience, venue truth, references, constraints, and opportunity." },
  { id: "strategy", workspace_id: "strategy", title: "Creative Direction", stage: "BUILDING_STRATEGY", description: "Choose the strongest original creative direction and production logic." },
  { id: "concept", workspace_id: "concept", title: "Concept Development", stage: "BUILDING_CONCEPT", description: "Develop the narrative, visual world, sound world, typography, and channel system." },
  { id: "assets", workspace_id: "assets", title: "Source Material", stage: "PREPARING_ASSETS", description: "Evaluate every supplied asset, preserve useful identity evidence, and regenerate inadequate material." },
  { id: "storyboard", workspace_id: "storyboard", title: "Storyboard & Shot Design", stage: null, description: "Design the scene sequence, independently directed shots, continuity, camera, action, performance, light, and sound beats." },
  { id: "production", workspace_id: "production", title: "Production", stage: "PRODUCING", description: "Generate and quality-control every shot, image, audio layer, graphic element, and required variant." },
  { id: "timeline", workspace_id: "timeline", title: "Edit & Timeline", stage: null, description: "Assemble real-duration scenes, pacing, transitions, typography, music, dialogue, foley, and sound effects." },
  { id: "documents", workspace_id: "documents", title: "Copy & Release Package", stage: null, description: "Prepare titles, captions, subtitles, CTAs, credits, rights evidence, and release documentation." },
  { id: "render", workspace_id: "render", title: "Finish & Quality", stage: "RENDERING", description: "Render, inspect the complete output, correct defects, and prove release readiness." },
  { id: "publishing", workspace_id: "publishing", title: "Release", stage: "PUBLISHING", description: "Deliver or publish every approved output through its intended channel." },
  { id: "learning", workspace_id: "learning", title: "Learning", stage: "LEARNING", description: "Measure results and preserve reusable creative intelligence." },
];

const DEFAULT_QUALITY_POLICY = {
  ambition: "world_class",
  review_mode: "evidence_based",
  regenerate_when_below_standard: true,
  full_output_review_required: true,
  identity_drift_allowed: false,
  release_only_after_quality_pass: true,
};

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

function structuredArray(value, label = "Decision") {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        return item;
      }
      const title = compactText(item, 180);
      return title ? { id: `${label.toLowerCase().replace(/\W+/g, "_")}_${index + 1}`, title } : null;
    })
    .filter(Boolean);
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
  if (/video|reel|cutdown|episode/.test(medium) && /instagram|facebook|tiktok|social/.test(channels)) {
    return "Social Campaign Cutdowns";
  }
  if (/video|reel|cutdown|episode/.test(medium)) return "Campaign Video Variants";
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
  if (/video|reel|cutdown|episode/.test(medium) && /instagram|facebook|tiktok|social/.test(channels)) {
    return ["9:16 vertical", "4:5 feed", "1:1 square"];
  }

  return [];
}

function executionCapabilities(item = {}, request = "") {
  const supplied = stringArray(item.execution_capabilities)
    .filter((capability) => capability.includes("."));
  if (supplied.length) return [...new Set(supplied)];

  const medium = String(item.medium || item.form || inferredMedium(request)).toLowerCase();
  if (/film|video|movie|cinema|trailer|reel|cutdown|episode/.test(medium)) {
    return [
      "ai.image.generate",
      "ai.image.analyze",
      "ai.image.upscale",
      "ai.video.image_to_video",
      "ai.music.generate",
      "ai.sfx.generate",
    ];
  }
  if (/image|photo|poster|banner|key art|still/.test(medium)) {
    return ["ai.image.generate", "ai.image.analyze", "ai.image.upscale"];
  }
  if (/audio|music|sound|voice/.test(medium)) {
    return ["ai.music.generate", "ai.sfx.generate"];
  }
  if (/website|web|landing|menu|document|copy|script|presentation|deck/.test(medium)) {
    return ["ai.text.generate", "ai.image.generate", "ai.image.analyze"];
  }
  return ["ai.reasoning.execute"];
}

function sameMeaning(left, right) {
  const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
  return normalize(left) === normalize(right);
}

function deliverableDescription(item = {}, request = "", index = 0) {
  const supplied = String(item.description || item.objective || "").trim();
  if (supplied && !sameMeaning(supplied, request)) return supplied;

  const title = deliverableTitle(item, index);
  const medium = String(item.medium || item.form || inferredMedium(request)).trim();
  const channels = stringArray(item.channels);
  const formats = deliverableFormats(item);
  const channelText = channels.length ? ` for ${channels.join(", ")}` : "";
  const formatText = formats.length ? ` in ${formats.join(", ")}` : "";

  return `Produce ${title} as a ${medium}${channelText}${formatText}, grounded in approved business truth and reference assets, with its own purpose, pacing, craft, and release-quality evidence.`;
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
    description: deliverableDescription(item, request, index),
    medium: String(item?.medium || item?.form || inferredMedium(request)).trim(),
    formats: deliverableFormats(item),
    channels: stringArray(item?.channels),
    capabilities: stringArray(item?.capabilities),
    execution_capabilities: executionCapabilities(item, request),
    dependencies: stringArray(item?.dependencies),
    success_criteria: stringArray(item?.success_criteria),
    specifications: item?.specifications && typeof item.specifications === "object" && !Array.isArray(item.specifications) ? item.specifications : {},
    metadata: item?.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata) ? item.metadata : {},
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
    title: compactText(object.title || object.name || (typeof item === "string" ? item : ""), 80),
    stage: String(object.stage || "").trim() || null,
    description: String(object.description || "").trim() || null,
    capabilities: stringArray(object.capabilities),
    required: object.required !== false,
    source_index: index,
  };
}

function genericWorkflowTitle(title, workspaceId) {
  const normalized = String(title || "").trim().toLowerCase().replace(/[_-]+/g, " ");
  return !normalized || normalized === workspaceId.replace(/_/g, " ");
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

  return WORKSPACE_ORDER.map((workspaceId) => {
    const fallback = defaults.get(workspaceId);
    const ai = aiByWorkspace.get(workspaceId) || {};
    const title = genericWorkflowTitle(ai.title, workspaceId)
      ? fallback.title
      : ai.title;

    return {
      id: String(ai.id || fallback.id || workspaceId),
      workspace_id: workspaceId,
      title: compactText(title || fallback.title, 80),
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

function normalizeQualityPolicy(value) {
  if (Array.isArray(value)) {
    return {
      ...DEFAULT_QUALITY_POLICY,
      principles: stringArray(value),
    };
  }
  if (value && typeof value === "object") {
    return {
      ...DEFAULT_QUALITY_POLICY,
      ...value,
    };
  }
  return { ...DEFAULT_QUALITY_POLICY };
}

function normalizeProductionMode(value) {
  const mode = String(value || "AI_NATIVE").trim().toUpperCase();
  return ["AI_NATIVE", "HYBRID", "REAL_WORLD"].includes(mode)
    ? mode
    : "AI_NATIVE";
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
    quality_policy: { ...DEFAULT_QUALITY_POLICY },
    assumptions: [],
    blocking_questions: [],
    decision_gates: [],
    optional_real_world_extensions: [],
    production_mode: "AI_NATIVE",
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
    quality_policy: normalizeQualityPolicy(source.quality_policy),
    assumptions: stringArray(source.assumptions),
    blocking_questions: stringArray(source.blocking_questions),
    decision_gates: structuredArray(source.decision_gates, "Decision Gate"),
    optional_real_world_extensions: structuredArray(source.optional_real_world_extensions, "Real World Extension"),
    production_mode: normalizeProductionMode(source.production_mode),
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
You are Avantiqo's executive creative producer, film director, agency strategist, and mission architect.

Operate as an accountable world-class agency. Interpret the request on its own terms. Be original, imaginative, commercially intelligent, culturally aware, physically believable, emotionally authoritative, humorous when appropriate, and production-ready.

AI-NATIVE PRODUCTION CONTRACT:
- Default production_mode is AI_NATIVE unless the user explicitly requests real filming or the supplied context proves a real shoot has already been commissioned.
- Treat uploaded assets as identity, venue, product, character, composition, and style evidence. Select the strongest references deliberately.
- When supplied imagery is inadequate, plan improved reference-grounded master stills first, then independently directed image-to-video shots. Never stretch one image or one clip into an entire film.
- Design multiple scenes and multiple shots with real durations, action beats, camera movement, performance, lighting, continuity, typography, music, foley, sound effects, transitions, climax, and channel-specific versions.
- Do not assume a physical shoot, actors, venue closures, permits, fire marshals, rights clearance, floorplans, or external production crews unless explicitly supported by business truth.
- Optional real filming may appear only in optional_real_world_extensions and must never be a dependency for the AI-native master production.
- Never claim an asset, music track, likeness, logo, location, or effect is rights-cleared unless evidence says so. Put unresolved rights or safety matters in decision_gates.
- Ask blocking_questions only when the missing fact makes safe or valid production impossible. Otherwise make a transparent assumption and continue autonomously.

Return strict JSON only with:
title, business_goal, objective, creative_thesis, audience, channels, languages, production_mode, deliverables, workflow, departments, production_principles, quality_policy, assumptions, blocking_questions, decision_gates, optional_real_world_extensions, confidence.

Every deliverable must have:
id, descriptive title, deliverable-specific description, concrete medium, formats, channels, capabilities, execution_capabilities, dependencies, success_criteria, specifications, metadata.

execution_capabilities must use only canonical capability IDs when relevant, including:
ai.reasoning.execute, ai.text.generate, ai.image.generate, ai.image.analyze, ai.image.upscale, ai.video.generate, ai.video.image_to_video, ai.video.lipsync, ai.voice.generate, ai.music.generate, ai.sfx.generate, ai.speech.to.text, ai.translate.

Never use generic titles such as Deliverable 1. Never repeat the full user request as every deliverable description. Never return OPEN when the request clearly names a medium.

Every workflow item must be an object with a distinct workspace_id chosen from mission, brief, research, strategy, concept, assets, storyboard, production, timeline, documents, render, publishing, learning. Do not repeat a workspace_id. Include the complete path needed to make, inspect, approve, and release the work.

quality_policy must be an object. Confidence must be an integer from 0 to 100.

USER REQUEST:
${creativeRequest}

AVAILABLE CONTEXT:
${JSON.stringify(context || {})}
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
