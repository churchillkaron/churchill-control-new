const CONTRACT = "AVANTIQO_SIMULATION_V1";

const SIMULATION_CLASSES = Object.freeze({
  RIGID_BODY: "RIGID_BODY",
  DEFORMABLE_CLOTH: "DEFORMABLE_CLOTH",
  DEFORMABLE_SOFT_BODY: "DEFORMABLE_SOFT_BODY",
  LIQUID_FLUID: "LIQUID_FLUID",
  PYRO_SMOKE_FIRE: "PYRO_SMOKE_FIRE",
  PARTICLE_GRANULAR: "PARTICLE_GRANULAR",
  DESTRUCTION_FRACTURE: "DESTRUCTION_FRACTURE",
  HAIR_FUR: "HAIR_FUR",
});

const SIMULATION_HEAVY = /\b(?:fluid|liquid|water simulation|ocean simulation|cloth simulation|fabric simulation|destruction|fracture|rigid[- ]body|soft[- ]body|deformable|fire simulation|smoke simulation|pyro|explosion simulation|particle simulation|granular simulation|sand simulation|hair simulation|fur simulation)\b/i;
const CLOTH = /\b(?:cloth|fabric|garment|flag|curtain|drape|cape|tarp)\b/i;
const SOFT = /\b(?:soft[- ]body|deformable|flesh|rubber|gel|foam deformation|elastic body)\b/i;
const LIQUID = /\b(?:fluid|liquid|water|ocean|wave|splash|pour|spill|foam|viscosity|lava|mud)\b/i;
const PYRO = /\b(?:pyro|fire|flame|smoke|combust|explosion|fireball|soot)\b/i;
const DESTRUCTION = /\b(?:destruction|fracture|shatter|collapse|break apart|crumble|debris field)\b/i;
const PARTICLE = /\b(?:particle|granular|sand|dust|snow|spark|embers|ash|gravel)\b/i;
const HAIR = /\b(?:hair|fur|strand|mane)\b/i;
const RIGID = /\b(?:rigid[- ]body|collision|bounce|roll|slide|falling object|projectile|joint|hinge|stack)\b/i;
const GENERIC = /^(?:simulation|physics|physical|realistic|cinematic|world[- ]class|natural|premium)$/i;

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value, limit = 5000) {
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
      input.simulation_contract,
      requirements.simulation_contract,
      intent.simulation_contract,
      generation.simulation_contract,
      metadata.simulation_contract_data,
    ),
    simulation: firstValue(
      input.simulation,
      requirements.simulation,
      intent.simulation,
      generation.simulation,
      metadata.simulation,
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
    location: firstValue(input.location, requirements.location, intent.location, metadata.location),
    execution_phase: text(input.execution_phase || metadata.execution_phase, 300),
  };
}

function entries(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean).map((item) => object(item));
  const candidate = object(value);
  if (Array.isArray(candidate.simulations)) {
    return candidate.simulations.filter(Boolean).map((item) => object(item));
  }
  if (Array.isArray(candidate.effects)) {
    return candidate.effects.filter(Boolean).map((item) => object(item));
  }
  return Object.keys(candidate).length ? [candidate] : [];
}

function vfxDerivedRequests(vfx) {
  return entries(vfx)
    .filter((effect) => effect.simulation_dependency === true || SIMULATION_HEAVY.test(text([
      effect.vfx_intent,
      effect.intent,
      effect.description,
      effect.effect,
      effect.type,
    ].join(" "), 5000)))
    .map((effect, index) => ({
      simulation_id: effect.simulation_id || `vfx-simulation-${index + 1}`,
      simulation_intent:
        effect.simulation_intent ||
        effect.vfx_intent ||
        effect.intent ||
        effect.description ||
        effect.effect ||
        effect.type,
      simulation_class: effect.simulation_class || effect.physics_class || null,
      target: effect.target_subject || effect.target_region || effect.target || effect.region || null,
      source_or_emitter: effect.source_or_emitter || effect.source || effect.emitter || effect.target || null,
      causal_trigger: effect.causal_trigger || effect.trigger || null,
      temporal_entry: effect.temporal_entry || effect.temporal?.entry || null,
      temporal_progression: effect.temporal_progression || effect.temporal?.progression || null,
      temporal_exit: effect.temporal_exit || effect.temporal?.exit || null,
      environment_coupling: effect.environment_coupling || effect.physical_plausibility || effect.physics || null,
      collision_geometry: effect.collision_geometry || effect.occlusion_depth_strategy || null,
      material_response: effect.material_response || effect.physical_plausibility || null,
      derived_from_vfx: true,
      source_vfx_effect_id: effect.effect_id || effect.id || null,
    }));
}

