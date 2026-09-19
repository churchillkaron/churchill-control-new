const CONTRACT = "CREATIVE_HUMAN_INTENT_UNDERSTANDING_V1";

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function boundedList(value, limit = 20, itemLimit = 500) {
  return list(value)
    .map((item) => text(item, itemLimit))
    .filter(Boolean)
    .slice(0, limit);
}

function enumValue(value, allowed, fallback = null) {
  const normalized = text(value, 80).toUpperCase();
  return allowed.includes(normalized) ? normalized : fallback;
}

function positiveNumber(value) {
  const number = finite(value);
  return number !== null && number > 0 ? number : null;
}

export function normalizeCreativeHumanIntentUnderstanding(value = {}) {
  const source = object(value);
  const masterRange = object(source.master_story_duration_minutes);
  const ambiguity = enumValue(source.ambiguity_level, ["NONE", "MATERIAL"], "NONE");

  return {
    contract: CONTRACT,
    user_goal: text(source.user_goal, 2400) || null,
    production_type: enumValue(
      source.production_type,
      ["VIDEO", "IMAGE", "AUDIO", "DOCUMENT", "WEBSITE", "CAMPAIGN"],
      "CAMPAIGN",
    ),
    channels: boundedList(source.channels, 12, 80).map((item) => item.toLowerCase()),
    orientation: enumValue(
      source.orientation,
      ["LANDSCAPE", "PORTRAIT", "SQUARE", "AUTO"],
      "AUTO",
    ),
    aspect_ratio: text(source.aspect_ratio, 40) || null,
    primary_duration_seconds: positiveNumber(source.primary_duration_seconds),
    master_story_required: source.master_story_required === true,
    master_story_duration_minutes: {
      minimum: positiveNumber(masterRange.minimum),
      maximum: positiveNumber(masterRange.maximum),
    },
    generation_scope: enumValue(
      source.generation_scope,
      ["FULL", "CHAPTER_ONLY", "SELECTED_PART_ONLY", "UNSPECIFIED"],
      "UNSPECIFIED",
    ),
    chapter_number: positiveNumber(source.chapter_number),
    chapter_duration_seconds: positiveNumber(source.chapter_duration_seconds),
    story_autonomy: enumValue(
      source.story_autonomy,
      ["STUDIO_LED", "COLLABORATIVE", "USER_LED"],
      "COLLABORATIVE",
    ),
    audience: boundedList(source.audience, 12, 400),
    tone: boundedList(source.tone, 16, 180),
    emotional_arc: boundedList(source.emotional_arc, 16, 240),
    required_elements: boundedList(source.required_elements, 30, 500),
    prohibited_elements: boundedList(source.prohibited_elements, 30, 500),
    benchmark_references: boundedList(source.benchmark_references, 20, 300),
    quality_intent: text(source.quality_intent, 1600) || null,
    ambiguity_level: ambiguity,
    candidate_interpretations: boundedList(source.candidate_interpretations, 3, 700),
    clarification_required:
      ambiguity === "MATERIAL" && source.clarification_required === true,
    clarification_question:
      ambiguity === "MATERIAL"
        ? text(source.clarification_question, 700) || null
        : null,
    confidence: Math.max(0, Math.min(100, finite(source.confidence) ?? 0)),
    authorization_effect: "NONE",
  };
}

export async function understandCreativeHumanIntent(options = {}) {
  const organizationId = text(
    options.organization_id || options.organizationId,
    160,
  );
  const message = text(options.message || options.intent, 12000);
  if (!organizationId || !message) return null;

  const recent = list(options.conversation)
    .slice(-10)
    .map((turn) => ({
      role: turn?.role === "assistant" ? "assistant" : "user",
      content: text(turn?.content, 1200),
    }))
    .filter((turn) => turn.content);

  const context = {
    organization_name: text(options.organization_name, 300) || null,
    project_objective: text(options.project_objective, 2400) || null,
    existing_creative_contract: object(options.existing_creative_contract),
  };

  const { AvantiqoIntelligenceReasoningRuntime } = await import(
    "@/lib/intelligence/runtime/AvantiqoIntelligenceReasoningRuntime"
  );

  const execution = await AvantiqoIntelligenceReasoningRuntime.run({
    organization_id: organizationId,
    party_id: text(options.party_id || options.partyId, 160) || null,
    entity_id: text(options.entity_id || options.entityId, 160) || null,
    system: [
      "Understand the user's creative meaning from the whole supplied request, conversation and existing creative context. Do not classify from keywords, regexes, command phrases or literal token matching.",
      "Resolve paraphrases, implied relationships, corrections, pronouns, shorthand and ordinary human language semantically. For example, understand the relationship between a complete work and the smaller portion the user wants produced now even when the user never says 'master story' or 'chapter'.",
      "Infer the deliverable and creative contract from meaning: production type, channels, orientation/aspect intent, duration relationships, whether a complete master story is required, what portion should be generated now, story autonomy, audience, tone, emotional arc, required elements, prohibited elements, benchmarks and quality intent.",
      "Do not turn examples or quality references into literal content requirements unless the user means them that way. Distinguish inspiration from copying and distinguish a quality floor from a template.",
      "Do not invent precision that the user did not provide. Use null/UNSPECIFIED/AUTO where appropriate.",
      "Use ambiguity_level MATERIAL only when materially different interpretations remain after using all supplied context. Otherwise proceed with the best semantic interpretation.",
      "This interpretation grants no authority for spending, media generation, publication, mutation or external provider use. Governance is enforced later.",
      "Return JSON only with user_goal, production_type, channels, orientation, aspect_ratio, primary_duration_seconds, master_story_required, master_story_duration_minutes {minimum, maximum}, generation_scope, chapter_number, chapter_duration_seconds, story_autonomy, audience, tone, emotional_arc, required_elements, prohibited_elements, benchmark_references, quality_intent, ambiguity_level, candidate_interpretations, clarification_required, clarification_question, confidence.",
    ].join("\n"),
    messages: [
      {
        role: "user",
        content: JSON.stringify({ message, recent, context }),
      },
    ],
    tools: [],
    authorization: { allow_mutating_tools: false },
    metadata: {
      module: "CREATIVE",
      operation: "CREATIVE_HUMAN_INTENT_SEMANTIC_UNDERSTANDING",
      raw_reasoning_persisted: false,
    },
    execution_lane: "fast",
    temperature: 0.05,
    response_format: { type: "json_object" },
    max_output_tokens: 1400,
    max_turns: 1,
    max_tool_calls: 0,
  });

  try {
    return normalizeCreativeHumanIntentUnderstanding(
      JSON.parse(text(execution?.text, 16000)),
    );
  } catch {
    return null;
  }
}

export const CreativeHumanIntentUnderstandingRuntime = Object.freeze({
  contract: CONTRACT,
  normalize: normalizeCreativeHumanIntentUnderstanding,
  understand: understandCreativeHumanIntent,
});

export default understandCreativeHumanIntent;
