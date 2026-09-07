export const CREATIVE_INVESTOR_FILM_CINEMATIC_BENCHMARK_CONTRACT =
  "AVANTIQO_INVESTOR_FILM_CINEMATIC_BENCHMARK_V1";
export const AVANTIQO_INTELLIGENCE_ENGINE_CINEMATIC_LANGUAGE_CONTRACT =
  "AVANTIQO_INTELLIGENCE_ENGINE_CINEMATIC_LANGUAGE_V1";

export const INVESTOR_FILM_CINEMATIC_FLOORS = Object.freeze({
  narrative_compulsion_score: 94,
  human_truth_score: 94,
  precision_score: 96,
  future_world_score: 94,
  world_depth_score: 94,
  sensory_physicality_score: 95,
  editorial_propulsion_score: 95,
  emotional_charge_score: 94,
  rewatch_value_score: 94,
  intelligence_engine_score: 96,
});

export const INVESTOR_FILM_REFERENCE_PRINCIPLES = Object.freeze([
  Object.freeze({
    reference: "VOLVO",
    principle: "HUMANITY_AND_HUMAN_CONSEQUENCE",
    imitation_forbidden: true,
  }),
  Object.freeze({
    reference: "NETFLIX",
    principle: "NARRATIVE_TENSION_AND_EPISODIC_COMPELLABILITY",
    imitation_forbidden: true,
  }),
  Object.freeze({
    reference: "APPLE",
    principle: "PRECISION_RESTRAINT_AND_VISUAL_CLARITY",
    imitation_forbidden: true,
  }),
  Object.freeze({
    reference: "TESLA",
    principle: "FUTURE_WORLD_VISION_WITH_SYSTEMIC_CONSEQUENCE",
    imitation_forbidden: true,
  }),
  Object.freeze({
    reference: "MERCEDES",
    principle: "WORLD_BUILDING_SCALE_AND_PREMIUM_ENVIRONMENTAL_DEPTH",
    imitation_forbidden: true,
  }),
  Object.freeze({
    reference: "FERRARI_LAMBORGHINI",
    principle: "CINEMATIC_PHYSICALITY_SENSORY_ENERGY_AND_MECHANICAL_CAUSALITY",
    imitation_forbidden: true,
  }),
]);

const INVESTOR_MARKERS = Object.freeze([
  "investor_first_minute_scope",
  "investor_project_id",
  "investor_scene",
  "investor_owned_only_execution",
]);

const INTELLIGENCE_TERMS = Object.freeze([
  "avantiqo intelligence",
  "intelligence",
  "ai intelligence",
  "business system",
  "decision",
  "understand",
  "context",
  "coordinate",
  "coordination",
  "exception propagation",
  "system response",
]);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clamp(value) {
  const number = finite(value);
  return number === null ? null : Math.max(0, Math.min(100, number));
}

function flattenText(value) {
  try {
    return JSON.stringify(value || {}).toLowerCase();
  } catch {
    return text(value).toLowerCase();
  }
}

function weighted(values = []) {
  let numerator = 0;
  let denominator = 0;
  for (const [value, weight] of values) {
    const score = clamp(value);
    if (score === null || !Number.isFinite(weight) || weight <= 0) continue;
    numerator += score * weight;
    denominator += weight;
  }
  return denominator > 0 ? Number((numerator / denominator).toFixed(3)) : null;
}

export function investorFilmTask(task = {}, shot = {}) {
  const metadata = object(task.metadata);
  const shotMetadata = object(shot.metadata);
  if (INVESTOR_MARKERS.some((key) => metadata[key] || shotMetadata[key])) return true;
  const source = flattenText({
    title: task.title,
    description: task.description,
    input: task.input,
    metadata,
    shot: {
      title: shot.title,
      purpose: shot.purpose,
      action: shot.action,
      metadata: shotMetadata,
    },
  });
  return source.includes("investor film") || source.includes("avantiqo investor");
}

