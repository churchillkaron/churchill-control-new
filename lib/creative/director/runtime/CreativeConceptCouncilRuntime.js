import { normalizeTemporalMechanicalContract } from "@/lib/creative/director/runtime/CreativeTemporalMechanicalNormalizationRuntime";
import crypto from "node:crypto";

import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import {
  CreativeUniversalTemporalDirectionRuntime,
} from "./CreativeUniversalTemporalDirectionRuntime";
import {
  CreativeMasterPlanRuntime,
} from "./CreativeMasterPlanRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.independent-concept-council.v1",
);

const DIRECTOR_MANDATES = Object.freeze([
  {
    id: "concept-a",
    role: "NARRATIVE_WORLD_DIRECTOR",
    mandate: "Build a causal cinematic world with a clear beginning, escalation, turn and resolution. Environment must transform because of character decisions and music, not operate as decorative montage.",
  },
  {
    id: "concept-b",
    role: "PERFORMANCE_ENERGY_DIRECTOR",
    mandate: "Build the strongest physical interpretation of rhythm, groove, performance, crowd behaviour, choreography, camera kinetics, lighting movement and editorial acceleration while preserving emotional truth.",
  },
  {
    id: "concept-c",
    role: "CULTURAL_BRAND_INNOVATION_DIRECTOR",
    mandate: "Create an ownable cultural and visual world with distinctive production design, memorable signature images, brand relevance and commercial clarity without copying existing artists, films or campaigns.",
  },
]);

const CRITIC_MANDATES = Object.freeze([
  {
    id: "originality",
    role: "ORIGINALITY_AND_CLICHE_CRITIC",
    weight: 0.30,
    minimum: 78,
    mandate: "Reject generic AI imagery, literal lyric illustration, heartbreak symbols, lonely walking, empty beauty shots, disconnected montage, repeated motifs, derivative campaign language and concepts that could fit any client.",
  },
  {
    id: "music_energy",
    role: "MUSIC_ENERGY_AND_ENVIRONMENT_CRITIC",
    weight: 0.25,
    minimum: 78,
    mandate: "Judge whether measured tempo, beat structure, impacts, rhythmic density, builds, drops, vocal sections, physical energy, social scale, camera movement, lighting movement and edit density are translated into visible decisions.",
  },
  {
    id: "brand_commercial",
    role: "BRAND_AND_COMMERCIAL_EFFECTIVENESS_CRITIC",
    weight: 0.25,
    minimum: 72,
    mandate: "Judge audience relevance, memorability, ownability, brand truth, emotional clarity, campaign extensibility and whether the idea can create valuable deliverables rather than only an attractive film.",
  },
  {
    id: "production",
    role: "PRODUCTION_FEASIBILITY_AND_COST_CRITIC",
    weight: 0.20,
    minimum: 65,
    mandate: "Judge whether the concept can be executed with available identity evidence, assets, approved services, shot durations, continuity, safety, rights and realistic generation/editing constraints without hidden cost explosion.",
  },
]);

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clamp(value, minimum = 0, maximum = 100) {
  return Math.max(minimum, Math.min(maximum, value));
}

function normalizedReasoningOutput(result = {}) {
  let value = result?.output?.output || result?.output || result || {};
  for (let depth = 0; depth < 4; depth += 1) {
    if (!value || typeof value !== "object" || Array.isArray(value)) break;
    if (value.raw && typeof value.raw === "object") {
      value = value.raw?.output?.text ?? value.raw?.output ?? value.raw;
      continue;
    }
    break;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value.result || value;
  }
  const source = text(value).replace(/^\uFEFF/, "");
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

function wordSet(value) {
  return new Set(
    text(value)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]+/gu, " ")
      .split(/\s+/)
      .filter((word) => word.length >= 4),
  );
}

function similarity(left, right) {
  const a = wordSet(left);
  const b = wordSet(right);
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter((word) => b.has(word)).length;
  const union = new Set([...a, ...b]).size;
  return union ? intersection / union : 0;
}

function conceptCorpus(concept = {}) {
  return [
    concept.title,
    concept.central_proposition,
    concept.original_world,
    concept.causal_story,
    concept.environment_progression,
    concept.performance_integration,
    concept.music_fit,
    concept.brand_fit,
    ...list(concept.signature_images),
    ...list(concept.scene_arc),
    ...list(concept.motif_system).map((item) =>
      typeof item === "string" ? item : JSON.stringify(item),
    ),
  ].map(text).filter(Boolean).join(" ");
}

function hash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function reason({
  organizationId,
  projectId,
  missionId,
  operation,
  prompt,
  maxOutputTokens = 10000,
}) {
  const result = await ServiceExecutionRuntime.execute({
    organization_id: organizationId,
    service_id: "ai.reasoning.execute",
    provider_id: null,
    category: "CREATIVE_DIRECTION",
    input: {
      quantity: 1,
      max_output_tokens: maxOutputTokens,
      response_format: { type: "json_object" },
      prompt,
    },
    metadata: {
      module: "CREATIVE",
      operation,
      creative_mission_id: missionId || null,
      creative_project_id: projectId,
    },
  });
  const output = normalizedReasoningOutput(result);
  if (!output) throw new Error(`${operation}_JSON_REQUIRED`);
  return { output, result };
}

