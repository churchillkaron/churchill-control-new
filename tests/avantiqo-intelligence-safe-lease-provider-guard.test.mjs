import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  requireAvantiqoIntelligenceSafeLease,
} from "../lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceSafeLeaseGuard.js";

const canonicalProviderSource = fs.readFileSync(
  new URL(
    "../lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProvider.js",
    import.meta.url,
  ),
  "utf8",
);
const runpodProviderSource = fs.readFileSync(
  new URL(
    "../lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceRunpodProvider.js",
    import.meta.url,
  ),
  "utf8",
);
const executorSource = fs.readFileSync(
  new URL(
    "../lib/platform/service-runtime/providers/ProviderExecutor.js",
    import.meta.url,
  ),
  "utf8",
);

const ENV_KEYS = [
  "AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE",
  "AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT",
  "AVANTIQO_RUNPOD_SAFE_LEASE_LANE",
  "AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID",
  "AVANTIQO_RUNPOD_SAFE_LEASE_EXPIRES_AT",
];

function withLeaseEnv(values, fn) {
  const before = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  try {
    for (const key of ENV_KEYS) delete process.env[key];
    for (const [key, value] of Object.entries(values)) {
      if (value != null) process.env[key] = String(value);
    }
    return fn();
  } finally {
    for (const key of ENV_KEYS) {
      if (before[key] == null) delete process.env[key];
      else process.env[key] = before[key];
    }
  }
}

function validLease(lane) {
  return {
    AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE: "YES",
    AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT: "AVANTIQO_RUNPOD_SAFE_LEASE_V2",
    AVANTIQO_RUNPOD_SAFE_LEASE_LANE: lane,
    AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID: "endpoint123",
    AVANTIQO_RUNPOD_SAFE_LEASE_EXPIRES_AT: new Date(Date.now() + 60_000).toISOString(),
  };
}

test("RunPod Intelligence inference fails closed without Safe Lease V2", () => {
  withLeaseEnv({}, () => {
    assert.throws(
      () => requireAvantiqoIntelligenceSafeLease("deep"),
      /AVANTIQO_INTELLIGENCE_SAFE_LEASE_ACTIVE_REQUIRED/,
    );
  });
});

test("canonical Fast and Deep RunPod lanes accept only their matching lease lanes", () => {
  withLeaseEnv(validLease("intelligence-fast"), () => {
    const lease = requireAvantiqoIntelligenceSafeLease("fast");
    assert.equal(lease.execution_lane, "fast");
    assert.equal(lease.lease_lane, "intelligence-fast");
  });

  withLeaseEnv(validLease("intelligence-deep"), () => {
    const lease = requireAvantiqoIntelligenceSafeLease("deep");
    assert.equal(lease.execution_lane, "deep");
    assert.equal(lease.lease_lane, "intelligence-deep");
  });

  withLeaseEnv(validLease("intelligence-fast"), () => {
    assert.throws(
      () => requireAvantiqoIntelligenceSafeLease("deep"),
      /AVANTIQO_INTELLIGENCE_SAFE_LEASE_LANE_MISMATCH/,
    );
  });
});

test("replacement candidate lease cannot become the general Fast reasoning route", () => {
  withLeaseEnv(validLease("intelligence-fast-candidate"), () => {
    assert.throws(
      () => requireAvantiqoIntelligenceSafeLease("fast"),
      /AVANTIQO_INTELLIGENCE_SAFE_LEASE_LANE_MISMATCH/,
    );
  });
});

test("expired Intelligence RunPod leases fail closed", () => {
  withLeaseEnv({
    ...validLease("intelligence-deep"),
    AVANTIQO_RUNPOD_SAFE_LEASE_EXPIRES_AT: new Date(Date.now() - 1_000).toISOString(),
  }, () => {
    assert.throws(
      () => requireAvantiqoIntelligenceSafeLease("deep"),
      /AVANTIQO_INTELLIGENCE_SAFE_LEASE_EXPIRED/,
    );
  });
});

test("Modal primary bypasses RunPod lease while RunPod fallback remains lease guarded", () => {
  assert.match(canonicalProviderSource, /AvantiqoIntelligenceProviderV2/);
  assert.match(canonicalProviderSource, /modal_primary_when_configured:\s*true/);
  assert.match(canonicalProviderSource, /safe_lease_required_for_inference:\s*false/);

  assert.match(executorSource, /ownedIntelligenceModalConfigured/);
  assert.match(executorSource, /AVANTIQO_INTELLIGENCE_MODAL_BASE_URL/);
  assert.match(executorSource, /AVANTIQO_INTELLIGENCE_MODAL_GATEWAY_TOKEN/);
  assert.match(executorSource, /Modal is a fully separate owned scale-to-zero infrastructure path/);
  assert.match(executorSource, /do not touch RunPod at all/);

  assert.match(runpodProviderSource, /requireAvantiqoIntelligenceSafeLease/);
  const executeStart = runpodProviderSource.indexOf("async execute(input = {})");
  const guardIndex = runpodProviderSource.indexOf(
    "requireAvantiqoIntelligenceSafeLease(lane",
    executeStart,
  );
  const fastDispatchIndex = runpodProviderSource.indexOf(
    "AvantiqoIntelligenceFastProvider.execute(governedInput)",
    executeStart,
  );
  const deepDispatchIndex = runpodProviderSource.indexOf(
    "AvantiqoIntelligenceDeepProvider.execute(governedInput)",
    executeStart,
  );

  assert.ok(executeStart >= 0);
  assert.ok(guardIndex > executeStart);
  assert.ok(fastDispatchIndex > guardIndex);
  assert.ok(deepDispatchIndex > guardIndex);
});
