import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { financeGateway } from "@/lib/finance/runtime/financeGateway";

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

  await financeGateway({
    type: "INVOICE_SETTLEMENT",
    payload: {
      organization_id,
      entity_id,
      source_module: "payments",
      source_id: invoiceId,
      amount,
      entryDate,
      description: "Invoice settlement posting",
    },
  });

  const { data, error } =
    await supabaseAdmin
      .from("invoice_settlements")
      .insert({
        organization_id,
        entity_id,
        invoice_id: invoiceId,
        payment_batch_id: paymentBatchId,
        settled_amount: amount,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