function evidencePacket(input = {}, directed = {}) {
  const plan = object(directed.plan);
  return {
    project: object(input.project),
    mission: object(input.mission),
    brief: object(input.brief),
    research:
      input.brief?.metadata?.autonomous_research ||
      input.brief?.metadata?.research ||
      directed.research ||
      null,
    measured_audio:
      plan.measured_audio_intelligence ||
      directed.measured_audio_intelligence ||
      input.brief?.metadata?.measured_audio_intelligence ||
      null,
    music_world: plan.music_world || directed.universal_creative_synthesis?.music_world || null,
    identity_profiles:
      plan.identity_profiles ||
      plan.subject_profiles ||
      directed.universal_identity_profiles ||
      input.brief?.metadata?.universal_subject_profiles ||
      [],
    product_profiles:
      plan.product_profiles ||
      input.brief?.metadata?.universal_product_profiles ||
      [],
    brand_mark_profiles:
      plan.brand_mark_profiles ||
      input.brief?.metadata?.universal_brand_mark_profiles ||
      [],
    location_profiles:
      plan.location_profiles ||
      input.brief?.metadata?.universal_location_profiles ||
      [],
    asset_manifest:
      plan.universal_asset_intelligence?.asset_manifest ||
      plan.asset_manifest ||
      [],
    deliverables: plan.deliverables || [],
    production_constraints: plan.production || {},
  };
}

function directorPrompt(director, evidence) {
  return `
You are Avantiqo's ${director.role}. You are one independent creative director in a blind concept round.
You cannot see the other directors' concepts, scores or language. Do not anticipate compromise and do not produce multiple options.

YOUR MANDATE
${director.mandate}

Return strict JSON only:
{
  "concept": {
    "id": "${director.id}",
    "director_role": "${director.role}",
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
    "strategic_basis": {
      "human_truth": "",
      "central_tension": "",
      "category_convention_response": "",
      "brand_asset_strategy": "",
      "attention_mechanism": "",
      "evidence_source_ids": [""]
    },
    "campaign_extensions": [""],
    "known_risks": [""],
    "anti_cliche_rules": [""]
  }
}

NON-NEGOTIABLE RULES
- Create one fully formed, causal and original concept, not a moodboard or montage.
- The concept must be specific to this company, performer, product, audience and measured source material.
- Lyrics are one signal only. Measured tempo, energy, rhythmic density, impacts, environment and social scale must produce visible decisions.
- Uploaded person media identifies the exact person; its backgrounds are not scene constraints unless explicitly assigned.
- Preserve exact face and body identity while allowing new environments, wardrobe, lighting, choreography and camera positions.
- No generic heartbreak imagery, broken hearts, lonely walking, mirrors, empty corridors, random neon, repeated beauty shots, vague empowerment, disconnected party montage or literal lyric illustration unless the evidence makes it uniquely necessary.
- Every signature image must advance story, performance, environment or brand meaning.
- Treat EVIDENCE.research.strategic_synthesis as the strategic authority when present. Do not ignore it and do not merely restate it. Translate it into an original concept.
- strategic_basis is mandatory when strategic_synthesis exists. State the chosen human truth, central tension, category convention response, brand-asset strategy and active-attention mechanism, and copy only evidence_source_ids that exist in the research packet.
- A category convention may be preserved when it aids comprehension or broken when evidence shows a distinctive opportunity; novelty alone is not a reason.
- Brand linkage must be designed into the story/device rather than attached as a late logo reveal unless the strategic evidence specifically earns delayed revelation.
- Do not copy a living artist, director, film, campaign or protected character.

EVIDENCE
${JSON.stringify(evidence)}
`;
}

