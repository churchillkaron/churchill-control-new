import {
  CreativePursuitSpatialChoreographyRuntime,
} from "../../quality/runtime/CreativePursuitSpatialChoreographyRuntime.js";
import {
  CreativePursuitPerformanceChoreographyRuntime,
} from "../../performance/runtime/CreativePursuitPerformanceChoreographyRuntime.js";
import {
  CreativeEditorialCausalityRuntime,
} from "../../post-production/runtime/CreativeEditorialCausalityRuntime.js";

const CONTRACT = "CREATIVE_TEMPORAL_CINEMATIC_INTELLIGENCE_V1";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}
function text(value) {
  return String(value ?? "").trim();
}
function lower(value) {
  return text(value).toLowerCase();
}
function sceneLanguage(scene = {}, plan = {}) {
  return lower([
    scene.title, scene.objective, scene.emotion, scene.human_stake,
    scene.state_change, scene.transition_logic, scene.tension?.audience_question,
    plan.story?.audience_tension, plan.story?.escalation, plan.concept?.narrative,
  ].map(text).join(" "));
}

export function classifyTemporalScene({ scene = {}, plan = {} } = {}) {
  const language = sceneLanguage(scene, plan);
  const rules = [
    ["PURSUIT_HUNT", /hunt|pursu|chase|escape|run|flee|stalk|track|predator|hunted|search beam|drone threat/],
    ["THREAT_SUSPENSE", /threat|fear|danger|suspense|tension|unease|withhold|stalk|menace/],
    ["REVEAL_TRANSFORMATION", /transform|reveal|metamorph|lightning|energy|brain|neural|logo|resolve into|material shift/],
    ["AWE_SCALE", /awe|scale|vast|monumental|epic|reveal environment|world opens/],
    ["INTIMATE_PERFORMANCE", /face|emotion|breath|confession|reaction|intimate|vulnerab/],
    ["PRODUCT_HERO", /product|vehicle|car|machine|hero object|launch|technical reveal/],
  ];
  const types = rules.filter(([, pattern]) => pattern.test(language)).map(([id]) => id);
  if (!types.length) types.push("GENERAL_NARRATIVE");
  return {
    contract: CONTRACT,
    primary_type: types[0],
    scene_types: types,
    tension_scene: types.some((id) => ["PURSUIT_HUNT", "THREAT_SUSPENSE"].includes(id)),
    transformation_scene: types.includes("REVEAL_TRANSFORMATION"),
  };
}

function requiredCoverage(type) {
  if (type === "PURSUIT_HUNT") return [
    "ATMOSPHERE_OR_GEOGRAPHY", "EMOTIONAL_FACE_OR_EYES", "BODY_DETAIL_OR_FEET",
    "THREAT_PROXIMITY", "LATERAL_OR_OBLIQUE_ACTION", "OBSTRUCTED_OR_LAYERED_VIEW",
    "GRAPHIC_SILHOUETTE", "IMPACT_OR_EVENT_INSERT",
  ];
  if (type === "THREAT_SUSPENSE") return [
    "ATMOSPHERE_OR_GEOGRAPHY", "EMOTIONAL_FACE_OR_EYES", "THREAT_PROXIMITY",
    "OBSTRUCTED_OR_LAYERED_VIEW", "REVEAL_FRAGMENT",
  ];
  if (type === "REVEAL_TRANSFORMATION") return [
    "CAUSE", "PHYSICAL_CONSEQUENCE", "TRANSFORMATION_PROGRESS", "FORM_SIMPLIFICATION", "BRAND_RESOLUTION",
  ];
  return ["ESTABLISH", "STATE_CHANGE", "PAYOFF_OR_HANDOFF"];
}

