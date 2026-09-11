import { collectStableBusinessIdentities } from "./OperatorDeterministicBusinessEffectRuntime.js";

export const AVANTIQO_BUSINESS_EFFECT_OUTCOME_CONTRACT =
  "AVANTIQO_AUTHORITATIVE_BUSINESS_EFFECT_OUTCOME_V1";

const text = (value, limit = 1200) => String(value ?? "").trim().slice(0, limit);
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const list = (value) => Array.isArray(value) ? value : [];

function explicitEnvelope(result = {}) {
  const root = object(result);
  return object(
    root.business_effect_outcome ||
    root.outcome_reinspection ||
    root.mutation_outcome ||
    root.result?.business_effect_outcome,
  );
}

function stableIdentities(...values) {
  const output = new Set();
  for (const value of values) {
    if (typeof value === "string" && /^[a-z0-9_]+:.+$/i.test(value.trim())) {
      output.add(value.trim());
      continue;
    }
    for (const identity of collectStableBusinessIdentities(value)) output.add(identity);
  }
  return output;
}
export function normalizeAuthoritativeBusinessEffectOutcome({
  result = {}, expected = {}, server_scope_bound = false,
} = {}) {
  const explicit = explicitEnvelope(result);
  const explicitState = text(explicit.state || explicit.status, 80).toUpperCase();
  const authoritative = explicit.authoritative_server_evidence === true;
  const exactScope = explicit.exact_business_scope_matched === true;

  if (explicitState === "COMPLETED" && authoritative && exactScope && explicit.business_effect_observed === true) {
    return { contract: AVANTIQO_BUSINESS_EFFECT_OUTCOME_CONTRACT, ...explicit, state: "COMPLETED", safe_to_retry: false };
  }
  if (explicitState === "NOT_COMPLETED" && authoritative && exactScope && explicit.business_effect_absent === true && explicit.safe_to_retry === true) {
    return { contract: AVANTIQO_BUSINESS_EFFECT_OUTCOME_CONTRACT, ...explicit, state: "NOT_COMPLETED" };
  }

  const expectedSource = object(expected);
  const expectedIdentities = stableIdentities(
    expectedSource.action_result,
    ...list(expectedSource.action_identity_evidence),
  );
  const observedIdentities = stableIdentities(result);
  const matchedIdentity = [...expectedIdentities].find((identity) => observedIdentities.has(identity)) || null;
  if (server_scope_bound === true && matchedIdentity) {
    return {
      contract: AVANTIQO_BUSINESS_EFFECT_OUTCOME_CONTRACT,
      state: "COMPLETED",
      authoritative_server_evidence: true,
      exact_business_scope_matched: true,
      business_effect_observed: true,
      business_effect_absent: false,
      safe_to_retry: false,
      matched_identity: matchedIdentity,
      derivation: "SERVER_BOUND_STABLE_BUSINESS_IDENTITY_MATCH",
    };
  }
  return {
    contract: AVANTIQO_BUSINESS_EFFECT_OUTCOME_CONTRACT,
    state: "UNCERTAIN",
    authoritative_server_evidence: server_scope_bound === true,
    exact_business_scope_matched: server_scope_bound === true,
    business_effect_observed: false,
    business_effect_absent: false,
    safe_to_retry: false,
    matched_identity: null,
    derivation: explicitState ? "EXPLICIT_OUTCOME_NOT_SUFFICIENTLY_PROVEN" : "NO_EXPLICIT_OR_IDENTITY_PROOF",
  };
}

export const BusinessEffectOutcomeRuntime = Object.freeze({
  contract: AVANTIQO_BUSINESS_EFFECT_OUTCOME_CONTRACT,
  normalize: normalizeAuthoritativeBusinessEffectOutcome,
});