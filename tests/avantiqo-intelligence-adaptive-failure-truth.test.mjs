import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveAdaptiveFailureLearning,
  observeVerifiedExecutionFailure,
} from "../lib/operator/runtime/IntelligenceFailureLearningPolicy.js";

test("blocked post-action verification becomes adaptive failure evidence", () => {
  const observation = observeVerifiedExecutionFailure({
    status: "blocked",
    reason: "READBACK_MISMATCH",
    capability: { key: "example.write", mode: "write" },
    action_call_completed: true,
    business_effect_verified: false,
  });

  assert.equal(observation.capability_key, "example.write");
  assert.equal(observation.execution_status, "blocked");
  assert.equal(observation.post_action_verification_failed, true);
  assert.equal(observation.normalized_reason, "readback_mismatch");
});

test("human governance blockers never become adaptive failure lessons", () => {
  for (const reason of [
    "APPROVAL_REQUIRED",
    "INSUFFICIENT_WALLET_BALANCE",
    "PERMISSION_REQUIRED",
    "UNAUTHORIZED",
    "ENTITY_CONTEXT_REQUIRED",
  ]) {
    assert.equal(
      observeVerifiedExecutionFailure({
        status: "blocked",
        reason,
        capability: { key: "example.write", mode: "write" },
      }),
      null,
      reason,
    );
  }
});

test("repeated verified blocker learns reinspection guidance without authorizing retry", () => {
  const first = observeVerifiedExecutionFailure({
    status: "blocked",
    reason: "READBACK_MISMATCH",
    capability: { key: "example.write", mode: "write" },
    action_call_completed: true,
    business_effect_verified: false,
  });
  const learned = deriveAdaptiveFailureLearning({
    observation: first,
    existingMetadata: { failure_occurrence_count: 1 },
    now: "2026-09-02T00:00:00.000Z",
  });

  assert.equal(learned.should_learn_lesson, true);
  assert.equal(learned.lesson.metadata.authorization_value, "none");
  assert.equal(learned.lesson.metadata.requires_current_evidence_before_retry, true);
  assert.equal(learned.lesson.metadata.post_action_verification_failed, true);
});