function learningGuardrails(plan = {}) {
  const memory = plan.taste_memory || {};
  const recurring = list(memory.recurring_rejection_patterns);
  return recurring.map((entry) => ({
    reason: text(entry.reason, 180),
    count: Number(entry.count) || 0,
    must_avoid: Number(entry.count) >= 2,
  })).filter((entry) => entry.reason);
}
function learnedCraftLessons(plan = {}) {
  const memory = plan.taste_memory || {};
  return list(memory.craft_lessons).slice(0, 16).map((lesson) => ({
    domain: text(lesson.domain, 80),
    score_delta: Number(lesson.score_delta) || 0,
    reasons: list(lesson.reasons).map((reason) => text(reason, 180)).filter(Boolean),
    accepted: lesson.accepted || {},
    rejected: lesson.rejected || {},
    evidence_only: true,
    copy_forbidden: true,
  }));
}

export function buildTemporalCoverageIntelligence({ scene = {}, plan = {} } = {}) {
  const classification = classifyTemporalScene({ scene, plan });
  const roles = requiredCoverage(classification.primary_type);
  const learnedGuardrails = learningGuardrails(plan);
  const craftLessons = learnedCraftLessons(plan);
  return {
    contract: CONTRACT,
    classification,
    coverage_contract: {
      required_roles: roles,
      minimum_distinct_roles: classification.primary_type === "PURSUIT_HUNT" ? 6 : Math.min(3, roles.length),
      rear_follow_default_forbidden: classification.tension_scene,
      repeated_camera_grammar_forbidden: true,
      detail_insert_required: classification.tension_scene,
      threat_insert_required: classification.tension_scene,
      emotional_microtruth_required: classification.tension_scene,
      escalation_required: classification.tension_scene,
      hold_and_acceleration_contrast_required: classification.tension_scene,
    },
    learned_guardrails: learnedGuardrails,
    learned_craft_lessons: craftLessons,
    editorial_contract: {
      equal_length_chain_forbidden: true,
      repeated_scale_chain_forbidden: true,
      repeated_angle_chain_forbidden: true,
      tension_must_change_across_sequence: classification.tension_scene,
      at_least_one_density_drop_or_hold: classification.tension_scene,
      at_least_one_acceleration_or_impact_cluster: classification.tension_scene,
    },
  };
}
function roleText(shot = {}) {
  return lower([
    shot.coverage_role, shot.coverage?.coverage_role, shot.title, shot.purpose,
    shot.subject, shot.action, shot.camera?.framing, shot.camera?.angle,
    shot.signature_frame_design?.fear_or_desire_focus,
  ].map(text).join(" "));
}
function inferCoverageRole(shot = {}) {
  const s = roleText(shot);
  if (/face|eye|expression|jaw|breath|close.?up/.test(s)) return "EMOTIONAL_FACE_OR_EYES";
  if (/foot|feet|shoe|boot|mud|hand|arm|body detail/.test(s)) return "BODY_DETAIL_OR_FEET";
  if (/drone|threat|beam|predator|pursuer|close pass/.test(s)) return "THREAT_PROXIMITY";
  if (/silhouette|graphic shape|backlight/.test(s)) return "GRAPHIC_SILHOUETTE";
  if (/obstruct|foreground|through branch|occlusion|partial/.test(s)) return "OBSTRUCTED_OR_LAYERED_VIEW";
  if (/lateral|profile|side|oblique|cross frame/.test(s)) return "LATERAL_OR_OBLIQUE_ACTION";
  if (/wide|establish|forest|environment|geography/.test(s)) return "ATMOSPHERE_OR_GEOGRAPHY";
  if (/impact|lightning|strike|snap|collision|event insert/.test(s)) return "IMPACT_OR_EVENT_INSERT";
  if (/cause/.test(s)) return "CAUSE";
  if (/consequence|debris|steam|reaction/.test(s)) return "PHYSICAL_CONSEQUENCE";
  if (/transform|energy gather|neural|morph/.test(s)) return "TRANSFORMATION_PROGRESS";
  if (/simplif|geometry|resolve form/.test(s)) return "FORM_SIMPLIFICATION";
  if (/logo|brand|avantiqo|mark/.test(s)) return "BRAND_RESOLUTION";
  return text(shot.coverage_role || shot.coverage?.coverage_role).toUpperCase() || "OTHER";
}
function cameraSignature(shot = {}) {
  return lower([
    shot.camera?.platform, shot.camera?.framing, shot.camera?.angle,
    shot.camera?.camera_distance, shot.camera?.movement_path, shot.camera?.lens_intent,
  ].map(text).join("|"));
}
function shotScale(shot = {}) {
  const value = lower([shot.camera?.framing, shot.camera?.camera_distance].map(text).join(" "));
  if (/extreme close|ecu|macro/.test(value)) return "EXTREME_CLOSE";
  if (/close.?up|cu/.test(value)) return "CLOSE";
  if (/medium close|mcu/.test(value)) return "MEDIUM_CLOSE";
  if (/medium|waist|ms/.test(value)) return "MEDIUM";
  if (/full body|full shot|fs/.test(value)) return "FULL";
  if (/extreme wide|ews/.test(value)) return "EXTREME_WIDE";
  if (/wide|long shot|ws/.test(value)) return "WIDE";
  return value ? "OTHER" : "UNKNOWN";
}
function shotAngle(shot = {}) {
  const value = lower(shot.camera?.angle);
  if (/low/.test(value)) return "LOW";
  if (/high|overhead|bird/.test(value)) return "HIGH";
  if (/profile|side|lateral/.test(value)) return "PROFILE";
  if (/rear|behind|back/.test(value)) return "REAR";
  if (/front|frontal|head.?on/.test(value)) return "FRONTAL";
  if (/oblique|three.?quarter|3\/4|three quarter/.test(value)) return "OBLIQUE";
  return value ? "OTHER" : "UNKNOWN";
}
export function evaluateTemporalSequenceIntelligence({ scene = {}, shots = [], plan = {} } = {}) {
  const intelligence = buildTemporalCoverageIntelligence({ scene, plan });
  const failures = [];
  const roles = list(shots).map(inferCoverageRole);
  const distinct = new Set(roles.filter((role) => role !== "OTHER"));
  const contract = intelligence.coverage_contract;

  if (distinct.size < contract.minimum_distinct_roles) {
    failures.push({
      code: "TEMPORAL_COVERAGE_DIVERSITY_REQUIRED",
      path: "shots",
      message: "Scene needs at least " + contract.minimum_distinct_roles + " distinct purposeful coverage roles; found " + distinct.size + ".",
    });
  }
  for (const role of contract.required_roles) {
    if (!roles.includes(role) && contract.minimum_distinct_roles >= contract.required_roles.length - 2) {
      failures.push({
        code: "TEMPORAL_COVERAGE_ROLE_REQUIRED",
        path: "shots",
        message: "Missing required coverage role " + role + ".",
      });
    }
  }

  const signatures = list(shots).map(cameraSignature);
  const scales = list(shots).map(shotScale);
  const angles = list(shots).map(shotAngle);
  let repeated = 1;
  for (let i = 1; i < signatures.length; i += 1) {
    repeated = signatures[i] && signatures[i] === signatures[i - 1] ? repeated + 1 : 1;
    if (repeated >= 3) failures.push({
      code: "TEMPORAL_REPEATED_CAMERA_GRAMMAR",
      path: "shots." + i + ".camera",
      message: "Three adjacent shots use materially identical camera grammar; redesign angle, scale, optics, platform or spatial relationship.",
    });
  }
  for (const [label, values, code] of [
    ["scale", scales, "TEMPORAL_REPEATED_SHOT_SCALE"],
    ["angle", angles, "TEMPORAL_REPEATED_CAMERA_ANGLE"],
  ]) {
    let run = 1;
    for (let i = 1; i < values.length; i += 1) {
      run = values[i] !== "UNKNOWN" && values[i] === values[i - 1] ? run + 1 : 1;
      if (run >= 3) failures.push({
        code,
        path: "shots." + i + ".camera",
        message: "Three adjacent shots repeat the same " + label + " family (" + values[i] + "); create deliberate visual contrast.",
      });
    }
  }
  if (intelligence.classification.tension_scene && new Set(scales.filter((value) => !["UNKNOWN","OTHER"].includes(value))).size < 3) {
    failures.push({
      code: "TEMPORAL_TENSION_SCALE_VARIETY_REQUIRED",
      path: "shots",
      message: "Tension coverage needs at least three readable shot-scale families so geography, threat and human detail can intercut.",
    });
  }

  if (intelligence.classification.tension_scene) {
    const requiredEnvironmentFields = [
      "wind_direction",
      "precipitation_state",
      "wetness_state",
      "ground_deformation_state",
      "footprint_track_state",
      "wardrobe_wetness_state",
      "atmosphere_density",
      "practical_light_state",
      "lightning_state",
      "moving_threat_state",
      "causal_change_from_previous_shot",
    ];
    list(shots).forEach((shot, index) => {
      const state = shot.environmental_continuity_state && typeof shot.environmental_continuity_state === "object"
        ? shot.environmental_continuity_state
        : {};
      for (const field of requiredEnvironmentFields) {
        if (text(state[field]).length < 8) failures.push({
          code: "TEMPORAL_ENVIRONMENT_CONTINUITY_FIELD_REQUIRED",
          path: "shots." + index + ".environmental_continuity_state." + field,
          message: "Tension/pursuit coverage requires explicit physical environment state for " + field + ".",
        });
      }
      if (!list(state.must_persist_into_next_shot).length) failures.push({
        code: "TEMPORAL_ENVIRONMENT_PERSISTENCE_REQUIRED",
        path: "shots." + index + ".environmental_continuity_state.must_persist_into_next_shot",
        message: "State what physical evidence must survive the cut so the environment cannot reset between generated clips.",
      });
    });
  }

  if (contract.rear_follow_default_forbidden) {
    list(shots).forEach((shot, index) => {
      const camera = cameraSignature(shot);
      const action = lower(shot.action);
      const anti = lower(shot.signature_frame_design?.anti_game_camera_rule);
      if (/behind|rear|follow/.test(camera) && /run|flee|chase|move/.test(action) && anti.length < 40) {
        failures.push({
          code: "TEMPORAL_GAME_CAMERA_FORBIDDEN",
          path: "shots." + index + ".camera",
          message: "Centered/rear-follow pursuit coverage is forbidden without an authored exception that changes audience knowledge.",
        });
      }
    });
  }

  const durations = list(shots).map((shot) => Number(shot.duration_seconds)).filter(Number.isFinite);
  if (durations.length >= 4) {
    const rounded = new Set(durations.map((value) => Math.round(value * 2) / 2));
    if (rounded.size < 3) failures.push({
      code: "TEMPORAL_EDIT_RHYTHM_FLAT",
      path: "shots",
      message: "Premium sequence requires at least three materially different duration bands rather than metronomic clip lengths.",
    });
  }

  if (intelligence.classification.transformation_scene) {
    const ordered = ["CAUSE", "PHYSICAL_CONSEQUENCE", "TRANSFORMATION_PROGRESS", "FORM_SIMPLIFICATION", "BRAND_RESOLUTION"];
    let cursor = -1;
    for (const role of ordered) {
      const index = roles.indexOf(role);
      if (index < 0) {
        failures.push({
          code: "TEMPORAL_TRANSFORMATION_BEAT_REQUIRED",
          path: "shots",
          message: "Transformation sequence is missing causal beat " + role + ".",
        });
      } else if (index <= cursor) {
        failures.push({
          code: "TEMPORAL_TRANSFORMATION_CAUSAL_ORDER_REQUIRED",
          path: "shots." + index,
          message: "Transformation must progress cause -> physical consequence -> transformation -> simplification -> brand resolution.",
        });
      } else {
        cursor = index;
      }
    }
  }

  const sequenceText = lower(list(shots).map((shot) => [
    shot.title, shot.purpose, shot.action, shot.camera?.framing,
    shot.camera?.angle, shot.camera?.movement_path,
    shot.signature_frame_design?.anti_game_camera_rule,
  ].map(text).join(" ")).join(" "));
  for (const pattern of intelligence.learned_guardrails || []) {
    if (!pattern.must_avoid) continue;
    const reason = lower(pattern.reason);
    const checks = [
      [/rear|behind|game.?camera|third.?person/, /rear|behind|third.?person|follow/],
      [/flat.?rhythm|equal.?length|metronom/, /same duration|equal duration|metronom/],
      [/generic.?fog|fake.?fog|beam/, /generic fog|decorative beam|floating haze/],
      [/plastic|synthetic|cgi|procedural/, /plastic|synthetic|procedural|clean cg/],
    ];
    for (const [reasonPattern, sequencePattern] of checks) {
      if (reasonPattern.test(reason) && sequencePattern.test(sequenceText)) {
        failures.push({
          code: "TEMPORAL_LEARNED_REJECTION_PATTERN_REPEATED",
          path: "shots",
          message: "A repeatedly rejected production pattern is present again: " + pattern.reason,
        });
        break;
      }
    }
  }

  const pursuitSpatial = CreativePursuitSpatialChoreographyRuntime.evaluate({
    scene,
    shots,
  });
  failures.push(...pursuitSpatial.failures);
  const pursuitPerformance = CreativePursuitPerformanceChoreographyRuntime.evaluate({
    scene,
    shots,
  });
  failures.push(...pursuitPerformance.failures);
  const editorialCausality = CreativeEditorialCausalityRuntime.evaluate({
    scene,
    shots,
  });
  failures.push(...editorialCausality.failures);

  const tempoRoles = list(shots).map((shot) => text(shot.tempo_role).toUpperCase());
  if (intelligence.editorial_contract.at_least_one_density_drop_or_hold &&
      !tempoRoles.some((role) => ["HOLD", "RELEASE", "SILENCE"].includes(role))) {
    failures.push({
      code: "TEMPORAL_TENSION_HOLD_REQUIRED", path: "shots",
      message: "Tension scene needs a hold/release/silence beat to create contrast.",
    });
  }
  if (intelligence.editorial_contract.at_least_one_acceleration_or_impact_cluster &&
      !tempoRoles.some((role) => ["ACCELERATE", "PEAK"].includes(role))) {
    failures.push({
      code: "TEMPORAL_TENSION_ACCELERATION_REQUIRED", path: "shots",
      message: "Tension scene needs an acceleration or peak cluster before payoff.",
    });
  }

  return {
    contract: CONTRACT,
    ...intelligence,
    coverage_roles: roles,
    pursuit_spatial_choreography: pursuitSpatial,
    pursuit_performance_choreography: pursuitPerformance,
    editorial_causality: editorialCausality,
    failures,
    passed: failures.length === 0,
  };
}

