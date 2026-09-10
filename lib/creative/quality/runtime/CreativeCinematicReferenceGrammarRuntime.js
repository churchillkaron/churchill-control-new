const REFERENCE_FAMILY = Object.freeze([
  Object.freeze({ id: "lamborghini-revuelto-from-now-on", url: "https://youtu.be/sitXeGjm4Mc", role: "MYSTERY_REVEAL_EFFECTS" }),
  Object.freeze({ id: "ferrari-roma-reference", url: "https://youtu.be/5wjBHDogyko", role: "LUXURY_CONTINUITY_REVEAL" }),
  Object.freeze({ id: "ferrari-f80-reference", url: "https://www.youtube.com/watch?v=vr8NwCFjGa0", role: "ENGINEERED_MOTION_SCALE" }),
  Object.freeze({ id: "ferrari-458-spider-reference", url: "https://youtu.be/Slz3lJcqfd4", role: "TACTILE_MECHANICAL_DETAIL" }),
  Object.freeze({ id: "volvo-v90-made-by-sweden", url: "https://www.youtube.com/watch?v=lnjSaGxfZ1g", role: "DOCUMENTARY_TRUTH_PLACE_HUMANITY" }),
]);

const ADVISORY_REFERENCE_ARCHETYPES = Object.freeze([
  Object.freeze({ id: "volvo-xc70-zlatan-made-by-sweden", url: "https://www.youtube.com/watch?v=tqrCGf9DwxU", role: "NATIONAL_IDENTITY_ACTION_MONTAGE", evidence_grade: "PUBLIC_STORYBOARD_MEASURED" }),
  Object.freeze({ id: "volvo-vintersaga", url: "https://www.youtube.com/watch?v=3KquHpO2VWI", role: "POETIC_WEATHER_GEOGRAPHY_HUMANITY", evidence_grade: "PUBLIC_STORYBOARD_MEASURED" }),
  Object.freeze({ id: "mercedes-amg-one-deep-dive-design", url: "https://www.youtube.com/watch?v=YhS_kCgAHEc", role: "ENGINEERING_TRUTH_TO_DESIGN_MEANING", evidence_grade: "PUBLIC_STORYBOARD_MEASURED" }),
  Object.freeze({ id: "mercedes-amg-gt63-pro-it-belongs-to-you", url: "https://www.youtube.com/watch?v=5jf-Eb4u5Ks", role: "PERFORMANCE_DESIRE_HERO_AUTHORITY", evidence_grade: "PUBLIC_STORYBOARD_MEASURED" }),
  Object.freeze({ id: "oakley-meta-athletic-intelligence-is-here", url: "https://vimeo.com/1138211259", role: "EMBODIED_PRODUCT_CAPABILITY_ACTION", evidence_grade: "PUBLIC_CREDITS_AND_CAMPAIGN_ANALYSIS" }),
]);

const PRINCIPLES = Object.freeze([
  "Continuity is narrative truth: recurring people, vehicles, products, architecture and environments remain one persistent identity unless an intentional story change is declared.",
  "Mystery comes from controlled withholding. Reveal information in stages rather than obscuring the subject without purpose.",
  "Every shot changes meaning. Repeated coverage, repeated scale and repeated camera behavior are rejected unless repetition itself is the device.",
  "Tactile detail earns scale: surfaces, mechanics, weather, material response and physical consequences make later hero reveals believable.",
  "Camera motion must feel engineered and motivated, with physically plausible acceleration, stabilization and screen direction.",
  "Place must be truthful and atmospheric. Weather, geography, architecture, light and human behavior should make the world identifiable rather than generically luxurious.",
  "Transitions are causal: use action, geometry, darkness, occlusion, reflection, sound or motion to carry state across cuts; never use morphing as a substitute for editorial thought.",
  "Human presence should reveal ritual, labor, emotion or consequence; decorative posing is not documentary truth.",
  "Effects support mystery, tension or transformation. They are not decoration and must never break object identity, physics or spatial geography.",
  "The payoff must be earned by the reveal ladder and should resolve or transform the question created earlier in the scene.",
  "Emotional calm does not mean visual stasis: contemplative films must keep revealing new place, weather, human, material or story information even when camera movement and performance are restrained.",
  "Identity-led montage must connect person, place, labor, weather, movement and product through meaning rather than category coverage; rapid cutting without thematic causality is noise.",
  "Product capability must become observable consequence: connect capability to human intent, physical action, visible response and felt advantage; a hero object or feature label is not proof.",
  "Technical explanation must continuously translate facts into visual evidence; long-form expertise is allowed to breathe but may not become static talking-head exposition when design, mechanism, material or consequence can carry the meaning.",
  "Controlled chaos requires a stable perceptual anchor: extreme action, rolls, reflections, second-unit inserts and rapid editorial changes must preserve subject identity, product function and one legible audience question.",
]);

