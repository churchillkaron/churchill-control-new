import { financeGateway } from "@/lib/finance/runtime/financeGateway";

export async function postSupplierInvoice({
  organizationId,
  invoiceId,
  totalAmount,
  taxAmount,
  accounts,
}) {
  return await financeGateway({

    type:
      "AP_INVOICE_APPROVED",

    payload:{

      organization_id:
        organizationId,

      entity_id:
        null,

      source_module:
        "procurement",

      source_id:
        invoiceId,

      source_document:
        "vendor_invoice",

      source_document_id:
        invoiceId,

      amount:
        totalAmount,

      taxAmount,

      accounts,

      description:
        `Supplier invoice ${invoiceId}`,

    },

  });
}
