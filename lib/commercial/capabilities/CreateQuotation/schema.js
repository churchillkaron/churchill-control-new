export const CreateQuotationSchema = {
  organizationId: "uuid",
  entityId: "uuid",
  partyId: "uuid",
  items: "array:min=1",
  validUntil: "date|null",
  notes: "string|null",
  terms: "string|null",
};
