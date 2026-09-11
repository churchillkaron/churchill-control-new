export const BUSINESS_PARTNER_DIAGNOSIS_RESOLUTION_CONTRACT =
  "AVANTIQO_BUSINESS_PARTNER_DIAGNOSIS_RESOLUTION_V1";

const text = (value, limit = 2000) => String(value ?? "").trim().slice(0, limit);
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};

const DATA = /VALIDATION|INVALID_INPUT|REQUIRED_FIELD|MISSING_INPUT|AMBIGUOUS|CLARIFICATION|UNMATCHED|UNKNOWN_|NOT_FOUND|MISSING_RECORD/;
const CONFIG = /CONFIG|CREDENTIAL|OAUTH|TOKEN|SECRET|API[_ ]?KEY|CONNECTION_REQUIRED|RECONNECT|REAUTH|QUOTA|BILLING/;
const TRANSIENT = /TIMEOUT|ECONNRESET|ECONNREFUSED|ETIMEDOUT|TEMPORAR|TRANSIENT|SERVICE_UNAVAILABLE|UPSTREAM_UNAVAILABLE|DEADLOCK|LOCK_TIMEOUT|NETWORK/;
const DEFECT = /NOT_IMPLEMENTED|IMPLEMENTATION_MISSING|MODULE_NOT_FOUND|REFERENCEERROR|TYPEERROR|RUNTIME_FAILURE|INTERNAL_SERVER_ERROR|CODE_DEFECT|INVARIANT_VIOLATION/;

export function resolveBusinessPartnerDiagnosis({
  initial_classification,
  repair = {},
  relevant_live_read_evidence_observed = false,
  exact_business_identity_evidence_matched = false,
} = {}) {
  const initial = text(initial_classification, 120).toUpperCase();
  if (initial !== "DIAGNOSIS_REQUIRED") {
    return { contract: BUSINESS_PARTNER_DIAGNOSIS_RESOLUTION_CONTRACT, applicable: false, status: "NOT_APPLICABLE", resolved_classification: initial || null, code_engineering_candidate: false };
  }
  if (relevant_live_read_evidence_observed !== true) {
    return { contract: BUSINESS_PARTNER_DIAGNOSIS_RESOLUTION_CONTRACT, applicable: true, status: "MORE_EVIDENCE_REQUIRED", resolved_classification: "DIAGNOSIS_REQUIRED", code_engineering_candidate: false, authorization_effect: "NONE" };
  }
  const parsed = object(repair);
  const detail = [parsed.diagnosis, parsed.proposed_next_step, ...(Array.isArray(parsed.observed_evidence) ? parsed.observed_evidence : [])]
    .map((value) => text(typeof value === "string" ? value : JSON.stringify(value), 1200)).filter(Boolean).join(" ").toUpperCase();
  if (DATA.test(detail)) return { contract: BUSINESS_PARTNER_DIAGNOSIS_RESOLUTION_CONTRACT, applicable: true, status: "RESOLVED", resolved_classification: "DATA_OR_CLARIFICATION", code_engineering_candidate: false, authorization_effect: "NONE" };
  if (CONFIG.test(detail)) return { contract: BUSINESS_PARTNER_DIAGNOSIS_RESOLUTION_CONTRACT, applicable: true, status: "RESOLVED", resolved_classification: "CONFIGURATION_OR_EXTERNAL", code_engineering_candidate: false, authorization_effect: "NONE" };
  if (TRANSIENT.test(detail)) return { contract: BUSINESS_PARTNER_DIAGNOSIS_RESOLUTION_CONTRACT, applicable: true, status: "RESOLVED", resolved_classification: "TRANSIENT_RUNTIME", code_engineering_candidate: false, authorization_effect: "NONE" };
  if (DEFECT.test(detail) && exact_business_identity_evidence_matched === true && parsed.repairable === true) {
    return { contract: BUSINESS_PARTNER_DIAGNOSIS_RESOLUTION_CONTRACT, applicable: true, status: "RESOLVED", resolved_classification: "PRODUCT_DEFECT_CANDIDATE", code_engineering_candidate: true, authorization_effect: "NONE" };
  }
  return { contract: BUSINESS_PARTNER_DIAGNOSIS_RESOLUTION_CONTRACT, applicable: true, status: "MORE_EVIDENCE_REQUIRED", resolved_classification: "DIAGNOSIS_REQUIRED", code_engineering_candidate: false, authorization_effect: "NONE" };
}
