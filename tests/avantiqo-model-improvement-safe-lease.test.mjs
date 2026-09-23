import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { requireAvantiqoModelImprovementSafeLease } from "../lib/intelligence/runtime/AvantiqoModelImprovementSafeLeaseGuard.js";

function withLocalEnabled(value, fn) {
  const before = process.env.AVANTIQO_INTELLIGENCE_LOCAL_MODEL_IMPROVEMENT_ENABLED;
  if (value == null) delete process.env.AVANTIQO_INTELLIGENCE_LOCAL_MODEL_IMPROVEMENT_ENABLED;
  else process.env.AVANTIQO_INTELLIGENCE_LOCAL_MODEL_IMPROVEMENT_ENABLED = value;
  try { return fn(); }
  finally {
    if (before === undefined) delete process.env.AVANTIQO_INTELLIGENCE_LOCAL_MODEL_IMPROVEMENT_ENABLED;
    else process.env.AVANTIQO_INTELLIGENCE_LOCAL_MODEL_IMPROVEMENT_ENABLED = before;
  }
}

test("model improvement fails closed when owned local improvement runtime is disabled", () => {
  withLocalEnabled(null, () => {
    assert.throws(() => requireAvantiqoModelImprovementSafeLease("trainer"), /LOCAL_RUNTIME_REQUIRED/);
  });
});

test("model improvement keeps exact stage lanes on owned local compute", () => {
  withLocalEnabled("true", () => {
    for (const [stage, lane] of [["trainer", "intelligence-trainer"], ["benchmark", "intelligence-benchmark"], ["candidate", "intelligence-candidate"]]) {
      const guard = requireAvantiqoModelImprovementSafeLease(stage);
      assert.equal(guard.lease_lane, lane);
      assert.equal(guard.external_compute_allowed, false);
      assert.equal(guard.external_provider_submission_allowed, false);
      assert.equal(guard.local_owned_hardware_required, true);
      assert.equal(guard.production_model_promotion_effect, "NONE");
    }
  });
});

test("invalid model improvement stage fails closed", () => {
  withLocalEnabled("true", () => {
    assert.throws(() => requireAvantiqoModelImprovementSafeLease("unknown"), /LOCAL_STAGE_INVALID/);
  });
});

test("training benchmark and candidate paths contain no external compute execution", () => {
  const trainer = fs.readFileSync("lib/intelligence/runtime/AvantiqoModelTrainingExecutionRuntime.js", "utf8");
  const benchmark = fs.readFileSync("lib/intelligence/runtime/AvantiqoModelBenchmarkExecutionRuntime.js", "utf8");
  const candidate = fs.readFileSync("lib/intelligence/runtime/AvantiqoModelCandidateCanaryRuntime.js", "utf8");
  const shared = fs.readFileSync("lib/intelligence/runtime/AvantiqoSharedTrainerReservationGuard.js", "utf8");
  for (const source of [trainer, benchmark, candidate, shared]) {
    assert.doesNotMatch(source, /Modal|modal|RunPod|runpod/);
  }
  assert.match(trainer, /AVANTIQO_INTELLIGENCE_LOCAL_TRAINER_EXECUTOR_REQUIRED/);
  assert.match(benchmark, /AVANTIQO_MODEL_BENCHMARK_LOCAL_RUNTIME_REQUIRED/);
  assert.match(candidate, /AVANTIQO_MODEL_CANDIDATE_CANARY_LOCAL_RUNTIME_REQUIRED/);
  assert.match(shared, /AVANTIQO_LOCAL_TRAINER_V1/);
});
