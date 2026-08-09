export function createQuotationDto(body = {}) {
  return {
    organizationId: body.organizationId || body.organization_id || null,
    entityId: body.entityId || body.entity_id || null,
    partyId: body.partyId || body.party_id || null,
    items: Array.isArray(body.items) ? body.items : [],
    validUntil: body.validUntil || body.valid_until || null,
    notes: body.notes || null,
    terms: body.terms || null,
  };
}