export function buildTemporalAudioDramaturgy({ scene = {}, shots = [], plan = {} } = {}) {
  const classification = classifyTemporalScene({ scene, plan });
  const audioLessons = learnedCraftLessons(plan).filter((lesson) => lesson.domain === "music_energy");
  const recurringAudioFailures = learningGuardrails(plan).filter((entry) =>
    /music|audio|sound|mix|score|silence|sfx/i.test(entry.reason),
  );
  return {
    contract: CONTRACT,
    scene_type: classification.primary_type,
    picture_is_timing_authority: true,
    music_is_not_constant_bed: true,
    foreground_physical_sound_may_override_score: true,
    silence_or_density_drop_required: classification.tension_scene,
    proximity_sound_required: classification.tension_scene,
    sync_event_density_follows_picture: true,
    learned_audio_lessons: audioLessons,
    recurring_audio_failures: recurringAudioFailures,
    learned_audio_is_advisory_not_template: true,
    cues: list(shots).map((shot, index) => ({
      shot_id: shot.id || null,
      index,
      tempo_role: text(shot.tempo_role).toUpperCase() || null,
      energy_level: Number(shot.energy_level) || 0,
      pressure: Number(shot.tension?.sonic_pressure) || 0,
      physical_sync_events: list(shot.audio?.sync_events),
      mix_intent: text(shot.audio?.mix_intent) || null,
      silence: text(shot.audio?.silence) || null,
    })),
  };
}

export const CreativeTemporalCinematicIntelligenceRuntime = Object.freeze({
  contract: CONTRACT,
  classifyScene: classifyTemporalScene,
  buildCoverageIntelligence: buildTemporalCoverageIntelligence,
  evaluateSequence: evaluateTemporalSequenceIntelligence,
  buildAudioDramaturgy: buildTemporalAudioDramaturgy,
});
