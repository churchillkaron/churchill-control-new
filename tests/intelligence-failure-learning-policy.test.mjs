import { test } from "node:test";
import assert from "node:assert/strict";

import {
  deriveAdaptiveFailureLearning,
  observeVerifiedExecutionFailure,
} from "../lib/operator/runtime/IntelligenceFailureLearningPolicy.js";

function failedExecution(reason, overrides = {}) {
  return {
    status: "failed",
    reason,
    capability: { key: "finance.invoice.post" },
    ...overrides,
  };
}

test("observes real failed capability executions", () => {
  const observed = observeVerifiedExecutionFailure(
    failedExecution("Provider timeout request_id=req_123456789"),
  );

  assert.equal(observed.capability_key, "finance.invoice.post");
  assert.match(observed.normalized_reason, /provider timeout/i);
  assert.ok(observed.fingerprint);
});

test("normalizes volatile ids so the same failure pattern matches", () => {
  const first = observeVerifiedExecutionFailure(
    failedExecution("Provider timeout request_id=req_111111111"),
  );
  const second = observeVerifiedExecutionFailure(
    failedExecution("Provider timeout request_id=req_999999999"),
  );

  assert.equal(first.fingerprint, second.fingerprint);
});

test("does not learn from confirmation or approval workflow gates", () => {
  for (const reason of [
    "CONFIRMATION_REQUIRED",
    "VOICE_CONFIRMATION_REQUIRED",
    "APPROVAL_REQUIRED",
    "APPROVAL_PENDING",
    "APPROVAL_REQUESTED",
  ]) {
    assert.equal(observeVerifiedExecutionFailure(failedExecution(reason)), null);
  }
});

test("does not learn a durable lesson from the first occurrence", () => {
  const observation = observeVerifiedExecutionFailure(
    failedExecution("Remote service unavailable"),
  );
  const learning = deriveAdaptiveFailureLearning({ observation });

  assert.equal(learning.occurrence_count, 1);
  assert.equal(learning.should_learn_lesson, false);
  assert.equal(learning.lesson, null);
});

test("second identical failure becomes a durable non-authorizing lesson", () => {
  const observation = observeVerifiedExecutionFailure(
    failedExecution("Remote service unavailable"),
  );
  const learning = deriveAdaptiveFailureLearning({
    observation,
    existingMetadata: {
      failure_occurrence_count: 1,
      first_failure_at: "2026-08-22T10:00:00.000Z",
    },
    now: "2026-08-22T11:00:00.000Z",
  });

  assert.equal(learning.occurrence_count, 2);
  assert.equal(learning.should_learn_lesson, true);
  assert.equal(learning.lesson.type, "lesson");
  assert.equal(learning.lesson.metadata.authorization_value, "none");
  assert.equal(learning.lesson.metadata.requires_current_evidence_before_retry, true);
  assert.match(learning.lesson.content, /do not repeat the identical attempt unchanged/i);
});

test("repeated failures strengthen lesson confidence without exceeding bounds", () => {
  const observation = observeVerifiedExecutionFailure(
    failedExecution("Remote service unavailable"),
  );
  const learning = deriveAdaptiveFailureLearning({
    observation,
    existingMetadata: { failure_occurrence_count: 20 },
  });

  assert.equal(learning.occurrence_count, 21);
  assert.ok(learning.lesson.importance <= 0.96);
  assert.ok(learning.lesson.confidence <= 0.98);
});
