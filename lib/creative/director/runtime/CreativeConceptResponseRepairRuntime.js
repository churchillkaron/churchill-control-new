import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.concept-response-repair.v1",
);

const DIRECTOR_OPERATION =
  /^CREATIVE_CONCEPT_DIRECTOR_(CONCEPT-[A-Z0-9_-]+)_V1$/;

const REQUIRED_TEXT_FIELDS = Object.freeze([
  "title",
  "central_proposition",
  "original_world",
  "causal_story",
  "environment_progression",
  "performance_integration",
  "music_fit",
  "brand_fit",
]);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function parseJson(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  const source = text(value).replace(/^\uFEFF/, "");
  if (!source) return null;
  const candidates = [source];
  for (const match of source.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    if (match[1]) candidates.push(match[1].trim());
  }
  const first = source.indexOf("{");
  const last = source.lastIndexOf("}");
  if (first >= 0 && last > first) candidates.push(source.slice(first, last + 1));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed.result || parsed;
      }
    } catch {
      // Continue with the next conservative JSON candidate.
    }
  }
  return null;
}

function resultPayload(result = {}) {
  const providerResult = object(result.output);
  const nested = object(providerResult.output);
  const source = Object.keys(nested).length ? nested : providerResult;
  const parsed = parseJson(source.text || source.content || source);
  return object(parsed?.result || parsed);
}

function firstText(...values) {
  return values.map(text).find(Boolean) || "";
}

function stringList(...values) {
  for (const value of values) {
    const items = list(value).map((item) =>
      typeof item === "string"
        ? text(item)
        : text(item?.description || item?.title || item?.name),
    ).filter(Boolean);
    if (items.length) return items;
  }
  return [];
}

function normalizeConcept(value = {}, operation = "") {
  const source = object(value.concept || value);
  const operationMatch = text(operation).toUpperCase().match(DIRECTOR_OPERATION);
  const operationId = text(operationMatch?.[1]).toLowerCase();
  return {
    ...source,
    id: firstText(source.id, source.concept_id, operationId),
    director_role: firstText(source.director_role, source.role),
    title: firstText(source.title, source.name, source.concept_title),
    central_proposition: firstText(
      source.central_proposition,
      source.proposition,
      source.core_idea,
      source.big_idea,
      source.concept_statement,
      source.logline,
    ),
    original_world: firstText(
      source.original_world,
      source.world,
      source.visual_world,
      source.creative_world,
      source.production_world,
    ),
    causal_story: firstText(
      source.causal_story,
      source.story,
      source.narrative,
      source.story_arc,
      source.causal_narrative,
    ),
    beginning: firstText(source.beginning, source.opening, source.start),
    escalation: firstText(source.escalation, source.build, source.development),
    turn: firstText(source.turn, source.pivot, source.transformation),
    resolution: firstText(source.resolution, source.ending, source.payoff),
    environment_progression: firstText(
      source.environment_progression,
      source.environmental_progression,
      source.world_progression,
      source.location_progression,
      source.spatial_progression,
    ),
    performance_integration: firstText(
      source.performance_integration,
      source.performance_strategy,
      source.human_action,
      source.cast_integration,
      source.people_integration,
    ),
    music_fit: firstText(
      source.music_fit,
      source.soundtrack_fit,
      source.audio_fit,
      source.rhythm_integration,
      source.music_integration,
    ),
    brand_fit: firstText(
      source.brand_fit,
      source.commercial_fit,
      source.brand_relevance,
      source.client_fit,
      source.business_fit,
    ),
    audience_feeling: firstText(
      source.audience_feeling,
      source.audience_emotion,
      source.viewer_feeling,
    ),
    signature_images: stringList(
      source.signature_images,
      source.hero_images,
      source.key_images,
      source.memorable_images,
      source.signature_moments,
    ),
    scene_arc: stringList(
      source.scene_arc,
      source.scenes,
      source.story_beats,
      source.narrative_beats,
      source.sequence,
    ),
    motif_system: list(source.motif_system).length
      ? source.motif_system
      : list(source.motifs),
    camera_language: firstText(
      source.camera_language,
      source.cinematography,
      source.camera_strategy,
    ),
    lighting_language: firstText(
      source.lighting_language,
      source.lighting_strategy,
      source.light_language,
    ),
    editing_language: firstText(
      source.editing_language,
      source.edit_strategy,
      source.pacing,
    ),
    production_approach: firstText(
      source.production_approach,
      source.execution_approach,
      source.production_strategy,
    ),
    campaign_extensions: stringList(
      source.campaign_extensions,
      source.extensions,
      source.channel_extensions,
    ),
    known_risks: stringList(
      source.known_risks,
      source.risks,
      source.production_risks,
    ),
    anti_cliche_rules: stringList(
      source.anti_cliche_rules,
      source.anti_cliches,
      source.prohibited_cliches,
    ),
  };
}

function conceptIssues(concept = {}) {
  const issues = REQUIRED_TEXT_FIELDS
    .filter((field) => text(concept[field]).length < 20)
    .map((field) => `FIELD_${field.toUpperCase()}_MINIMUM_20_CHARACTERS`);
  const images = list(concept.signature_images).map(text).filter(Boolean);
  if (images.length < 5) issues.push("SIGNATURE_IMAGES_MINIMUM_5");
  return issues;
}

