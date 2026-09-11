export const BUSINESS_PARTNER_EXTERNAL_BACKOFF_RECOVERY_CONTRACT =
  "AVANTIQO_BUSINESS_PARTNER_EXTERNAL_BACKOFF_RECOVERY_V1";

const BACKOFF_SECONDS = Object.freeze([60, 120, 300, 600, 900, 1800]);
const TEMPORARY = /RATE[_ -]?LIMIT|HTTP[_ -]?429|\b429\b|TIMEOUT|ECONNRESET|ECONNREFUSED|ETIMEDOUT|TEMPORAR|TRANSIENT|PROVIDER.*UNAVAILABLE|EXTERNAL.*UNAVAILABLE|OUTAGE|NETWORK|DNS|\b502\b|\b503\b|\b504\b/i;

const text = (value, limit = 1600) => String(value ?? "").trim().slice(0, limit);
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};

function retryAfterSeconds(evidence = {}, reason = "") {
  const source = object(evidence);
  const seconds = Number(source.retry_after_seconds ?? source.retryAfterSeconds);
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(3600, Math.ceil(seconds));
  const milliseconds = Number(source.retry_after_ms ?? source.retryAfterMs);
  if (Number.isFinite(milliseconds) && milliseconds > 0) return Math.min(3600, Math.ceil(milliseconds / 1000));
  const match = text(reason, 1200).match(/retry[- ]?after[^0-9]{0,20}(\d{1,5})/i);
  return match ? Math.min(3600, Math.max(1, Number(match[1]))) : null;
}

function readOnlyRecovery(recovery = {}) {
  const current = object(recovery);
  const mode = text(object(current.capability).mode, 80).toLowerCase();
  const phase = text(object(current.failure_evidence).phase, 80).toLowerCase();
  return mode === "read" || phase === "read";
}
export function createBusinessPartnerExternalBackoffRecoveryState({
  configurationRecovery = {}, transientRecovery = {}, recovery = {}, previousRecovery = {}, reason = "", now = new Date(),
} = {}) {
  const current = object(recovery);
  const configuration = object(configurationRecovery);
  const transient = object(transientRecovery);
  const detail = [reason, object(current.failure_evidence).error_code, object(current.failure_evidence).error_class]
    .map((value) => text(value, 500)).filter(Boolean).join(" ");
  const temporary = TEMPORARY.test(detail) || configuration.status === "EXTERNAL_DEPENDENCY_PENDING";
  const safeRead = readOnlyRecovery(current) || transient.read_only_retry === true;
  if (!temporary || !safeRead) return null;
  const previous = Object.keys(object(current.external_backoff_recovery)).length
    ? object(current.external_backoff_recovery)
    : object(object(previousRecovery).external_backoff_recovery);
  const previousAttempt = Number(previous.attempt_count || 0);
  if (previousAttempt >= BACKOFF_SECONDS.length) {
    return {
      contract: BUSINESS_PARTNER_EXTERNAL_BACKOFF_RECOVERY_CONTRACT,
      status: "BACKOFF_LIMIT_REACHED", attempt_count: previousAttempt,
      auto_resume_allowed: false, read_only_retry: true, mutation_replay_allowed: false,
      authorization_effect: "NONE",
    };
  }
  const attempt = previousAttempt + 1;
  const requestedDelay = retryAfterSeconds(object(current.failure_evidence), detail);
  const delaySeconds = Math.max(BACKOFF_SECONDS[attempt - 1], requestedDelay || 0);
  const base = now instanceof Date ? now : new Date(now);
  const retryAt = new Date(base.getTime() + delaySeconds * 1000).toISOString();
  return {
    contract: BUSINESS_PARTNER_EXTERNAL_BACKOFF_RECOVERY_CONTRACT,
    status: "WAITING_BACKOFF",
    wait_kind: "EXTERNAL_BACKOFF",
    attempt_count: attempt,
    max_attempts: BACKOFF_SECONDS.length,
    delay_seconds: delaySeconds,
    retry_not_before: retryAt,
    auto_resume_allowed: false,
    read_only_retry: true,
    mutation_replay_allowed: false,
    retry_requires_fresh_governance: true,
    authorization_effect: "NONE",
  };
}

export function authorizeBusinessPartnerExternalBackoffWake(state = {}) {
  const current = object(state);
  if (
    text(current.contract, 160) !== BUSINESS_PARTNER_EXTERNAL_BACKOFF_RECOVERY_CONTRACT ||
    text(current.status, 80) !== "WAITING_BACKOFF" ||
    current.read_only_retry !== true ||
    current.mutation_replay_allowed !== false
  ) return current;
  return {
    ...current,
    status: "RETRY_DUE",
    resume_authorized: true,
    authorization_effect: "SAME_ACTION_ONLY",
  };
}
