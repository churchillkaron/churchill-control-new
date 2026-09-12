const CONTRACT = "AVANTIQO_VFX_V1";

const EFFECT_CLASSES = Object.freeze({
  CLEANUP_REMOVAL: "CLEANUP_REMOVAL",
  SET_EXTENSION: "SET_EXTENSION",
  SCREEN_REPLACEMENT: "SCREEN_REPLACEMENT",
  ATMOSPHERIC: "ATMOSPHERIC",
  LIGHTING_EFFECT: "LIGHTING_EFFECT",
  PARTICLE_EFFECT: "PARTICLE_EFFECT",
  ENERGY_MAGIC: "ENERGY_MAGIC",
  CREATURE_OBJECT_AUGMENT: "CREATURE_OBJECT_AUGMENT",
  BEAUTY_CLEANUP: "BEAUTY_CLEANUP",
  GENERAL_VFX: "GENERAL_VFX",
});

const TRACKING_MODES = Object.freeze([
  "NONE",
  "CAMERA",
  "OBJECT",
  "PLANAR",
  "POINT",
]);

const SIMULATION_HEAVY = /\b(?:fluid|liquid|water simulation|ocean simulation|cloth simulation|destruction|fracture|rigid[- ]body|soft[- ]body|fire simulation|smoke simulation|pyro|explosion simulation|particle simulation)\b/i;
const SCREEN = /\b(?:screen|monitor|phone|tablet|display|billboard|sign replacement)\b/i;
const REMOVE = /\b(?:remove|removal|cleanup|clean up|erase|wire removal|object removal|blemish)\b/i;
const SET_EXTENSION = /\b(?:set extension|extend set|environment extension|digital matte|background extension)\b/i;
const ATMOSPHERE = /\b(?:fog|mist|haze|smoke|rain|snow|dust|atmospher)\b/i;
const LIGHT = /\b(?:lightning|glow|light effect|lens flare|interactive light|light wrap)\b/i;
const PARTICLE = /\b(?:particle|spark|embers|debris)\b/i;
const ENERGY = /\b(?:magic|energy|portal|beam|aura|supernatural)\b/i;
const CREATURE = /\b(?:creature|augment|digital object|cg object|object augment)\b/i;
const BEAUTY = /\b(?:beauty|skin cleanup|retouch|de[- ]?age|makeup cleanup)\b/i;
const GENERIC = /^(?:cinematic|realistic|premium|world[- ]class|vfx|visual effects?|effect|seamless|natural)$/i;

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value, limit = 4000) {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value).trim().slice(0, limit);
  }
  if (!value) return "";
  try {
    return JSON.stringify(value).slice(0, limit);
  } catch {
    return "";
  }
}

function upper(value) {
  return text(value, 300).toUpperCase().replace(/[ -]+/g, "_");
}

function firstObject(...values) {
  for (const value of values) {
    const candidate = object(value);
    if (Object.keys(candidate).length) return candidate;
  }
  return {};
}

function firstValue(...values) {
  for (const value of values) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value) && !value.length) continue;
    if (typeof value === "object" && !Array.isArray(value) && !Object.keys(value).length) continue;
    return value;
  }
  return null;
}

function issue(code, field, message, severity = "blocking") {
  return { code, field, message, severity };
}

