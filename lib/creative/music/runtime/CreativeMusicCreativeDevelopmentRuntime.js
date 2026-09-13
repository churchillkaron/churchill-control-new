const CONTRACT = "AVANTIQO_MUSIC_CREATIVE_DEVELOPMENT_V1";
const CONCEPT_COUNT = 3;

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

function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
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
    required_fields: [
      "central_musical_proposition", "emotional_arc", "motif_and_hook_system",
      "harmony_language", "rhythm_and_groove", "instrumentation",
      "arrangement_arc", "performance_direction", "sonic_identity",
      "mix_space_intent", "signature_moments", "production_method",
    ],
    must_be_independently_authored: true,
  });
}
export function buildMusicCreativeDevelopment(input = {}) {
  const objective = text(input.objective || input.request || input.brief);
  if (!objective) throw new Error("CREATIVE_MUSIC_CREATIVE_DEVELOPMENT_OBJECTIVE_REQUIRED");
  const research = researchRequirements(objective);
  const concepts = DIRECTORS.map(conceptTemplate);
  return Object.freeze({
    contract: CONTRACT,
    objective,
    research_room: research,
    concept_competition: {
      required: true,
      concept_count: CONCEPT_COUNT,
      concepts,
      critics: CRITICS.map((critic) => ({ ...critic })),
      blind_independent_scoring: true,
      weighted_winner_required: true,
      minimum_winner_score: 88,
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
  const requiredFamilies = ["MUSICALITY", "PERFORMANCE", "SONIC_IDENTITY", "TECHNICAL", "INTENT_FIDELITY"];
  const families = new Set(rows.map((row) => text(row.family).toUpperCase()));
  for (const family of requiredFamilies) {
    if (!families.has(family)) failures.push(`MUSIC_DAILIES_REVIEW_REQUIRED:${family}`);
  }
  for (const row of rows) {
    const score = Number(row.score);
    const family = text(row.family) || "UNKNOWN";
    if (!Number.isFinite(score) || score < 0 || score > 100) failures.push(`MUSIC_DAILIES_SCORE_INVALID:${family}`);
    if (row.passed !== true || score < 90) failures.push(`MUSIC_DAILIES_REJECTED:${family}`);
    if (!list(row.evidence).length) failures.push(`MUSIC_DAILIES_EVIDENCE_REQUIRED:${family}`);
  }
  const intendedKeys = [
    "emotional_arc", "arrangement_arc", "motif_and_hook_system",
    "performance_direction", "sonic_identity", "dynamic_arc",
  ];
  for (const key of intendedKeys) {
    if (!intended[key]) failures.push(`MUSIC_DAILIES_INTENDED_CONTRACT_REQUIRED:${key}`);
    if (!rendered[key]) failures.push(`MUSIC_DAILIES_RENDERED_EVIDENCE_REQUIRED:${key}`);
  }
  return Object.freeze({
    contract: "AVANTIQO_MUSIC_DAILIES_V1",
    passed: failures.length === 0,
    status: failures.length ? "REJECTED_FOR_REPAIR" : "APPROVED_FOR_MIX",
    failures: [...new Set(failures)],
    intended_vs_rendered_required: true,
    repair_before_mix_when_rejected: true,
  });
}

export const CreativeMusicCreativeDevelopmentRuntime = Object.freeze({
  contract: CONTRACT,
  build: buildMusicCreativeDevelopment,
  evaluateDailies: evaluateMusicDailies,
});
