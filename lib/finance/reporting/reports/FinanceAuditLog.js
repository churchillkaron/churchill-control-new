/**
 * FINANCE AUDIT LOG (ACCOUNTING FIRM GRADE)
 * Immutable event trace per transaction
 */

export function createFinanceAuditLog({
  type,
  payload,
  context,
  result
}) {
  return {
    id: `${Date.now()}-${Math.random()}`,

    type,

    // WHO
    person_id: context?.person_id || null,

    // WHERE
    organization_id: context?.organization_id || null,
    entity_id: context?.entity_id || null,
    legal_entity_id: context?.legal_entity_id || null,

    // WHAT
    payload,
    result,

    // WHEN
    timestamp: Date.now()
  };
}