function source(input = {}) {
  const requirements = object(input.requirements);
  const intent = object(input.intent);
  const generation = object(input.generation);
  const metadata = object(input.metadata);
  return {
    existing: firstObject(
      input.vfx_contract,
      requirements.vfx_contract,
      intent.vfx_contract,
      generation.vfx_contract,
      metadata.vfx_contract,
    ),
    vfx: firstValue(
      input.vfx,
      requirements.vfx,
      intent.vfx,
      generation.vfx,
      metadata.vfx,
    ),
    subject: firstValue(input.subject, requirements.subject, intent.subject, metadata.subject),
    action: firstValue(input.action, requirements.action, intent.action, metadata.action),
    frame_plan: firstObject(input.frame_plan, requirements.frame_plan, intent.frame_plan, metadata.frame_plan),
    camera: firstObject(input.camera, requirements.camera, intent.camera, metadata.camera),
    continuity: firstObject(input.continuity, requirements.continuity, intent.continuity, metadata.continuity),
    identity_requirements: firstValue(input.identity_requirements, requirements.identity_requirements, intent.identity_requirements),
    product_requirements: firstValue(input.product_requirements, requirements.product_requirements, intent.product_requirements),
    simulation_contract: firstObject(input.simulation_contract, requirements.simulation_contract, intent.simulation_contract, metadata.simulation_contract),
    frame_design: firstObject(input.frame_design, requirements.frame_design, intent.frame_design, metadata.frame_design),
    dp_intent: firstObject(input.dp_intent, requirements.dp_intent, intent.dp_intent, metadata.dp_intent),
    physical_world: firstObject(input.physical_world, requirements.physical_world, intent.physical_world, metadata.physical_world),
    visual_journey_state: firstObject(input.visual_journey_state, requirements.visual_journey_state, intent.visual_journey_state, metadata.visual_journey_state),
    execution_phase: text(input.execution_phase || metadata.execution_phase, 300),
  };
}

function entries(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean).map((item) => object(item));
  const obj = object(value);
  if (Array.isArray(obj.effects)) return obj.effects.filter(Boolean).map((item) => object(item));
  return Object.keys(obj).length ? [obj] : [];
}

function classify(effect = {}) {
  const explicit = upper(effect.effect_class || effect.class || effect.type);
  if (Object.values(EFFECT_CLASSES).includes(explicit)) return explicit;
  const combined = text([
    effect.effect,
    effect.intent,
    effect.description,
    effect.target,
    effect.type,
  ].join(" "), 4000);
  if (SCREEN.test(combined)) return EFFECT_CLASSES.SCREEN_REPLACEMENT;
  if (REMOVE.test(combined)) return EFFECT_CLASSES.CLEANUP_REMOVAL;
  if (SET_EXTENSION.test(combined)) return EFFECT_CLASSES.SET_EXTENSION;
  if (BEAUTY.test(combined)) return EFFECT_CLASSES.BEAUTY_CLEANUP;
  if (ATMOSPHERE.test(combined)) return EFFECT_CLASSES.ATMOSPHERIC;
  if (LIGHT.test(combined)) return EFFECT_CLASSES.LIGHTING_EFFECT;
  if (PARTICLE.test(combined)) return EFFECT_CLASSES.PARTICLE_EFFECT;
  if (ENERGY.test(combined)) return EFFECT_CLASSES.ENERGY_MAGIC;
  if (CREATURE.test(combined)) return EFFECT_CLASSES.CREATURE_OBJECT_AUGMENT;
  return EFFECT_CLASSES.GENERAL_VFX;
}

function trackingMode(effect = {}, effectClass) {
  const explicit = upper(effect.tracking_mode || effect.tracking?.mode || effect.track_mode);
  if (TRACKING_MODES.includes(explicit)) return explicit;
  if (effectClass === EFFECT_CLASSES.SCREEN_REPLACEMENT) return "PLANAR";
  if ([EFFECT_CLASSES.CLEANUP_REMOVAL, EFFECT_CLASSES.BEAUTY_CLEANUP].includes(effectClass)) {
    return "OBJECT";
  }
  return "NONE";
}

function temporal(effect = {}, framePlan = {}) {
  const sourceTemporal = object(effect.temporal || effect.lifecycle);
  return {
    entry: firstValue(effect.temporal_entry, sourceTemporal.entry, framePlan.opening_frame),
    progression: firstValue(effect.temporal_progression, sourceTemporal.progression, framePlan.progression),
    exit: firstValue(effect.temporal_exit, sourceTemporal.exit, framePlan.closing_frame),
  };
}

