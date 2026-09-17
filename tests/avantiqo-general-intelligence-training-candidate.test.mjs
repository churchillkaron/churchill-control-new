import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const candidate = fs.readFileSync("lib/intelligence/runtime/AvantiqoGeneralIntelligenceTrainingCandidateRuntime.js", "utf8");
const compiler = fs.readFileSync("lib/intelligence/runtime/AvantiqoTrainingExampleCompilerRuntime.js", "utf8");
const dataset = fs.readFileSync("lib/intelligence/runtime/AvantiqoTrainingDatasetRuntime.js", "utf8");
const readiness = fs.readFileSync("lib/intelligence/runtime/AvantiqoModelTrainingReadinessRuntime.js", "utf8");
const route = fs.readFileSync("app/api/internal/intelligence/continuous-learning/process/route.js", "utf8");

test("general intelligence training candidate requires durable mastery evidence", () => {
  assert.match(candidate, /m\.mastery_evidence_candidate === true/);
  assert.match(candidate, /m\.retention_gate_passed === true/);
  assert.match(candidate, /m\.transfer_gate_passed === true/);
  assert.match(candidate, /Number\(m\.strong_retention_count \|\| 0\) >= 3/);
  assert.match(candidate, /Number\(m\.max_retention_day \|\| 0\) >= 7/);
  assert.match(candidate, /Number\(m\.worst_forgetting_score \|\| 1\) <= 0\.15/);
});

test("training candidate learns transfer discipline rather than mutable world facts", () => {
  assert.match(candidate, /GENERAL_INTELLIGENCE_TRANSFER_DISCIPLINE/);
  assert.match(candidate, /trains_reasoning_pattern_not_world_facts: true/);
  assert.match(candidate, /mutable_world_facts_included: false/);
  assert.match(compiler, /treat analogy as a hypothesis rather than evidence/i);
  assert.match(dataset, /Train the reasoning pattern, not mutable world facts/);
});

test("candidate remains benchmark gated and cannot start training", () => {
  assert.match(candidate, /training_ready: false/);
  assert.match(candidate, /benchmark_status: "UNREVIEWED"/);
  assert.match(candidate, /requires_benchmark_validation: true/);
  assert.match(candidate, /automatic_training_started: false/);
  assert.match(candidate, /automatic_model_weight_mutation: false/);
  assert.match(candidate, /production_model_promotion_effect: "NONE"/);
});

test("unchanged evidence preserves benchmark review while changed evidence invalidates it", () => {
  assert.match(candidate, /source_fingerprint/);
  assert.match(candidate, /unchanged_candidate_review_state_preserved: true/);
  assert.match(candidate, /changed_evidence_requires_fresh_benchmark: true/);
  assert.match(candidate, /priorMetadata|object\(prior\.metadata\)/);
});

test("compiler persists immutable source candidate and benchmark bindings", () => {
  assert.match(compiler, /source_candidate_id: example\.source_candidate_id/);
  assert.match(compiler, /source_candidate_fingerprint: example\.source_candidate_fingerprint/);
  assert.match(compiler, /source_benchmark_id: example\.source_benchmark_id/);
  assert.match(compiler, /source_benchmark_suite: example\.source_benchmark_suite/);
  assert.match(readiness, /GENERAL_INTELLIGENCE_TRANSFER_DISCIPLINE: "AVANTIQO_GENERAL_INTELLIGENCE_TRAINING_CANDIDATE_V1"/);
});

test("nightly learning seeds candidates after mastery evidence without training", () => {
  const masteryIndex = route.indexOf("reconcileAvantiqoGeneralIntelligenceMasteryEvidence()");
  const candidateIndex = route.indexOf("seedAvantiqoGeneralIntelligenceTrainingCandidates()");
  assert.ok(masteryIndex >= 0 && candidateIndex > masteryIndex);
  assert.match(route, /general_intelligence_training_candidates: generalIntelligenceTrainingCandidates/);
});
