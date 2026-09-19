import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  evaluateEditorialCausality,
} from "../lib/creative/post-production/runtime/CreativeEditorialCausalityRuntime.js";

const temporal = fs.readFileSync("lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime.js", "utf8");
const assembly = fs.readFileSync("lib/creative/post-production/runtime/CreativeEditorialAssemblyRuntime.js", "utf8");
const review = fs.readFileSync("lib/creative/review/runtime/CreativeEditReviewRuntime.js", "utf8");
const planner = fs.readFileSync("lib/creative/production-graph/planner/ProductionGraphPlanner.js", "utf8");

test("editorial causality blocks random angle changes", () => {
  const result = evaluateEditorialCausality({
    scene: { objective: "Hunt sequence" },
    shots: [
      { id: "a", action: "man runs", transition_out: "CUT" },
      { id: "b", action: "drone follows", transition_in: "CUT" },
    ],
  });
  assert.equal(result.passed, false);
  assert.ok(result.failures.some((failure) => failure.code === "EDITORIAL_CUT_TRIGGER_REQUIRED"));
  assert.ok(result.failures.some((failure) => failure.code === "EDITORIAL_INFORMATION_HANDOFF_REQUIRED"));
  assert.ok(result.failures.some((failure) => failure.code === "EDITORIAL_STATE_CHANGE_REQUIRED"));
});

test("causally motivated pursuit cut passes", () => {
  const result = evaluateEditorialCausality({
    scene: { objective: "Hunt sequence" },
    shots: [
      {
        id: "a",
        action: "runner hears drone close",
        editorial_causality: {
          cut_motivation: "SOUND",
          cut_trigger: "Rotor pitch rises sharply off-screen rear-left.",
          information_handoff: "The off-screen rotor sound hands threat direction into the drone insert.",
          sound_bridge: "J-cut rotor whine starts before the drone appears.",
          visual_match_or_contrast: "Runner eye-line left contrasts with drone entering from upper-left.",
          what_is_withheld: "Exact drone distance stays hidden until the insert.",
          what_changes_after_cut: "Threat proximity becomes visible and pressure rises.",
        },
      },
      { id: "b", action: "drone closes distance" },
    ],
  });
  assert.equal(result.passed, true);
  assert.equal(result.boundaries[0].motivation, "SOUND");
});

test("editorial causality reaches direction graph review and assembly", () => {
  assert.match(temporal, /editorial_causality/);
  assert.match(temporal, /Every cut must be causally earned/);
  assert.match(temporal, /A new angle by itself is never a reason to cut/);
  assert.match(planner, /editorial_causality/);
  assert.match(review, /editorial_causality/);
  assert.match(assembly, /EDITORIAL_CAUSAL_MOTIVATION_REQUIRED/);
  assert.match(assembly, /every_boundary_requires_causal_motivation/);
});
