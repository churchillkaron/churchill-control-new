export const BUSINESS_PARTNER_TRANSIENT_RECOVERY_CONTRACT =
  "AVANTIQO_BUSINESS_PARTNER_TRANSIENT_RECOVERY_V1";

const text = (value, limit = 1200) => String(value ?? "").trim().slice(0, limit);
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};

const TRANSIENT = /TIMEOUT|ECONNRESET|ECONNREFUSED|ETIMEDOUT|TEMPORAR|TRANSIENT|DEADLOCK|LOCK_TIMEOUT|NETWORK|502|503|504/i;

export function classifyBusinessPartnerTransientRecovery({ classification, reason, repair = {}, recovery = {} } = {}) {
  if (text(classification, 120).toUpperCase() !== "TRANSIENT_RUNTIME") {
    return { contract: BUSINESS_PARTNER_TRANSIENT_RECOVERY_CONTRACT, applicable: false, status: "NOT_APPLICABLE", auto_resume_allowed: false };
  }
  const current = object(recovery);
  const failureEvidence = object(current.failure_evidence);
  const mode = text(object(current.capability).mode, 80).toLowerCase();
  const phase = text(failureEvidence.phase, 80).toLowerCase();
  const retryableRead = mode === "read" || phase === "read";
  const detail = [reason, object(repair).diagnosis, object(repair).proposed_next_step].map((value) => text(value, 1200)).filter(Boolean).join(" ");
  const transientObserved = TRANSIENT.test(detail);
  const retryPolicy = text(object(repair).retry_policy, 80);
  const noHuman = object(repair).needs_human !== true;
  const ready = retryableRead && transientObserved && noHuman && retryPolicy === "safe_reinspect_then_retry";
  if (!retryableRead) {
    return { contract: BUSINESS_PARTNER_TRANSIENT_RECOVERY_CONTRACT, applicable: true, status: "WRITE_OUTCOME_REINSPECTION_REQUIRED", auto_resume_allowed: false, read_only_retry: false, authorization_effect: "NONE" };
  }
  return { contract: BUSINESS_PARTNER_TRANSIENT_RECOVERY_CONTRACT, applicable: true, status: ready ? "READY_TO_RETRY" : "REINSPECT_REQUIRED", auto_resume_allowed: ready, read_only_retry: true, retry_attempted: false, authorization_effect: ready ? "SAME_ACTION_ONLY" : "NONE" };
}
