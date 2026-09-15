import assert from "node:assert/strict";
import test from "node:test";

import {
  AVANTIQO_SPECIALIST_BENCHMARK_PROVIDER_ADAPTER_CONTRACT,
  executeAvantiqoSpecialistBenchmarkProvider,
  inspectAvantiqoSpecialistBenchmarkProviderAdapter,
} from "../lib/intelligence/runtime/AvantiqoSpecialistBenchmarkProviderAdapter.js";

function leaseContext(lane) {
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

test("adapter inspection has no mutation authority", () => {
  for (const lane of ["deep", "fast"]) {
    const info = inspectAvantiqoSpecialistBenchmarkProviderAdapter({ lane });
    assert.equal(info.contract, AVANTIQO_SPECIALIST_BENCHMARK_PROVIDER_ADAPTER_CONTRACT);
    assert.equal(info.lane, lane);
    assert.equal(info.provider_id, "avantiqo-intelligence");
    assert.equal(info.opens_safe_lease, false);
    assert.equal(info.scales_runpod, false);
    assert.equal(info.mutates_wallet, false);
    assert.equal(info.deploys_production, false);
    assert.equal(info.raw_reasoning_persisted, false);
  }
});

test("adapter rejects unknown lanes before provider execution", async () => {
  await assert.rejects(
    executeAvantiqoSpecialistBenchmarkProvider({
      lane: "turbo",
      provider_input: {},
    }),
    /AVANTIQO_INTELLIGENCE_SAFE_LEASE_EXECUTION_LANE_INVALID|AVANTIQO_SPECIALIST_BENCHMARK_PROVIDER_LANE_INVALID/,
  );
});

test("adapter reuses canonical Safe Lease lane validation before provider execution", async () => {
  await assert.rejects(
    executeAvantiqoSpecialistBenchmarkProvider({
      lane: "deep",
      provider_input: {
        execution_lane: "deep",
        context: leaseContext("fast"),
      },
    }),
    /AVANTIQO_INTELLIGENCE_SAFE_LEASE_LANE_MISMATCH/,
  );
});

test("adapter rejects provider-input lane mismatch before provider execution", async () => {
  await assert.rejects(
    executeAvantiqoSpecialistBenchmarkProvider({
      lane: "fast",
      provider_input: {
        execution_lane: "deep",
        context: leaseContext("fast"),
      },
    }),
    /AVANTIQO_SPECIALIST_BENCHMARK_PROVIDER_INPUT_LANE_MISMATCH/,
  );
});
