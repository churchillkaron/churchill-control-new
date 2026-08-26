import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  requireAvantiqoModelImprovementSafeLease,
} from "../lib/intelligence/runtime/AvantiqoModelImprovementSafeLeaseGuard.js";

const KEYS = [
  "AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE",
  "AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT",
  "AVANTIQO_RUNPOD_SAFE_LEASE_LANE",
  "AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID",
  "AVANTIQO_RUNPOD_SAFE_LEASE_EXPIRES_AT",
];

function withEnv(values, fn) {
  const before = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  for (const key of KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(values)) process.env[key] = value;
  try { return fn(); }
  finally {
    for (const key of KEYS) {
      if (before[key] === undefined) delete process.env[key];
      else process.env[key] = before[key];
    }
  }
}

function validEnv(lane, endpoint = "endpoint_123") {
  return {
    AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE: "YES",
    AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT: "AVANTIQO_RUNPOD_SAFE_LEASE_V2",
    AVANTIQO_RUNPOD_SAFE_LEASE_LANE: lane,
    AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID: endpoint,
    AVANTIQO_RUNPOD_SAFE_LEASE_EXPIRES_AT: new Date(Date.now() + 60_000).toISOString(),
  };
}

test("model improvement rejects execution without Safe Lease V2", () => {
  withEnv({}, () => {
    assert.throws(
      () => requireAvantiqoModelImprovementSafeLease("trainer"),
      /SAFE_LEASE_ACTIVE_REQUIRED/,
    );
  });
});

test("model improvement requires exact stage lane", () => {
  withEnv(validEnv("intelligence-deep"), () => {
    assert.throws(
      () => requireAvantiqoModelImprovementSafeLease("trainer"),
      /SAFE_LEASE_LANE_MISMATCH/,
    );
  });
});

test("model improvement binds configured endpoint to leased endpoint", () => {
  withEnv(validEnv("intelligence-trainer", "leased_ep"), () => {
    assert.throws(
      () => requireAvantiqoModelImprovementSafeLease("trainer", {
        configuredEndpointId: "other_ep",
      }),
      /SAFE_LEASE_ENDPOINT_MISMATCH/,
    );
  });
});

test("expired model improvement leases fail closed", () => {
  const env = validEnv("intelligence-candidate");
  env.AVANTIQO_RUNPOD_SAFE_LEASE_EXPIRES_AT = new Date(Date.now() - 1_000).toISOString();
  withEnv(env, () => {
    assert.throws(
      () => requireAvantiqoModelImprovementSafeLease("candidate"),
      /SAFE_LEASE_EXPIRED/,
    );
  });
});

test("trainer benchmark and candidate use distinct governed lease identities", () => {
  for (const [stage, lane] of [
    ["trainer", "intelligence-trainer"],
    ["benchmark", "intelligence-benchmark"],
    ["candidate", "intelligence-candidate"],
  ]) {
    withEnv(validEnv(lane, `${stage}_ep`), () => {
      const guard = requireAvantiqoModelImprovementSafeLease(stage, {
        configuredEndpointId: `${stage}_ep`,
      });
      assert.equal(guard.safe_lease_contract, "AVANTIQO_RUNPOD_SAFE_LEASE_V2");
      assert.equal(guard.lease_lane, lane);
      assert.equal(guard.endpoint_id, `${stage}_ep`);
      assert.equal(guard.direct_endpoint_scaling_allowed, false);
      assert.equal(guard.production_model_promotion_effect, "NONE");
    });
  }
});

test("all paid model improvement paths are statically Safe Lease bound", async () => {
  const [policy, trainer, benchmark, candidate, benchmarkWorker, trainerLocal, benchmarkLocal, promotion] =
    await Promise.all([
      readFile("config/avantiqo-runpod-safe-lease-policy.json", "utf8"),
      readFile("lib/intelligence/runtime/AvantiqoModelTrainingExecutionRuntime.js", "utf8"),
      readFile("lib/intelligence/runtime/AvantiqoModelBenchmarkExecutionRuntime.js", "utf8"),
      readFile("lib/intelligence/runtime/AvantiqoModelCandidateCanaryRuntime.js", "utf8"),
      readFile("services/avantiqo-intelligence-benchmark/handler.py", "utf8"),
      readFile("scripts/run-avantiqo-model-training-execution-local.mjs", "utf8"),
      readFile("scripts/run-avantiqo-model-benchmark-submission-local.mjs", "utf8"),
      readFile("lib/intelligence/runtime/AvantiqoModelPromotionRuntime.js", "utf8"),
    ]);

  assert.match(policy, /"max_jobs_per_lease"\s*:\s*1/);
  assert.match(policy, /"intelligence-trainer"\s*:\s*"avantiqo-intelligence-trainer-v1"/);
  assert.match(policy, /"intelligence-benchmark"\s*:\s*"avantiqo-intelligence-trainer-v1"/);
  assert.match(policy, /"intelligence-candidate"\s*:\s*"avantiqo-intelligence-candidate-v1"/);

  assert.match(trainer, /requireAvantiqoModelImprovementSafeLease\("trainer"/);
  assert.match(benchmark, /requireAvantiqoModelImprovementSafeLease\("benchmark"/);
  assert.match(candidate, /requireAvantiqoModelImprovementSafeLease\("candidate"/);

  assert.match(benchmark, /mode:\s*"paired"/);
  assert.match(benchmark, /provider_job_count:\s*1/);
  assert.doesNotMatch(benchmark, /baseline_provider_job_id/);
  assert.doesNotMatch(benchmark, /candidate_provider_job_id/);
  assert.match(benchmarkWorker, /"single_runpod_job": True/);
  assert.match(benchmarkWorker, /"baseline_outputs": baseline_outputs/);
  assert.match(benchmarkWorker, /"candidate_outputs": candidate_outputs/);

  assert.match(trainerLocal, /SAFE_LEASE_LANE = "intelligence-trainer"/);
  assert.match(trainerLocal, /refreshAvantiqoModelTrainingJob/);
  assert.match(trainerLocal, /SAFE_LEASE_EXPIRY_BEFORE_TERMINAL_STATE/);
  assert.match(benchmarkLocal, /SAFE_LEASE_LANE = "intelligence-benchmark"/);
  assert.match(benchmarkLocal, /refreshAvantiqoModelBenchmark/);
  assert.match(benchmarkLocal, /provider_jobs_submitted: 1/);

  assert.match(promotion, /explicit_production_release_required: true/);
  assert.match(promotion, /production_release_authorized: false/);
  assert.match(promotion, /production_endpoint_mutated: false/);
  assert.match(promotion, /production_model_promoted: false/);
});
