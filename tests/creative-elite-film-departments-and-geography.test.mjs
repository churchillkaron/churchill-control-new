import assert from "node:assert/strict";
import test from "node:test";

import { creativeGeographyTruthFailures } from "../lib/creative/quality/runtime/CreativeGeographyTruthPreflightRuntime.js";
import { requiredEliteFilmDepartments, eliteFilmDepartmentActivationFailures } from "../lib/creative/director/runtime/CreativeEliteFilmDepartmentActivationRuntime.js";

function decisions(active = []) {
  return Object.fromEntries(active.map((id) => [id, { status: "ACTIVE" }]));
}

test("named geography rejects generic water city and beach substitutes", () => {
  const failures = creativeGeographyTruthFailures({
    geography_claim: "Wall Street, Manhattan, New York",
    geography_signature: {
      recognition_anchors: ["city", "street"],
      forbidden_generic_substitutes: ["generic skyline"],
      recognition_test: "Viewer should know this is the exact claimed district from visible evidence.",
    },
  });
  assert.ok(failures.includes("SHOT_GEOGRAPHY_GENERIC_ANCHOR_FORBIDDEN"));
  assert.ok(failures.includes("SHOT_GEOGRAPHY_CLAIM_NOT_BOUND_TO_VISIBLE_ANCHOR"));
});
test("place-specific anchors can bind a named geography claim", () => {
  const failures = creativeGeographyTruthFailures({
    geography_claim: "Wall Street, Manhattan, New York",
    geography_signature: {
      recognition_anchors: ["Wall Street street-sign geometry and canyon", "New York Stock Exchange facade on Broad Street"],
      forbidden_generic_substitutes: ["generic finance skyline", "anonymous office district"],
      recognition_test: "An uninformed viewer can identify Lower Manhattan from the named street geometry and NYSE facade.",
    },
  });
  assert.deepEqual(failures, []);
});

test("complex premium temporal work activates real specialist departments", () => {
  const plan = {
    deliverables: [{ output_spec: { duration_seconds: 60 } }],
    scenes: [{ shots: [{
      geography_claim: "North Sea",
      subject_class: "Heavy offshore helicopter with twin engines, articulated rotor and wheeled landing gear",
      mechanical_truth: "Rotor mast, transmission, engines and wheeled landing gear remain physically connected.",
      production_design: { environment: "offshore platform" },
      vfx: { compositing: ["integrate helicopter plate with platform extension"] },
      source_bindings: [{ role: "plate" }],
    }] }],
  };
  const required = requiredEliteFilmDepartments(plan);
  for (const role of [
    "production_designer", "location_production_supervisor", "previsualization_supervisor",
    "post_production_supervisor", "color_di_supervisor", "sound_design_supervisor",
    "mix_finishing_engineer", "cg_asset_supervisor", "tracking_roto_supervisor",
    "compositing_supervisor", "simulation_physics_supervisor",
  ]) assert.ok(required.includes(role), role);
});
test("required elite departments cannot be opted out", () => {
  const plan = {
    deliverables: [{ output_spec: { duration_seconds: 90 } }],
    role_decisions: decisions(["production_designer"]),
    scenes: [{ shots: [{
      geography_claim: "Phuket, Thailand",
      subject_class: "Industrial vehicle and articulated machinery in operation",
      mechanical_truth: "Machine joints, load paths and moving assemblies remain physically plausible.",
      production_design: { environment: "working industrial exterior" },
      vfx: { compositing: ["source plate integration"] },
      source_bindings: [{ role: "plate" }],
    }] }],
  };
  const failures = eliteFilmDepartmentActivationFailures(plan);
  assert.ok(failures.includes("ELITE_FILM_DEPARTMENT_REQUIRED:location_production_supervisor"));
  assert.ok(failures.includes("ELITE_FILM_DEPARTMENT_REQUIRED:previsualization_supervisor"));
  assert.ok(failures.includes("ELITE_FILM_DEPARTMENT_REQUIRED:compositing_supervisor"));
  assert.ok(failures.includes("ELITE_FILM_DEPARTMENT_REQUIRED:simulation_physics_supervisor"));
});
