export const FORECAST_GOVERNANCE_CONTROL_LABELS = {
  REVIEW_CASE_MISSING: "Review case missing",
  REVIEW_NOT_RESOLVED: "Review not resolved",
  OWNER_MISSING: "Review owner missing",
  ACKNOWLEDGEMENT_MISSING: "Review acknowledgement missing",
  RESOLUTION_ACTOR_MISSING: "Resolver missing",
  RESOLUTION_TIME_MISSING: "Resolution timestamp missing",
  RESOLUTION_EVIDENCE_MISSING: "Resolution evidence missing",
  CLOSURE_AUDIT_MISSING: "Protected closure evidence missing",
};

export function forecastGovernanceMissingControls({ review = null, closureEvent = null } = {}) {
  if (!review) return ["REVIEW_CASE_MISSING"];

  const missing = [];
  if (review.status !== "RESOLVED") missing.push("REVIEW_NOT_RESOLVED");
  if (!review.assigned_to) missing.push("OWNER_MISSING");
  if (!review.acknowledged_by || !review.acknowledged_at) missing.push("ACKNOWLEDGEMENT_MISSING");
  if (!review.resolved_by) missing.push("RESOLUTION_ACTOR_MISSING");
  if (!review.resolved_at) missing.push("RESOLUTION_TIME_MISSING");
  if (!String(review.resolution_note || "").trim()) missing.push("RESOLUTION_EVIDENCE_MISSING");
  if (!closureEvent) missing.push("CLOSURE_AUDIT_MISSING");
  return missing;
}

export function forecastGovernanceControlStatus({ review = null, closureEvent = null } = {}) {
  const missing = forecastGovernanceMissingControls({ review, closureEvent });
  return {
    governance_complete: missing.length === 0,
    missing_controls: missing,
    missing_control_labels: missing.map(code => FORECAST_GOVERNANCE_CONTROL_LABELS[code] || code),
  };
}
