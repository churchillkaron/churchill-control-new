import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const operator = fs.readFileSync(new URL("../lib/operator/runtime/OperatorReasoningRuntime.js", import.meta.url), "utf8");
const route = fs.readFileSync(new URL("../app/api/operator/turn/route.js", import.meta.url), "utf8");
const learning = fs.readFileSync(new URL("../lib/intelligence/runtime/AvantiqoMechanismFirstLearningRuntime.js", import.meta.url), "utf8");
const child = fs.readFileSync(new URL("../scripts/run-avantiqo-learning-mechanism-synthesis-modal-child-local.mjs", import.meta.url), "utf8");

test("Operator Deep is owned in production while benchmark metadata is development-only", () => {
  assert.match(operator, /if \(text\(process\.env\.NODE_ENV\)\.toLowerCase\(\) !== "development"\) return null/);
  assert.match(operator, /service_id: "ai\.reasoning\.execute"[\s\S]*?\.\.\.ownedOperatorIntelligenceSelectionPolicy\(\)/);
});

test("Operator route has Node 300 second runtime budget", () => {
  assert.match(route, /export const runtime = "nodejs"/);
  assert.match(route, /export const maxDuration = 300/);
});

test("Learning director is Modal-only", () => {
  assert.match(learning, /READY_FOR_MODAL_SYNTHESIS/);
  assert.match(learning, /AVANTIQO_INTELLIGENCE_MODAL_H100_V1/);
  assert.match(learning, /synthesis_modal_only/);
  assert.doesNotMatch(learning, /RUNPOD_SAFE_LEASE|READY_FOR_SAFE_LEASE_SYNTHESIS/);
});

test("Learning synthesis cannot bypass Service Runtime", () => {
  assert.match(child, /executeService\s*\(/);
  assert.match(child, /settlePendingService\s*\(/);
  assert.match(child, /modal-intelligence-direct:/);
  assert.match(child, /duplicate_provider_job_submitted: false/);
  assert.match(child, /raw_reasoning_persisted: false/);
  assert.doesNotMatch(child, /api\.runpod\.ai|rest\.runpod\.io|AVANTIQO_RUNPOD_SAFE_LEASE/);
});

test("legacy direct RunPod Learning child is absent", () => {
  assert.equal(fs.existsSync(new URL("../scripts/run-avantiqo-learning-mechanism-synthesis-child-local.mjs", import.meta.url)), false);
});
