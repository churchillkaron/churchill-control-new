import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const runtime = read("lib/creative/simulation/runtime/CreativeSimulationRuntime.js");
const authoring = read("lib/creative/simulation/runtime/CreativeSimulationAuthoringRuntime.js");
const planning = read("lib/creative/simulation/runtime/CreativeSimulationPlanningBootstrap.js");
const execution = read("lib/creative/simulation/runtime/CreativeSimulationExecutionGate.js");
const qc = read("lib/creative/simulation/runtime/CreativeSimulationQualityGateBootstrap.js");
const vfx = read("lib/creative/vfx/runtime/CreativeVfxRuntime.js");
const bridge = read("lib/creative/quality/runtime/CreativePerceptualCandidateSelectionBridgeBootstrap.js");
const shot = read("lib/creative/shots/documents/Shot.js");
const instrumentation = read("instrumentation.js");

assert.match(runtime, /AVANTIQO_SIMULATION_V1/);
assert.match(runtime, /provider_neutral:\s*true/);
assert.match(runtime, /provider_prompt_persisted:\s*false/);
assert.match(runtime, /execution_authorship_forbidden:\s*true/);
assert.match(runtime, /causal_frame_to_frame_state_required:\s*true/);
assert.match(runtime, /scale_units_material_physics_locked:\s*true/);
assert.match(runtime, /collision_and_environment_coupling_required:\s*true/);
assert.match(runtime, /aggregate_beauty_cannot_override_physics_failure:\s*true/);

for (const simulationClass of [
  "RIGID_BODY",
  "DEFORMABLE_CLOTH",
  "DEFORMABLE_SOFT_BODY",
  "LIQUID_FLUID",
  "PYRO_SMOKE_FIRE",
  "PARTICLE_GRANULAR",
  "DESTRUCTION_FRACTURE",
  "HAIR_FUR",
]) {
  assert.match(runtime, new RegExp(simulationClass));
}

for (const field of [
  "simulation_intent",
  "target_subject_or_region",
  "source_or_emitter",
  "causal_trigger",
  "initial_state",
  "temporal_entry",
  "temporal_progression",
  "temporal_exit_or_settle",
  "scale_and_units",
  "gravity_and_external_forces",
  "collision_geometry",
  "material_response",
  "boundary_conditions",
  "environment_coupling",
  "solver_requirements",
  "time_step_and_substeps",
  "spatial_resolution",
  "class_requirements",
  "anti_artifact_constraints",
  "provider_execution_order",
]) {
  assert.match(runtime, new RegExp(field));
}

for (const blocker of [
  "SIMULATION_INTENT_REQUIRED",
  "SIMULATION_TARGET_REQUIRED",
  "SIMULATION_SOURCE_REQUIRED",
  "SIMULATION_CAUSAL_TRIGGER_REQUIRED",
  "SIMULATION_TEMPORAL_EVOLUTION_REQUIRED",
  "SIMULATION_SCALE_REQUIRED",
  "SIMULATION_FORCES_REQUIRED",
  "SIMULATION_COLLISION_GEOMETRY_REQUIRED",
  "SIMULATION_MATERIAL_RESPONSE_REQUIRED",
  "SIMULATION_BOUNDARIES_REQUIRED",
  "SIMULATION_ENVIRONMENT_COUPLING_REQUIRED",
  "SIMULATION_SOLVER_FAMILY_REQUIRED",
  "SIMULATION_TIMESTEP_REQUIRED",
  "SIMULATION_RESOLUTION_REQUIRED",
  "SIMULATION_CLASS_REQUIREMENTS_REQUIRED",
  "SIMULATION_PREAUTHORED_CONTRACT_REQUIRED",
]) {
  assert.match(runtime, new RegExp(blocker));
}

for (const physicalDetail of [
  "density_and_viscosity",
  "volume_continuity",
  "surface_response",
  "wetting_and_collision",
  "source_fields",
  "buoyancy_advection",
  "combustion_or_emission",
  "dissipation_turbulence",
  "attachment_and_pins",
  "stretch_bend_shear",
  "self_collision",
  "aerodynamic_response",
  "mass_and_inertia",
  "friction_and_restitution",
  "constraints_and_joints",
  "fracture_topology",
  "constraint_strength",
  "trigger_and_strain",
  "secondary_debris",
]) {
  assert.match(runtime, new RegExp(physicalDetail));
}

assert.match(runtime, /vfxDerivedRequests/);
assert.match(runtime, /derived_from_vfx:\s*true/);
assert.match(vfx, /VFX_SIMULATION_CONTRACT_REQUIRED/);
assert.match(vfx, /simulation_heavy_effects_require_simulation_contract:\s*true/);

