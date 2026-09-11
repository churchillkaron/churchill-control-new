import { normalizeAuthoritativeBusinessEffectOutcome } from "./BusinessEffectOutcomeRuntime.mjs";
export const BUSINESS_PARTNER_AMBIGUOUS_WRITE_RECOVERY_CONTRACT =
  "AVANTIQO_BUSINESS_PARTNER_AMBIGUOUS_WRITE_RECOVERY_V1";

const text = (value, limit = 1200) => String(value ?? "").trim().slice(0, limit);
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};

export function assessBusinessPartnerAmbiguousWriteOutcome({ result = {}, verifier = {}, expected = {}, server_scope_bound = false } = {}) {
  if (text(verifier?.mode, 80).toLowerCase() !== "read" || !text(verifier?.key, 300)) {
    return { contract: BUSINESS_PARTNER_AMBIGUOUS_WRITE_RECOVERY_CONTRACT, status: "UNCERTAIN", reason: "REGISTERED_READ_VERIFIER_REQUIRED", mutation_replay_allowed: false, authorization_effect: "NONE" };
  }
  const evidence = normalizeAuthoritativeBusinessEffectOutcome({ result, expected, server_scope_bound });
  const state = text(evidence.state || evidence.status, 80).toUpperCase();
  const authoritative = evidence.authoritative_server_evidence === true;
  const exactScope = evidence.exact_business_scope_matched === true;
  if (!authoritative || !exactScope) {
    return { contract: BUSINESS_PARTNER_AMBIGUOUS_WRITE_RECOVERY_CONTRACT, status: "UNCERTAIN", reason: "AUTHORITATIVE_EXACT_SCOPE_OUTCOME_REQUIRED", mutation_replay_allowed: false, authorization_effect: "NONE" };
  }
  if (state === "COMPLETED" && evidence.business_effect_observed === true) {
    return { contract: BUSINESS_PARTNER_AMBIGUOUS_WRITE_RECOVERY_CONTRACT, status: "COMPLETED", reason: null, business_effect_verified: true, mutation_replay_allowed: false, authorization_effect: "NONE" };
  }
  if (state === "NOT_COMPLETED" && evidence.business_effect_absent === true && evidence.safe_to_retry === true) {
    return { contract: BUSINESS_PARTNER_AMBIGUOUS_WRITE_RECOVERY_CONTRACT, status: "NOT_COMPLETED", reason: null, business_effect_verified: false, mutation_replay_allowed: true, retry_requires_fresh_governance: true, authorization_effect: "SAME_ACTION_ONLY" };
  }
  return { contract: BUSINESS_PARTNER_AMBIGUOUS_WRITE_RECOVERY_CONTRACT, status: "UNCERTAIN", reason: "EXPLICIT_COMPLETION_STATE_NOT_PROVEN", mutation_replay_allowed: false, authorization_effect: "NONE" };
}
