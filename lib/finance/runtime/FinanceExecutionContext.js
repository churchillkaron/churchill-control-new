/**
 * FINANCE EXECUTION CONTEXT (FROZEN STATE)
 * This ensures accounting integrity at runtime level
 */

export function createFinanceContext(input = {}) {
  const {
    person_id,
    organization_id,
    entity_id,
    legal_entity_id
  } = input;

  if (!entity_id) {
    throw new Error("FinanceContext: entity_id required");
  }

  return Object.freeze({
    person_id: person_id || null,
    organization_id: organization_id || null,
    entity_id,
    legal_entity_id: legal_entity_id || null,
    timestamp: Date.now()
  });
}
