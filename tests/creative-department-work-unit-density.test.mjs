import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDepartmentBreakdown,
} from "../lib/creative/production-room/runtime/CreativeDepartmentBreakdownRuntime.js";

const active = (ids) => Object.fromEntries(
  ids.map((id) => [id, { status: "ACTIVE" }]),
);

test("complex shot expands into binding specialist department work units", () => {
  const result = buildDepartmentBreakdown({
    shots: [{
      id: "shot-1",
      purpose: "Helicopter crosses the offshore platform and reveals the moving threat.",
      action: "high-speed helicopter tracking pass",
      camera: { movement_path: "tracking orbit" },
      geography_claim: "North Sea",
      subject_class: "helicopter vehicle machinery",
      mechanical_truth: "rotor and drivetrain remain physically coherent",
      production_design: { environment: "offshore platform" },
      vfx: { compositing: ["CG extension"] },
      continuity_invariants: ["helicopter identity", "platform geography"],
    }],
    take_strategy: { max_takes_per_shot: 3 },
    role_decisions: active([
      "film_director",
      "director_of_photography",
      "production_designer",
      "editor",
      "sound_director",
      "previsualization_supervisor",
      "cg_asset_supervisor",
      "simulation_physics_supervisor",
      "tracking_roto_supervisor",
      "compositing_supervisor",
      "color_di_supervisor",
      "sound_design_supervisor",
      "mix_finishing_engineer",
      "post_production_supervisor",
      "action_motion_supervisor",
      "second_unit_director",
      "location_production_supervisor",
      "technical_subject_supervisor",
    ]),
  });

  assert.equal(result.passed, true);
  assert.ok(result.department_work_unit_count >= 14);
  assert.ok(result.average_department_work_units_per_shot >= 14);
  assert.equal(
    result.department_work_units.every((unit) =>
      unit.authority_binding === true &&
      unit.execution_authorized === false &&
      unit.approval_required_before_downstream_handoff === true
    ),
    true,
  );
});
