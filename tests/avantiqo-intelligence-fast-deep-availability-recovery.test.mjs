import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../lib/platform/service-runtime/providers/ProviderExecutor.js", import.meta.url),
  "utf8",
);
const leaseSource = await readFile(
  new URL("../lib/platform/service-runtime/execution/OwnedIntelligenceFastPodLeaseRuntime.js", import.meta.url),
  "utf8",
);

test("Fast lease and shared-volume outages recover through owned Deep", () => {
  assert.match(source, /AVANTIQO_INTELLIGENCE_FAST_POD_LEASE_ACQUIRE_FAILED/);
  assert.match(source, /AVANTIQO_INTELLIGENCE_FAST_POD_SHARED_VOLUME_BUSY/);
  assert.match(source, /recoverOwnedFastThroughDeep/);
  assert.match(source, /capability:\s*"ai\.reasoning\.execute"/);
  assert.match(source, /execution_lane:\s*"deep"/);
});

test("availability recovery never enables an external provider", () => {
  assert.match(source, /AVANTIQO_OWNED_INTELLIGENCE_AVAILABILITY_RECOVERY_V1/);
  assert.match(source, /owned_provider_only:\s*true/);
  assert.match(source, /external_fallback_used:\s*false/);
  assert.doesNotMatch(source, /provider:\s*["']openai["']/i);
  assert.doesNotMatch(source, /provider:\s*["']anthropic["']/i);
  assert.doesNotMatch(source, /provider:\s*["']gemini["']/i);
});

test("recovery stays inside canonical request-scoped Safe Lease ownership", () => {
  assert.match(source, /withOwnedIntelligenceRequestLease/);
  assert.match(source, /AvantiqoIntelligenceProvider\.execute/);
  assert.match(source, /organizationId/);
  assert.match(source, /intelligence_safe_lease/);
});

test("non-availability Fast failures remain fail-closed", () => {
  assert.match(source, /if \(!fastAvailabilityRecoveryEligible\(fastError, options\)\) throw fastError/);
  assert.doesNotMatch(source, /FAST_REASONING_TRANSPORT_FORBIDDEN[\s\S]*FAST_AVAILABILITY_RECOVERY_PATTERNS/);
});

test("Fast distributed lease preserves safe database conflict reason instead of only P0001", () => {
  assert.match(leaseSource, /safeDatabaseReason/);
  assert.match(leaseSource, /AVANTIQO_INTELLIGENCE_RUNPOD_LEASE_\[A-Z0-9_\]\+/);
  assert.match(leaseSource, /reason \|\| error\.code \|\| "UNKNOWN"/);
  assert.doesNotMatch(
    leaseSource,
    /LEASE_ACQUIRE_FAILED:\$\{error\.code \|\| "UNKNOWN"\}/,
  );
});
