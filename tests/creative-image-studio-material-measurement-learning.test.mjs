import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const measurement = fs.readFileSync("lib/creative/image/runtime/CreativeImageMaterialMeasurementRuntime.js","utf8");
const material = fs.readFileSync("lib/creative/image/runtime/CreativeImageMaterialTruthPackRuntime.js","utf8");
const learning = fs.readFileSync("lib/creative/learning/runtime/CreativeProductionLearningRuntime.js","utf8");
const queue = fs.readFileSync("lib/creative/production/queue/runtime/ProductionQueueRuntime.js","utf8");

test("material truth references receive conservative physical measurements",()=>{
  assert.match(measurement,/creative\.materials\.estimate/);
  assert.match(measurement,/visual_estimate_not_lab_measurement:true/);
  assert.match(measurement,/minimum_confidence:0\.85/);
  assert.match(measurement,/material_measurement_sealed/);
  assert.match(measurement,/Preserve uncertainty rather than inventing precision/);
});

test("material truth handoff requires all references to have measurements",()=>{
  assert.match(material,/material_measurements_complete/);
  assert.match(material,/measured\.length===assets\.length/);
  assert.match(material,/material_measurement_contract/);
});

test("production queue executes material measurement after truth QC",()=>{
  const qc=queue.indexOf("CreativeImageMaterialTruthPackRuntime.reconcileQc");
  const measurementIndex=queue.indexOf("CreativeImageMaterialMeasurementRuntime.ensure");
  assert.ok(qc>=0);
  assert.ok(measurementIndex>qc);
});

test("governed learning captures Image Studio accepted/rejected evidence",()=>{
  assert.match(learning,/imageStudioExplorationPairs/);
  assert.match(learning,/imageStudioFailureFrequency/);
  assert.match(learning,/IMAGE_STUDIO_RECURRING_FAILURE_PATTERN/);
  assert.match(learning,/IMAGE_STUDIO_ACCEPTED_REJECTED_DESIGN_EVIDENCE_AVAILABLE/);
  assert.match(learning,/automatic_style_copy_allowed: false/);
});