function continuityAnchors(continuity = {}) {
  return {
    identity: firstValue(continuity.identity, continuity.identity_anchor),
    product: firstValue(continuity.product, continuity.product_anchor),
    environment: firstValue(continuity.environment, continuity.location, continuity.environment_anchor),
    lighting: firstValue(continuity.lighting, continuity.lighting_anchor),
    spatial_orientation: firstValue(continuity.spatial_orientation, continuity.screen_direction),
  };
}

function normalizeEffect(effect = {}, src = {}, index = 0) {
  const effectClass = classify(effect);
  const mode = trackingMode(effect, effectClass);
  const timeline = temporal(effect, src.frame_plan);
  const intent = text(
    firstValue(effect.vfx_intent, effect.intent, effect.description, effect.effect),
    1800,
  );
  const target = text(
    firstValue(effect.target_subject, effect.target_region, effect.target, effect.region),
    1200,
  );
  const trackingTarget = text(
    firstValue(effect.tracking_target, effect.tracking?.target, target),
    1200,
  );
  const simulationDependency = effect.simulation_dependency === true || SIMULATION_HEAVY.test(intent);

  return {
    effect_id: text(effect.effect_id || effect.id, 300) || `vfx-${index + 1}`,
    effect_class: effectClass,
    vfx_intent: intent,
    target_subject_or_region: target,
    source_plate: firstValue(effect.source_plate, effect.plate, effect.source_reference, effect.reference_asset),
    tracking_mode: mode,
    tracking_target: trackingTarget || null,
    mask_roto_strategy: firstValue(effect.mask_roto_strategy, effect.mask, effect.roto, effect.matte_strategy),
    occlusion_depth_strategy: firstValue(effect.occlusion_depth_strategy, effect.occlusion, effect.depth_strategy),
    temporal_entry: timeline.entry,
    temporal_progression: timeline.progression,
    temporal_exit: timeline.exit,
    perspective_scale: firstValue(effect.perspective_scale, effect.perspective, effect.scale_match),
    motion_blur: firstValue(effect.motion_blur, effect.motion_blur_match),
    depth_of_field: firstValue(effect.depth_of_field, effect.dof, effect.focus_match),
    lighting_interaction: firstValue(effect.lighting_interaction, effect.light_interaction, effect.shadow_interaction),
    color_exposure_match: firstValue(effect.color_exposure_match, effect.color_match, effect.exposure_match),
    edge_integration: firstValue(effect.edge_integration, effect.edge_treatment, effect.edge_quality),
    grain_texture_match: firstValue(effect.grain_texture_match, effect.grain_match, effect.texture_match),
    cleanup_constraints: list(effect.cleanup_constraints || effect.constraints),
    continuity_anchors: continuityAnchors(src.continuity),
    physical_plausibility: firstValue(effect.physical_plausibility, effect.physics, effect.integration_physics),
    simulation_dependency: simulationDependency,
    simulation_contract_present: Object.keys(src.simulation_contract).length > 0,
    anti_artifact_constraints: [
      "No matte chatter, edge boiling, haloing, color spill, alpha fringe, tracking slip, scale pumping, perspective drift or temporal popping.",
      "Do not alter actor identity, facial geometry, anatomy, wardrobe, product geometry, logos, text, environment continuity or camera intent unless explicitly required by this effect.",
      "Preserve correct occlusion order, contact shadows, reflections, motion blur, depth of field, grain, exposure and color response for the photographed plate.",
      "No effect may teleport, disappear, duplicate, detach from its tracked surface, or change topology without explicit story authority.",
    ],
    provider_execution_order: [
      "PLATE_AND_TARGET_LOCK",
      "TRACKING_SOLVE",
      "MASK_ROTO_MATTE",
      "PERSPECTIVE_DEPTH_OCCLUSION",
      "EFFECT_TEMPORAL_BEHAVIOR",
      "LIGHTING_COLOR_INTERACTION",
      "MOTION_BLUR_DOF_GRAIN_INTEGRATION",
      "EDGE_ALPHA_CLEANUP",
      "TEMPORAL_AND_CONTINUITY_QC",
    ],
  };
}

