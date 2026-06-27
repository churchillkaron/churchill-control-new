/**
 * FINANCE IDENTITY RESOLVER (CLEAN MODEL)
 * RULE:
 * - organization_id = ACCESS CONTEXT ONLY (UBTE)
 * - entity_id = ACCOUNTING BOOK ONLY
 */

export function resolveFinanceIdentity(context = {}) {
  const {
    organization_id,
    entity_id,
    legal_entity_id,
    person_id
  } = context;

  // 🔥 HARD RULE: entity is required for finance
  if (!entity_id) {
    throw new Error("FinanceIdentity: entity_id required");
  }

  return {
    person_id: person_id || null,

    // ACCESS LAYER (NOT FINANCE TRUTH)
    organization_id: organization_id || null,

    // ACCOUNTING TRUTH
    entity_id,

    // GROUPING ONLY (OPTIONAL)
    legal_entity_id: legal_entity_id || null
  };
}