async function generateIndependentConcepts(context, evidence) {
  const calls = DIRECTOR_MANDATES.map((director) => reason({
    ...context,
    operation: `CREATIVE_CONCEPT_DIRECTOR_${director.id.toUpperCase()}_V1`,
    prompt: directorPrompt(director, evidence),
    maxOutputTokens: 8000,
  }));
  const results = await Promise.all(calls);
  const concepts = results.map(({ output }, index) => {
    const concept = object(output.concept || output);
    const director = DIRECTOR_MANDATES[index];
    if (text(concept.id) !== director.id) concept.id = director.id;
    concept.director_role = director.role;
    return concept;
  });

  const strategicResearch = object(evidence.research?.strategic_synthesis);
  const researchSourceIds = new Set(list(evidence.research?.sources).map((entry) => text(entry?.id)).filter(Boolean));
  for (const concept of concepts) {
    const substantiveRequired = [
      concept.central_proposition,
      concept.original_world,
      concept.causal_story,
      concept.environment_progression,
      concept.performance_integration,
      concept.music_fit,
      concept.brand_fit,
      object(evidence.research?.strategic_synthesis).contract ? concept.strategic_basis?.human_truth : "research-not-strategic",
    ];
    if (text(concept.title).length < 8 || substantiveRequired.some((value) => text(value).length < 20)) {
      throw new Error(`INDEPENDENT_CONCEPT_INCOMPLETE:${concept.id}`);
    }
    if (list(concept.signature_images).length < 5) {
      throw new Error(`INDEPENDENT_CONCEPT_SIGNATURE_IMAGES_REQUIRED:${concept.id}`);
    }
    if (Object.keys(strategicResearch).length) {
      const basis = object(concept.strategic_basis);
      for (const field of ["human_truth", "central_tension", "category_convention_response", "brand_asset_strategy", "attention_mechanism"]) {
        if (text(basis[field]).length < 12) throw new Error(`INDEPENDENT_CONCEPT_STRATEGIC_BASIS_REQUIRED:${concept.id}:${field}`);
      }
      const evidenceIds = list(basis.evidence_source_ids).map(text).filter(Boolean);
      if (!evidenceIds.length) throw new Error(`INDEPENDENT_CONCEPT_STRATEGIC_EVIDENCE_REQUIRED:${concept.id}`);
      const invalid = evidenceIds.filter((id) => !researchSourceIds.has(id));
      if (invalid.length) throw new Error(`INDEPENDENT_CONCEPT_STRATEGIC_EVIDENCE_INVALID:${concept.id}:${invalid.join(",")}`);
    }
  }

  const titles = new Set(concepts.map((concept) => text(concept.title).toLowerCase()));
  if (titles.size !== concepts.length) {
    throw new Error("INDEPENDENT_CONCEPT_TITLES_NOT_DISTINCT");
  }
  const overlaps = [];
  for (let left = 0; left < concepts.length; left += 1) {
    for (let right = left + 1; right < concepts.length; right += 1) {
      const score = similarity(conceptCorpus(concepts[left]), conceptCorpus(concepts[right]));
      overlaps.push({
        left: concepts[left].id,
        right: concepts[right].id,
        similarity: Number(score.toFixed(4)),
      });
      if (score >= 0.62) {
        throw new Error(
          `INDEPENDENT_CONCEPTS_SEMANTICALLY_TOO_SIMILAR:${concepts[left].id}:${concepts[right].id}:${score.toFixed(3)}`,
        );
      }
    }
  }

  return {
    concepts,
    results,
    distinctness: {
      passed: true,
      pairwise_similarity: overlaps,
      maximum_allowed_similarity: 0.62,
    },
  };
}

function criticPrompt(critic, evidence, concepts) {
  return `
You are Avantiqo's independent ${critic.role}. You did not create these concepts and cannot see any other critic's report.

YOUR MANDATE
${critic.mandate}

Return strict JSON only:
{
  "critic_id": "${critic.id}",
  "evaluations": [{
    "concept_id": "concept-a",
    "score": 0,
    "passed": false,
    "strengths": [""],
    "failures": [""],
    "cliche_or_risk_hits": [""],
    "mandatory_repairs": [""],
    "rejection_reason": null
  }],
  "ranking": ["concept-a", "concept-b", "concept-c"],
  "critic_summary": ""
}

RULES
- Score from 0 to 100 using only your mandate and the supplied evidence.
- Mark passed=false below ${critic.minimum}.
- Do not reward polished language without specific causal, musical, environmental, identity, brand or production logic.
- Reject a concept with fatal cliché, identity misuse, source-background copying, weak music fit, non-causal montage or unexecutable hidden complexity.
- Evaluate every concept independently before ranking.

EVIDENCE
${JSON.stringify(evidence)}

CONCEPTS
${JSON.stringify(concepts)}
`;
}

async function runIndependentCritics(context, evidence, concepts) {
  const calls = CRITIC_MANDATES.map((critic) => reason({
    ...context,
    operation: `CREATIVE_CONCEPT_CRITIC_${critic.id.toUpperCase()}_V1`,
    prompt: criticPrompt(critic, evidence, concepts),
    maxOutputTokens: 7000,
  }));
  const results = await Promise.all(calls);
  const reports = results.map(({ output }, index) => {
    const critic = CRITIC_MANDATES[index];
    const evaluations = list(output.evaluations).map((evaluation) => ({
      ...evaluation,
      concept_id: text(evaluation.concept_id),
      score: clamp(finite(evaluation.score) ?? 0),
      passed:
        evaluation.passed === true &&
        (finite(evaluation.score) ?? 0) >= critic.minimum &&
        !text(evaluation.rejection_reason),
    }));
    if (evaluations.length !== concepts.length) {
      throw new Error(`CREATIVE_CONCEPT_CRITIC_COVERAGE_INVALID:${critic.id}`);
    }
    for (const concept of concepts) {
      if (!evaluations.some((evaluation) => evaluation.concept_id === concept.id)) {
        throw new Error(`CREATIVE_CONCEPT_CRITIC_CONCEPT_MISSING:${critic.id}:${concept.id}`);
      }
    }
    return {
      critic_id: critic.id,
      role: critic.role,
      weight: critic.weight,
      minimum: critic.minimum,
      evaluations,
      ranking: list(output.ranking),
      critic_summary: text(output.critic_summary),
    };
  });
  return { reports, results };
}