function evaluateEffect(effect = {}) {
  const blockers = [];
  const warnings = [];
  if (!effect.vfx_intent || GENERIC.test(effect.vfx_intent)) {
    blockers.push(issue("VFX_INTENT_REQUIRED", "vfx_intent", "VFX must state the exact visible story/cleanup intent."));
  }
  if (!effect.target_subject_or_region) {
    blockers.push(issue("VFX_TARGET_REQUIRED", "target_subject_or_region", "VFX requires a precise target subject, surface or region."));
  }
  if (!effect.temporal_entry || !effect.temporal_progression || !effect.temporal_exit) {
    blockers.push(issue("VFX_TEMPORAL_LIFECYCLE_REQUIRED", "temporal", "VFX must define entry, progression and exit across time."));
  }
  if (effect.tracking_mode !== "NONE" && !effect.tracking_target) {
    blockers.push(issue("VFX_TRACKING_TARGET_REQUIRED", "tracking_target", "Tracked VFX requires an explicit tracking target."));
  }
  if (effect.effect_class === EFFECT_CLASSES.SCREEN_REPLACEMENT && effect.tracking_mode !== "PLANAR") {
    blockers.push(issue("VFX_SCREEN_PLANAR_TRACK_REQUIRED", "tracking_mode", "Screen replacement requires planar tracking/corner-pin authority."));
  }
  if (effect.effect_class === EFFECT_CLASSES.SCREEN_REPLACEMENT && !effect.mask_roto_strategy) {
    blockers.push(issue("VFX_SCREEN_MATTE_REQUIRED", "mask_roto_strategy", "Screen replacement requires an explicit matte/roto strategy."));
  }
  if (!effect.occlusion_depth_strategy && ![EFFECT_CLASSES.BEAUTY_CLEANUP].includes(effect.effect_class)) {
    blockers.push(issue("VFX_OCCLUSION_DEPTH_PLAN_REQUIRED", "occlusion_depth_strategy", "VFX requires foreground/background and occlusion-depth treatment."));
  }
  if (!effect.perspective_scale) blockers.push(issue("VFX_PERSPECTIVE_SCALE_REQUIRED", "perspective_scale", "VFX requires perspective and scale matching."));
  if (!effect.motion_blur) blockers.push(issue("VFX_MOTION_BLUR_MATCH_REQUIRED", "motion_blur", "VFX requires motion-blur matching to the plate."));
  if (!effect.depth_of_field) blockers.push(issue("VFX_DOF_MATCH_REQUIRED", "depth_of_field", "VFX requires depth-of-field/focus matching."));
  if (!effect.lighting_interaction) blockers.push(issue("VFX_LIGHTING_INTERACTION_REQUIRED", "lighting_interaction", "VFX requires lighting/shadow/reflection interaction authority."));
  if (!effect.color_exposure_match) blockers.push(issue("VFX_COLOR_EXPOSURE_MATCH_REQUIRED", "color_exposure_match", "VFX requires plate color/exposure matching."));
  if (!effect.edge_integration) blockers.push(issue("VFX_EDGE_INTEGRATION_REQUIRED", "edge_integration", "VFX requires edge/alpha integration treatment."));
  if (!effect.grain_texture_match) blockers.push(issue("VFX_GRAIN_TEXTURE_MATCH_REQUIRED", "grain_texture_match", "VFX requires grain/texture matching."));
  if (!effect.physical_plausibility) blockers.push(issue("VFX_PHYSICAL_PLAUSIBILITY_REQUIRED", "physical_plausibility", "VFX requires explicit physical plausibility constraints."));
  if (effect.simulation_dependency && !effect.simulation_contract_present) {
    blockers.push(issue("VFX_SIMULATION_CONTRACT_REQUIRED", "simulation_dependency", "Simulation-heavy VFX must wait for the governed simulation layer instead of faking dynamics."));
  }
  if (effect.cleanup_constraints.length > 8) {
    warnings.push(issue("VFX_CLEANUP_CONSTRAINT_OVERLOAD", "cleanup_constraints", "Too many simultaneous cleanup constraints increase integration risk.", "warning"));
  }
  return { blockers, warnings };
}

