import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

import { emitAccountingEvent } from "./emitAccountingEvent";

export async function settleInvoice({
  organization_id,
  entity_id,
  invoiceId,
  paymentBatchId,
  amount,
  entryDate,
}) {

  if (!organization_id) {
    throw new Error("organization_id required");
  }

  if (!entity_id) {
    throw new Error("entity_id required");
  }
  await emitAccountingEvent({
    organization_id,
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
        organization_id: organization_id,
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
