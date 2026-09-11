export const BUSINESS_PARTNER_CONFIGURATION_RECOVERY_CONTRACT =
  "AVANTIQO_BUSINESS_PARTNER_CONFIGURATION_RECOVERY_V1";

const text = (value, limit = 1200) => String(value ?? "").trim().slice(0, limit);
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};

const HUMAN_CREDENTIAL = /CREDENTIAL|OAUTH|TOKEN|SECRET|API[_ ]?KEY|LOGIN|RECONNECT|REAUTH/i;
const GOVERNANCE = /APPROVAL|PERMISSION|AUTHORIZ|WALLET|BILLING|QUOTA_EXCEEDED|QUOTA_REQUIRED/i;
const EXTERNAL = /RATE[_ -]?LIMIT|HTTP[_ -]?429|\b429\b|PROVIDER.*UNAVAILABLE|EXTERNAL.*UNAVAILABLE|OUTAGE|NETWORK|DNS|503|502|504/i;

export function classifyBusinessPartnerConfigurationRecovery({ classification, reason, repair = {}, relevant_live_read_evidence_observed = false, exact_business_identity_evidence_matched = false } = {}) {
  const normalized = text(classification, 120).toUpperCase();
  const detail = [reason, object(repair).diagnosis, object(repair).proposed_next_step]
    .map((value) => text(value, 1200)).filter(Boolean).join(" ");
  if (normalized !== "CONFIGURATION_OR_EXTERNAL") {
    return { contract: BUSINESS_PARTNER_CONFIGURATION_RECOVERY_CONTRACT, applicable: false, status: "NOT_APPLICABLE", auto_resume_allowed: false };
  }
  if (GOVERNANCE.test(detail)) return { contract: BUSINESS_PARTNER_CONFIGURATION_RECOVERY_CONTRACT, applicable: true, status: "GOVERNANCE_REQUIRED", auto_resume_allowed: false };
  if (HUMAN_CREDENTIAL.test(detail)) return { contract: BUSINESS_PARTNER_CONFIGURATION_RECOVERY_CONTRACT, applicable: true, status: "HUMAN_CREDENTIAL_REQUIRED", auto_resume_allowed: false };
  if (EXTERNAL.test(detail)) return { contract: BUSINESS_PARTNER_CONFIGURATION_RECOVERY_CONTRACT, applicable: true, status: "EXTERNAL_DEPENDENCY_PENDING", auto_resume_allowed: false };
  const ready = object(repair).repairable === true && relevant_live_read_evidence_observed === true && exact_business_identity_evidence_matched === true && object(repair).needs_human !== true && text(object(repair).retry_policy, 80) === "safe_reinspect_then_retry";
  return { contract: BUSINESS_PARTNER_CONFIGURATION_RECOVERY_CONTRACT, applicable: true, status: ready ? "READY_TO_RETRY" : "REINSPECT_REQUIRED", auto_resume_allowed: ready, authorization_effect: "SAME_ACTION_ONLY" };
}
