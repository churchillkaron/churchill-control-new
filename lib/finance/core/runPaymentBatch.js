import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

import { settleInvoice } from "./settleInvoice";

export async function runPaymentBatch({
  tenantId,
  paymentBatchId,
  invoices,
  entryDate,
}) {
  const settlements = [];

  for (const invoice of invoices || []) {
    const settlement =
      await settleInvoice({
        tenantId,
        invoiceId:
          invoice.invoiceId,
        paymentBatchId,
        amount:
          invoice.amount,
        entryDate,
      });

    settlements.push(
      settlement
    );
  }

  await supabase
    .from("payment_batches")
    .update({
      payment_status:
        "completed",
    })
    .eq("id", paymentBatchId);

  return settlements;
}