function scorecard(concepts, reports) {
  return concepts.map((concept) => {
    const criticScores = {};
    let weighted = 0;
    let weight = 0;
    let passed = true;
    const mandatoryRepairs = [];
    const failures = [];
    for (const report of reports) {
      const evaluation = report.evaluations.find((item) => item.concept_id === concept.id);
      if (!evaluation) {
        passed = false;
        continue;
      }
      criticScores[report.critic_id] = evaluation.score;
      weighted += evaluation.score * report.weight;
      weight += report.weight;
      if (!evaluation.passed) passed = false;
      mandatoryRepairs.push(...list(evaluation.mandatory_repairs));
      failures.push(...list(evaluation.failures));
    }
    const weightedScore = weight ? weighted / weight : 0;
    if (weightedScore < 76) passed = false;
    return {
      concept_id: concept.id,
      critic_scores: criticScores,
      weighted_score: Number(weightedScore.toFixed(2)),
      all_critics_passed: passed,
      mandatory_repairs: [...new Set(mandatoryRepairs.map(text).filter(Boolean))],
      failures: [...new Set(failures.map(text).filter(Boolean))],
    };
  }).sort((left, right) => right.weighted_score - left.weighted_score);
}

function selectorPrompt(evidence, concepts, reports, cards) {
  return `
You are Avantiqo's Executive Creative Director. You did not create the concepts and you must not protect any director's work.
Select the single concept that best satisfies the evidence and independent critic reports.

Return strict JSON only:
{
  "selected_concept_id": "",
  "selection_reason": "",
  "decisive_strengths": [""],
  "mandatory_repairs_before_planning": [""],
  "rejected_concepts": [{"concept_id":"", "reason":""}],
  "confidence": 0
}

RULES
- Select only a concept with all_critics_passed=true and weighted_score >= 76.
- Do not average concepts together and do not create a fourth hybrid concept.
- Explain why the selected world is more original, more faithful to measured music/environment evidence, more identity-safe, more brand-ownable and more executable.
- Preserve all mandatory repairs from the critics. A repair may sharpen the selected concept but may not turn it into another concept.
- If no concept qualifies, return selected_concept_id="".

EVIDENCE
${JSON.stringify(evidence)}

CONCEPTS
${JSON.stringify(concepts)}

INDEPENDENT CRITIC REPORTS
${JSON.stringify(reports)}

DETERMINISTIC SCORECARDS
${JSON.stringify(cards)}
`;
}

async function selectConcept(context, evidence, concepts, reports, cards) {
  const qualifying = cards.filter((card) => card.all_critics_passed && card.weighted_score >= 76);
  if (!qualifying.length) throw new Error("CREATIVE_CONCEPT_COUNCIL_NO_QUALIFYING_CONCEPT");
  const { output, result } = await reason({
    ...context,
    operation: "CREATIVE_EXECUTIVE_CONCEPT_SELECTION_V1",
    prompt: selectorPrompt(evidence, concepts, reports, cards),
    maxOutputTokens: 5000,
  });
  const selectedId = text(output.selected_concept_id);
  const selectedCard = cards.find((card) => card.concept_id === selectedId);
  const selectedConcept = concepts.find((concept) => concept.id === selectedId);
  if (!selectedConcept || !selectedCard?.all_critics_passed || selectedCard.weighted_score < 76) {
    throw new Error("CREATIVE_EXECUTIVE_CONCEPT_SELECTION_INVALID");
  }
  return {
    selection: {
      ...output,
      selected_concept_id: selectedId,
      confidence: clamp(finite(output.confidence) ?? 0),
      selected_scorecard: selectedCard,
      selected_concept: selectedConcept,
      mandatory_repairs_before_planning: [
        ...new Set([
          ...list(output.mandatory_repairs_before_planning),
          ...list(selectedCard.mandatory_repairs),
        ].map(text).filter(Boolean)),
      ],
    },
    result,
  };
}

