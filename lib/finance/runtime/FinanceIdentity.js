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
    person_id,
  } = context;

  if (!entity_id) {
    throw new Error("FinanceIdentity: entity_id required");
  }

  return {
    person_id: person_id || null,
    organization_id: organization_id || null,
    entity_id,
  };
}
