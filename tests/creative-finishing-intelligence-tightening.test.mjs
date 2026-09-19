import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  buildFinishingIntelligence,
} from "../lib/creative/post-production/runtime/CreativeFinishingIntelligenceRuntime.js";

const perceptual = fs.readFileSync("lib/creative/quality/runtime/CreativeGeneratedMediaPerceptualExecutionGate.js", "utf8");
const planner = fs.readFileSync("lib/creative/production-graph/planner/ProductionGraphPlanner.js", "utf8");
const composite = fs.readFileSync("lib/creative/compositing/runtime/CreativeCompositeTaskMaterializationRuntime.js", "utf8");
const optical = fs.readFileSync("lib/creative/post-production/runtime/CreativeOpticalTaskMaterializationRuntime.js", "utf8");

test("finishing intelligence classifies recurring synthetic failures", () => {
  const result = buildFinishingIntelligence({
    taste_memory: {
      recurring_rejection_patterns: [
        { reason: "plastic bark and detached volumetric beams", count: 4 },
        { reason: "excessive halation and digital grain", count: 3 },
        { reason: "lifted milky blacks hide artifacts", count: 2 },
      ],
    },
  });
  assert.ok(result.domain_patterns.MATERIAL_LIGHT.length);
  assert.ok(result.domain_patterns.OPTICAL.length);
  assert.ok(result.domain_patterns.BLACK_LEVEL.length);
  assert.equal(result.optical_gate.stacked_effect_signature_forbidden, true);
  assert.equal(result.color_gate.artifact_hiding_grade_forbidden, true);
});

test("composite optical and color reviews have stage-specific anti-AI rules", () => {
  assert.match(perceptual, /FINAL COMPOSITE REVIEW/);
  assert.match(perceptual, /OPTICAL FINISH REVIEW/);
  assert.match(perceptual, /COLOR\/DI REVIEW/);
  assert.match(perceptual, /pasted fog/);
  assert.match(perceptual, /generic 'film look'/);
  assert.match(perceptual, /teal-orange defaults/);
});

test("finishing intelligence propagates into graph and materialization", () => {
  assert.match(planner, /finishing_intelligence/);
  assert.match(composite, /composite_gate/);
  assert.match(optical, /optical_gate/);
});