function planRevisionPrompt(plan, evidence, council) {
  const selected = council.selection.selected_concept;
  const hasDirectedShots = list(plan.scenes).some((scene) => list(scene.shots).length > 0);
  if (!hasDirectedShots) {
    return `
You are Avantiqo's Production Creative Director. The independent Concept Council has selected the winning concept.
Revise the supplied STORY-LEVEL Creative Master Plan so it fully expresses that winner before Tribunal review. Do not create shots, camera execution, provider instructions or production-unit work yet.

Return strict JSON only:
{
  "concept": {
    "title": "",
    "creative_thesis": "",
    "hook": "",
    "message": "",
    "narrative": "",
    "creative_system": "",
    "emotional_promise": "",
    "call_to_action": "",
    "signature_device": "",
    "refused_devices": []
  },
  "story": {
    "hook": "",
    "audience_tension": "",
    "escalation": "",
    "observable_proof": "",
    "turn": "",
    "resolution": "",
    "call_to_action": "",
    "emotional_arc": "",
    "anti_cliche_strategy": ""
  },
  "story_architecture": {},
  "scenes": [{
    "id": "same scene id",
    "title": "",
    "objective": "",
    "emotion": "",
    "story_function": "",
    "story_state_before": "",
    "state_change": "",
    "story_state_after": "",
    "transition_logic": ""
  }]
}

NON-NEGOTIABLE RULES
- This is STORY / CREATIVE DIRECTION only. Return zero shots. Shot direction belongs after Tribunal.
- Preserve every original scene id, scene count, duration and chronological order exactly.
- Preserve asset manifest, rights restrictions, deliverables, quality policy and approved service/capability facts unless the Council explicitly requires a story-level correction.
- Apply every mandatory Council repair and make beginning, middle, payoff, emotional arc, message, brand role and exact duration intent explicit.
- Do not write provider prompts, negative prompts, provider parameters, generation instructions or transport payloads.

SELECTED CONCEPT
${JSON.stringify(selected)}

COUNCIL DECISION
${JSON.stringify(council.selection)}

EVIDENCE
${JSON.stringify(evidence)}

CURRENT STORY-LEVEL MASTER PLAN
${JSON.stringify(plan)}
`;
  }
  return `
You are Avantiqo's Production Creative Director. The independent concept council has already selected the approved concept.
Rewrite the supplied temporal plan so every scene and shot executes that selected concept. You are implementing the decision, not judging it and not creating another concept.

Return strict JSON only:
{
  "concept": {
    "title": "",
    "hook": "",
    "message": "",
    "narrative": "",
    "visual_system": {},
    "camera_language": {},
    "lighting_system": {},
    "production_design": {}
  },
  "story_architecture": {},
  "scenes": [{
    "id": "same scene id",
    "title": "",
    "objective": "",
    "emotion": "",
    "story_function": "",
    "location": {},
    "actors": [],
    "products": [],
    "visual_style": {},
    "camera_style": {},
    "audio_style": {},
    "shots": [{
      "id": "same shot id",
      "title": "",
      "purpose": "",
      "subject": "",
      "action": "",
      "performance": "",
      "frame_plan": {"opening_frame":"", "progression":"", "closing_frame":""},
      "camera": {},
      "lighting": {},
      "production_design": {},
      "continuity": {},
      "negative_constraints": []
    }]
  }]
}

NON-NEGOTIABLE RULES
- Preserve every original scene id, shot id, scene count, shot count, duration and chronological order exactly.
- Do not change service, capability, provider, output specification, identity contract, audio timing, measured music section, keyframe contract, lip-sync contract, rights contract or reuse policy.
- Rewrite creative purpose, action, performance, environment, camera, lighting and design so they unmistakably execute the selected concept.
- Every shot must cause a new story, performance, environment or musical state. No filler and no repeated visual beat.
- Apply every mandatory repair from the council.
- Do not write provider prompts, negative prompts, provider-specific parameters or transport payloads. Provider serialization belongs only at execution transport.
- Uploaded identity-reference backgrounds remain excluded.

SELECTED CONCEPT
${JSON.stringify(selected)}

COUNCIL DECISION
${JSON.stringify(council.selection)}

EVIDENCE
${JSON.stringify(evidence)}

CURRENT TECHNICAL PLAN TO REVISE
${JSON.stringify(plan)}
`;
}

function revisedByStableId(original = [], revised = [], label, { allowPositionalFallback = false } = {}) {
  const originalRows = list(original);
  const revisedRows = list(revised);
  if (revisedRows.length > originalRows.length) {
    throw new Error(`CREATIVE_COUNCIL_PLAN_${label}_COUNT_CHANGED`);
  }
  const originalIds = new Set(originalRows.map((item) => text(item?.id)).filter(Boolean));
  const revisedIds = new Set();
  const byId = new Map();
  for (let index = 0; index < revisedRows.length; index += 1) {
    const item = revisedRows[index];
    const id = text(item?.id);
    if (id && revisedIds.has(id)) {
      throw new Error(`CREATIVE_COUNCIL_PLAN_${label}_ID_DUPLICATED:${id}`);
    }
    if (id) revisedIds.add(id);
    if (id && originalIds.has(id)) {
      byId.set(id, item);
      continue;
    }
    if (!allowPositionalFallback) {
      throw new Error(`CREATIVE_COUNCIL_PLAN_${label}_ID_CHANGED:${id || "missing"}`);
    }
    const originalId = text(originalRows[index]?.id);
    if (!originalId || byId.has(originalId)) {
      throw new Error(`CREATIVE_COUNCIL_PLAN_${label}_POSITIONAL_MAPPING_INVALID:${index + 1}`);
    }
    byId.set(originalId, item);
  }
  return byId;
}

