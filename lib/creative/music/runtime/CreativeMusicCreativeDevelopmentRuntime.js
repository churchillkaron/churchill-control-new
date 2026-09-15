const CONTRACT = "AVANTIQO_MUSIC_CREATIVE_DEVELOPMENT_V2";
const CONCEPT_COUNT = 3;
const WINNER_FLOOR = 88;

const DIRECTORS = Object.freeze([
  { id: "emotion", role: "EMOTIONAL_NARRATIVE_COMPOSER", mandate: "Design the strongest emotional arc, motif memory and tension/release journey without relying on generic genre cliches." },
  { id: "performance", role: "PERFORMANCE_GROOVE_PRODUCER", mandate: "Design the strongest groove, musicianship, vocal/instrument performance, dynamics and physical energy while preserving human feel." },
  { id: "innovation", role: "SONIC_IDENTITY_INNOVATION_DIRECTOR", mandate: "Design an ownable sonic world, instrumentation language, texture system and memorable signature moments that do not imitate a reference artist." },
]);

const CRITICS = Object.freeze([
  { id: "brief_fidelity", weight: 0.20, minimum: 90 },
  { id: "musicality", weight: 0.15, minimum: 86 },
  { id: "emotion", weight: 0.15, minimum: 86 },
  { id: "originality", weight: 0.15, minimum: 88 },
  { id: "arrangement", weight: 0.10, minimum: 84 },
  { id: "performance", weight: 0.10, minimum: 84 },
  { id: "sonic_identity", weight: 0.10, minimum: 86 },
  { id: "production_feasibility", weight: 0.05, minimum: 78 },
]);

const CONCEPT_FIELDS = Object.freeze([
  "central_musical_proposition", "emotional_arc", "motif_and_hook_system",
  "harmony_language", "rhythm_and_groove", "instrumentation",
  "arrangement_arc", "performance_direction", "sonic_identity",
  "mix_space_intent", "signature_moments", "production_method",
]);
function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function clamp(value, minimum = 0, maximum = 100) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : null;
}
function researchRequirements(objective) {
  const sourceDependent = /reference|existing|source|backing|remix|cover|video|film|brand/i.test(objective);
  return Object.freeze({
    genre_and_form: true,
    audience_and_use_case: true,
    instrumentation_and_performance_language: true,
    cultural_context: true,
    technical_delivery_context: true,
    source_analysis: sourceDependent,
    rights_and_provenance: sourceDependent,
    reference_copying_prohibited: true,
    research_before_direction: true,
  });
}

function conceptTemplate(director) {
  return Object.freeze({
    id: `music-concept-${director.id}`,
    director_id: director.id,
    director_role: director.role,
    mandate: director.mandate,
    required_fields: [...CONCEPT_FIELDS],
    must_be_independently_authored: true,
  });
}
function wordSet(value) {
  return new Set(text(value).toLowerCase().replace(/[^a-z0-9\s]+/g, " ").split(/\s+/).filter((word) => word.length >= 4));
}
function conceptCorpus(concept = {}) {
  return CONCEPT_FIELDS.map((field) => {
    const value = concept[field];
    return Array.isArray(value) ? value.join(" ") : text(value);
  }).filter(Boolean).join(" ");
}
function conceptSimilarity(left = {}, right = {}) {
  const a = wordSet(conceptCorpus(left));
  const b = wordSet(conceptCorpus(right));
  if (!a.size || !b.size) return 1;
  const intersection = [...a].filter((word) => b.has(word)).length;
  return intersection / new Set([...a, ...b]).size;
}

export function validateMusicConcept(concept = {}, template = {}) {
  const failures = [];
  const source = object(concept);
  for (const field of list(template.required_fields || CONCEPT_FIELDS)) {
    const value = source[field];
    if (Array.isArray(value) ? value.length === 0 : !text(value)) failures.push(`MUSIC_CONCEPT_FIELD_REQUIRED:${field}`);
  }
  if (!text(source.id || template.id)) failures.push("MUSIC_CONCEPT_ID_REQUIRED");
  if (!text(source.director_id || template.director_id)) failures.push("MUSIC_CONCEPT_DIRECTOR_REQUIRED");
  return Object.freeze({ passed: failures.length === 0, failures: [...new Set(failures)] });
}
export function evaluateMusicConceptDiversity(concepts = []) {
  const rows = list(concepts);
  const failures = [];
  const comparisons = [];
  for (let left = 0; left < rows.length; left += 1) {
    for (let right = left + 1; right < rows.length; right += 1) {
      const similarity = conceptSimilarity(rows[left], rows[right]);
      comparisons.push({ left: rows[left]?.id || left, right: rows[right]?.id || right, similarity });
      if (similarity > 0.72) failures.push(`MUSIC_CONCEPTS_NOT_INDEPENDENT:${rows[left]?.id || left}:${rows[right]?.id || right}`);
    }
  }
  if (rows.length !== CONCEPT_COUNT) failures.push(`MUSIC_CONCEPT_COUNT_REQUIRED:${CONCEPT_COUNT}`);
  return Object.freeze({ passed: failures.length === 0, failures: [...new Set(failures)], comparisons });
}

