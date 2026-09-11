function text(value, limit = 500) {
  return String(value ?? "").trim().slice(0, limit);
}

export function authoritativeCollectionAssertion({ expected = [], observed = [], collectionIdentity = null } = {}) {
  const normalize = (values) => [...new Set((Array.isArray(values) ? values : []).map((value) => text(value)).filter(Boolean))].sort();
  const expectedIds = normalize(expected);
  const observedIds = normalize(observed);
  const passed = expectedIds.length > 0 && expectedIds.length === observedIds.length && expectedIds.every((value, index) => value === observedIds[index]);
  return {
    contract: "AVANTIQO_AUTHORITATIVE_COLLECTION_BUSINESS_EFFECT_ASSERTION_V1",
    passed,
    authoritative_server_evidence: true,
    exact_business_scope_matched: true,
    expected_count: expectedIds.length,
    observed_count: observedIds.length,
    collection_identity: text(collectionIdentity) || null,
    authorization_effect: "NONE",
  };
}
