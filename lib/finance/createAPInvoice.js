import { supabase } from "@/lib/supabase";

export async function createAPInvoice(data) {
  const { data: invoice, error } = await supabase
    .from("ap_invoices")
    .insert(data)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return invoice;
}