function promptlessGeneration(value = {}) {
  const {
    prompt: ignoredPrompt,
    provider_prompt: ignoredProviderPrompt,
    negative_prompt: ignoredNegativePrompt,
    visual_prompt: ignoredVisualPrompt,
    video_prompt: ignoredVideoPrompt,
    ...structured
  } = object(value);
  return structured;
}

function requiresSyntheticProduction(plan = {}) {
  return list(plan.scenes).some((scene) =>
    list(scene?.shots).some((shot) => {
      const generation = object(shot?.generation);
      return generation.required !== false && Boolean(
        text(generation.service) || text(generation.capability),
      );
    }),
  );
}

function normalizeSelectedProductionPolicy(plan = {}) {
  if (!requiresSyntheticProduction(plan)) return plan;
  const concept = object(plan.concept);
  const review = object(plan.creative_review);
  const refused = list(concept.refused_devices).map(text).filter(Boolean).filter((value) =>
    !/^(ai[- ]generated landscapes|no ai imagery|zero ai[- ]generated imagery)/i.test(value),
  );
  const finishing = list(review.finishing_requirements).map(text).filter(Boolean).filter((value) =>
    !/^zero ai[- ]generated imagery/i.test(value),
  );
  const normalizeConceptPolicy = (value = {}) => {
    const source = object(value);
    return {
      ...source,
      production_approach: text(source.production_approach)
        .replace(/\bNo CGI skyline or AI imagery\.?/gi, "Synthetic production is allowed when documentary realism, true geography and stable visual continuity are preserved."),
      anti_cliche_rules: list(source.anti_cliche_rules).map((rule) =>
        text(rule).replace(/No literal AI imagery or data visualizations/gi, "No literal AI-themed imagery or generic data visualizations"),
      ),
    };
  };
  const conceptCandidates = list(plan.concept_candidates).map((candidate) =>
    text(candidate?.id) === text(plan.selected_concept_id)
      ? normalizeConceptPolicy(candidate)
      : candidate,
  );
  const conceptCouncil = object(plan.concept_council);
  const selection = object(conceptCouncil.selection);
  return {
    ...plan,
    concept_candidates: conceptCandidates,
    concept_council: {
      ...conceptCouncil,
      selection: {
        ...selection,
        selected_concept: normalizeConceptPolicy(selection.selected_concept),
      },
      execution_policy_override: "Selected-concept prose may describe preferred practical aesthetics, but synthetic generation is explicitly permitted when the production plan requires it and documentary realism gates remain satisfied.",
    },
    concept: {
      ...concept,
      refused_devices: refused,
      production_design: {
        ...object(concept.production_design),
        description: text(concept.production_design?.description)
          .replace(/\bNo CGI skyline or AI imagery\.?/gi, "Synthetic production is allowed only when geography, materials, lighting and camera physics remain documentary-real and free of visible generative artifacts."),
      },
    },
    creative_review: {
      ...review,
      finishing_requirements: [
        ...finishing,
        "Synthetic generation is permitted for this production; reject visible AI artifacts, fake geography, invented brand/UI details, unstable identity, impossible motion and continuity breaks.",
      ],
    },
    production: {
      ...object(plan.production),
      synthetic_generation_allowed: true,
      generation_quality_policy: "SYNTHETIC_ALLOWED_DOCUMENTARY_REALISM_REQUIRED",
      visible_ai_artifacts_allowed: false,
      fake_geography_allowed: false,
      invented_brand_or_ui_allowed: false,
    },
  };
}

