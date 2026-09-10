import crypto from "node:crypto";

import { CreativeShotPhysicalPreflightRuntime } from "./CreativeShotPhysicalPreflightRuntime.js";
import { CreativeGeographyTruthPreflightRuntime } from "./CreativeGeographyTruthPreflightRuntime.js";
import { CreativeSubjectMotionChoreographyRuntime } from "./CreativeSubjectMotionChoreographyRuntime.js";
import { CreativeVirtualCameraStateRuntime } from "./CreativeVirtualCameraStateRuntime.js";
import { CreativeTechnicalSubjectTruthRuntime } from "./CreativeTechnicalSubjectTruthRuntime.js";

const CONTRACT = "CREATIVE_SHOT_PREVISUALIZATION_BLUEPRINT_V1";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}
function blueprintPayload(shot = {}) {
  return {
    shot_id: shot.id || null,
    duration_seconds: Number(shot.duration_seconds || 0) || null,
    reveal_stage: shot.reveal_stage || null,
    mystery_function: shot.mystery_function || null,
    subject_class: shot.subject_class || null,
    subject_signature: object(shot.subject_signature),
    hero_asset_truth: object(shot.hero_asset_truth),
    technical_truth_evidence: object(shot.technical_truth_evidence),
    subject_identity_key: shot.subject_identity_key || null,
    world_identity_key: shot.world_identity_key || null,
    mechanical_truth: shot.mechanical_truth || null,
    mechanical_signature: object(shot.mechanical_signature),
    world_geometry_anchor: shot.world_geometry_anchor || null,
    world_topology: list(shot.world_topology),
    geography_claim: shot.geography_claim || "NONE",
    geography_proof: list(shot.geography_proof),
    geography_signature: object(shot.geography_signature),
    frame_plan: object(shot.frame_plan),
    camera: object(shot.camera),
    virtual_camera_state: object(shot.virtual_camera_state),
    subject_motion_choreography: object(shot.subject_motion_choreography),
    lighting: object(shot.lighting),
    production_design: object(shot.production_design),
    continuity_invariants: list(shot.continuity_invariants),
    transition_in: shot.transition_in || null,
    transition_out: shot.transition_out || null,
    vfx: shot.vfx || {},
  };
}

export function buildShotPrevisualizationBlueprint(shot = {}) {
  const physical = CreativeShotPhysicalPreflightRuntime.evaluate(shot);
  const geography = CreativeGeographyTruthPreflightRuntime.evaluate(shot);
  const subjectMotion = CreativeSubjectMotionChoreographyRuntime.evaluate(shot);
  const virtualCamera = CreativeVirtualCameraStateRuntime.evaluate(shot);
  const technicalTruth = CreativeTechnicalSubjectTruthRuntime.evaluate(shot);
  const payload = blueprintPayload(shot);
  const failures = [...new Set([...physical.failures, ...geography.failures, ...subjectMotion.failures, ...virtualCamera.failures, ...technicalTruth.failures])];
  return Object.freeze({
    contract: CONTRACT,
    passed: failures.length === 0,
    failures,
    blueprint_digest: digest({ contract: CONTRACT, payload }),
    payload,
    zero_provider_calls: true,
    zero_media_generation: true,
  });
}

export const CreativeShotPrevisualizationBlueprintRuntime = Object.freeze({
  contract: CONTRACT,
  build: buildShotPrevisualizationBlueprint,
});
