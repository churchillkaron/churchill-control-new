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
function vocalSongRequested(input = {}) {
  return input.instrumental === false || Boolean(text(input.lyrics || input.lyric_source || input.source_lyrics));
}

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
    owned_ai_music_generation_is_expected: true,
    do_not_claim_live_recording_or_no_ai_generation_without_actual_recording_evidence: true,
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
    owned_ai_music_generation_is_expected: true,
    production_method_must_describe_desired_sound_not_false_recording_provenance: true,
    do_not_claim_live_recording_or_no_ai_generation_without_actual_recording_evidence: true,
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
    owned_ai_music_generation_is_expected: true,
    production_method_must_describe_desired_sound_not_false_recording_provenance: true,
    do_not_claim_live_recording_or_no_ai_generation_without_actual_recording_evidence: true,
  }, CONCEPT_SHAPE);
}

function validateSongwriterContract(contract = {}) {
  const failures = [];
  const source = object(contract);
  if (!text(source.lyrics) || text(source.lyrics).length < 120) failures.push("MUSIC_SONGWRITER_LYRICS_TOO_THIN");
  if (!text(source.hook)) failures.push("MUSIC_SONGWRITER_HOOK_REQUIRED");
  if (list(source.sections).length < 3) failures.push("MUSIC_SONGWRITER_SECTIONS_REQUIRED");
  if (!text(source.vocal_language)) failures.push("MUSIC_SONGWRITER_VOCAL_LANGUAGE_REQUIRED");
  if (!text(source.vocal_delivery)) failures.push("MUSIC_SONGWRITER_VOCAL_DELIVERY_REQUIRED");
  return { passed: failures.length === 0, failures };
}

async function songwriterLock(input, finalConcept, researchReport) {
  if (!vocalSongRequested(input)) return null;
  const preserveExactLyrics = input.preserve_source_lyrics_exactly === true;
  const sourceLyrics = text(input.lyrics || input.lyric_source || input.source_lyrics);
  const outputShape = {
    title: "string", hook: "string", lyrics: "string", vocal_language: "string",
    vocal_delivery: "string", sections: [{ label: "string", lyrics: "string" }],
    preserve_core_meaning: true,
  };
  const constraints = {
    approved_concept: finalConcept,
    research: researchReport,
    source_lyrics: sourceLyrics,
    source_lyrics_are_emotional_material_not_a_rigid_final_draft: !preserveExactLyrics,
    preserve_source_lyrics_exactly: preserveExactLyrics,
    when_preserve_source_lyrics_exactly_use_source_lyrics_verbatim: preserveExactLyrics,
    preserve_core_meaning_and_personal_voice: true,
    improve_grammar_meter_singability_repetition_hook_and_section_structure: !preserveExactLyrics,
    tasteful_new_lines_allowed_when_they_support_the_same_story: !preserveExactLyrics,
    avoid_generic_motivational_cliches: true,
    make_the_hook_memorable_and_natural_to_sing: true,
    fit_requested_song_duration_seconds: Number(input.duration_seconds) || null,
    do_not_imitate_named_artists: true,
    generation_not_authorized: true,
  };
  const firstRaw = await runReason("MUSIC_STUDIO_SONGWRITER_LOCK", input, constraints, outputShape);
  const first = preserveExactLyrics ? { ...firstRaw, lyrics: sourceLyrics, preserve_core_meaning: true } : firstRaw;
  const validation = validateSongwriterContract(first);
  if (validation.passed) return first;
  const repairedRaw = await runReason("MUSIC_STUDIO_SONGWRITER_REPAIR", {
    ...input, previous_songwriter_contract: first, songwriter_validation_failures: validation.failures,
  }, { ...constraints, repair_only_failed_songwriting_dimensions: true }, outputShape);
  const repaired = preserveExactLyrics ? { ...repairedRaw, lyrics: sourceLyrics, preserve_core_meaning: true } : repairedRaw;
  const repairedValidation = validateSongwriterContract(repaired);
  if (!repairedValidation.passed) throw new Error(`CREATIVE_MUSIC_SONGWRITER_INVALID:${repairedValidation.failures.join(",")}`);
  return repaired;
}