assert.match(authoring, /AVANTIQO_SIMULATION_AUTHORING_V1/);
assert.match(authoring, /simulation_authored_before_materialization:\s*true/);
assert.match(authoring, /simulation_can_be_derived_from_vfx_dependency:\s*true/);
assert.match(planning, /AVANTIQO_SIMULATION_PLANNING_BOOTSTRAP_V1/);
assert.match(planning, /simulation_contracts_in_graph:\s*true/);
assert.match(planning, /simulation_execution_authorship_forbidden:\s*true/);
assert.match(execution, /AVANTIQO_SIMULATION_EXECUTION_GATE_V1/);
assert.match(execution, /CreativeSimulationRuntime\.assertReady/);
assert.match(execution, /simulation_verified_before_dispatch:\s*true/);
assert.match(execution, /simulation_execution_authored:\s*false/);
assert.match(execution, /fail_closed:\s*true/);

assert.match(qc, /AVANTIQO_SIMULATION_QC_V1/);
assert.match(qc, /AVANTIQO_SIMULATION_QC_SEAL_V1/);
assert.match(qc, /actual_rendered_frames_are_authority:\s*true/);
assert.match(qc, /aggregate_score_cannot_override_physics_failure:\s*true/);
assert.match(qc, /causal_frame_to_frame_state_required:\s*true/);
assert.match(qc, /collision_and_environment_coupling_fail_closed:\s*true/);
assert.match(qc, /material_scale_and_force_drift_forbidden:\s*true/);
assert.match(qc, /provider_calls_added:\s*0/);
assert.match(qc, /simulation_qc_sealed:\s*true/);
assert.match(qc, /simulation_qc_sealed:\s*false/);
assert.match(qc, /rejected_before_editing:\s*true/);

for (const dimension of [
  "causal_trigger_and_initial_state",
  "gravity_and_external_forces",
  "mass_scale_and_material_response",
  "collisions_and_constraints",
  "boundary_conditions",
  "temporal_state_evolution",
  "environment_coupling",
  "solver_stability_observable",
  "class_specific_dynamics",
  "continuity_and_settling",
]) {
  assert.match(qc, new RegExp(dimension));
}

for (const evidence of [
  "simulation_causal_valid",
  "gravity_force_response_valid",
  "mass_scale_material_valid",
  "collision_response_valid",
  "boundary_conditions_valid",
  "temporal_state_continuity_valid",
  "environment_coupling_valid",
  "solver_stability_valid",
  "class_specific_dynamics_valid",
  "simulation_settle_or_exit_valid",
  "simulation_teleportation_detected",
  "frame_state_reset_detected",
  "collision_tunneling_detected",
  "interpenetration_detected",
  "weightless_motion_detected",
  "unexplained_energy_gain_detected",
  "source_or_emitter_drift_detected",
  "topology_popping_detected",
  "solver_jitter_detected",
  "material_property_drift_detected",
]) {
  assert.match(qc, new RegExp(evidence));
}

assert.match(bridge, /AVANTIQO_SIMULATION_QC_V1/);
assert.match(bridge, /AVANTIQO_SIMULATION_QC_SEAL_V1/);
assert.match(bridge, /simulationQcPassed/);
assert.match(bridge, /shot_candidate_simulation_qc_passed/);
assert.match(bridge, /vfxPassed\s*&&\s*simulationPassed/);
assert.match(bridge, /include_in_master:\s*passed/);

assert.match(shot, /simulation:\s*structured\(data\.simulation\)/);
assert.match(shot, /simulation_intent_preserved:\s*true/);

const vfxPlanningIndex = instrumentation.indexOf("CreativeVfxPlanningBootstrap");
const simulationPlanningIndex = instrumentation.indexOf("CreativeSimulationPlanningBootstrap");
const materializationIndex = instrumentation.indexOf("CreativeProductionTaskMaterializationGraphRuntime");
const vfxQcIndex = instrumentation.indexOf("CreativeVfxQualityGateBootstrap");
const simulationQcIndex = instrumentation.indexOf("CreativeSimulationQualityGateBootstrap");
const continuityQcIndex = instrumentation.indexOf("CreativeContinuityQualityGateBootstrap");
const candidateIndex = instrumentation.indexOf("CreativePerceptualCandidateSelectionBridgeBootstrap");
assert.ok(vfxPlanningIndex >= 0);
assert.ok(simulationPlanningIndex > vfxPlanningIndex);
assert.ok(materializationIndex > simulationPlanningIndex);
assert.ok(vfxQcIndex > materializationIndex);
assert.ok(simulationQcIndex > vfxQcIndex);
assert.ok(continuityQcIndex > simulationQcIndex);
assert.ok(candidateIndex > continuityQcIndex);

console.log("AVANTIQO_STUDIO_SIMULATION_CONTRACT=PASS");
