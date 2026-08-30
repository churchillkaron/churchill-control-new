import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateAvantiqoIntelligenceFastSchedulingState,
} from "../lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceFastProvider.js";
import {
  isAvantiqoIntelligenceFastUnscheduledError,
} from "../lib/platform/service-runtime/execution/OwnedIntelligenceFastPodFallbackRuntime.js";

function health({ inQueue = 0, inProgress = 0, initializing = 0, ready = 0, running = 0, idle = 0 } = {}) {
  return {
    jobs: { inQueue, inProgress },
    workers: { initializing, ready, running, idle },
  };
}

test("queued Fast request waits before unscheduled deadline", () => {
  const result = evaluateAvantiqoIntelligenceFastSchedulingState({
    health: health({ inQueue: 1 }),
    elapsed_ms: 90_000,
    unscheduled_timeout_ms: 180_000,
  });
  assert.equal(result.status, "WAITING_FOR_SCHEDULER");
  assert.equal(result.worker_observed, false);
});

test("queued Fast request fails as unscheduled only after bounded scheduler deadline", () => {
  const result = evaluateAvantiqoIntelligenceFastSchedulingState({
    health: health({ inQueue: 1 }),
    elapsed_ms: 180_000,
    unscheduled_timeout_ms: 180_000,
  });
  assert.equal(result.status, "UNSCHEDULED");
  assert.equal(result.worker_observed, false);
});

test("initializing worker proves Fast scheduling before inference begins", () => {
  const result = evaluateAvantiqoIntelligenceFastSchedulingState({
    health: health({ inQueue: 1, initializing: 1 }),
    elapsed_ms: 170_000,
    unscheduled_timeout_ms: 180_000,
  });
  assert.equal(result.status, "SCHEDULED");
  assert.equal(result.worker_observed, true);
});

test("in-progress job proves scheduler success even if worker counters lag", () => {
  const result = evaluateAvantiqoIntelligenceFastSchedulingState({
    health: health({ inProgress: 1 }),
    elapsed_ms: 190_000,
    unscheduled_timeout_ms: 180_000,
  });
  assert.equal(result.status, "SCHEDULED");
  assert.equal(result.worker_observed, true);
});

test("once a worker was observed later zero counters do not misclassify request as unscheduled", () => {
  const result = evaluateAvantiqoIntelligenceFastSchedulingState({
    health: health({ inQueue: 1 }),
    elapsed_ms: 240_000,
    unscheduled_timeout_ms: 180_000,
    previous_worker_observed: true,
  });
  assert.equal(result.status, "SCHEDULED");
  assert.equal(result.worker_observed, true);
});

test("unreadable health does not become false capacity proof", () => {
  const result = evaluateAvantiqoIntelligenceFastSchedulingState({
    health: null,
    elapsed_ms: 300_000,
    unscheduled_timeout_ms: 180_000,
    health_readable: false,
  });
  assert.equal(result.status, "HEALTH_UNREADABLE");
  assert.equal(result.worker_observed, false);
});

test("Fast Pod fallback is eligible only for the exact bounded unscheduled error", () => {
  assert.equal(
    isAvantiqoIntelligenceFastUnscheduledError(
      new Error("AVANTIQO_INTELLIGENCE_FAST_WORKER_NOT_SCHEDULED_WITHIN_180000_MS"),
    ),
    true,
  );
  assert.equal(
    isAvantiqoIntelligenceFastUnscheduledError(
      new Error("AVANTIQO_INTELLIGENCE_FAST_REQUEST_FAILED:500:boom"),
    ),
    false,
  );
  assert.equal(
    isAvantiqoIntelligenceFastUnscheduledError(
      new Error("AVANTIQO_INTELLIGENCE_REQUEST_LEASE_HTTP_403"),
    ),
    false,
  );
});
