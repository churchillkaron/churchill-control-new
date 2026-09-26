import assert from "node:assert/strict";
import test from "node:test";

import {
  AVANTIQO_SPECIALIST_BENCHMARK_EXECUTION_CONTRACT,
  executeAvantiqoSpecialistBenchmarkCase,
  planAvantiqoSpecialistBenchmarkExecution,
} from "../lib/intelligence/runtime/AvantiqoSpecialistBenchmarkExecutionRuntime.js";

function governedContext(lane = "fast") {
  return {
    organization_id: "org-test",
    organization_service_id: "service-test",
    usage_id: "usage-test",
    intelligence_safe_lease_contract: "AVANTIQO_RUNPOD_SAFE_LEASE_V2",
    intelligence_safe_lease_lane: lane === "fast" ? "intelligence-fast" : "intelligence-deep",
    intelligence_safe_lease_endpoint_id: "endpoint-test",
    intelligence_safe_lease_expires_at: "2099-01-01T00:00:00.000Z",
  };
}

test("plan mode is deterministic and performs no execution or mutation", () => {
  const plan = planAvantiqoSpecialistBenchmarkExecution();
  assert.equal(plan.contract, AVANTIQO_SPECIALIST_BENCHMARK_EXECUTION_CONTRACT);
  assert.equal(plan.mode, "plan");
  assert.equal(plan.execution_approved, false);
  assert.equal(plan.inference_performed, false);
  assert.equal(plan.runpod_mutation_performed, false);
  assert.equal(plan.wallet_mutation_performed, false);
  assert.equal(plan.production_deploy_performed, false);
  assert.equal(plan.safe_lease_policy, "REUSE_AVANTIQO_INTELLIGENCE_SAFE_LEASE_GUARD_V2");
  assert.equal(plan.cases.length, 6);
  assert.deepEqual(
    plan.cases.map((item) => item.expected_lane),
    ["deep", "deep", "deep", "deep", "deep", "fast"],
  );
});

test("execution requires explicit approval before adapter invocation", async () => {
  let calls = 0;
  await assert.rejects(
    executeAvantiqoSpecialistBenchmarkCase({
      case_id: "code-trivial-edit-02",
      context: governedContext("fast"),
      execute_provider: async () => {
        calls += 1;
        return {};
      },
    }),
    /AVANTIQO_SPECIALIST_BENCHMARK_EXECUTION_NOT_APPROVED/,
  );
  assert.equal(calls, 0);
});

test("execution requires complete governed Safe Lease context before adapter invocation", async () => {
  let calls = 0;
  await assert.rejects(
    executeAvantiqoSpecialistBenchmarkCase({
      case_id: "code-trivial-edit-02",
      execution_approved: true,
      context: { organization_id: "org-only" },
      execute_provider: async () => {
        calls += 1;
        return {};
      },
    }),
    /AVANTIQO_SPECIALIST_BENCHMARK_GOVERNED_SAFE_LEASE_CONTEXT_REQUIRED/,
  );
  assert.equal(calls, 0);
});

test("canonical Safe Lease guard rejects lane mismatch before adapter invocation", async () => {
  let calls = 0;
  await assert.rejects(
    executeAvantiqoSpecialistBenchmarkCase({
      case_id: "business-cash-inventory-01",
      execution_approved: true,
      context: governedContext("fast"),
      execute_provider: async () => {
        calls += 1;
        return {};
      },
    }),
    /AVANTIQO_INTELLIGENCE_SAFE_LEASE_LANE_MISMATCH/,
  );
  assert.equal(calls, 0);
});

test("fast benchmark case is routed to fast adapter lane and does not self-score", async () => {
  const result = await executeAvantiqoSpecialistBenchmarkCase({
    case_id: "code-trivial-edit-02",
    execution_approved: true,
    context: governedContext("fast"),
    execute_provider: async ({ lane, provider_input, safe_lease }) => {
      assert.equal(lane, "fast");
      assert.equal(safe_lease.lease_lane, "intelligence-fast");
      assert.equal(provider_input.execution_lane, "fast");
      assert.equal(provider_input.intelligence_domain, "code");
      return {
        provider: "avantiqo-intelligence",
        model: "Qwen/Qwen3-30B-A3B-Instruct-2507",
        output: {
          text: "Fixed the spelling typo only.",
          execution_lane: "fast",
          finish_reason: "stop",
          usage: { input_tokens: 25, output_tokens: 8, total_tokens: 33 },
        },
        ttft_ms: 42,
        total_latency_ms: 120,
      };
    },
  });

  assert.equal(result.mode, "execute");
  assert.equal(result.inference_performed, true);
  assert.equal(result.scoring_performed, false);
  assert.equal(result.safe_lease_guard.lease_lane, "intelligence-fast");
  assert.equal(result.observation.observed_lane, "fast");
  assert.equal(result.observation.ttft_ms, 42);
  assert.equal(result.observation.total_latency_ms, 120);
  assert.equal(result.observation.raw_reasoning_persisted, false);
});

test("deep case lane is fixed by benchmark contract, not caller preference", async () => {
  const result = await executeAvantiqoSpecialistBenchmarkCase({
    case_id: "business-cash-inventory-01",
    execution_approved: true,
    execution_lane: "fast",
    context: governedContext("deep"),
    execute_provider: async ({ lane, provider_input, safe_lease }) => {
      assert.equal(lane, "deep");
      assert.equal(safe_lease.lease_lane, "intelligence-deep");
      assert.equal(provider_input.execution_lane, "deep");
      return {
        provider: "avantiqo-intelligence",
        model: "Qwen/Qwen3-30B-A3B-Thinking-2507",
        output: {
          text: "Final answer only.",
          finish_reason: "stop",
          usage: { input_tokens: 100, output_tokens: 50 },
        },
      };
    },
  });
  assert.equal(result.observation.expected_lane, "deep");
  assert.equal(result.observation.observed_lane, "deep");
  assert.equal(result.observation.ttft_ms, null);
  assert.equal(result.observation.ttft_measured, false);
  assert.ok(result.observation.total_latency_ms >= 0);
});

test("invalid adapter TTFT is rejected rather than fabricated", async () => {
  await assert.rejects(
    executeAvantiqoSpecialistBenchmarkCase({
      case_id: "code-trivial-edit-02",
      execution_approved: true,
      context: governedContext("fast"),
      execute_provider: async () => ({
        output: { text: "done", execution_lane: "fast" },
        ttft_ms: 200,
        total_latency_ms: 100,
      }),
    }),
    /AVANTIQO_SPECIALIST_BENCHMARK_TTFT_EXCEEDS_TOTAL/,
  );
});