function author(input = {}) {
  const src = source(input);
  if (Object.keys(src.existing).length) return verify(input);
  const requested = entries(src.vfx);
  if (!requested.length) {
    return {
      contract: CONTRACT,
      applicable: false,
      status: "NOT_APPLICABLE",
      vfx_contract: null,
      blocking_issues: [],
      warnings: [],
    };
  }
  const effects = requested.map((effect, index) => normalizeEffect(effect, src, index));
  const decisions = effects.map(evaluateEffect);
  const blockingIssues = decisions.flatMap((decision) => decision.blockers);
  const warnings = decisions.flatMap((decision) => decision.warnings);
  const vfxContract = {
    contract: CONTRACT,
    version: 1,
    provider_neutral: true,
    provider_prompt_persisted: false,
    execution_authored: false,
    effects,
    global_continuity_anchors: continuityAnchors(src.continuity),
    cinematic_inheritance: {
      frame_design: src.frame_design,
      dp_intent: src.dp_intent,
      physical_world: src.physical_world,
      visual_journey_state: src.visual_journey_state,
      plate_camera_light_material_authority_preserved: true,
      provider_may_reinterpret_cinematography: false,
    },
    identity_geometry_mutation_forbidden_without_story_authority: true,
    product_geometry_mutation_forbidden_without_story_authority: true,
    generative_transition_morphing_forbidden: true,
    simulation_heavy_effects_require_simulation_contract: true,
  };
  return {
    contract: CONTRACT,
    applicable: true,
    status: blockingIssues.length ? "BLOCKED" : "READY",
    vfx_contract: vfxContract,
    blocking_issues: blockingIssues,
    warnings,
  };
}

function verify(input = {}) {
  const src = source(input);
  const existing = src.existing;
  if (!Object.keys(existing).length) {
    if (!entries(src.vfx).length) {
      return { contract: CONTRACT, applicable: false, status: "NOT_APPLICABLE", vfx_contract: null, blocking_issues: [], warnings: [] };
    }
    return {
      contract: CONTRACT,
      applicable: true,
      status: "BLOCKED",
      vfx_contract: null,
      blocking_issues: [issue("VFX_PREAUTHORED_CONTRACT_REQUIRED", "vfx_contract", "VFX must be authored in planning before execution; execution-time authorship is forbidden.")],
      warnings: [],
    };
  }
  const effects = list(existing.effects);
  const blockers = [];
  const warnings = [];
  if (text(existing.contract, 300) !== CONTRACT) {
    blockers.push(issue("VFX_CONTRACT_INVALID", "contract", `Expected ${CONTRACT}.`));
  }
  if (!effects.length) blockers.push(issue("VFX_EFFECTS_REQUIRED", "effects", "An applicable VFX contract requires at least one effect."));
  for (const effect of effects) {
    const result = evaluateEffect(effect);
    blockers.push(...result.blockers);
    warnings.push(...result.warnings);
  }
  return {
    contract: CONTRACT,
    applicable: true,
    status: blockers.length ? "BLOCKED" : "READY",
    vfx_contract: existing,
    blocking_issues: blockers,
    warnings,
  };
}

function assertReady(input = {}) {
  const result = verify(input);
  if (!result.applicable) return result;
  if (result.status !== "READY") {
    const codes = result.blocking_issues.map((item) => item.code).join(",");
    throw new Error(`CREATIVE_VFX_NOT_READY:${codes}`);
  }
  return result;
}

export const CreativeVfxRuntime = Object.freeze({
  contract: CONTRACT,
  effectClasses: EFFECT_CLASSES,
  author,
  verify,
  assertReady,
  provider_neutral: true,
  provider_prompt_persisted: false,
  execution_authorship_forbidden: true,
});

export const AVANTIQO_VFX_CONTRACT = CONTRACT;