function repairPrompt({ operation, originalPrompt, concept, issues }) {
  return `
You are Avantiqo's senior concept-response repair editor.
A blind independent creative director already produced the concept below. Preserve that director's distinct idea, mandate, identity and authorship. Do not replace it, merge it with another concept, select a winner, or create a different concept.

Repair only the missing, short, malformed or aliased fields listed below. Expand them with concrete causal, cinematic, environmental, performance, brand and production logic grounded in the original evidence. Remove no valid specificity.

Return strict JSON only:
{
  "concept": {
    "id": "",
    "director_role": "",
    "title": "",
    "central_proposition": "",
    "original_world": "",
    "causal_story": "",
    "beginning": "",
    "escalation": "",
    "turn": "",
    "resolution": "",
    "environment_progression": "",
    "performance_integration": "",
    "music_fit": "",
    "brand_fit": "",
    "audience_feeling": "",
    "signature_images": ["", "", "", "", ""],
    "scene_arc": ["", "", "", "", ""],
    "motif_system": [{"motif":"", "maximum_uses":1, "variation_rule":""}],
    "camera_language": "",
    "lighting_language": "",
    "editing_language": "",
    "production_approach": "",
    "campaign_extensions": [""],
    "known_risks": [""],
    "anti_cliche_rules": [""]
  }
}

REPAIR RULES
- Preserve concept id and director role exactly.
- Preserve the central creative idea and all valid existing details.
- Every mandatory narrative and brand field must contain at least 20 meaningful characters.
- Supply at least five distinct signature images that each advance story, environment, performance or brand meaning.
- Keep the concept specific to the supplied company, venue, audience, assets and approved production constraints.
- No generic montage, stock hospitality language, repeated motif, copied campaign, protected style imitation, invented business fact, identity drift or uploaded-background copying.
- Do not mention this repair process in the concept.

ORIGINAL_OPERATION
${operation}

VALIDATION_ISSUES
${JSON.stringify(issues)}

EXISTING_CONCEPT
${JSON.stringify(concept)}

ORIGINAL_DIRECTOR_BRIEF_AND_EVIDENCE
${text(originalPrompt)}
`;
}

function withConceptPayload(result = {}, concept = {}, evidence = {}) {
  const providerResult = object(result.output);
  const nested = object(providerResult.output);
  const payload = {
    concept,
    text: JSON.stringify({ concept }),
    concept_response_repair: evidence,
  };
  if (Object.keys(nested).length) {
    return {
      ...result,
      output: {
        ...providerResult,
        output: {
          ...nested,
          ...payload,
        },
      },
    };
  }
  return {
    ...result,
    output: {
      ...providerResult,
      ...payload,
    },
  };
}

export function installCreativeConceptResponseRepair() {
  if (ServiceExecutionRuntime[INSTALL_FLAG]) return;
  const executeWithoutConceptRepair = ServiceExecutionRuntime.execute.bind(
    ServiceExecutionRuntime,
  );

  Object.defineProperty(ServiceExecutionRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ServiceExecutionRuntime.execute = async function executeWithConceptRepair(input = {}) {
    const operation = text(input.metadata?.operation).toUpperCase();
    if (
      text(input.category).toUpperCase() !== "CREATIVE_DIRECTION" ||
      !DIRECTOR_OPERATION.test(operation)
    ) {
      return executeWithoutConceptRepair(input);
    }

    const result = await executeWithoutConceptRepair(input);
    const normalized = normalizeConcept(resultPayload(result), operation);
    const initialIssues = conceptIssues(normalized);
    if (!initialIssues.length) {
      return withConceptPayload(result, normalized, {
        contract: "CREATIVE_CONCEPT_RESPONSE_REPAIR_V1",
        mode: "ALIAS_NORMALIZATION_ONLY",
        original_operation: operation,
        repaired: false,
        issues_before: [],
        issues_after: [],
      });
    }

    const repairOperation = `${operation}_REPAIR_V1`;
    const repairResult = await executeWithoutConceptRepair({
      ...input,
      input: {
        ...object(input.input),
        quantity: 1,
        max_output_tokens: 6000,
        response_format: { type: "json_object" },
        prompt: repairPrompt({
          operation,
          originalPrompt: input.input?.prompt,
          concept: normalized,
          issues: initialIssues,
        }),
      },
      metadata: {
        ...object(input.metadata),
        operation: repairOperation,
        concept_repair_of_operation: operation,
        concept_repair_attempt: 1,
      },
    });
    const repaired = normalizeConcept(resultPayload(repairResult), operation);
    repaired.id = normalized.id;
    repaired.director_role = normalized.director_role;
    const remainingIssues = conceptIssues(repaired);
    if (remainingIssues.length) {
      throw new Error(
        `INDEPENDENT_CONCEPT_REPAIR_FAILED:${repaired.id}:${remainingIssues.join(",")}`,
      );
    }

    return withConceptPayload(repairResult, repaired, {
      contract: "CREATIVE_CONCEPT_RESPONSE_REPAIR_V1",
      mode: "TARGETED_REASONING_REPAIR",
      original_operation: operation,
      repair_operation: repairOperation,
      repaired: true,
      issues_before: initialIssues,
      issues_after: remainingIssues,
      original_usage_id: result?.usage?.id || null,
      repair_usage_id: repairResult?.usage?.id || null,
    });
  };
}

installCreativeConceptResponseRepair();

export const CreativeConceptResponseRepairRuntime = {
  installed: true,
  normalizeConcept,
  conceptIssues,
};
