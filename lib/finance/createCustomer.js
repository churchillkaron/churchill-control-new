import { supabase } from "@/lib/supabase";

export async function createCustomer(data) {
  const { data: customer, error } = await supabase
    .from("customers")
    .insert(data)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return customer;
}