function classify(request = {}) {
  const explicit = upper(request.simulation_class || request.class || request.type || request.physics_class);
  if (Object.values(SIMULATION_CLASSES).includes(explicit)) return explicit;
  const combined = text([
    request.simulation_intent,
    request.intent,
    request.description,
    request.effect,
    request.type,
  ].join(" "), 5000);
  if (DESTRUCTION.test(combined)) return SIMULATION_CLASSES.DESTRUCTION_FRACTURE;
  if (CLOTH.test(combined)) return SIMULATION_CLASSES.DEFORMABLE_CLOTH;
  if (SOFT.test(combined)) return SIMULATION_CLASSES.DEFORMABLE_SOFT_BODY;
  if (LIQUID.test(combined)) return SIMULATION_CLASSES.LIQUID_FLUID;
  if (PYRO.test(combined)) return SIMULATION_CLASSES.PYRO_SMOKE_FIRE;
  if (HAIR.test(combined)) return SIMULATION_CLASSES.HAIR_FUR;
  if (PARTICLE.test(combined)) return SIMULATION_CLASSES.PARTICLE_GRANULAR;
  if (RIGID.test(combined)) return SIMULATION_CLASSES.RIGID_BODY;
  return SIMULATION_CLASSES.RIGID_BODY;
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

function solverFamily(simulationClass) {
  switch (simulationClass) {
    case SIMULATION_CLASSES.LIQUID_FLUID:
      return "PARTICLE_GRID_OR_EQUIVALENT_FREE_SURFACE_FLUID";
    case SIMULATION_CLASSES.PYRO_SMOKE_FIRE:
      return "SPARSE_OR_ADAPTIVE_VOLUME_ADVECTION_COMBUSTION";
    case SIMULATION_CLASSES.DEFORMABLE_CLOTH:
      return "CONSTRAINT_OR_DEFORMABLE_SURFACE_SOLVER";
    case SIMULATION_CLASSES.DEFORMABLE_SOFT_BODY:
      return "DEFORMABLE_VOLUME_OR_SOFT_BODY_SOLVER";
    case SIMULATION_CLASSES.PARTICLE_GRANULAR:
      return "PARTICLE_OR_GRANULAR_DYNAMICS_SOLVER";
    case SIMULATION_CLASSES.DESTRUCTION_FRACTURE:
      return "RIGID_BODY_FRACTURE_CONSTRAINT_SOLVER";
    case SIMULATION_CLASSES.HAIR_FUR:
      return "STRAND_CONSTRAINT_DYNAMICS_SOLVER";
    default:
      return "RIGID_BODY_COLLISION_CONSTRAINT_SOLVER";
  }
}

function classRequirements(request = {}, simulationClass) {
  switch (simulationClass) {
    case SIMULATION_CLASSES.DEFORMABLE_CLOTH:
      return {
        attachment_and_pins: firstValue(request.attachment_and_pins, request.attachments, "Preserve physically anchored attachment points; unpinned regions may move only through forces, inertia and collisions."),
        stretch_bend_shear: firstValue(request.stretch_bend_shear, request.stiffness, "Use material-consistent stretch, bend and shear resistance; no rubber-sheet stretching unless canonically required."),
        self_collision: firstValue(request.self_collision, "Prevent cloth self-intersection and tunneling through the wearer, props and environment."),
        aerodynamic_response: firstValue(request.aerodynamic_response, request.wind_response, "Wind and drag response must follow the shot's actual force direction and relative motion."),
      };
    case SIMULATION_CLASSES.DEFORMABLE_SOFT_BODY:
      return {
        deformation_model: firstValue(request.deformation_model, request.elasticity, "Use material-consistent deformation under contact and load."),
        volume_preservation: firstValue(request.volume_preservation, "Preserve plausible volume and surface continuity unless compression or tearing is explicitly authorized."),
        recovery_and_damping: firstValue(request.recovery_and_damping, request.damping, "Deformation recovery and damping must follow the visible material; no jelly oscillation unless physically justified."),
      };
    case SIMULATION_CLASSES.LIQUID_FLUID:
      return {
        density_and_viscosity: firstValue(request.density_and_viscosity, request.viscosity, "Use the visible liquid's real-world density/viscosity class; water-like liquids must not move like syrup and vice versa."),
        volume_continuity: firstValue(request.volume_continuity, "Preserve liquid volume/incompressibility to the extent visible; no unexplained gain, loss or teleportation of fluid mass."),
        surface_response: firstValue(request.surface_response, request.surface_tension, "Resolve free-surface breakup, splash, foam and surface tension at the shot's visible scale without boiling/noise artifacts."),
        wetting_and_collision: firstValue(request.wetting_and_collision, "Liquid must collide with and flow around canonical geometry; contact, pooling and runoff must respect gravity and boundaries."),
      };
    case SIMULATION_CLASSES.PYRO_SMOKE_FIRE:
      return {
        source_fields: firstValue(request.source_fields, "Source density/flame/heat and velocity only from the canonical emitter or ignition region."),
        buoyancy_advection: firstValue(request.buoyancy_advection, "Smoke, hot gases and flame motion must show coherent velocity advection and temperature/buoyancy response."),
        combustion_or_emission: firstValue(request.combustion_or_emission, request.combustion, "Combustion/emission intensity follows the causal source; no detached fire or smoke appearing without source continuity."),
        dissipation_turbulence: firstValue(request.dissipation_turbulence, "Dissipation, disturbance and turbulence may add detail but may not reverse causal flow or create frame-to-frame noise boiling."),
      };
    case SIMULATION_CLASSES.PARTICLE_GRANULAR:
      return {
        emission_and_lifetime: firstValue(request.emission_and_lifetime, request.emission, "Particles originate from the canonical source with coherent birth, advection, collision and death/settling behavior."),
        mass_size_distribution: firstValue(request.mass_size_distribution, "Particle size and apparent mass remain stable and appropriate to the visible material and shot scale."),
        drag_and_collision: firstValue(request.drag_and_collision, "Gravity, drag and collisions determine trajectories; no synchronized or weightless swarm motion unless explicitly motivated."),
      };
    case SIMULATION_CLASSES.DESTRUCTION_FRACTURE:
      return {
        fracture_topology: firstValue(request.fracture_topology, "Fracture begins at physically plausible stress/impact regions and preserves recognizable source-object topology until breakage."),
        constraint_strength: firstValue(request.constraint_strength, "Unbroken regions remain constrained until the canonical force/strain exceeds their plausible strength."),
        trigger_and_strain: firstValue(request.trigger_and_strain, request.causal_trigger, "Fracture requires a visible causal trigger; no spontaneous breakage or pre-trigger debris."),
        secondary_debris: firstValue(request.secondary_debris, "Debris inherits momentum from the break event, collides with the environment and settles under gravity; secondary dust must remain source-coupled."),
      };
    case SIMULATION_CLASSES.HAIR_FUR:
      return {
        root_attachment: firstValue(request.root_attachment, "Hair/fur roots remain attached to the canonical subject with no scalp or surface sliding."),
        strand_response: firstValue(request.strand_response, "Strand bend, inertia, drag and damping follow head/body motion and environmental forces without synchronized sheet motion."),
        collision_response: firstValue(request.collision_response, "Strands respect body, garment and environment collisions and recover without clipping or explosive separation."),
      };
    default:
      return {
        mass_and_inertia: firstValue(request.mass_and_inertia, request.mass, "Mass, center of mass and rotational inertia must match the object's visible size, shape and material."),
        friction_and_restitution: firstValue(request.friction_and_restitution, request.friction, request.restitution, "Static/dynamic friction and restitution must match the contacting materials; no frictionless sliding or super-elastic bounce unless specified."),
        constraints_and_joints: firstValue(request.constraints_and_joints, request.constraints, "Preserve canonical joints, hinges, supports and locked degrees of freedom; unconstrained bodies respond only to forces and contact."),
      };
  }
}

function normalizeSimulation(request = {}, src = {}, index = 0) {
  const simulationClass = classify(request);
  const intent = text(firstValue(
    request.simulation_intent,
    request.intent,
    request.description,
    request.effect,
    request.type,
  ), 2200);
  const target = text(firstValue(
    request.target_subject_or_region,
    request.target_subject,
    request.target_region,
    request.target,
    src.subject,
  ), 1400);
  const sourceOrEmitter = firstValue(
    request.source_or_emitter,
    request.source,
    request.emitter,
    request.source_geometry,
    target,
  );
  const causalTrigger = firstValue(
    request.causal_trigger,
    request.trigger,
    request.force_event,
    src.action,
    intent ? `The canonical story event initiates only this simulation: ${intent}` : null,
  );
  const temporalEntry = firstValue(request.temporal_entry, request.temporal?.entry, src.frame_plan.opening_frame);
  const temporalProgression = firstValue(request.temporal_progression, request.temporal?.progression, src.frame_plan.progression, src.action);
  const temporalExit = firstValue(request.temporal_exit, request.temporal?.exit, request.settle_state, src.frame_plan.closing_frame);
  const collisionGeometry = firstValue(
    request.collision_geometry,
    request.colliders,
    request.collision,
    `Use canonical visible geometry around ${target || "the simulation"} as collision authority; no phantom or missing colliders.`,
  );
  const environmentCoupling = firstValue(
    request.environment_coupling,
    request.environment_interaction,
    request.physical_plausibility,
    `Couple the simulation to gravity, canonical colliders, moving subjects/props and environmental forces that are actually present in the shot.`,
  );
  const materialResponse = firstValue(
    request.material_response,
    request.material_properties,
    request.material,
    `Infer material behavior only from canonical visible material/identity references and preserve it consistently through the shot; do not use generic weightless dynamics.`,
  );
  const scaleAndUnits = firstValue(
    request.scale_and_units,
    request.scene_scale,
    request.units,
    "Use canonical real-world scene scale with SI-consistent relative units; all gravity, velocity, mass, collision thickness and solver resolution must be evaluated at that same scale.",
  );
  const solver = object(request.solver_requirements || request.solver);
  const classSpecific = classRequirements(request, simulationClass);
  return {
    simulation_id: text(request.simulation_id || request.id, 300) || `simulation-${index + 1}`,
    simulation_class: simulationClass,
    simulation_intent: intent,
    target_subject_or_region: target,
    source_or_emitter: sourceOrEmitter,
    causal_trigger: causalTrigger,
    initial_state: firstValue(request.initial_state, request.entry_state, temporalEntry),
    temporal_entry: temporalEntry,
    temporal_progression: temporalProgression,
    temporal_exit_or_settle: temporalExit,
    scale_and_units: scaleAndUnits,
    gravity_and_external_forces: firstValue(
      request.gravity_and_external_forces,
      request.forces,
      request.gravity,
      "Use real-world gravity direction unless the canonical story explicitly overrides it; every additional force must have a visible or story-authorized source, direction and duration.",
    ),
    collision_geometry: collisionGeometry,
    material_response: materialResponse,
    boundary_conditions: firstValue(
      request.boundary_conditions,
      request.boundaries,
      "Respect canonical scene boundaries, openings, floors, walls, containers and moving collision geometry; no invisible walls or boundary leaks.",
    ),
    interaction_targets: list(request.interaction_targets || request.interactions),
    environment_coupling: environmentCoupling,
    solver_requirements: {
      method_family: text(solver.method_family || solver.family, 500) || solverFamily(simulationClass),
      time_step_and_substeps: firstValue(
        solver.time_step_and_substeps,
        solver.time_step,
        solver.substeps,
        "Use a timestep/substep strategy fine enough to prevent visible tunneling, explosive constraints, temporal jitter and unstable contacts at the shot's fastest motion.",
      ),
      spatial_resolution: firstValue(
        solver.spatial_resolution,
        solver.resolution,
        "Use simulation resolution sufficient for the smallest story-relevant visible feature; adaptive/sparse computation is allowed only when it preserves interactions at active boundaries.",
      ),
      stable_replay: firstValue(
        solver.stable_replay,
        solver.cache,
        "Prefer deterministic seed/state and cache/replay semantics where the execution backend supports them so approved dynamics do not drift between passes.",
      ),
    },
    class_requirements: classSpecific,
    camera_observability: firstValue(
      request.camera_observability,
      `Prioritize physically correct behavior where visible to the approved camera while preserving off-frame state needed to re-enter frame without teleportation or discontinuity.`,
    ),
    continuity_anchors: continuityAnchors(src.continuity),
    source_vfx_effect_id: request.source_vfx_effect_id || null,
    derived_from_vfx: request.derived_from_vfx === true,
    anti_artifact_constraints: [
      "No simulation teleportation, frame-to-frame state reset, collision tunneling, interpenetration, weightless motion, unexplained energy gain, source drift, topology popping or solver jitter.",
      "No simulated material may change apparent density, scale, mass class, viscosity, stiffness or collision behavior between frames without a physical cause.",
      "Preserve actor identity, anatomy, product geometry, logos, text, camera intent and environment continuity unless the canonical simulation specifically authorizes a physical deformation or fracture.",
      "Simulation state must evolve causally from the previous frame and must settle, dissipate or continue according to forces and material behavior rather than stopping arbitrarily at the cut.",
    ],
    provider_execution_order: [
      "SCALE_MATERIAL_AND_INITIAL_STATE",
      "SOURCE_TRIGGER_AND_BOUNDARY_SETUP",
      "COLLIDERS_CONSTRAINTS_AND_INTERACTIONS",
      "FORCES_GRAVITY_AND_SOLVER_STABILITY",
      "CLASS_SPECIFIC_DYNAMICS",
      "TEMPORAL_EVOLUTION_AND_SETTLING",
      "CAMERA_OBSERVABILITY_AND_ENVIRONMENT_COUPLING",
      "PHYSICS_AND_CONTINUITY_QC",
    ],
  };
}

function evaluateSimulation(simulation = {}) {
  const blockers = [];
  const warnings = [];
  if (!simulation.simulation_intent || GENERIC.test(simulation.simulation_intent)) {
    blockers.push(issue("SIMULATION_INTENT_REQUIRED", "simulation_intent", "Simulation must state the exact visible physical story behavior."));
  }
  if (!simulation.target_subject_or_region) {
    blockers.push(issue("SIMULATION_TARGET_REQUIRED", "target_subject_or_region", "Simulation requires a precise affected subject, material, emitter or region."));
  }
  if (!simulation.source_or_emitter) {
    blockers.push(issue("SIMULATION_SOURCE_REQUIRED", "source_or_emitter", "Simulation requires a physical source/emitter or simulated body."));
  }
  if (!simulation.causal_trigger) {
    blockers.push(issue("SIMULATION_CAUSAL_TRIGGER_REQUIRED", "causal_trigger", "Simulation must have a causal trigger or initial dynamic state."));
  }
  if (!simulation.temporal_entry || !simulation.temporal_progression || !simulation.temporal_exit_or_settle) {
    blockers.push(issue("SIMULATION_TEMPORAL_EVOLUTION_REQUIRED", "temporal", "Simulation must define entry, progression and exit/settling state."));
  }
  if (!simulation.scale_and_units) blockers.push(issue("SIMULATION_SCALE_REQUIRED", "scale_and_units", "Simulation requires a single coherent scene scale/units contract."));
  if (!simulation.gravity_and_external_forces) blockers.push(issue("SIMULATION_FORCES_REQUIRED", "gravity_and_external_forces", "Simulation requires gravity/external force authority."));
  if (!simulation.collision_geometry) blockers.push(issue("SIMULATION_COLLISION_GEOMETRY_REQUIRED", "collision_geometry", "Simulation requires canonical collision geometry."));
  if (!simulation.material_response) blockers.push(issue("SIMULATION_MATERIAL_RESPONSE_REQUIRED", "material_response", "Simulation requires material response authority."));
  if (!simulation.boundary_conditions) blockers.push(issue("SIMULATION_BOUNDARIES_REQUIRED", "boundary_conditions", "Simulation requires boundary conditions."));
  if (!simulation.environment_coupling) blockers.push(issue("SIMULATION_ENVIRONMENT_COUPLING_REQUIRED", "environment_coupling", "Simulation requires environment interaction/coupling."));
  if (!text(simulation.solver_requirements?.method_family, 500)) blockers.push(issue("SIMULATION_SOLVER_FAMILY_REQUIRED", "solver_requirements.method_family", "Simulation requires a provider-neutral solver method family."));
  if (!simulation.solver_requirements?.time_step_and_substeps) blockers.push(issue("SIMULATION_TIMESTEP_REQUIRED", "solver_requirements.time_step_and_substeps", "Simulation requires timestep/substep stability authority."));
  if (!simulation.solver_requirements?.spatial_resolution) blockers.push(issue("SIMULATION_RESOLUTION_REQUIRED", "solver_requirements.spatial_resolution", "Simulation requires spatial resolution authority."));
  if (!Object.keys(object(simulation.class_requirements)).length) blockers.push(issue("SIMULATION_CLASS_REQUIREMENTS_REQUIRED", "class_requirements", "Simulation requires class-specific physical constraints."));
  if (list(simulation.interaction_targets).length > 12) {
    warnings.push(issue("SIMULATION_INTERACTION_COMPLEXITY_HIGH", "interaction_targets", "Large simultaneous interaction sets increase solver and continuity risk; split only if the story permits it.", "warning"));
  }
  return { blockers, warnings };
}

function requestedSimulations(src = {}) {
  const explicit = entries(src.simulation);
  const derived = vfxDerivedRequests(src.vfx);
  if (!explicit.length) return derived;
  if (!derived.length) return explicit;
  const explicitIds = new Set(explicit.map((item) => text(item.source_vfx_effect_id || item.vfx_effect_id || item.id, 300)).filter(Boolean));
  return [
    ...explicit,
    ...derived.filter((item) => !item.source_vfx_effect_id || !explicitIds.has(text(item.source_vfx_effect_id, 300))),
  ];
}

function author(input = {}) {
  const src = source(input);
  if (Object.keys(src.existing).length) return verify(input);
  const requested = requestedSimulations(src);
  if (!requested.length) {
    return {
      contract: CONTRACT,
      applicable: false,
      status: "NOT_APPLICABLE",
      simulation_contract: null,
      blocking_issues: [],
      warnings: [],
    };
  }
  const simulations = requested.map((request, index) => normalizeSimulation(request, src, index));
  const decisions = simulations.map(evaluateSimulation);
  const blockingIssues = decisions.flatMap((decision) => decision.blockers);
  const warnings = decisions.flatMap((decision) => decision.warnings);
  const simulationContract = {
    contract: CONTRACT,
    version: 1,
    provider_neutral: true,
    provider_prompt_persisted: false,
    execution_authored: false,
    simulations,
    global_continuity_anchors: continuityAnchors(src.continuity),
    causal_frame_to_frame_state_required: true,
    scale_units_material_physics_locked: true,
    collision_and_environment_coupling_required: true,
    solver_or_generation_must_honor_same_observable_physics: true,
    aggregate_beauty_cannot_override_physics_failure: true,
    identity_anatomy_product_protected_outside_authorized_deformation: true,
  };
  return {
    contract: CONTRACT,
    applicable: true,
    status: blockingIssues.length ? "BLOCKED" : "READY",
    simulation_contract: simulationContract,
    blocking_issues: blockingIssues,
    warnings,
  };
}

function verify(input = {}) {
  const src = source(input);
  const existing = src.existing;
  const requested = requestedSimulations(src);
  if (!Object.keys(existing).length) {
    if (!requested.length) {
      return { contract: CONTRACT, applicable: false, status: "NOT_APPLICABLE", simulation_contract: null, blocking_issues: [], warnings: [] };
    }
    return {
      contract: CONTRACT,
      applicable: true,
      status: "BLOCKED",
      simulation_contract: null,
      blocking_issues: [issue("SIMULATION_PREAUTHORED_CONTRACT_REQUIRED", "simulation_contract", "Simulation must be authored in planning before execution; execution-time authorship is forbidden.")],
      warnings: [],
    };
  }
  const simulations = list(existing.simulations);
  const blockers = [];
  const warnings = [];
  if (text(existing.contract, 300) !== CONTRACT) {
    blockers.push(issue("SIMULATION_CONTRACT_INVALID", "contract", `Expected ${CONTRACT}.`));
  }
  if (!simulations.length) blockers.push(issue("SIMULATION_EFFECTS_REQUIRED", "simulations", "An applicable simulation contract requires at least one simulation."));
  for (const simulation of simulations) {
    const result = evaluateSimulation(simulation);
    blockers.push(...result.blockers);
    warnings.push(...result.warnings);
  }
  return {
    contract: CONTRACT,
    applicable: true,
    status: blockers.length ? "BLOCKED" : "READY",
    simulation_contract: existing,
    blocking_issues: blockers,
    warnings,
  };
}

function assertReady(input = {}) {
  const result = verify(input);
  if (!result.applicable) return result;
  if (result.status !== "READY") {
    const codes = result.blocking_issues.map((item) => item.code).join(",");
    throw new Error(`CREATIVE_SIMULATION_NOT_READY:${codes}`);
  }
  return result;
}

export const CreativeSimulationRuntime = Object.freeze({
  contract: CONTRACT,
  simulationClasses: SIMULATION_CLASSES,
  author,
  verify,
  assertReady,
  requestedSimulations,
  provider_neutral: true,
  provider_prompt_persisted: false,
  execution_authorship_forbidden: true,
});

export const AVANTIQO_SIMULATION_CONTRACT = CONTRACT;
