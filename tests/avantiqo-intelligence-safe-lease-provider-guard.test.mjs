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
const directRuntimeSource = fs.readFileSync(
  new URL(
    "../lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceModalDirectRuntime.js",
    import.meta.url,
  ),
  "utf8",
);
const registrationSource = fs.readFileSync(
  new URL(
    "../lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderRegistration.js",
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

test("Intelligence primary lane mirrors working Audio direct Modal SDK transport", () => {
  assert.match(directRuntimeSource, /const APP_NAME = "avantiqo-intelligence-owned"/);
  assert.match(directRuntimeSource, /const DIRECT_TRANSPORT = "modal-js-sdk-function-call-v1"/);
  assert.match(directRuntimeSource, /new sdk\.ModalClient\(\{ tokenId: configValue\.tokenId, tokenSecret: configValue\.tokenSecret \}\)/);
  assert.match(directRuntimeSource, /client\.functions\.fromName\(APP_NAME, lane, lookupOptions\)/);
  assert.match(directRuntimeSource, /worker\.spawn\(\[payload\]\)/);
  assert.match(directRuntimeSource, /client\.functionCalls\.fromId\(callId\)/);
  assert.match(directRuntimeSource, /call\.get\(\{ timeoutMs: 0 \}\)/);
  assert.match(directRuntimeSource, /modal_gateway_used:\s*false/);
  assert.match(directRuntimeSource, /modal_gpu:\s*"H100"/);
  assert.match(directRuntimeSource, /modal_volume_created:\s*false/);
  assert.match(directRuntimeSource, /runpod_inference_performed:\s*false/);
  assert.match(directRuntimeSource, /const tools = Array\.isArray\(input\.tools\) && input\.tools\.length > 0 \? input\.tools : undefined/);
  assert.match(directRuntimeSource, /const toolChoice = tools \? \(input\.tool_choice \|\| input\.toolChoice\) : undefined/);
  assert.match(directRuntimeSource, /tool_choice:\s*toolChoice/);
  assert.doesNotMatch(directRuntimeSource, /tool_choice:\s*input\.tool_choice \|\| input\.toolChoice/);
  assert.doesNotMatch(directRuntimeSource, /AVANTIQO_INTELLIGENCE_MODAL_BASE_URL/);
  assert.doesNotMatch(directRuntimeSource, /AVANTIQO_INTELLIGENCE_MODAL_GATEWAY_TOKEN/);
});

test("Intelligence readiness derives from shared direct Modal credentials only", () => {
  assert.match(registrationSource, /MODAL_TOKEN_ID \|\| process\.env\.AVANTIQO_MODAL_TOKEN_ID/);
  assert.match(registrationSource, /MODAL_TOKEN_SECRET \|\| process\.env\.AVANTIQO_MODAL_TOKEN_SECRET/);
  assert.match(registrationSource, /modal_gateway_required:\s*false/);
  assert.match(registrationSource, /modal_transport:\s*MODAL_TRANSPORT/);
  assert.doesNotMatch(registrationSource, /AVANTIQO_INTELLIGENCE_MODAL_BASE_URL/);
  assert.doesNotMatch(registrationSource, /AVANTIQO_INTELLIGENCE_MODAL_GATEWAY_TOKEN/);

  assert.match(canonicalProviderSource, /modal_gateway_required:\s*false/);
  assert.match(canonicalProviderSource, /AVANTIQO_INTELLIGENCE_MODAL_DIRECT_TRANSPORT/);
  assert.doesNotMatch(canonicalProviderSource, /AVANTIQO_INTELLIGENCE_MODAL_BASE_URL/);
  assert.doesNotMatch(canonicalProviderSource, /AVANTIQO_INTELLIGENCE_MODAL_GATEWAY_TOKEN/);
});

test("Modal primary bypasses RunPod lease while RunPod fallback remains lease guarded", () => {
  assert.match(executorSource, /ownedIntelligenceModalConfigured/);
  assert.match(executorSource, /MODAL_TOKEN_ID \|\| process\.env\.AVANTIQO_MODAL_TOKEN_ID/);
  assert.match(executorSource, /MODAL_TOKEN_SECRET \|\| process\.env\.AVANTIQO_MODAL_TOKEN_SECRET/);
  assert.match(executorSource, /same direct Modal SDK credentials used by Audio/);
  assert.match(executorSource, /do\s*not touch RunPod at all/);
  assert.doesNotMatch(executorSource, /AVANTIQO_INTELLIGENCE_MODAL_BASE_URL/);
  assert.doesNotMatch(executorSource, /AVANTIQO_INTELLIGENCE_MODAL_GATEWAY_TOKEN/);

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