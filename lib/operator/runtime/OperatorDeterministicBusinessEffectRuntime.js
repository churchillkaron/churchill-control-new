function text(value, limit = 1200) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

const STABLE_BUSINESS_IDENTITY_KEYS = new Set([
  "id", "uuid", "invoice_id", "bill_id", "journal_id", "booking_id",
  "reservation_id", "work_order_id", "order_id", "payment_id", "receipt_id",
  "customer_id", "vendor_id", "supplier_id", "employee_id", "person_id",
  "party_id", "asset_id", "document_id", "record_id", "transaction_id",
]);

export function collectStableBusinessIdentities(value, depth = 0, output = new Set()) {
  if (depth > 5 || value === null || value === undefined) return output;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 100)) collectStableBusinessIdentities(item, depth + 1, output);
    return output;
  }
  if (typeof value !== "object") return output;
  for (const [rawKey, rawValue] of Object.entries(value)) {
    const key = text(rawKey, 120).toLowerCase();
    if (STABLE_BUSINESS_IDENTITY_KEYS.has(key)) {
      const normalized = text(rawValue, 500);
      if (normalized) output.add(`${key}:${normalized}`);
    }
    collectStableBusinessIdentities(rawValue, depth + 1, output);
  }
  return output;
}

export function deterministicBusinessEffectProof(execution = {}) {
  const current = object(execution);
  const verification = object(current.post_action_verification);
  if (text(verification.status, 80).toLowerCase() !== "completed") {
    return { passed: false, method: "verification_status", reason: "POST_ACTION_VERIFICATION_NOT_COMPLETED", matched_identity: null };
  }
  const resultAssertion = object(object(verification.result).business_effect_assertion);
  if (
    text(resultAssertion.contract, 120) === "AVANTIQO_AUTHORITATIVE_COLLECTION_BUSINESS_EFFECT_ASSERTION_V1" &&
    resultAssertion.passed === true &&
    resultAssertion.authoritative_server_evidence === true &&
    resultAssertion.exact_business_scope_matched === true &&
    Number.isInteger(resultAssertion.expected_count) &&
    resultAssertion.expected_count >= 1 &&
    resultAssertion.expected_count === resultAssertion.observed_count
  ) {
    return {
      passed: true,
      method: "authoritative_collection_identity_set_match",
      reason: null,
      matched_identity: text(resultAssertion.collection_identity, 500) || null,
    };
  }
  if (
    text(resultAssertion.contract, 120) === "AVANTIQO_AUTHORITATIVE_VALUE_SET_BUSINESS_EFFECT_ASSERTION_V1" &&
    resultAssertion.passed === true && resultAssertion.authoritative_server_evidence === true && resultAssertion.exact_business_scope_matched === true &&
    Number.isInteger(resultAssertion.expected_count) && resultAssertion.expected_count >= 1 && resultAssertion.expected_count === resultAssertion.observed_count
  ) {
    return { passed: true, method: "authoritative_value_set_match", reason: null, matched_identity: text(resultAssertion.value_set_identity, 500) || null };
  }
  const explicitAssertion = object(verification.assertion);
  if (verification.business_effect_verified === true && explicitAssertion.passed === true) {
    return {
      passed: true,
      method: text(explicitAssertion.method, 120) || "server_assertion",
      reason: null,
      matched_identity: text(explicitAssertion.matched_identity, 500) || null,
    };
  }
  const actionIdentities = collectStableBusinessIdentities(current.result);
  for (const identity of Array.isArray(current.action_identity_evidence) ? current.action_identity_evidence : []) {
    const normalized = text(identity, 600);
    const separator = normalized.indexOf(":");
    const key = separator > 0 ? normalized.slice(0, separator).toLowerCase() : "";
    if (STABLE_BUSINESS_IDENTITY_KEYS.has(key)) actionIdentities.add(normalized);
  }
  const verificationIdentities = collectStableBusinessIdentities(verification.result);
  for (const identity of actionIdentities) {
    if (verificationIdentities.has(identity)) {
      return { passed: true, method: "stable_business_identity_match", reason: null, matched_identity: identity };
    }
  }
  return {
    passed: false,
    method: "stable_business_identity_match",
    reason: actionIdentities.size ? "POST_ACTION_VERIFICATION_ASSERTION_FAILED" : "POST_ACTION_VERIFICATION_IDENTITY_NOT_AVAILABLE",
    matched_identity: null,
  };
}