const MEASURED_VISUAL_ENVELOPE = Object.freeze({
  contract: "CREATIVE_CINEMATIC_PUBLIC_STORYBOARD_BENCHMARK_V1",
  evidence_grade: "PARTIAL_VISUAL_ONLY",
  exact_reference_count: 5,
  maximum_sample_interval_seconds: 2,
  minimum_luminance_range: 91.343,
  minimum_contrast_range: 63.835,
  minimum_adjacent_visual_change_mean: 26.09,
  minimum_adjacent_visual_change_p75: 34.947,
  maximum_longest_low_change_run_seconds: 14,
  audio_measurements_verified: false,
  full_reference_measurements_verified: false,
});

const GRAMMAR_DIMENSIONS = Object.freeze({
  reveal_ladder: Object.freeze({ minimum_stages: 3, requires_payoff: true }),
  shot_scale_progression: Object.freeze({ minimum_distinct_scales: 2, repeated_scale_limit: 2 }),
  transition_causality: Object.freeze({ allowed_devices: ["action", "geometry", "darkness", "occlusion", "reflection", "sound", "motion"], unexplained_morph_allowed: false }),
  tactile_detail: Object.freeze({ required_before_hero_scale_payoff: true }),
  geography_truth: Object.freeze({ named_place_requires_visual_proof: true }),
  human_purpose: Object.freeze({ decorative_pose_allowed: false }),
  black_frame_intent: Object.freeze({ decorative_black_allowed: false, must_serve_tension_transition_or_sound: true }),
  continuity: Object.freeze({ persistent_identity_required: true, hidden_reset_allowed: false }),
  camera_authorship: Object.freeze({ generic_stationary_coverage_allowed: false, movement_must_be_motivated: true }),
  payoff: Object.freeze({ must_resolve_or_transform_open_question: true }),
});

function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function text(value) { return String(value ?? "").trim().toLowerCase(); }

export function evaluateCinematicReferenceGrammar(plan = {}) {
  const shots = list(plan.shots || plan.timeline?.shots || plan.scene?.shots);
  const failures = [];
  const revealStages = new Set(shots.map((s) => text(s.reveal_stage)).filter(Boolean));
  if (revealStages.size < GRAMMAR_DIMENSIONS.reveal_ladder.minimum_stages) failures.push("REFERENCE_GRAMMAR_REVEAL_LADDER_TOO_FLAT");
  if (!shots.some((s) => s.payoff === true || /payoff|reveal|resolve|transform/.test(text(s.narrative_function)))) failures.push("REFERENCE_GRAMMAR_PAYOFF_REQUIRED");
  const scales = shots.map((s) => text(s.shot_scale || s.camera?.framing)).filter(Boolean);
  if (new Set(scales).size < GRAMMAR_DIMENSIONS.shot_scale_progression.minimum_distinct_scales) failures.push("REFERENCE_GRAMMAR_SHOT_SCALE_VARIATION_REQUIRED");
  let repeated = 1;
  for (let i = 1; i < scales.length; i += 1) { repeated = scales[i] === scales[i - 1] ? repeated + 1 : 1; if (repeated > 2) failures.push("REFERENCE_GRAMMAR_REPEATED_COVERAGE"); }
  for (const shot of shots) {
    if (shot.black_frame === true && !/(tension|transition|sound|heartbeat|silence|reveal)/.test(text(shot.black_frame_purpose))) failures.push("REFERENCE_GRAMMAR_DECORATIVE_BLACK_FRAME");
    if ((text(shot.geography_claim) && text(shot.geography_claim) !== "none" || Boolean(shot.named_place)) && !list(shot.geography_proof).length) failures.push("REFERENCE_GRAMMAR_GEOGRAPHY_PROOF_REQUIRED");
    if (shot.human_present === true && !text(shot.human_purpose)) failures.push("REFERENCE_GRAMMAR_HUMAN_PURPOSE_REQUIRED");
    if (shot.transition && !GRAMMAR_DIMENSIONS.transition_causality.allowed_devices.includes(text(shot.transition.device))) failures.push("REFERENCE_GRAMMAR_TRANSITION_CAUSALITY_REQUIRED");
  }
  return Object.freeze({ contract: "CREATIVE_CINEMATIC_REFERENCE_GRAMMAR_EVALUATION_V1", passed: failures.length === 0, score: failures.length ? 0 : 100, failures: [...new Set(failures)] });
}

export const CreativeCinematicReferenceGrammarRuntime = Object.freeze({
  contract: "CREATIVE_CINEMATIC_REFERENCE_GRAMMAR_V2",
  references: REFERENCE_FAMILY,
  principles: PRINCIPLES,
  dimensions: GRAMMAR_DIMENSIONS,
  measured_visual_envelope: MEASURED_VISUAL_ENVELOPE,
  evaluate: evaluateCinematicReferenceGrammar,
  snapshot() {
    return {
      contract: this.contract,
      learning_mode: "ABSTRACT_CRAFT_PRINCIPLES_NOT_SHOT_COPYING",
      references: REFERENCE_FAMILY,
      advisory_reference_archetypes: ADVISORY_REFERENCE_ARCHETYPES,
      principles: PRINCIPLES,
      dimensions: GRAMMAR_DIMENSIONS,
      measured_visual_envelope: MEASURED_VISUAL_ENVELOPE,
      prohibited: ["copying protected shot sequences or brand-specific creative expression", "treating reference films as templates", "sacrificing project truth to imitate automotive imagery"],
    };
  },
});
