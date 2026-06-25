import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function runPaymentPriorityQueue({
  tenantId,
  invoices,
}) {
  const queue =
    invoices.map((invoice) => {
      const amount =
        Number(
          invoice.paymentAmount ||
            0
        );

      let priority =
        "medium";

      if (amount > 50000) {
        priority = "high";
      }

      return {
        tenant_id: tenantId,
        vendor_name:
          invoice.vendorName,
        invoice_reference:
          invoice.invoiceReference,
        payment_amount:
          amount,
        payment_priority:
          priority,
        due_date:
          invoice.dueDate,
      };
    });

  const { data, error } =
    await supabase
      .from(
        "payment_priority_queue"
      )
      .insert(queue)
      .select();

  if (error) {
    throw error;
  }

  return data;
}