export function intelligenceEngineApplicable(task = {}, shot = {}) {
  if (!investorFilmTask(task, shot)) return false;
  const source = flattenText({
    title: shot.title || task.title,
    purpose: shot.purpose,
    action: shot.action,
    performance: shot.performance,
    narration: shot.narration,
    graphics: shot.graphics,
    input: task.input,
    metadata: task.metadata,
  });
  return INTELLIGENCE_TERMS.some((term) => source.includes(term));
}

function firstMinutePressureBuild(task = {}, shot = {}) {
  const metadata = object(task.metadata);
  const shotMetadata = object(shot.metadata);
  const scoped = Boolean(
    metadata.investor_first_minute_scope ||
    shotMetadata.investor_first_minute_scope,
  );
  const end = finite(
    shotMetadata.master_timeline_end_seconds ||
    metadata.master_timeline_end_seconds ||
    metadata.scope_end_seconds,
  );
  return scoped && (end === null || end <= 60.001) &&
    !intelligenceEngineApplicable(task, shot);
}

export function compileInvestorFilmCinematicBenchmark({
  task = {},
  shot = {},
  cinematography_acquisition = {},
  professional_filmcraft = {},
} = {}) {
  const applicable = investorFilmTask(task, shot);
  if (!applicable) {
    return {
      contract: CREATIVE_INVESTOR_FILM_CINEMATIC_BENCHMARK_CONTRACT,
      status: "NOT_APPLICABLE",
      applicable: false,
      intelligence_engine: { applicable: false },
    };
  }

  const intelligenceApplicable = intelligenceEngineApplicable(task, shot);
  const pressureBuild = firstMinutePressureBuild(task, shot);

  return {
    contract: CREATIVE_INVESTOR_FILM_CINEMATIC_BENCHMARK_CONTRACT,
    status: "READY",
    applicable: true,
    inspiration_policy: {
      mode: "PRINCIPLES_NOT_IMITATION",
      references: INVESTOR_FILM_REFERENCE_PRINCIPLES,
      copy_campaign_composition_forbidden: true,
      copy_brand_specific_assets_forbidden: true,
      copy_automotive_engine_visuals_forbidden: true,
      copy_engine_audio_forbidden: true,
    },
    audience_contract: {
      passive_corporate_explainer_forbidden: true,
      continued_attention_required: true,
      curiosity_gap_required: true,
      each_shot_must_change_story_state_or_sensory_state: true,
      beautiful_but_passive_shot_rejectable: true,
      rewatch_value_required: true,
    },
    cinematic_language: {
      human_truth: "REAL_PEOPLE_REAL_PRESSURE_REAL_CONSEQUENCE",
      narrative: "CAUSE_EFFECT_TENSION_ESCALATION_PAYOFF",
      precision: "RESTRAINED_EXACT_INTENTIONAL_COMPOSITION",
      future_world: "SYSTEMIC_FUTURE_VISIBLE_THROUGH_CONSEQUENCES_NOT_GIMMICKS",
      world_building: "COHERENT_RECURRING_PLACES_MATERIALS_SCALE_AND_GEOGRAPHY",
      physicality: {
        requirement: "TACTILE_MASS_SPEED_LIGHT_AIR_TEXTURE_AND_SPATIAL_FORCE",
        camera_must_have_momentum_or_deliberate_stillness: true,
        foreground_parallax_and_depth_when_story_motivated: true,
        environmental_secondary_motion_required_when_natural: true,
        sound_must_have_spatial_weight: true,
        spectacle_without_story_motivation_forbidden: true,
      },
    },
    intelligence_engine: {
      contract: AVANTIQO_INTELLIGENCE_ENGINE_CINEMATIC_LANGUAGE_CONTRACT,
      applicable: intelligenceApplicable,
      metaphor: "INTELLIGENCE_IS_THE_BUSINESS_POWERTRAIN",
      causal_chain: [
        "SIGNAL_CAPTURE",
        "CONTEXT_COMPREHENSION",
        "DECISION",
        "PROPAGATION",
        "PHYSICAL_BUSINESS_CONSEQUENCE",
        "FEEDBACK_AND_PROOF",
      ],
      visual_rule: "SHOW_CAUSAL_UNDERSTANDING_MOVING_THROUGH_REAL_BUSINESS_OBJECTS_AND_ACTIONS",
      ui_rule: "UI_IS_EVIDENCE_NOT_THE_HERO",
      spatial_rule: "SIGNALS_AND_RELATIONSHIPS_REMAIN_ANCHORED_TO_REAL_PEOPLE_OBJECTS_MONEY_AND_PLACES",
      sound_rule: "CAUSAL_SPATIAL_IMPULSES_PRECISION_AND_RELEASE_NOT_GENERIC_AI_WHOOSHES",
      forbidden: [
        "GENERIC_GLOWING_AI_ORB",
        "GENERIC_SCI_FI_BRAIN",
        "UNANCHORED_HOLOGRAM_TUNNEL",
        "RANDOM_NEON_CIRCUITS",
        "DASHBOARD_AS_HERO",
        "AUTOMOTIVE_ENGINE_VISUAL_COPY",
        "AUTOMOTIVE_ENGINE_AUDIO_COPY",
      ],
    },
    story_phase: pressureBuild
      ? "PRESSURE_BUILD_BEFORE_INTELLIGENCE_REVEAL"
      : intelligenceApplicable
        ? "INTELLIGENCE_ENGINE_REVEAL_OR_OPERATION"
        : "WORLD_AND_STAKES_BUILD",
    first_minute_rule: pressureBuild
      ? {
          intelligence_reveal_must_not_be_forced_early: true,
          business_fragmentation_and_supplier_exception_tension_required: true,
          physical_causality_must_build_before_system_resolution: true,
        }
      : null,
    craft_evidence: {
      cinematography_acquisition_contract:
        text(cinematography_acquisition.contract) || null,
      professional_filmcraft_contract:
        text(professional_filmcraft.contract) || null,
      provider_neutral: true,
      provider_selection_forbidden: true,
    },
    thresholds: INVESTOR_FILM_CINEMATIC_FLOORS,
  };
}