export function scoreMusicConceptCompetition({ concepts = [], critic_reviews = [] } = {}) {
  const rows = list(concepts);
  const reviews = list(critic_reviews);
  const scoreRows = rows.map((concept) => {
    const failures = [];
    let weighted = 0;
    for (const critic of CRITICS) {
      const review = reviews.find((item) => text(item.critic_id) === critic.id && text(item.concept_id) === text(concept.id));
      const score = clamp(review?.score);
      if (score === null) failures.push(`MUSIC_CRITIC_SCORE_REQUIRED:${critic.id}`);
      else {
        weighted += score * critic.weight;
        if (score < critic.minimum || review?.passed !== true) failures.push(`MUSIC_CRITIC_REJECTED:${critic.id}`);
      }
    }
    return { concept_id: concept.id, weighted_score: Math.round(weighted * 100) / 100, failures };
  });
  scoreRows.sort((a, b) => b.weighted_score - a.weighted_score);
  const winner = scoreRows[0] || null;
  return Object.freeze({
    passed: Boolean(winner && winner.weighted_score >= WINNER_FLOOR && winner.failures.length === 0),
    minimum_winner_score: WINNER_FLOOR,
    winner_concept_id: winner?.concept_id || null,
    winner_score: winner?.weighted_score || 0,
    scores: scoreRows,
    failures: winner ? winner.failures : ["MUSIC_CONCEPT_WINNER_REQUIRED"],
  });
}
export function validateMusicPreproductionBrief(brief = {}, options = {}) {
  const required = [
    "tempo_map", "key_and_harmony", "form_and_section_lengths", "motif_map",
    "instrumentation", "performance_direction", "dynamic_arc", "sonic_palette",
    "transition_map", "mix_space_intent", "delivery_targets",
  ];
  const failures = [];
  for (const field of required) {
    const value = brief[field];
    if (Array.isArray(value) ? value.length === 0 : !value || (typeof value === "object" && !Object.keys(value).length)) {
      failures.push(`MUSIC_PREPRODUCTION_FIELD_REQUIRED:${field}`);
    }
  }
  if (options.vocal_required === true) {
    const vocal = object(brief.vocal_contract);
    if (vocal.required !== true) failures.push("MUSIC_PREPRODUCTION_VOCAL_CONTRACT_REQUIRED");
    if (!text(vocal.lyrics)) failures.push("MUSIC_PREPRODUCTION_LYRICS_REQUIRED");
    if (!text(vocal.vocal_language)) failures.push("MUSIC_PREPRODUCTION_VOCAL_LANGUAGE_REQUIRED");
  }
  return Object.freeze({ passed: failures.length === 0, failures });
}

export function buildMusicCreativeDevelopment(input = {}) {
  const objective = text(input.objective || input.request || input.brief);
  if (!objective) throw new Error("CREATIVE_MUSIC_CREATIVE_DEVELOPMENT_OBJECTIVE_REQUIRED");
  const research = researchRequirements(objective);
  const concepts = DIRECTORS.map(conceptTemplate);
  const listeningContext = input.music_listening_context && typeof input.music_listening_context === "object"
    ? input.music_listening_context
    : null;
  const vocalIntelligence = input.music_vocal_intelligence && typeof input.music_vocal_intelligence === "object"
    ? input.music_vocal_intelligence
    : null;
  return Object.freeze({
    contract: CONTRACT,
    objective,
    listening_context: listeningContext,
    vocal_intelligence: vocalIntelligence,
    vocal_intelligence_policy: {
      trusted_vocal_clips_only: true,
      role_inference_forbidden: true,
      descriptive_not_user_intent: true,
      mutation_authorized: false,
      publication_authorized: false,
    },
    listening_context_policy: {
      current_evidence_only: true,
      descriptive_not_user_intent: true,
      mutation_authorized: false,
      publication_authorized: false,
    },
    research_room: research,
    concept_competition: {
      required: true,
      concept_count: CONCEPT_COUNT,
      concepts,
      critics: CRITICS.map((critic) => ({ ...critic })),
      blind_independent_scoring: true,
      weighted_winner_required: true,
      minimum_winner_score: WINNER_FLOOR,
      no_single_director_self_approval: true,
      references_are_craft_grounding_not_copy_targets: true,
    },
    winner_revision: {
      required: true,
      preserve_best_evidence_from_losing_concepts: true,
      resolve_critic_failures_before_preproduction: true,
    },
    preproduction: {
      lock_before_generation: [
        "tempo_map", "key_and_harmony", "form_and_section_lengths", "motif_map",
        "instrumentation", "performance_direction", "dynamic_arc", "sonic_palette",
        "transition_map", "mix_space_intent", "delivery_targets",
      ],
      expensive_generation_before_lock_allowed: false,
    },
  });
}

