import { createDocument } from "@/lib/ubte/documents/DocumentFactory";
import { QuotationDocument } from "./manifest.js";

export function createQuotationDocument({
  organizationId,
  entityId = null,
  quotationNumber = null,
  customerId = null,
  customerName = null,
  currencyCode = "THB",
  items = [],
  subtotal = 0,
  discount = 0,
  tax = 0,
  total = 0,
  validUntil = null,
  createdBy = null,
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  return createDocument({
    definition: QuotationDocument,
    organizationId,
    data: {
      entityId,

      quotationNumber,

      customerId,
      customerName,

      currencyCode,

      items,

      subtotal: Number(subtotal || 0),
      discount: Number(discount || 0),
      tax: Number(tax || 0),
      total: Number(total || 0),

      validUntil,

      createdBy,
      approvedBy: null,
    },
  });
}
