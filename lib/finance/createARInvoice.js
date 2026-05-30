import { supabase } from "@/lib/supabase";

export async function createARInvoice(data) {
  const { data: invoice, error } = await supabase
    .from("ar_invoices")
    .insert(data)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return invoice;
}
