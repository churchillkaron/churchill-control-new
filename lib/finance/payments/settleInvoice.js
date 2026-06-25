import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

import { emitAccountingEvent } from "./emitAccountingEvent";

export async function settleInvoice({
  tenantId,
  invoiceId,
  paymentBatchId,
  amount,
  entryDate,
}) {
  await emitAccountingEvent({
    tenantId,
    eventType:
      "INVOICE_SETTLEMENT",
    sourceModule: "payments",
    sourceId: invoiceId,
    payload: {
      amount,
      entryDate,
      description:
        "Invoice settlement posting",
    },
  });

  const { data, error } =
    await supabase
      .from(
        "invoice_settlements"
      )
      .insert({
        tenant_id: tenantId,
        invoice_id: invoiceId,
        payment_batch_id:
          paymentBatchId,
        settled_amount:
          amount,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