function mergeRevisedPlan(originalPlan, revision, council) {
  const originalScenes = list(originalPlan.scenes);
  const revisedScenes = list(revision.scenes);
  const revisedSceneById = revisedByStableId(originalScenes, revisedScenes, "SCENE");

  const selected = council.selection.selected_concept;
  const scenes = originalScenes.map((originalScene, sceneIndex) => {
    const revisedScene = revisedSceneById.get(text(originalScene.id)) || {};
    const originalShots = list(originalScene.shots);
    const revisedShots = list(revisedScene.shots);
    const revisedShotById = revisedByStableId(originalShots, revisedShots, `SHOT_${sceneIndex + 1}`, { allowPositionalFallback: true });
    const shots = originalShots.map((originalShot, shotIndex) => {
      const revisedShot = revisedShotById.get(text(originalShot.id)) || {};
      const revisedGeneration = promptlessGeneration(revisedShot.generation);
      const originalGeneration = promptlessGeneration(originalShot.generation);
      const merged = {
        ...originalShot,
        ...revisedShot,
        id: originalShot.id,
        duration_seconds: originalShot.duration_seconds,
        reference_asset_ids: originalShot.reference_asset_ids,
        reference_assets: originalShot.reference_assets,
        identity_requirements: originalShot.identity_requirements,
        performance_contract: originalShot.performance_contract,
        music_intelligence: originalShot.music_intelligence,
        reuse_policy: originalShot.reuse_policy,
        keyframe_contract: originalShot.keyframe_contract,
        rights_requirements: originalShot.rights_requirements,
        output_spec: originalShot.output_spec,
      };
      merged.generation = {
        ...originalGeneration,
        ...revisedGeneration,
        service: originalGeneration.service,
        capability: originalGeneration.capability,
        provider: originalGeneration.provider,
        model: originalGeneration.model,
        output_spec: originalGeneration.output_spec,
        provider_parameters: originalGeneration.provider_parameters,
        identity_lock: originalGeneration.identity_lock,
      };
      merged.metadata = {
        ...object(originalShot.metadata),
        ...object(revisedShot.metadata),
        concept_council_contract: "INDEPENDENT_CREATIVE_CONCEPT_COUNCIL_V1",
        selected_concept_id: selected.id,
        selected_concept_hash: council.concept_hash,
      };
      return merged;
    });
    return {
      ...originalScene,
      ...revisedScene,
      id: originalScene.id,
      duration_seconds: originalScene.duration_seconds,
      shots,
      music_intelligence: originalScene.music_intelligence,
      metadata: {
        ...object(originalScene.metadata),
        ...object(revisedScene.metadata),
        concept_council_contract: "INDEPENDENT_CREATIVE_CONCEPT_COUNCIL_V1",
        selected_concept_id: selected.id,
      },
    };
  });

  const mergedPlan = {
    ...originalPlan,
    concept: {
      ...object(originalPlan.concept),
      ...object(revision.concept),
      id: selected.id,
      title: text(revision.concept?.title) || selected.title,
      narrative: text(revision.concept?.narrative) || selected.causal_story,
      selected_by: "INDEPENDENT_CREATIVE_CONCEPT_COUNCIL_V1",
    },
    story: {
      ...object(originalPlan.story),
      ...object(revision.story),
    },
    story_architecture: {
      ...object(originalPlan.story_architecture),
      ...object(revision.story_architecture),
    },
    scenes,
    concept_candidates: council.concepts,
    selected_concept_id: selected.id,
    concept_selection_reason: council.selection.selection_reason,
    concept_council: {
      contract: "INDEPENDENT_CREATIVE_CONCEPT_COUNCIL_V1",
      council_hash: council.council_hash,
      concept_hash: council.concept_hash,
      director_count: council.concepts.length,
      critic_count: council.critic_reports.length,
      distinctness: council.distinctness,
      scorecards: council.scorecards,
      selection: council.selection,
      critic_reports: council.critic_reports,
    },
    anti_cliche_rules: [
      ...new Set([
        ...list(originalPlan.anti_cliche_rules),
        ...list(selected.anti_cliche_rules),
      ].map(text).filter(Boolean)),
    ],
    motif_limits: list(selected.motif_system).length
      ? selected.motif_system
      : originalPlan.motif_limits,
    production: {
      ...object(originalPlan.production),
      independent_concept_directors_required: true,
      independent_concept_critics_required: true,
      executive_creative_selection_required: true,
      concept_council_contract: "INDEPENDENT_CREATIVE_CONCEPT_COUNCIL_V1",
      concept_council_hash: council.council_hash,
      selected_concept_hash: council.concept_hash,
      prohibit_self_judged_concept_selection: true,
      prohibit_hybrid_concept_selection: true,
    },
    validation_summary: {
      ...object(originalPlan.validation_summary),
      independent_concept_count: council.concepts.length,
      independent_critic_count: council.critic_reports.length,
      concept_distinctness_passed: council.distinctness.passed,
      selected_concept_id: selected.id,
      selected_concept_weighted_score:
        council.selection.selected_scorecard?.weighted_score || null,
      concept_council_passed: true,
    },
  };
  return normalizeSelectedProductionPolicy(mergedPlan);
}

async function resumeApprovedCouncilPlan(input = {}) {
  const organizationId = input.organization_id;
  const project = object(input.project);
  const mission = object(input.mission);
  const approvedMaster = object(input.approved_master);
  const approvedPlan = Object.keys(object(approvedMaster.plan)).length
    ? object(approvedMaster.plan)
    : approvedMaster;
  const approvedCouncil = approvedMaster.independent_concept_council || approvedPlan.concept_council || null;

  if (!organizationId) throw new Error("organization_id required");
  if (!project.id) throw new Error("creative_project_id required");
  if (!approvedCouncil) throw new Error("CREATIVE_APPROVED_CONCEPT_COUNCIL_REQUIRED");
  if (!Object.keys(approvedPlan).length) throw new Error("CREATIVE_APPROVED_COUNCIL_PLAN_REQUIRED");

  const repairedMaster = await CreativeMasterPlanRuntime.repairExistingPlan({
    organization_id: organizationId,
    mission,
    project,
    brief: object(input.brief),
    assets: list(input.assets),
    plan: approvedPlan,
    repair_results: list(input.repair_results),
  });

  return {
    plan: repairedMaster.plan,
    independent_concept_council: approvedCouncil,
    post_revision_master_validation: {
      passed: repairedMaster.validation?.passed === true,
      decision_passed: repairedMaster.decision_validation?.passed === true,
      repair_count: repairedMaster.repairs.length,
    },
    usage: { post_revision_repairs: repairedMaster.repairs.map((item) => item.usage || null) },
    billing: { post_revision_repairs: repairedMaster.repairs.map((item) => item.billing || null) },
    resumed_from_approved_council: true,
  };
}