async function preproduction(input, finalConcept, researchReport, songwriterContract = null) {
  const vocalRequired = vocalSongRequested(input);
  const outputShape = {
    tempo_map: {}, key_and_harmony: {}, form_and_section_lengths: [], motif_map: [],
    instrumentation: [], performance_direction: {}, dynamic_arc: [], sonic_palette: [],
    transition_map: [], mix_space_intent: {}, delivery_targets: {},
    vocal_contract: { required: false, lyrics: "string", vocal_language: "string", vocal_delivery: "string", vocal_gender: "string", vocal_role: "string", preserve_core_meaning: true },
  };
  const constraints = {
    approved_concept: finalConcept,
    research: researchReport,
    generation_not_authorized: true,
    lock_before_paid_generation: true,
    every_required_preproduction_field_must_be_nonempty: true,
    vocal_song_required: vocalRequired,
    when_vocal_song_required_lock_final_lyrics_before_generation: vocalRequired,
    supplied_lyrics_are_source_material_not_rigid_copy: vocalRequired && input.preserve_source_lyrics_exactly !== true,
    preserve_source_lyrics_exactly: input.preserve_source_lyrics_exactly === true,
    required_vocal_gender: text(input.vocal_gender || input.lead_vocal_gender || ""),
    required_vocal_role: text(input.requested_vocal || input.vocal_role || ""),
    songwriter_contract: songwriterContract,
    songwriter_may_polish_grammar_meter_repetition_and_hooks_without_changing_core_meaning: vocalRequired,
    when_songwriter_contract_exists_use_its_lyrics_exactly: Boolean(songwriterContract),
    exact_duration_seconds: Number(input.duration_seconds) || null,
    tempo_map_must_include_explicit_numeric_bpm_field: true,
    instrumental_fallback_forbidden_when_vocal_song_required: vocalRequired,
  };
  const firstRaw = await runReason("MUSIC_STUDIO_PREPRODUCTION_LOCK", input, constraints, outputShape);
  const first = vocalRequired && songwriterContract ? {
    ...firstRaw,
    vocal_contract: {
      required: true,
      lyrics: text(songwriterContract.lyrics),
      vocal_language: text(songwriterContract.vocal_language || input.vocal_language || "english"),
      vocal_delivery: text(songwriterContract.vocal_delivery),
      vocal_gender: text(input.vocal_gender || input.lead_vocal_gender || "female"),
      vocal_role: text(input.requested_vocal || input.vocal_role || "female lead vocal"),
      preserve_core_meaning: true,
    },
  } : firstRaw;
  const firstValidation = validateMusicPreproductionBrief(first, { vocal_required: vocalRequired });
  if (firstValidation.passed) return first;
  const repairedRaw = await runReason("MUSIC_STUDIO_PREPRODUCTION_REPAIR", {
    ...input,
    previous_preproduction: first,
    preproduction_validation_failures: firstValidation.failures,
  }, {
    ...constraints,
    repair_only_failed_or_empty_fields: true,
    validation_failures_must_all_be_resolved: firstValidation.failures,
  }, outputShape);
  const repaired = vocalRequired && songwriterContract ? {
    ...repairedRaw,
    vocal_contract: {
      required: true,
      lyrics: text(songwriterContract.lyrics),
      vocal_language: text(songwriterContract.vocal_language || input.vocal_language || "english"),
      vocal_delivery: text(songwriterContract.vocal_delivery),
      vocal_gender: text(input.vocal_gender || input.lead_vocal_gender || "female"),
      vocal_role: text(input.requested_vocal || input.vocal_role || "female lead vocal"),
      preserve_core_meaning: true,
    },
  } : repairedRaw;
  const repairedValidation = validateMusicPreproductionBrief(repaired, { vocal_required: vocalRequired });
  if (!repairedValidation.passed) {
    throw new Error(`CREATIVE_MUSIC_PREPRODUCTION_REPAIR_INVALID:${repairedValidation.failures.join(",")}`);
  }
  return repaired;
}

export async function executeMusicCreativeFloor(input = {}) {
  const objective = text(input.objective);
  if (!text(input.organization_id)) throw new Error("organization_id required");
  if (!objective) throw new Error("CREATIVE_MUSIC_CREATIVE_FLOOR_OBJECTIVE_REQUIRED");
  const development = buildMusicCreativeDevelopment(input);
  const researchReport = await research(input, development);
  const concepts = await Promise.all(development.concept_competition.concepts.map(async (template) => {
    const row = await concept(input, template, researchReport);
    const validation = validateMusicConcept(row, template);
    if (!validation.passed) throw new Error(`CREATIVE_MUSIC_CONCEPT_INVALID:${validation.failures.join(",")}`);
    return row;
  }));
  const diversity = evaluateMusicConceptDiversity(concepts);
  if (!diversity.passed) throw new Error(`CREATIVE_MUSIC_CONCEPT_DIVERSITY_FAILED:${diversity.failures.join(",")}`);
  const criticReviews = (await Promise.all(concepts.map((conceptRow) => criticPanel(
    input,
    development.concept_competition.critics,
    conceptRow,
    researchReport,
  )))).flat();
  const competition = scoreMusicConceptCompetition({ concepts, critic_reviews: criticReviews });
  if (!competition.passed) {
    return { contract: CONTRACT, status: "CONCEPT_REPAIR_REQUIRED", research: researchReport,
      concepts, critic_reviews: criticReviews, competition, production_authorized: false };
  }
  const winner = concepts.find((row) => row.id === competition.winner_concept_id);
  const winnerReviews = criticReviews.filter((row) => row.concept_id === winner.id);
  const revised = { ...winner, ...(await reviseWinner(input, winner, winnerReviews, researchReport)) };
  const songwriterContract = await songwriterLock(input, revised, researchReport);
  const preproductionBrief = await preproduction(input, revised, researchReport, songwriterContract);
  const preproductionValidation = validateMusicPreproductionBrief(preproductionBrief, { vocal_required: vocalSongRequested(input) });
  if (!preproductionValidation.passed) throw new Error(`CREATIVE_MUSIC_PREPRODUCTION_INVALID:${preproductionValidation.failures.join(",")}`);
  return {
    contract: CONTRACT, status: "READY_FOR_PRODUCTION_CONFIRMATION", research: researchReport,
    concepts, critic_reviews: criticReviews, competition, winning_concept: revised,
    songwriter_contract: songwriterContract,
    preproduction_brief: preproductionBrief, production_authorized: false,
    paid_generation_started: false, publication_authorized: false,
  };
}

export const CreativeMusicCreativeFloorExecutionRuntime = Object.freeze({ contract: CONTRACT, execute: executeMusicCreativeFloor });
