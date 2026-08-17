import { test } from "node:test";
import assert from "node:assert/strict";

import {
  FORECAST_GOVERNANCE_CONTROL_LABELS,
  forecastGovernanceControlStatus,
  forecastGovernanceMissingControls,
} from "../lib/finance/budgeting/runtime/ForecastGovernanceControlPolicy.js";

function resolvedReview(overrides = {}) {
  return {
    status: "RESOLVED",
    assigned_to: "owner-user-id",
    acknowledged_by: "ack-user-id",
    acknowledged_at: "2026-08-17T00:00:00.000Z",
    resolved_by: "resolver-user-id",
    resolved_at: "2026-08-17T01:00:00.000Z",
    resolution_note: "Reviewed and accepted with supporting evidence.",
    ...overrides,
  };
}

const closureEvent = {
  action_type: "FORECAST_OVERRIDE_REVIEW_CLOSED",
  created_at: "2026-08-17T01:00:00.000Z",
};

test("forecast override governance is complete only when closure evidence exists", () => {
  const result = forecastGovernanceControlStatus({
    review: resolvedReview(),
    closureEvent,
  });

  assert.equal(result.governance_complete, true);
  assert.deepEqual(result.missing_controls, []);
  assert.deepEqual(result.missing_control_labels, []);
});

test("a due date is not a governance completion prerequisite", () => {
  const result = forecastGovernanceControlStatus({
    review: resolvedReview({ due_date: null }),
    closureEvent,
  });

  assert.equal(result.governance_complete, true);
  assert.ok(!result.missing_controls.includes("DUE_DATE_MISSING"));
});

test("a resolved review without protected closure evidence remains incomplete", () => {
  const result = forecastGovernanceControlStatus({
    review: resolvedReview(),
    closureEvent: null,
  });

  assert.equal(result.governance_complete, false);
  assert.deepEqual(result.missing_controls, ["CLOSURE_AUDIT_MISSING"]);
  assert.deepEqual(result.missing_control_labels, [
    FORECAST_GOVERNANCE_CONTROL_LABELS.CLOSURE_AUDIT_MISSING,
  ]);
});

test("an absent review case is explicitly incomplete", () => {
  const result = forecastGovernanceControlStatus({ review: null, closureEvent: null });

  assert.equal(result.governance_complete, false);
  assert.deepEqual(result.missing_controls, ["REVIEW_CASE_MISSING"]);
});

test("an open review reports every missing closure control", () => {
  const missing = forecastGovernanceMissingControls({
    review: {
      status: "OPEN",
      assigned_to: null,
      acknowledged_by: null,
      acknowledged_at: null,
      resolved_by: null,
      resolved_at: null,
      resolution_note: "",
    },
    closureEvent: null,
  });

  assert.deepEqual(missing, [
    "REVIEW_NOT_RESOLVED",
    "OWNER_MISSING",
    "ACKNOWLEDGEMENT_MISSING",
    "RESOLUTION_ACTOR_MISSING",
    "RESOLUTION_TIME_MISSING",
    "RESOLUTION_EVIDENCE_MISSING",
    "CLOSURE_AUDIT_MISSING",
  ]);
});

test("whitespace-only resolution evidence is incomplete", () => {
  const result = forecastGovernanceControlStatus({
    review: resolvedReview({ resolution_note: "   " }),
    closureEvent,
  });

  assert.equal(result.governance_complete, false);
  assert.deepEqual(result.missing_controls, ["RESOLUTION_EVIDENCE_MISSING"]);
});
