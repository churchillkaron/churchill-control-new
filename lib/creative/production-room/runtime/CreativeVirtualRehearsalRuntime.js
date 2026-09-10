import { CreativeShotPhysicalPreflightRuntime } from "../../quality/runtime/CreativeShotPhysicalPreflightRuntime.js";
import { CreativeSubjectMotionChoreographyRuntime } from "../../quality/runtime/CreativeSubjectMotionChoreographyRuntime.js";
import { CreativeVirtualCameraStateRuntime } from "../../quality/runtime/CreativeVirtualCameraStateRuntime.js";

export const CREATIVE_VIRTUAL_REHEARSAL_CONTRACT = "CREATIVE_VIRTUAL_REHEARSAL_V1";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function coverageFailures(coverage = {}) {
  const failures = [];
  const units = list(coverage.units);
  if (!units.length) failures.push("REHEARSAL_COVERAGE_UNIT_REQUIRED");
  const ids = new Set();
  for (const unit of units) {
    const id = text(unit.id);
    if (!id || ids.has(id)) failures.push("REHEARSAL_COVERAGE_UNIT_ID_INVALID");
    ids.add(id);
    if (!text(unit.purpose)) failures.push(`REHEARSAL_COVERAGE_PURPOSE_REQUIRED:${id || "unknown"}`);
    if (!text(unit.shared_action_state)) failures.push(`REHEARSAL_SHARED_ACTION_STATE_REQUIRED:${id || "unknown"}`);
    if (!text(unit.cut_opportunity)) failures.push(`REHEARSAL_CUT_OPPORTUNITY_REQUIRED:${id || "unknown"}`);
  }
  return failures;
}function lightingFailures(lighting = {}) {
  const failures = [];
  for (const key of ["motivated_sources", "shadow_behavior", "reflection_behavior", "surface_response", "continuity_rule"]) {
    const value = lighting[key];
    const valid = Array.isArray(value) ? value.length > 0 : text(value).length >= 12;
    if (!valid) failures.push(`REHEARSAL_LIGHTING_${key.toUpperCase()}_REQUIRED`);
  }
  return failures;
}

function editabilityFailures(editability = {}) {
  const failures = [];
  if (!text(editability.entry_state)) failures.push("REHEARSAL_EDIT_ENTRY_STATE_REQUIRED");
  if (!text(editability.exit_state)) failures.push("REHEARSAL_EDIT_EXIT_STATE_REQUIRED");
  if (list(editability.cut_points).length < 1) failures.push("REHEARSAL_EDIT_CUT_POINT_REQUIRED");
  if (!text(editability.failure_if_missing)) failures.push("REHEARSAL_EDIT_FAILURE_DEFINED_REQUIRED");
  return failures;
}

export function evaluateVirtualRehearsal({ shot = {}, coverage = {}, lighting_simulation = {}, editability = {} } = {}) {
  const physical = CreativeShotPhysicalPreflightRuntime.evaluate(shot);
  const motion = CreativeSubjectMotionChoreographyRuntime.evaluate(shot);
  const camera = CreativeVirtualCameraStateRuntime.evaluate(shot);
  const failures = [...new Set([
    ...physical.failures,
    ...motion.failures,
    ...camera.failures,
    ...coverageFailures(coverage),
    ...lightingFailures(lighting_simulation),
    ...editabilityFailures(editability),
  ])];
  return Object.freeze({
    contract: CREATIVE_VIRTUAL_REHEARSAL_CONTRACT,
    passed: failures.length === 0,
    failures,
    evidence: { physical, motion, camera, coverage: object(coverage), lighting_simulation: object(lighting_simulation), editability: object(editability) },
    zero_provider_calls: true,
    zero_media_generation: true,
  });
}

export const CreativeVirtualRehearsalRuntime = Object.freeze({
  contract: CREATIVE_VIRTUAL_REHEARSAL_CONTRACT,
  evaluate: evaluateVirtualRehearsal,
});