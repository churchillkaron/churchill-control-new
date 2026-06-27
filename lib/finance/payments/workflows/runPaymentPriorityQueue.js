import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function runPaymentPriorityQueue({
  organization_id,
  entity_id,
  invoices,
}) {

  if (!organization_id) {
    throw new Error("organization_id required");
  }

  if (!entity_id) {
    throw new Error("entity_id required");
  }
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
        organization_id: organization_id,
        entity_id: entity_id,
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