function scoreBundle(evidence = {}) {
  return {
    story: clamp(evidence.story_score),
    environment: clamp(evidence.environment_score),
    camera: clamp(evidence.camera_score),
    anatomy: clamp(evidence.anatomy_score),
    identity: clamp(evidence.identity_score),
    product: clamp(evidence.product_fidelity_score),
    music: clamp(evidence.music_energy_score),
    performance: clamp(evidence.performance_score),
    continuity: clamp(evidence.continuity_score),
    physics: clamp(evidence.physics_score),
    artifact: clamp(evidence.artifact_score),
  };
}

export function evaluateInvestorFilmCinematicBenchmark({
  evidence = {},
  source = {},
  shot = {},
} = {}) {
  const plan = compileInvestorFilmCinematicBenchmark({ task: source, shot });
  if (!plan.applicable) {
    return {
      contract: CREATIVE_INVESTOR_FILM_CINEMATIC_BENCHMARK_CONTRACT,
      applicable: false,
      passed: true,
      failures: [],
      dimensions: {},
      cinematic_attraction_score: null,
      intelligence_engine: plan.intelligence_engine,
    };
  }

  const s = scoreBundle(evidence);
  const dimensions = {
    narrative_compulsion_score: weighted([
      [s.story, 0.45], [s.performance, 0.25], [s.camera, 0.15], [s.music, 0.15],
    ]),
    human_truth_score: weighted([
      [s.performance, 0.45], [s.identity, 0.20], [s.anatomy, 0.15], [s.physics, 0.20],
    ]),
    precision_score: weighted([
      [s.artifact, 0.25], [s.continuity, 0.20], [s.camera, 0.15],
      [s.identity, 0.15], [s.physics, 0.15], [s.product, 0.10],
    ]),
    future_world_score: weighted([
      [s.story, 0.30], [s.environment, 0.30], [s.camera, 0.20], [s.artifact, 0.20],
    ]),
    world_depth_score: weighted([
      [s.environment, 0.40], [s.camera, 0.25], [s.story, 0.20], [s.continuity, 0.15],
    ]),
    sensory_physicality_score: weighted([
      [s.physics, 0.30], [s.camera, 0.25], [s.performance, 0.20],
      [s.environment, 0.15], [s.music, 0.10],
    ]),
    editorial_propulsion_score: weighted([
      [s.story, 0.35], [s.camera, 0.25], [s.continuity, 0.20], [s.music, 0.20],
    ]),
    emotional_charge_score: weighted([
      [s.performance, 0.40], [s.story, 0.30], [s.music, 0.20], [s.camera, 0.10],
    ]),
  };
  dimensions.rewatch_value_score = weighted([
    [dimensions.narrative_compulsion_score, 0.20],
    [dimensions.sensory_physicality_score, 0.25],
    [dimensions.emotional_charge_score, 0.20],
    [dimensions.future_world_score, 0.15],
    [dimensions.world_depth_score, 0.10],
    [dimensions.editorial_propulsion_score, 0.10],
  ]);
  dimensions.intelligence_engine_score = plan.intelligence_engine.applicable
    ? weighted([
        [s.story, 0.30], [s.camera, 0.20], [s.environment, 0.15],
        [s.physics, 0.15], [s.continuity, 0.10], [s.artifact, 0.10],
      ])
    : null;

  const failures = [];
  for (const [field, floor] of Object.entries(INVESTOR_FILM_CINEMATIC_FLOORS)) {
    if (field === "intelligence_engine_score" && !plan.intelligence_engine.applicable) continue;
    const score = finite(dimensions[field]);
    if (score === null) failures.push(`${field}:EVIDENCE_REQUIRED`);
    else if (score < floor) failures.push(`${field}:BELOW_${floor}`);
  }

  const cinematicAttractionScore = weighted([
    [dimensions.narrative_compulsion_score, 0.18],
    [dimensions.sensory_physicality_score, 0.18],
    [dimensions.editorial_propulsion_score, 0.16],
    [dimensions.emotional_charge_score, 0.14],
    [dimensions.precision_score, 0.12],
    [dimensions.world_depth_score, 0.10],
    [dimensions.future_world_score, 0.07],
    [dimensions.rewatch_value_score, 0.05],
    ...(plan.intelligence_engine.applicable
      ? [[dimensions.intelligence_engine_score, 0.12]]
      : []),
  ]);

  return {
    contract: CREATIVE_INVESTOR_FILM_CINEMATIC_BENCHMARK_CONTRACT,
    applicable: true,
    passed: failures.length === 0,
    story_phase: plan.story_phase,
    dimensions,
    thresholds: INVESTOR_FILM_CINEMATIC_FLOORS,
    failures,
    cinematic_attraction_score: cinematicAttractionScore,
    intelligence_engine: plan.intelligence_engine,
    scoring_basis: "DERIVED_FROM_EXISTING_PERCEPTUAL_REVIEW_NO_ADDITIONAL_PROVIDER_CALL",
    provider_calls_added: 0,
    repair_instructions: failures.map((failure) =>
      `Improve only the failed cinematic dimension while preserving approved story, identity, continuity and physical truth: ${failure}`,
    ),
  };
}

export const CreativeInvestorFilmCinematicBenchmarkRuntime = Object.freeze({
  contract: CREATIVE_INVESTOR_FILM_CINEMATIC_BENCHMARK_CONTRACT,
  intelligence_engine_contract:
    AVANTIQO_INTELLIGENCE_ENGINE_CINEMATIC_LANGUAGE_CONTRACT,
  floors: INVESTOR_FILM_CINEMATIC_FLOORS,
  references: INVESTOR_FILM_REFERENCE_PRINCIPLES,
  investorFilmTask,
  intelligenceEngineApplicable,
  compile: compileInvestorFilmCinematicBenchmark,
  evaluate: evaluateInvestorFilmCinematicBenchmark,
});
