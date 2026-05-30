import { supabase } from "@/lib/supabase";

export async function createPayment(data) {
  const { data: payment, error } = await supabase
    .from("payments")
    .insert(data)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return payment;
}
