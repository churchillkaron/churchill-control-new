export function validateCreateQuotation(input = {}) {
  const errors = [];
  if (!input.organizationId) errors.push("organizationId required");
  if (!input.entityId) errors.push("entityId required");
  if (!input.partyId) errors.push("partyId required");
  if (!Array.isArray(input.items) || !input.items.length) {
    errors.push("quotation lines required");
  }
  return { valid: errors.length === 0, errors };
}
