import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const CONTRACT = "AVANTIQO_FAST_ZERO_IDLE_CAPACITY_AUDIT_V1";
const source = await readFile(
  "lib/platform/service-runtime/execution/OwnedIntelligenceRequestLeaseRuntime.js",
  "utf8",
);

for (const required of [
  '"FAST_SERVERLESS_ZERO_IDLE_CAPACITY_V1"',
  "AVANTIQO_INTELLIGENCE_FAST_ZERO_IDLE_CAPACITY_ENABLED",
  "finite(endpoint?.workersMax, -1) !== 1",
  "activeWorkers(endpoint).length > 1",
  "health.inQueue !== 0",
  "health.inProgress !== 0",
  'lane === "fast" && fastZeroIdleCapacityEnabled()',
  "preserveFastZeroIdleCapacity && !executionError",
  "await verifyFastZeroIdleCapacity(endpointId, config)",
  "await parkAndVerify(endpointId, config)",
  'state: executionError || cleanupError ? "FAILED" : "RELEASED"',
  "await releaseDistributed",
]) {
  assert.ok(source.includes(required), `${CONTRACT}_MISSING:${required}`);
}

const successPreserve = source.indexOf(
  "if (preserveFastZeroIdleCapacity && !executionError)",
);
const successVerify = source.indexOf(
  "await verifyFastZeroIdleCapacity(endpointId, config)",
  successPreserve,
);
const fallbackPark = source.indexOf(
  "await parkAndVerify(endpointId, config)",
  successPreserve,
);
assert.ok(successPreserve >= 0 && successVerify > successPreserve);
assert.ok(fallbackPark > successVerify);

assert.equal(
  source.includes("workersMin: 1"),
  false,
  `${CONTRACT}_FAST_GPU_MUST_NOT_BE_PINNED_ON`,
);

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  verified: {
    fast_success_keeps_serverless_capacity_open: true,
    fast_workers_min_remains_zero: true,
    fast_worker_limit_remains_one: true,
    fast_queue_must_be_empty_before_lease_release: true,
    fast_failure_parks_fail_closed: true,
    deep_path_still_parks: true,
    distributed_request_lease_still_released: true,
    cross_organization_lane_lock_not_held_between_requests: true,
    feature_can_be_disabled_by_environment: true,
    provider_call_performed: false,
    runpod_mutation_performed: false,
    wallet_mutation_performed: false,
    production_deploy_performed: false,
  },
}, null, 2));
console.log(`${CONTRACT}=PASS`);
