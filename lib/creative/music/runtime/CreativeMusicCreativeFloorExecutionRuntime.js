import { reason as creativeReason } from "@/lib/creative/reasoning/CreativeReasoningService";
import {
  buildMusicCreativeDevelopment,
  evaluateMusicConceptDiversity,
  scoreMusicConceptCompetition,
  validateMusicConcept,
  validateMusicPreproductionBrief,
} from "./CreativeMusicCreativeDevelopmentRuntime.js";

const CONTRACT = "AVANTIQO_MUSIC_CREATIVE_FLOOR_EXECUTION_V1";
function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }

const CONCEPT_SHAPE = {
  central_musical_proposition: "string", emotional_arc: "string",
  motif_and_hook_system: "string", harmony_language: "string",
  rhythm_and_groove: "string", instrumentation: "string",
  arrangement_arc: "string", performance_direction: "string",
  sonic_identity: "string", mix_space_intent: "string",
  signature_moments: ["string"], production_method: "string",
};

async function runReason(task, input, constraints, outputShape) {
  const response = await creativeReason({ task, input, constraints, outputShape, temperature: 0.7 });
  return object(response?.result);
}

async function research(input, development) {
  return runReason("MUSIC_STUDIO_RESEARCH_ROOM", input, {
    requirements: development.research_room,
    prohibit_reference_copying: true,
    factual_claims_need_evidence: true,
    no_media_generation: true,
  }, {
    genre_and_form: {}, audience_and_use_case: {}, cultural_context: {},
    instrumentation_and_performance_language: {}, technical_delivery_context: {},
    source_analysis: {}, rights_and_provenance: {}, references: [], open_questions: [],
  });
}

async function concept(input, template, researchReport) {
  const result = await runReason(`MUSIC_STUDIO_CONCEPT_${template.director_id.toUpperCase()}`, input, {
    director: template,
    research: researchReport,
    independent_from_other_concepts: true,
    do_not_imitate_named_artists: true,
  }, { id: "string", ...CONCEPT_SHAPE });
  return { ...result, id: template.id, director_id: template.director_id, director_role: template.director_role };
}

async function criticPanel(input, criticSpecs, conceptRow, researchReport) {
  const result = await runReason("MUSIC_STUDIO_CRITIC_PANEL", input, {
    critics: criticSpecs,
    concept: conceptRow,
    research: researchReport,
    independent_blind_review: true,
    evaluate_each_critic_independently: true,
    do_not_average_or_merge_critic_judgements: true,
    return_exactly_one_review_per_critic: true,
  }, {
    reviews: [{
      critic_id: "string", score: 0, passed: false, evidence: ["string"],
      failures: ["string"], repair: ["string"],
    }],
  });
  const byCritic = new Map(list(result.reviews).map((row) => [text(row?.critic_id), object(row)]));
  return criticSpecs.map((criticSpec) => {
    const row = byCritic.get(criticSpec.id);
    if (!row) throw new Error(`CREATIVE_MUSIC_CRITIC_REVIEW_MISSING:${criticSpec.id}`);
    const score = Number(row.score);
    return {
      critic_id: criticSpec.id,
      concept_id: conceptRow.id,
      score: Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0,
      passed: row.passed === true,
      evidence: list(row.evidence),
      failures: list(row.failures),
      repair: list(row.repair),
    };
  });
}

async function reviseWinner(input, winner, reviews, researchReport) {
  return runReason("MUSIC_STUDIO_WINNER_REVISION", input, {
    winning_concept: winner,
    critic_reviews: reviews,
    research: researchReport,
    preserve_strengths: true,
    resolve_all_critic_failures: true,
  }, CONCEPT_SHAPE);
}

async function preproduction(input, finalConcept, researchReport) {
  return runReason("MUSIC_STUDIO_PREPRODUCTION_LOCK", input, {
    approved_concept: finalConcept,
    research: researchReport,
    generation_not_authorized: true,
    lock_before_paid_generation: true,
  }, {
    tempo_map: {}, key_and_harmony: {}, form_and_section_lengths: [], motif_map: [],
    instrumentation: [], performance_direction: {}, dynamic_arc: [], sonic_palette: [],
    transition_map: [], mix_space_intent: {}, delivery_targets: {},
  });
}

export async function executeMusicCreativeFloor(input = {}) {
  const objective = text(input.objective);
  if (!text(input.organization_id)) throw new Error("organization_id required");
  if (!objective) throw new Error("CREATIVE_MUSIC_CREATIVE_FLOOR_OBJECTIVE_REQUIRED");
  const development = buildMusicCreativeDevelopment(input);
  const researchReport = await research(input, development);
  const concepts = [];
  for (const template of development.concept_competition.concepts) {
    const row = await concept(input, template, researchReport);
    const validation = validateMusicConcept(row, template);
    if (!validation.passed) throw new Error(`CREATIVE_MUSIC_CONCEPT_INVALID:${validation.failures.join(",")}`);
    concepts.push(row);
  }
  const diversity = evaluateMusicConceptDiversity(concepts);
  if (!diversity.passed) throw new Error(`CREATIVE_MUSIC_CONCEPT_DIVERSITY_FAILED:${diversity.failures.join(",")}`);
  const criticReviews = [];
  for (const conceptRow of concepts) {
    criticReviews.push(...await criticPanel(
      input,
      development.concept_competition.critics,
      conceptRow,
      researchReport,
    ));
  }
  const competition = scoreMusicConceptCompetition({ concepts, critic_reviews: criticReviews });
  if (!competition.passed) {
    return { contract: CONTRACT, status: "CONCEPT_REPAIR_REQUIRED", research: researchReport,
      concepts, critic_reviews: criticReviews, competition, production_authorized: false };
  }
  const winner = concepts.find((row) => row.id === competition.winner_concept_id);
  const winnerReviews = criticReviews.filter((row) => row.concept_id === winner.id);
  const revised = { ...winner, ...(await reviseWinner(input, winner, winnerReviews, researchReport)) };
  const preproductionBrief = await preproduction(input, revised, researchReport);
  const preproductionValidation = validateMusicPreproductionBrief(preproductionBrief);
  if (!preproductionValidation.passed) throw new Error(`CREATIVE_MUSIC_PREPRODUCTION_INVALID:${preproductionValidation.failures.join(",")}`);
  return {
    contract: CONTRACT, status: "READY_FOR_PRODUCTION_CONFIRMATION", research: researchReport,
    concepts, critic_reviews: criticReviews, competition, winning_concept: revised,
    preproduction_brief: preproductionBrief, production_authorized: false,
    paid_generation_started: false, publication_authorized: false,
  };
}

export const CreativeMusicCreativeFloorExecutionRuntime = Object.freeze({ contract: CONTRACT, execute: executeMusicCreativeFloor });
