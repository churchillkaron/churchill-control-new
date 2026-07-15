import { defineDocument } from "@/lib/ubte/documents/defineDocument";

export const QuotationDocument =
  defineDocument({
    type: "sales.quotation",
    domain: "sales",
    name: "Quotation",

    lifecycle: [
      "DRAFT",
      "SENT",
      "ACCEPTED",
      "REJECTED",
      "EXPIRED",
      "CONVERTED",
      "CLOSED",
      "CANCELLED",
    ],

    defaultStatus: "DRAFT",

    schema: {},

    events: {
      created: "sales.quotation.created",
      sent: "sales.quotation.sent",
      accepted: "sales.quotation.accepted",
      rejected: "sales.quotation.rejected",
      converted: "sales.quotation.converted",
      cancelled: "sales.quotation.cancelled",
    },

    relationships: {
      customer: "Customer",
      salesOrder: "SalesOrder",
    },
  });
