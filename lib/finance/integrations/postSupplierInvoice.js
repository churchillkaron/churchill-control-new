import { createServerSupabase } from "@/lib/shared/supabase/server";
import { postAccountingEvent } from "@/lib/finance/postAccountingEvent";

export async function postSupplierInvoice({
  organizationId,
  invoiceId,
  totalAmount,
  taxAmount,
  accounts,
}) {
  return await postAccountingEvent({
    organizationId,
    eventType: "AP_INVOICE_APPROVED",
    sourceModule: "procurement",
    sourceId: invoiceId,
    description: `Supplier invoice ${invoiceId}`,
    amount: totalAmount,
    taxAmount,
    accounts,
    metadata: {
      invoiceId,
    },
  });
}