async function runCouncil(input, directed) {
  const organizationId = input.organization_id;
  const project = object(input.project);
  const mission = object(input.mission);
  const evidence = evidencePacket(input, directed);
  const context = {
    organizationId,
    projectId: project.id,
    missionId: mission.id || mission.creative_mission_id || null,
  };
  const directors = await generateIndependentConcepts(context, evidence);
  const critics = await runIndependentCritics(
    context,
    evidence,
    directors.concepts,
  );
  const cards = scorecard(directors.concepts, critics.reports);
  const executive = await selectConcept(
    context,
    evidence,
    directors.concepts,
    critics.reports,
    cards,
  );
  const selectedConcept = executive.selection.selected_concept;
  const conceptHash = hash(selectedConcept);
  const councilHash = hash({
    concepts: directors.concepts,
    distinctness: directors.distinctness,
    critic_reports: critics.reports,
    scorecards: cards,
    selection: executive.selection,
  });
  const council = {
    contract: "INDEPENDENT_CREATIVE_CONCEPT_COUNCIL_V1",
    concepts: directors.concepts,
    distinctness: directors.distinctness,
    critic_reports: critics.reports,
    scorecards: cards,
    selection: executive.selection,
    concept_hash: conceptHash,
    council_hash: councilHash,
  };
  const revision = await reason({
    ...context,
    operation: "CREATIVE_SELECTED_CONCEPT_PLAN_REVISION_V1",
    prompt: planRevisionPrompt(directed.plan, evidence, council),
    maxOutputTokens: 16000,
  });
  const mergedPlan = mergeRevisedPlan(directed.plan, revision.output, council);
  const normalizedPlan = normalizeTemporalMechanicalContract(mergedPlan, {
    duration_seconds: mergedPlan?.temporal_contract?.duration_seconds || mergedPlan?.deliverables?.[0]?.output_spec?.duration_seconds || null,
    assets: list(input.assets),
  });
  const repairedMaster = await CreativeMasterPlanRuntime.repairExistingPlan({
    organization_id: organizationId,
    mission,
    project,
    brief: object(input.brief),
    assets: list(input.assets),
    plan: normalizedPlan,
  });
  const plan = repairedMaster.plan;

  return {
    plan,
    council,
    usage: {
      directors: directors.results.map((item) => item.result?.usage || null),
      critics: critics.results.map((item) => item.result?.usage || null),
      executive: executive.result?.usage || null,
      revision: revision.result?.usage || null,
      post_revision_repairs: repairedMaster.repairs.map((item) => item.usage || null),
    },
    billing: {
      directors: directors.results.map((item) => item.result?.billing || null),
      critics: critics.results.map((item) => item.result?.billing || null),
      executive: executive.result?.billing || null,
      revision: revision.result?.billing || null,
      post_revision_repairs: repairedMaster.repairs.map((item) => item.billing || null),
    },
    post_revision_master_validation: {
      passed: repairedMaster.validation?.passed === true,
      decision_passed: repairedMaster.decision_validation?.passed === true,
      repair_count: repairedMaster.repairs.length,
    },
  };
}

function install() {
  if (CreativeUniversalTemporalDirectionRuntime[INSTALL_FLAG]) return;
  const createWithoutCouncil = CreativeUniversalTemporalDirectionRuntime.create.bind(
    CreativeUniversalTemporalDirectionRuntime,
  );
  Object.defineProperty(CreativeUniversalTemporalDirectionRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  CreativeUniversalTemporalDirectionRuntime.create = async function createWithIndependentConceptCouncil(input = {}) {
    const directed = await createWithoutCouncil(input);
    const approvedCouncil =
      input.approved_master?.independent_concept_council ||
      input.approved_master?.plan?.concept_council ||
      null;
    if (approvedCouncil) {
      return {
        ...directed,
        independent_concept_council: approvedCouncil,
      };
    }
    const council = await runCouncil(input, directed);
    return {
      ...directed,
      plan: council.plan,
      independent_concept_council: council.council,
      usage: {
        ...object(directed.usage),
        concept_council: council.usage,
      },
      billing: {
        ...object(directed.billing),
        concept_council: council.billing,
      },
    };
  };
}

install();

export const CreativeConceptCouncilRuntime = {
  installed: true,
  run: runCouncil,
  resumeApprovedCouncilPlan,
};