import { createHash } from "node:crypto";
import {
  operatorRepairReasonIsHumanGate,
} from "./OperatorRepairSupervisionPolicy.js";

function text(value, limit = 1000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function capabilityKey(execution = {}) {
  return text(
    execution?.capability?.key ||
      execution?.capability_key ||
      execution?.requested_capability_key,
    300,
  );
}

function normalizedFailureReason(value) {
  return text(value, 700)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/https?:\/\/\S+/gi, "<url>")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, "<id>")
    .replace(/\b[0-9a-f]{24,}\b/gi, "<id>")
    .replace(
      /\b(req|request|run|job|usage|task|trace)[-_ ]?id\s*[:=]\s*[^\s,;]+/gi,
      "$1_id=<id>",
    )
    .replace(/\b\d{10,}\b/g, "<number>")
    .replace(/\s+/g, " ")
    .trim();
}

function fingerprint(capability, normalizedReason) {
  return createHash("sha256")
    .update(`${capability}|${normalizedReason}`)
    .digest("hex")
    .slice(0, 24);
}

export function observeVerifiedExecutionFailure(execution = {}) {
  const status = text(execution?.status, 80).toLowerCase();
  const capability = capabilityKey(execution);
  const rawReason = text(execution?.reason || execution?.error, 700);

  if (!["failed", "blocked"].includes(status) || !capability || !rawReason) {
    return null;
  }
  if (operatorRepairReasonIsHumanGate(rawReason)) return null;

  const normalizedReason = normalizedFailureReason(rawReason);
  if (!normalizedReason) return null;

  return {
    capability_key: capability,
    raw_reason: rawReason,
    normalized_reason: normalizedReason,
    fingerprint: fingerprint(capability, normalizedReason),
    execution_status: status,
    post_action_verification_failed:
      execution?.action_call_completed === true &&
      execution?.business_effect_verified === false,
  };
}

export function observeVerifiedExecutionSuccess(execution = {}) {
  const status = text(execution?.status, 80).toLowerCase();
  const capability = capabilityKey(execution);
  if (status !== "completed" || !capability) return null;

  const mode = text(execution?.capability?.mode, 80).toLowerCase();
  const verification = object(execution?.post_action_verification);
  const verificationStatus = text(verification.status, 80).toLowerCase();
  if (mode !== "read" && verificationStatus !== "completed") return null;

  return {
    capability_key: capability,
    verified: true,
    verification_mode: mode === "read" ? "read_completion" : "post_action_verification",
    success_fingerprint: fingerprint(capability, "verified-success"),
  };
}

export function deriveAdaptiveFailureLearning({
  observation,
  existingMetadata = {},
  now = new Date().toISOString(),
} = {}) {
  if (!observation?.fingerprint || !observation?.capability_key) return null;

  const previous = object(existingMetadata);
  const previousCount = Math.max(
    0,
    Number(previous.failure_occurrence_count || 0) || 0,
  );
  const occurrenceCount = previousCount + 1;
  const firstSeenAt = text(previous.first_failure_at, 80) || now;

  return {
    occurrence_count: occurrenceCount,
    first_failure_at: firstSeenAt,
    last_failure_at: now,
    should_learn_lesson: occurrenceCount >= 2,
    blocker_metadata: {
      failure_fingerprint: observation.fingerprint,
      failure_occurrence_count: occurrenceCount,
      first_failure_at: firstSeenAt,
      last_failure_at: now,
      adaptive_learning_eligible: true,
      execution_status: observation.execution_status || null,
      post_action_verification_failed:
        observation.post_action_verification_failed === true,
    },
    lesson: occurrenceCount >= 2
      ? {
          type: "lesson",
          subject: observation.capability_key,
          content: `Repeated executions of ${observation.capability_key} failed with the same observed failure pattern (${observation.normalized_reason}). Do not repeat the identical attempt unchanged; re-check current prerequisites and verified evidence first, then choose a materially different safe approach when the evidence supports it.`,
          importance: Math.min(0.96, 0.86 + occurrenceCount * 0.02),
          confidence: Math.min(0.98, 0.82 + occurrenceCount * 0.04),
          scope: "party",
          metadata: {
            learned_from: "repeated_verified_execution_failure",
            failure_fingerprint: observation.fingerprint,
            failure_occurrence_count: occurrenceCount,
            first_failure_at: firstSeenAt,
            last_failure_at: now,
            durability: "durable",
            authorization_value: "none",
            requires_current_evidence_before_retry: true,
            execution_status: observation.execution_status || null,
            post_action_verification_failed:
              observation.post_action_verification_failed === true,
          },
        }
      : null,
  };
}

export function deriveResolvedFailureLearning({
  successObservation,
  retiredFailureMetadata = [],
  now = new Date().toISOString(),
} = {}) {
  if (!successObservation?.verified || !successObservation?.capability_key) return null;

  const failures = retiredFailureMetadata
    .map(object)
    .filter((item) => text(item.learned_from, 120) === "repeated_verified_execution_failure")
    .filter((item) => text(item.failure_fingerprint, 120));
  if (!failures.length) return null;

  const totalOccurrences = failures.reduce(
    (sum, item) => sum + Math.max(1, Number(item.failure_occurrence_count || 1)),
    0,
  );
  const failureFamily = [...new Set(
    failures.map((item) => text(item.failure_fingerprint, 120)).filter(Boolean),
  )].sort();

  return {
    lesson: {
      type: "lesson",
      subject: successObservation.capability_key,
      content: `${successObservation.capability_key} recovered from a previously repeated verified failure pattern and later completed with verified outcome evidence. Treat the recovery as evidence that prerequisites or approach changed materially; preserve verification and do not assume the earlier failing attempt is safe to replay unchanged.`,
      importance: Math.min(0.98, 0.88 + totalOccurrences * 0.01),
      confidence: Math.min(0.99, 0.9 + totalOccurrences * 0.01),
      metadata: {
        learned_from: "verified_failure_recovery",
        failure_family: failureFamily,
        prior_failure_occurrence_count: totalOccurrences,
        recovered_at: now,
        verification_mode: successObservation.verification_mode,
        durability: "durable",
        authorization_value: "none",
        requires_current_evidence_before_execution: true,
      },
    },
    training_candidate: {
      capability_key: successObservation.capability_key,
      failure_family: failureFamily,
      prior_failure_occurrence_count: totalOccurrences,
      outcome: "VERIFIED_RECOVERY",
      verification_mode: successObservation.verification_mode,
      observed_at: now,
    },
  };
}

export function failureFingerprintMatches(metadata = {}, observation = {}) {
  return Boolean(
    text(metadata?.failure_fingerprint, 80) &&
    text(metadata.failure_fingerprint, 80) === text(observation?.fingerprint, 80),
  );
}
