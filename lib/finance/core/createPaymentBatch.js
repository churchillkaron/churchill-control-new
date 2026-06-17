import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function createPaymentBatch({
  tenantId,
  paymentType,
  invoices,
}) {
  let totalAmount = 0;

  for (const invoice of invoices || []) {
    totalAmount += Number(
      invoice.amount || 0
    );
  }

  const reference =
    `PAY-${Date.now()}`;

  const { data, error } =
    await supabase
      .from("payment_batches")
      .insert({
        tenant_id: tenantId,
        batch_reference:
          reference,
        payment_type:
          paymentType,
        total_amount:
          totalAmount,
        payment_status:
          "pending",
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