export function evaluateMusicDailies({ intended = {}, rendered = {}, reviews = [] } = {}) {
  const rows = list(reviews);
  const failures = [];
  const requiredFamilies = ["MUSICALITY", "PERFORMANCE", "SONIC_IDENTITY", "TECHNICAL", "TRANSLATION", "INTENT_FIDELITY"];
  const families = new Set(rows.map((row) => text(row.family).toUpperCase()));
  for (const family of requiredFamilies) {
    if (!families.has(family)) failures.push(`MUSIC_DAILIES_REVIEW_REQUIRED:${family}`);
  }
  const reviewInfrastructureFailures = [];
  for (const row of rows) {
    const score = Number(row.score);
    const family = text(row.family) || "UNKNOWN";
    const rowFailures = list(row.failures).map(text);
    const reviewerInvalid = rowFailures.some((value) => value.startsWith("MUSIC_DAILIES_REVIEWER_EXECUTION_FAILED:") || value.startsWith("MUSIC_DAILIES_REVIEWER_EVIDENCE_POLICY_FAILED:"));
    if (!Number.isFinite(score) || score < 0 || score > 100) failures.push(`MUSIC_DAILIES_SCORE_INVALID:${family}`);
    if (reviewerInvalid) reviewInfrastructureFailures.push(`MUSIC_DAILIES_REVIEW_INVALID:${family}`);
    else if (row.passed !== true || score < 90) failures.push(`MUSIC_DAILIES_REJECTED:${family}`);
    if (!list(row.evidence).length) failures.push(`MUSIC_DAILIES_EVIDENCE_REQUIRED:${family}`);
  }
  const intendedKeys = [
    "emotional_arc", "arrangement_arc", "motif_and_hook_system",
    "performance_direction", "sonic_identity", "dynamic_arc",
  ];
  for (const key of intendedKeys) {
    if (!intended[key]) failures.push(`MUSIC_DAILIES_INTENDED_CONTRACT_REQUIRED:${key}`);
  }
  const renderedEvidenceKeys = [
    "musical_analysis", "melodic_intelligence", "form_intelligence",
    "rhythm_intelligence", "dynamic_sections", "master_report", "perceptual_translation",
  ];
  for (const key of renderedEvidenceKeys) {
    if (!rendered[key]) failures.push(`MUSIC_DAILIES_RENDERED_EVIDENCE_REQUIRED:${key}`);
  }
  return Object.freeze({
    contract: "AVANTIQO_MUSIC_DAILIES_V1",
    passed: failures.length === 0 && reviewInfrastructureFailures.length === 0,
    status: reviewInfrastructureFailures.length ? "REVIEW_INCOMPLETE" : failures.length ? "REJECTED_FOR_REPAIR" : "APPROVED_FOR_MIX",
    failures: [...new Set([...failures, ...reviewInfrastructureFailures])],
    music_repair_required: failures.some((value) => value.startsWith("MUSIC_DAILIES_REJECTED:")),
    reviewer_repair_required: reviewInfrastructureFailures.length > 0,
    intended_vs_rendered_required: true,
    repair_before_mix_when_rejected: true,
  });
}

export const CreativeMusicCreativeDevelopmentRuntime = Object.freeze({
  contract: CONTRACT,
  directors: DIRECTORS,
  critics: CRITICS,
  conceptFields: CONCEPT_FIELDS,
  build: buildMusicCreativeDevelopment,
  validateConcept: validateMusicConcept,
  evaluateDiversity: evaluateMusicConceptDiversity,
  scoreCompetition: scoreMusicConceptCompetition,
  validatePreproduction: validateMusicPreproductionBrief,
  evaluateDailies: evaluateMusicDailies,
});
